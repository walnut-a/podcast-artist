import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import type { AppSettings, DependencyCheckResult, DependencyStatusFile } from '../../shared/types';

const CHECK_TIMEOUT_MS = 5000;

export async function runDependencyChecks(settings: AppSettings): Promise<DependencyStatusFile> {
  const checkedAt = new Date().toISOString();
  const dependencies = await Promise.all([
    checkFfmpeg(settings, checkedAt),
    checkFfprobe(settings, checkedAt),
    checkWhisperCpp(settings, checkedAt)
  ]);

  return {
    schemaVersion: 'dependencyStatus.v1',
    checkedAt,
    dependencies
  };
}

async function checkFfmpeg(settings: AppSettings, checkedAt: string): Promise<DependencyCheckResult> {
  const resolvedPath = await resolveExecutable(settings.tools.ffmpeg.path, ['ffmpeg']);
  if (!resolvedPath) {
    return notConfigured('ffmpeg', 'FFmpeg', ['proxy', 'peaks', 'normalization', 'export'], checkedAt);
  }

  const version = await runCommand(resolvedPath, ['-version']);
  if (!version.ok) {
    return unavailable('ffmpeg', 'FFmpeg', ['proxy', 'peaks', 'normalization', 'export'], resolvedPath, checkedAt, version.error);
  }

  const filters = await runCommand(resolvedPath, ['-filters']);
  const filterText = filters.ok ? filters.stdout : '';
  const hasLoudnorm = filterText.includes('loudnorm');
  const hasAmix = filterText.includes('amix');
  const hasAfade = filterText.includes('afade');
  const hasRequiredFilters = hasLoudnorm && hasAmix && hasAfade;

  return {
    id: 'ffmpeg',
    displayName: 'FFmpeg',
    requiredFor: ['proxy', 'peaks', 'normalization', 'export'],
    status: hasRequiredFilters ? 'available' : 'partial',
    resolvedPath,
    version: firstLine(version.stdout),
    checkedAt,
    capabilities: {
      canRun: true,
      filters: {
        loudnorm: hasLoudnorm,
        amix: hasAmix,
        afade: hasAfade
      },
      canExportWav: true
    },
    error: hasRequiredFilters ? null : 'FFmpeg is executable, but one or more required filters were not detected.'
  };
}

async function checkFfprobe(settings: AppSettings, checkedAt: string): Promise<DependencyCheckResult> {
  const resolvedPath = await resolveExecutable(settings.tools.ffprobe.path, ['ffprobe']);
  if (!resolvedPath) {
    return notConfigured('ffprobe', 'ffprobe', ['audio probing', 'import metadata'], checkedAt);
  }

  const version = await runCommand(resolvedPath, ['-version']);
  if (!version.ok) {
    return unavailable('ffprobe', 'ffprobe', ['audio probing', 'import metadata'], resolvedPath, checkedAt, version.error);
  }

  return {
    id: 'ffprobe',
    displayName: 'ffprobe',
    requiredFor: ['audio probing', 'import metadata'],
    status: 'available',
    resolvedPath,
    version: firstLine(version.stdout),
    checkedAt,
    capabilities: {
      canRun: true,
      canProbeAudio: true
    },
    error: null
  };
}

async function checkWhisperCpp(settings: AppSettings, checkedAt: string): Promise<DependencyCheckResult> {
  const resolvedPath = await resolveExecutable(settings.tools.whisperCpp.path, ['whisper-cli', 'whisper', 'main']);
  const modelPath = settings.tools.whisperCpp.defaultModelPath;
  const modelAvailable = modelPath ? await isExecutableOrReadable(modelPath, false) : false;

  if (!resolvedPath && !modelPath) {
    return notConfigured('whisper_cpp', 'whisper.cpp', ['transcription'], checkedAt, {
      binaryExecutable: false,
      modelAvailable: false
    });
  }

  if (!resolvedPath) {
    return {
      id: 'whisper_cpp',
      displayName: 'whisper.cpp',
      requiredFor: ['transcription'],
      status: 'partial',
      resolvedPath: null,
      version: null,
      checkedAt,
      capabilities: {
        binaryExecutable: false,
        modelAvailable
      },
      error: 'whisper.cpp binary is not configured or was not found.'
    };
  }

  const help = await runCommand(resolvedPath, ['--help']);
  const binaryExecutable = help.ok;

  if (!binaryExecutable) {
    return unavailable('whisper_cpp', 'whisper.cpp', ['transcription'], resolvedPath, checkedAt, help.error, {
      binaryExecutable: false,
      modelAvailable
    });
  }

  const status = modelAvailable ? 'available' : 'partial';
  return {
    id: 'whisper_cpp',
    displayName: 'whisper.cpp',
    requiredFor: ['transcription'],
    status,
    resolvedPath,
    version: firstLine(help.stdout || help.stderr) || 'help command available',
    checkedAt,
    capabilities: {
      binaryExecutable: true,
      modelAvailable,
      modelPath: modelPath ?? null
    },
    error: modelAvailable ? null : 'whisper.cpp binary is executable, but the default model file is missing.'
  };
}

async function resolveExecutable(configuredPath: string | null, executableNames: string[]): Promise<string | null> {
  if (configuredPath && (await isExecutableOrReadable(configuredPath, true))) {
    return configuredPath;
  }

  const searchDirs = [
    ...new Set([
      ...(process.env.PATH?.split(path.delimiter).filter(Boolean) ?? []),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin'
    ])
  ];

  for (const dir of searchDirs) {
    for (const executableName of executableNames) {
      const candidate = path.join(dir, executableName);
      if (await isExecutableOrReadable(candidate, true)) {
        return candidate;
      }
    }
  }

  return null;
}

async function isExecutableOrReadable(filePath: string, executable: boolean): Promise<boolean> {
  try {
    await access(filePath, executable ? constants.X_OK : constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function runCommand(executablePath: string, args: string[]): Promise<{ ok: true; stdout: string; stderr: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      executablePath,
      args,
      {
        timeout: CHECK_TIMEOUT_MS,
        maxBuffer: 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ ok: false, error: error.message || stderr || 'Command failed.' });
          return;
        }
        resolve({ ok: true, stdout, stderr });
      }
    );

    child.on('error', (error) => {
      resolve({ ok: false, error: error.message });
    });
  });
}

function notConfigured(
  id: DependencyCheckResult['id'],
  displayName: string,
  requiredFor: string[],
  checkedAt: string,
  capabilities: Record<string, unknown> = {}
): DependencyCheckResult {
  return {
    id,
    displayName,
    requiredFor,
    status: 'not_configured',
    resolvedPath: null,
    version: null,
    capabilities,
    checkedAt,
    error: `${displayName} is not configured and was not found automatically.`
  };
}

function unavailable(
  id: DependencyCheckResult['id'],
  displayName: string,
  requiredFor: string[],
  resolvedPath: string,
  checkedAt: string,
  error: string,
  capabilities: Record<string, unknown> = {}
): DependencyCheckResult {
  return {
    id,
    displayName,
    requiredFor,
    status: 'unavailable',
    resolvedPath,
    version: null,
    capabilities,
    checkedAt,
    error
  };
}

function firstLine(value: string): string | null {
  return value.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? null;
}
