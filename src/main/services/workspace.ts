import path from 'node:path';
import { access, copyFile, mkdir, readdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type {
  AddAudioClipInput,
  AgentTask,
  ApplyWriteIntentResult,
  AppSettings,
  AudioAnalysis,
  AudioAssetPlaybackData,
  AppendMarkdownDocumentResult,
  AppendTaskResultInput,
  AudioClip,
  AudioEditPlan,
  AudioPeaks,
  AudioProxy,
  AudioAssetProcessingInput,
  AudioTrack,
  CreateAudioTrackInput,
  CreateMarkdownAppendIntentInput,
  CreateProjectInput,
  CreateResearchTaskInput,
  DeleteAudioTrackInput,
  ExportAudioInput,
  ExportJob,
  FileHash,
  GenerateAudioPeaksInput,
  ImportLibraryAssetInput,
  InsertAudioGapInput,
  LibraryAsset,
  LibraryAssetKind,
  LibraryAssetsFile,
  MarkdownAppendWriteIntent,
  ProjectDocument,
  ProjectManifest,
  ProjectSummary,
  RippleDeleteAudioClipInput,
  UpdateAudioTrackInput,
  UpdateAudioClipTimingInput,
  WorkspaceManifest,
  WorkspaceSummary
} from '../../shared/types';
import { createId, slugifyProjectTitle } from './ids';
import { ensureDir, readJsonFile, writeJsonFile, writeTextFile } from './jsonFile';

export async function ensureWorkspace(settings: AppSettings): Promise<WorkspaceSummary> {
  const workspacePath = settings.workspacePath;
  await ensureDir(workspacePath);
  await ensureDir(path.join(workspacePath, 'library', 'projects'));
  await ensureDir(path.join(workspacePath, 'library', 'shared', 'assets'));
  await ensureSharedAssetsIndex(workspacePath);
  await ensureDir(path.join(workspacePath, 'projects'));

  const manifestPath = path.join(workspacePath, 'workspace.json');
  const existing = await readJsonFile<WorkspaceManifest>(manifestPath);
  const now = new Date().toISOString();
  const manifest: WorkspaceManifest =
    existing ??
    {
      schemaVersion: 'workspace.v1',
      id: 'wks_default',
      name: 'Podcast Artist Workspace',
      createdAt: now,
      updatedAt: now,
      libraryPath: 'library',
      projectsPath: 'projects',
      settings: {
        defaultProjectScope: 'project',
        allowCrossProjectAssetReference: true
      }
    };

  await writeJsonFile(manifestPath, { ...manifest, updatedAt: now });
  const projects = await listProjects(settings);
  return { manifest: { ...manifest, updatedAt: now }, path: workspacePath, projects };
}

export async function listProjects(settings: AppSettings): Promise<ProjectSummary[]> {
  const projectsRoot = path.join(settings.workspacePath, 'projects');
  await ensureDir(projectsRoot);
  const entries = await readdir(projectsRoot, { withFileTypes: true });
  const summaries: ProjectSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectRoot = path.join(projectsRoot, entry.name);
    const manifest = await readJsonFile<ProjectManifest>(path.join(projectRoot, 'project.json'));
    if (!manifest) continue;
    summaries.push(await toProjectSummary(settings.workspacePath, projectRoot, manifest));
  }

  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createProject(settings: AppSettings, input: CreateProjectInput): Promise<ProjectSummary> {
  const title = input.title.trim();
  if (!title) {
    throw new Error('Project title is required.');
  }

  await ensureWorkspace(settings);

  const baseSlug = slugifyProjectTitle(title);
  const slug = await createUniqueProjectSlug(settings.workspacePath, baseSlug);
  const projectId = createId('prj');
  const documentId = 'doc_episode';
  const now = new Date().toISOString();

  const projectRoot = path.join(settings.workspacePath, 'projects', slug);
  const appDataRoot = path.join(projectRoot, '.podcast-artist');
  await createProjectDirectories(projectRoot);

  const libraryProjectRoot = path.join(settings.workspacePath, 'library', 'projects', slug);
  await ensureDir(path.join(libraryProjectRoot, 'assets', 'audio'));
  await ensureDir(path.join(libraryProjectRoot, 'assets', 'attachments'));

  const assetsIndexPath = path.join(libraryProjectRoot, 'assets.json');
  const assetsIndex: LibraryAssetsFile = {
    schemaVersion: 'assets.v1',
    scope: 'project',
    projectId,
    assets: []
  };
  await writeJsonFile(assetsIndexPath, assetsIndex);

  const manifest: ProjectManifest = {
    schemaVersion: 'project.v1',
    id: projectId,
    slug,
    title,
    status: 'drafting',
    createdAt: now,
    updatedAt: now,
    document: {
      id: documentId,
      path: 'episode.md'
    },
    library: {
      scope: 'project',
      assetsIndexPath: `../../library/projects/${slug}/assets.json`
    },
    paths: {
      appData: '.podcast-artist',
      exports: 'exports',
      sqlite: 'project.sqlite'
    },
    defaultExportSettings: {
      format: 'wav',
      sampleRate: 48000,
      channels: 2,
      loudnessTargetLufs: -16
    }
  };

  await writeJsonFile(path.join(projectRoot, 'project.json'), manifest);
  await writeTextFile(path.join(projectRoot, 'episode.md'), `# ${title}\n\n`);
  await writeJsonFile(path.join(appDataRoot, 'edit-plans', 'pln_rough_cut.json'), createEmptyEditPlan(projectId, now));

  return toProjectSummary(settings.workspacePath, projectRoot, manifest);
}

export async function importLibraryAsset(settings: AppSettings, input: ImportLibraryAssetInput): Promise<LibraryAsset> {
  const projectRecord = await findProjectById(settings, input.projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const sourceStats = await stat(input.sourcePath);
  if (!sourceStats.isFile()) {
    throw new Error('Only files can be imported as library assets.');
  }

  const assetsIndexPath = path.resolve(projectRecord.projectRoot, projectRecord.manifest.library.assetsIndexPath);
  const assetsIndex = await readJsonFile<LibraryAssetsFile>(assetsIndexPath);
  if (!assetsIndex) {
    throw new Error(`Assets index not found: ${assetsIndexPath}`);
  }

  const now = new Date().toISOString();
  const assetId = createId('ast');
  const originalFileName = path.basename(input.sourcePath);
  const destinationRelativePath = path.join('assets', assetSubdir(input.kind), `${assetId}_${sanitizeFileName(originalFileName)}`);
  const destinationPath = path.join(path.dirname(assetsIndexPath), destinationRelativePath);
  await ensureDir(path.dirname(destinationPath));
  await copyFile(input.sourcePath, destinationPath);

  const asset: LibraryAsset = {
    id: assetId,
    workspaceId: 'wks_default',
    projectId: projectRecord.manifest.id,
    scope: 'project',
    kind: input.kind,
    libraryPath: toPosixPath(destinationRelativePath),
    originalPath: input.sourcePath,
    originalFileName,
    sha256: await hashFile(destinationPath),
    sizeBytes: sourceStats.size,
    mimeType: inferMimeType(originalFileName, input.kind),
    importedAt: now,
    importedBy: 'user',
    metadata: {}
  };

  const nextAssetsIndex: LibraryAssetsFile = {
    ...assetsIndex,
    assets: [...assetsIndex.assets, asset]
  };
  await writeJsonFile(assetsIndexPath, nextAssetsIndex);

  return asset;
}

export async function createMarkdownAppendIntent(
  settings: AppSettings,
  input: CreateMarkdownAppendIntentInput
): Promise<MarkdownAppendWriteIntent> {
  const markdown = input.markdown;
  if (!markdown.trim()) {
    throw new Error('Markdown payload is required.');
  }

  const projectRecord = await findProjectById(settings, input.projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const documentPath = path.join(projectRecord.projectRoot, projectRecord.manifest.document.path);
  const baseHash = await hashTextFile(documentPath);
  const now = new Date().toISOString();
  const intent: MarkdownAppendWriteIntent = {
    schemaVersion: 'writeIntent.v1',
    id: createId('wit'),
    projectId: projectRecord.manifest.id,
    sourceTaskId: input.sourceTaskId ?? null,
    target: {
      kind: 'markdown_document',
      path: projectRecord.manifest.document.path,
      documentId: projectRecord.manifest.document.id
    },
    baseHash,
    operation: {
      type: 'append_markdown',
      markdown
    },
    summary: input.summary.trim() || 'Append markdown',
    status: 'pending',
    createdAt: now,
    appliedAt: null,
    error: null
  };

  const pendingPath = path.join(projectRecord.projectRoot, '.podcast-artist', 'write-journal', 'pending', `${intent.id}.json`);
  await writeJsonFile(pendingPath, intent);
  return intent;
}

export async function applyPendingWriteIntents(settings: AppSettings, projectId: string): Promise<ApplyWriteIntentResult> {
  const projectRecord = await findProjectById(settings, projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const journalRoot = path.join(projectRecord.projectRoot, '.podcast-artist', 'write-journal');
  const pendingRoot = path.join(journalRoot, 'pending');
  await ensureDir(pendingRoot);
  const pendingFiles = (await readdir(pendingRoot)).filter((fileName) => fileName.endsWith('.json')).sort();
  const result: ApplyWriteIntentResult = {
    projectId,
    applied: 0,
    failed: 0,
    skipped: 0
  };

  for (const fileName of pendingFiles) {
    const pendingPath = path.join(pendingRoot, fileName);
    const applyingPath = path.join(journalRoot, 'applying', fileName);
    const intent = await readJsonFile<MarkdownAppendWriteIntent>(pendingPath);
    if (!intent) {
      result.skipped += 1;
      continue;
    }

    await ensureDir(path.dirname(applyingPath));
    await rename(pendingPath, applyingPath);
    const applyingIntent: MarkdownAppendWriteIntent = { ...intent, status: 'applying', error: null };
    await writeJsonFile(applyingPath, applyingIntent);

    const completedIntent = await applyMarkdownAppendIntent(projectRecord.projectRoot, projectRecord.manifest, applyingIntent);
    const destinationState = completedIntent.status === 'applied' ? 'applied' : 'failed';
    const destinationPath = path.join(journalRoot, destinationState, fileName);
    await writeJsonFile(destinationPath, completedIntent);
    await unlink(applyingPath);

    if (completedIntent.status === 'applied') {
      result.applied += 1;
    } else {
      result.failed += 1;
    }
  }

  return result;
}

export async function readProjectDocument(settings: AppSettings, projectId: string): Promise<ProjectDocument> {
  const projectRecord = await findProjectById(settings, projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const documentPath = path.join(projectRecord.projectRoot, projectRecord.manifest.document.path);
  return {
    projectId: projectRecord.manifest.id,
    documentId: projectRecord.manifest.document.id,
    path: projectRecord.manifest.document.path,
    content: await readFile(documentPath, 'utf8'),
    hash: await hashTextFile(documentPath)
  };
}

export async function appendMarkdownToProjectDocument(
  settings: AppSettings,
  input: CreateMarkdownAppendIntentInput
): Promise<AppendMarkdownDocumentResult> {
  const intent = await createMarkdownAppendIntent(settings, input);
  const applyResult = await applyPendingWriteIntents(settings, input.projectId);
  const document = await readProjectDocument(settings, input.projectId);
  return {
    intent,
    applyResult,
    document
  };
}

export async function createResearchTask(settings: AppSettings, input: CreateResearchTaskInput): Promise<AgentTask> {
  const projectRecord = await findProjectById(settings, input.projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const userPrompt = input.userPrompt.trim();
  if (!userPrompt) {
    throw new Error('Task prompt is required.');
  }

  const resultMarkdown = input.resultMarkdown.trim();
  if (!resultMarkdown) {
    throw new Error('Task result is required.');
  }

  const taskId = createId('tsk');
  const taskRoot = path.join(projectRecord.projectRoot, '.podcast-artist', 'tasks', taskId);
  const now = new Date().toISOString();
  const task: AgentTask = {
    schemaVersion: 'agentTask.v1',
    id: taskId,
    projectId: projectRecord.manifest.id,
    documentId: projectRecord.manifest.document.id,
    segmentId: input.segmentId ?? null,
    type: 'research',
    title: input.title.trim() || userPrompt.slice(0, 48),
    status: 'completed',
    provider: {
      kind: 'research',
      profileId: input.providerProfileId ?? null
    },
    userPrompt,
    contextPath: 'context.md',
    resultPath: 'result.md',
    writeIntentPath: null,
    createdAt: now,
    completedAt: now,
    error: null
  };

  await writeTextFile(path.join(taskRoot, task.contextPath), input.contextMarkdown.trimEnd() + '\n');
  await writeTextFile(path.join(taskRoot, task.resultPath), resultMarkdown + '\n');
  await writeJsonFile(path.join(taskRoot, 'task.json'), task);
  return task;
}

export async function readProjectTasks(settings: AppSettings, projectId: string): Promise<AgentTask[]> {
  const projectRecord = await findProjectById(settings, projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const tasksRoot = path.join(projectRecord.projectRoot, '.podcast-artist', 'tasks');
  await ensureDir(tasksRoot);
  const entries = await readdir(tasksRoot, { withFileTypes: true });
  const tasks = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => readJsonFile<AgentTask>(path.join(tasksRoot, entry.name, 'task.json')))
  );

  return tasks
    .filter((task): task is AgentTask => Boolean(task))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function appendTaskResultToDocument(
  settings: AppSettings,
  input: AppendTaskResultInput
): Promise<AppendMarkdownDocumentResult> {
  const projectRecord = await findProjectById(settings, input.projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const taskPath = path.join(projectRecord.projectRoot, '.podcast-artist', 'tasks', input.taskId, 'task.json');
  const task = await readJsonFile<AgentTask>(taskPath);
  if (!task) {
    throw new Error(`Task not found: ${input.taskId}`);
  }

  const resultMarkdown = await readFile(path.join(path.dirname(taskPath), task.resultPath), 'utf8');
  const appendResult = await appendMarkdownToProjectDocument(settings, {
    projectId: input.projectId,
    markdown: `\n${resultMarkdown.trimEnd()}\n`,
    summary: input.summary,
    sourceTaskId: task.id
  });
  const writeIntentPath = path.join('..', '..', 'write-journal', 'applied', `${appendResult.intent.id}.json`);
  await writeJsonFile(taskPath, { ...task, writeIntentPath });

  return appendResult;
}

export async function readProjectLibrary(settings: AppSettings, projectId: string): Promise<LibraryAssetsFile> {
  const projectRecord = await findProjectById(settings, projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const assetsIndexPath = path.resolve(projectRecord.projectRoot, projectRecord.manifest.library.assetsIndexPath);
  const library = await readJsonFile<LibraryAssetsFile>(assetsIndexPath);
  if (!library) {
    throw new Error(`Assets index not found: ${assetsIndexPath}`);
  }

  return library;
}

export async function analyzeAudioAsset(settings: AppSettings, input: AudioAssetProcessingInput): Promise<AudioAnalysis> {
  const { projectRecord, library, asset, assetPath } = await getProjectAudioAsset(settings, input.projectId, input.assetId);
  const ffprobePath = await resolveFfprobeExecutable(settings);
  if (!ffprobePath) {
    throw new Error('ffprobe is not configured or was not found.');
  }

  const probeJson = await runCommandCaptureStdout(ffprobePath, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_streams',
    '-show_format',
    assetPath
  ]);
  const parsed = parseFfprobeAudioAnalysis(probeJson);
  const now = new Date().toISOString();
  const analysis: AudioAnalysis = {
    schemaVersion: 'audioAnalysis.v1',
    projectId: projectRecord.manifest.id,
    assetId: asset.id,
    durationMs: parsed.durationMs,
    sampleRate: parsed.sampleRate,
    channels: parsed.channels,
    codecName: parsed.codecName,
    bitRate: parsed.bitRate,
    sourceHash: asset.sha256,
    analyzedAt: now
  };

  await writeJsonFile(path.join(projectRecord.projectRoot, '.podcast-artist', 'audio-cache', 'analysis', `${asset.id}.json`), analysis);
  await updateLibraryAsset(settings, input.projectId, asset.id, {
    ...asset,
    metadata: {
      ...asset.metadata,
      audio: {
        durationMs: analysis.durationMs,
        sampleRate: analysis.sampleRate,
        channels: analysis.channels,
        codecName: analysis.codecName,
        bitRate: analysis.bitRate,
        analyzedAt: analysis.analyzedAt
      }
    }
  });
  return analysis;
}

export async function generateAudioProxy(settings: AppSettings, input: AudioAssetProcessingInput): Promise<AudioProxy> {
  const { projectRecord, asset, assetPath } = await getProjectAudioAsset(settings, input.projectId, input.assetId);
  const ffmpegPath = await resolveFfmpegExecutable(settings);
  if (!ffmpegPath) {
    throw new Error('FFmpeg is not configured or was not found.');
  }

  const now = new Date().toISOString();
  const proxyPath = toPosixPath(path.join('.podcast-artist', 'audio-cache', 'proxy', `${asset.id}.wav`));
  const proxyAbsolutePath = path.join(projectRecord.projectRoot, proxyPath);
  await ensureDir(path.dirname(proxyAbsolutePath));
  await runCommand(ffmpegPath, [
    '-y',
    '-i',
    assetPath,
    '-vn',
    '-ar',
    '48000',
    '-ac',
    '2',
    proxyAbsolutePath
  ]);

  const proxy: AudioProxy = {
    schemaVersion: 'audioProxy.v1',
    projectId: projectRecord.manifest.id,
    assetId: asset.id,
    proxyPath,
    format: 'wav',
    sampleRate: 48000,
    channels: 2,
    sourceHash: asset.sha256,
    generatedAt: now
  };
  await writeJsonFile(path.join(projectRecord.projectRoot, '.podcast-artist', 'audio-cache', 'proxy', `${asset.id}.json`), proxy);
  return proxy;
}

export async function generateAudioPeaks(settings: AppSettings, input: GenerateAudioPeaksInput): Promise<AudioPeaks> {
  const { projectRecord, asset, assetPath } = await getProjectAudioAsset(settings, input.projectId, input.assetId);
  const ffmpegPath = await resolveFfmpegExecutable(settings);
  if (!ffmpegPath) {
    throw new Error('FFmpeg is not configured or was not found.');
  }

  const pointsPerSecond = input.pointsPerSecond ?? 20;
  const knownDurationMs = getAssetDurationMs(asset);
  const rawPcm = await runCommandCaptureBuffer(ffmpegPath, [
    '-i',
    assetPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    String(pointsPerSecond),
    '-f',
    'f32le',
    '-'
  ]);
  const sampleCount = Math.floor(rawPcm.length / 4);
  const durationMs = knownDurationMs ?? Math.ceil((sampleCount / pointsPerSecond) * 1000);
  const desiredPoints = knownDurationMs ? Math.max(1, Math.ceil((knownDurationMs / 1000) * pointsPerSecond)) : sampleCount;
  const peaks = buildPeaksFromFloat32Buffer(rawPcm, desiredPoints);
  const now = new Date().toISOString();
  const peaksFile: AudioPeaks = {
    schemaVersion: 'audioPeaks.v1',
    projectId: projectRecord.manifest.id,
    assetId: asset.id,
    pointsPerSecond,
    durationMs,
    peaks,
    sourceHash: asset.sha256,
    generatedAt: now
  };
  await writeJsonFile(path.join(projectRecord.projectRoot, '.podcast-artist', 'audio-cache', 'peaks', `${asset.id}.json`), peaksFile);
  return peaksFile;
}

export async function readAudioAssetPlaybackData(
  settings: AppSettings,
  input: AudioAssetProcessingInput
): Promise<AudioAssetPlaybackData> {
  const { projectRecord, asset, assetPath } = await getProjectAudioAsset(settings, input.projectId, input.assetId);
  const sourceUrl = pathToFileURL(assetPath).toString();
  const proxy = await readJsonFile<AudioProxy>(
    path.join(projectRecord.projectRoot, '.podcast-artist', 'audio-cache', 'proxy', `${asset.id}.json`)
  );
  const peaks = await readJsonFile<AudioPeaks>(
    path.join(projectRecord.projectRoot, '.podcast-artist', 'audio-cache', 'peaks', `${asset.id}.json`)
  );
  const validProxy = proxy?.sourceHash === asset.sha256 ? proxy : null;
  const validPeaks = peaks?.sourceHash === asset.sha256 ? peaks : null;
  const proxyAbsolutePath = validProxy ? path.join(projectRecord.projectRoot, validProxy.proxyPath) : null;
  const proxyUrl = proxyAbsolutePath && (await fileExists(proxyAbsolutePath)) ? pathToFileURL(proxyAbsolutePath).toString() : null;

  return {
    schemaVersion: 'audioAssetPlayback.v1',
    projectId: projectRecord.manifest.id,
    assetId: asset.id,
    sourceUrl,
    proxyUrl,
    preferredUrl: proxyUrl ?? sourceUrl,
    durationMs: validPeaks?.durationMs ?? getAssetDurationMs(asset),
    peaks: validPeaks,
    sourceHash: asset.sha256,
    loadedAt: new Date().toISOString()
  };
}

export async function readAudioEditPlan(settings: AppSettings, projectId: string): Promise<AudioEditPlan> {
  const projectRecord = await findProjectById(settings, projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${projectId}`);
  }

  return readAudioEditPlanForProject(projectRecord.projectRoot);
}

export async function createAudioTrackInEditPlan(settings: AppSettings, input: CreateAudioTrackInput): Promise<AudioEditPlan> {
  const projectRecord = await findProjectById(settings, input.projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const plan = await readAudioEditPlanForProject(projectRecord.projectRoot);
  const trackName = normalizeTrackName(input.name, plan.tracks.length);
  if (plan.tracks.some((track) => track.name === trackName)) return plan;

  const now = new Date().toISOString();
  const nextPlan: AudioEditPlan = {
    ...plan,
    tracks: [...plan.tracks, createAudioTrack(trackName)],
    updatedAt: now
  };
  await writeAudioEditPlanForProject(projectRecord.projectRoot, nextPlan);
  await touchProjectManifest(projectRecord.projectRoot, projectRecord.manifest, now);
  return nextPlan;
}

export async function updateAudioTrackInEditPlan(settings: AppSettings, input: UpdateAudioTrackInput): Promise<AudioEditPlan> {
  const projectRecord = await findProjectById(settings, input.projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const plan = await readAudioEditPlanForProject(projectRecord.projectRoot);
  const track = plan.tracks.find((item) => item.id === input.trackId);
  if (!track) {
    throw new Error(`Audio track not found: ${input.trackId}`);
  }

  const nextName = input.name === undefined ? track.name : input.name.trim() || track.name;
  if (nextName !== track.name && plan.tracks.some((item) => item.id !== track.id && item.name === nextName)) {
    throw new Error(`Audio track name already exists: ${nextName}`);
  }

  const now = new Date().toISOString();
  const nextPlan: AudioEditPlan = {
    ...plan,
    tracks: plan.tracks.map((item) =>
      item.id === track.id
        ? {
            ...item,
            name: nextName,
            muted: input.muted ?? item.muted
          }
        : item
    ),
    updatedAt: now
  };
  await writeAudioEditPlanForProject(projectRecord.projectRoot, nextPlan);
  await touchProjectManifest(projectRecord.projectRoot, projectRecord.manifest, now);
  return nextPlan;
}

export async function deleteAudioTrackInEditPlan(settings: AppSettings, input: DeleteAudioTrackInput): Promise<AudioEditPlan> {
  const projectRecord = await findProjectById(settings, input.projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const plan = await readAudioEditPlanForProject(projectRecord.projectRoot);
  const track = plan.tracks.find((item) => item.id === input.trackId);
  if (!track) {
    throw new Error(`Audio track not found: ${input.trackId}`);
  }
  if (plan.clips.some((clip) => clip.trackId === track.id)) {
    throw new Error('Cannot delete an audio track that contains clips.');
  }
  if (plan.tracks.length <= 1) {
    throw new Error('At least one audio track is required.');
  }

  const now = new Date().toISOString();
  const nextPlan: AudioEditPlan = {
    ...plan,
    tracks: plan.tracks.filter((item) => item.id !== track.id),
    updatedAt: now
  };
  await writeAudioEditPlanForProject(projectRecord.projectRoot, nextPlan);
  await touchProjectManifest(projectRecord.projectRoot, projectRecord.manifest, now);
  return nextPlan;
}

export async function addAudioClipToEditPlan(settings: AppSettings, input: AddAudioClipInput): Promise<AudioClip> {
  const projectRecord = await findProjectById(settings, input.projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  if (input.sourceEndMs <= input.sourceStartMs) {
    throw new Error('Clip sourceEndMs must be greater than sourceStartMs.');
  }

  const library = await readProjectLibrary(settings, input.projectId);
  const asset = library.assets.find((item) => item.id === input.assetId);
  if (!asset || asset.kind !== 'audio') {
    throw new Error(`Audio asset not found: ${input.assetId}`);
  }

  const plan = await readAudioEditPlanForProject(projectRecord.projectRoot);
  const trackName = normalizeTrackName(input.trackName, plan.tracks.length);
  const existingTrack = plan.tracks.find((track) => track.name === trackName);
  const track = existingTrack ?? createAudioTrack(trackName);
  const trackClips = plan.clips.filter((clip) => clip.trackId === track.id);
  const timelineStartMs = trackClips.reduce(
    (max, clip) => Math.max(max, clip.timelineStartMs + clipDurationMs(clip)),
    0
  );
  const clip: AudioClip = {
    id: createId('clp'),
    trackId: track.id,
    assetId: asset.id,
    sourceStartMs: input.sourceStartMs,
    sourceEndMs: input.sourceEndMs,
    timelineStartMs,
    gainDb: 0,
    fadeInMs: 20,
    fadeOutMs: 20
  };
  const nextPlan: AudioEditPlan = {
    ...plan,
    tracks: existingTrack ? plan.tracks : [...plan.tracks, track],
    clips: [...plan.clips, clip].sort(sortClips),
    updatedAt: new Date().toISOString()
  };
  await writeAudioEditPlanForProject(projectRecord.projectRoot, nextPlan);
  await touchProjectManifest(projectRecord.projectRoot, projectRecord.manifest, nextPlan.updatedAt);

  return clip;
}

export async function rippleDeleteAudioClip(
  settings: AppSettings,
  input: RippleDeleteAudioClipInput
): Promise<AudioEditPlan> {
  const projectRecord = await findProjectById(settings, input.projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const plan = await readAudioEditPlanForProject(projectRecord.projectRoot);
  const removedClip = plan.clips.find((clip) => clip.id === input.clipId);
  if (!removedClip) {
    throw new Error(`Clip not found: ${input.clipId}`);
  }

  const removedDurationMs = clipDurationMs(removedClip);
  const nextPlan: AudioEditPlan = {
    ...plan,
    clips: plan.clips
      .filter((clip) => clip.id !== removedClip.id)
      .map((clip) =>
        clip.trackId === removedClip.trackId && clip.timelineStartMs > removedClip.timelineStartMs
          ? { ...clip, timelineStartMs: Math.max(0, clip.timelineStartMs - removedDurationMs) }
          : clip
      )
      .sort(sortClips),
    updatedAt: new Date().toISOString()
  };
  await writeAudioEditPlanForProject(projectRecord.projectRoot, nextPlan);
  await touchProjectManifest(projectRecord.projectRoot, projectRecord.manifest, nextPlan.updatedAt);
  return nextPlan;
}

export async function updateAudioClipTiming(
  settings: AppSettings,
  input: UpdateAudioClipTimingInput
): Promise<AudioEditPlan> {
  const projectRecord = await findProjectById(settings, input.projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const sourceStartMs = Math.max(0, Math.round(input.sourceStartMs));
  const sourceEndMs = Math.max(0, Math.round(input.sourceEndMs));
  if (sourceEndMs <= sourceStartMs) {
    throw new Error('Clip sourceEndMs must be greater than sourceStartMs.');
  }

  const plan = await readAudioEditPlanForProject(projectRecord.projectRoot);
  const existingClip = plan.clips.find((clip) => clip.id === input.clipId);
  if (!existingClip) {
    throw new Error(`Clip not found: ${input.clipId}`);
  }

  const previousDurationMs = clipDurationMs(existingClip);
  const nextDurationMs = sourceEndMs - sourceStartMs;
  const durationDeltaMs = nextDurationMs - previousDurationMs;
  const nextPlan: AudioEditPlan = {
    ...plan,
    clips: plan.clips
      .map((clip) => {
        if (clip.id === existingClip.id) {
          return { ...clip, sourceStartMs, sourceEndMs };
        }
        if (clip.trackId === existingClip.trackId && clip.timelineStartMs > existingClip.timelineStartMs) {
          return { ...clip, timelineStartMs: Math.max(0, clip.timelineStartMs + durationDeltaMs) };
        }
        return clip;
      })
      .sort(sortClips),
    updatedAt: new Date().toISOString()
  };

  await writeAudioEditPlanForProject(projectRecord.projectRoot, nextPlan);
  await touchProjectManifest(projectRecord.projectRoot, projectRecord.manifest, nextPlan.updatedAt);
  return nextPlan;
}

export async function insertAudioGap(settings: AppSettings, input: InsertAudioGapInput): Promise<AudioEditPlan> {
  const projectRecord = await findProjectById(settings, input.projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const timelineStartMs = Math.max(0, Math.round(input.timelineStartMs));
  const durationMs = Math.max(0, Math.round(input.durationMs));
  if (durationMs <= 0) {
    throw new Error('Gap durationMs must be greater than 0.');
  }

  const plan = await readAudioEditPlanForProject(projectRecord.projectRoot);
  if (!plan.tracks.some((track) => track.id === input.trackId)) {
    throw new Error(`Track not found: ${input.trackId}`);
  }

  const nextPlan: AudioEditPlan = {
    ...plan,
    clips: plan.clips
      .map((clip) =>
        clip.trackId === input.trackId && clip.timelineStartMs >= timelineStartMs
          ? { ...clip, timelineStartMs: clip.timelineStartMs + durationMs }
          : clip
      )
      .sort(sortClips),
    updatedAt: new Date().toISOString()
  };

  await writeAudioEditPlanForProject(projectRecord.projectRoot, nextPlan);
  await touchProjectManifest(projectRecord.projectRoot, projectRecord.manifest, nextPlan.updatedAt);
  return nextPlan;
}

export interface FfmpegRenderClipInput {
  inputPath: string;
  sourceStartMs: number;
  sourceEndMs: number;
  timelineStartMs: number;
  gainDb: number;
  fadeInMs: number;
  fadeOutMs: number;
}

export interface FfmpegRenderArgsInput {
  clips: FfmpegRenderClipInput[];
  sampleRate: number;
  channels: number;
  loudnessTargetLufs: number;
  outputPath: string;
}

export function buildFfmpegRenderArgs(input: FfmpegRenderArgsInput): string[] {
  if (!input.clips.length) {
    throw new Error('At least one clip is required for export.');
  }

  const args = ['-y'];
  const chains: string[] = [];
  for (const [index, clip] of input.clips.entries()) {
    const durationMs = clip.sourceEndMs - clip.sourceStartMs;
    if (durationMs <= 0) {
      throw new Error('Clip duration must be positive.');
    }

    args.push('-ss', formatSeconds(clip.sourceStartMs), '-t', formatSeconds(durationMs), '-i', clip.inputPath);
    const filters = [`[${index}:a]asetpts=PTS-STARTPTS`];
    if (clip.gainDb !== 0) {
      filters.push(`volume=${clip.gainDb}dB`);
    }
    if (clip.fadeInMs > 0) {
      filters.push(`afade=t=in:st=0:d=${formatSeconds(clip.fadeInMs)}`);
    }
    if (clip.fadeOutMs > 0) {
      filters.push(`afade=t=out:st=${formatSeconds(Math.max(0, durationMs - clip.fadeOutMs))}:d=${formatSeconds(clip.fadeOutMs)}`);
    }
    if (clip.timelineStartMs > 0) {
      filters.push(`adelay=${formatFfmpegDelay(clip.timelineStartMs, input.channels)}`);
    }
    chains.push(`${filters.join(',')}[a${index}]`);
  }

  const loudnorm = `loudnorm=I=${input.loudnessTargetLufs}:TP=-1.5:LRA=11[out]`;
  const clipLabels = input.clips.map((_, index) => `[a${index}]`);
  const filterTail =
    clipLabels.length === 1
      ? `${clipLabels[0]}${loudnorm}`
      : `${clipLabels.join('')}amix=inputs=${clipLabels.length}:duration=longest:normalize=0,${loudnorm}`;
  args.push('-filter_complex', `${chains.join(';')};${filterTail}`, '-map', '[out]', '-ar', String(input.sampleRate), '-ac', String(input.channels), input.outputPath);
  return args;
}

export async function exportAudioEditPlan(settings: AppSettings, input: ExportAudioInput): Promise<ExportJob> {
  const projectRecord = await findProjectById(settings, input.projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const now = new Date().toISOString();
  const jobId = createId('exp');
  const outputPath = toPosixPath(path.join('exports', `${projectRecord.manifest.slug}-${jobId}.wav`));
  const job: ExportJob = {
    schemaVersion: 'exportJob.v1',
    id: jobId,
    projectId: projectRecord.manifest.id,
    sourcePlanId: input.planId ?? 'pln_rough_cut',
    status: 'running',
    settings: {
      format: 'wav',
      sampleRate: projectRecord.manifest.defaultExportSettings.sampleRate,
      channels: projectRecord.manifest.defaultExportSettings.channels,
      loudnessTargetLufs: projectRecord.manifest.defaultExportSettings.loudnessTargetLufs
    },
    outputPath,
    createdAt: now,
    completedAt: null,
    error: null
  };

  await writeExportJob(projectRecord.projectRoot, job);

  try {
    const ffmpegPath = await resolveFfmpegExecutable(settings);
    if (!ffmpegPath) {
      throw new Error('FFmpeg is not configured or was not found.');
    }

    const library = await readProjectLibrary(settings, input.projectId);
    const plan = await readAudioEditPlanForProject(projectRecord.projectRoot);
    const trackById = new Map(plan.tracks.map((track) => [track.id, track]));
    const renderClips = plan.clips
      .filter((clip) => !trackById.get(clip.trackId)?.muted)
      .slice()
      .sort((a, b) => a.timelineStartMs - b.timelineStartMs || a.trackId.localeCompare(b.trackId))
      .map((clip) => {
        const asset = library.assets.find((item) => item.id === clip.assetId);
        if (!asset) {
          throw new Error(`Library asset not found for clip ${clip.id}: ${clip.assetId}`);
        }

        const assetsRoot = path.dirname(path.resolve(projectRecord.projectRoot, projectRecord.manifest.library.assetsIndexPath));
        return {
          inputPath: path.join(assetsRoot, asset.libraryPath),
          sourceStartMs: clip.sourceStartMs,
          sourceEndMs: clip.sourceEndMs,
          timelineStartMs: clip.timelineStartMs,
          gainDb: clip.gainDb,
          fadeInMs: clip.fadeInMs,
          fadeOutMs: clip.fadeOutMs
        };
      });

    const outputAbsolutePath = path.join(projectRecord.projectRoot, outputPath);
    await ensureDir(path.dirname(outputAbsolutePath));
    const args = buildFfmpegRenderArgs({
      clips: renderClips,
      sampleRate: job.settings.sampleRate,
      channels: job.settings.channels,
      loudnessTargetLufs: job.settings.loudnessTargetLufs,
      outputPath: outputAbsolutePath
    });
    await runFfmpeg(ffmpegPath, args);

    const completedJob: ExportJob = {
      ...job,
      status: 'completed',
      completedAt: new Date().toISOString()
    };
    await writeExportJob(projectRecord.projectRoot, completedJob);
    return completedJob;
  } catch (exportError) {
    const failedJob: ExportJob = {
      ...job,
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: exportError instanceof Error ? exportError.message : String(exportError)
    };
    await writeExportJob(projectRecord.projectRoot, failedJob);
    return failedJob;
  }
}

async function createProjectDirectories(projectRoot: string): Promise<void> {
  const dirs = [
    '.podcast-artist/documents/episode',
    '.podcast-artist/document-versions/episode',
    '.podcast-artist/tasks',
    '.podcast-artist/write-journal/pending',
    '.podcast-artist/write-journal/applying',
    '.podcast-artist/write-journal/applied',
    '.podcast-artist/write-journal/failed',
    '.podcast-artist/audio-cache/analysis',
    '.podcast-artist/audio-cache/proxy',
    '.podcast-artist/audio-cache/peaks',
    '.podcast-artist/transcripts',
    '.podcast-artist/edit-plans',
    '.podcast-artist/renders',
    'exports',
    'logs'
  ];

  await Promise.all(dirs.map((dir) => mkdir(path.join(projectRoot, dir), { recursive: true })));
}

async function ensureSharedAssetsIndex(workspacePath: string): Promise<void> {
  const sharedAssetsPath = path.join(workspacePath, 'library', 'shared', 'assets.json');
  const existing = await readJsonFile<LibraryAssetsFile>(sharedAssetsPath);
  if (!existing) {
    await writeJsonFile(sharedAssetsPath, {
      schemaVersion: 'assets.v1',
      scope: 'shared',
      projectId: null,
      assets: []
    } satisfies LibraryAssetsFile);
  }
}

async function createUniqueProjectSlug(workspacePath: string, baseSlug: string): Promise<string> {
  const projectsRoot = path.join(workspacePath, 'projects');
  let slug = baseSlug;
  let index = 2;

  while (await exists(path.join(projectsRoot, slug))) {
    slug = `${baseSlug}-${index}`;
    index += 1;
  }

  return slug;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findProjectById(
  settings: AppSettings,
  projectId: string
): Promise<{ projectRoot: string; manifest: ProjectManifest } | null> {
  const projectsRoot = path.join(settings.workspacePath, 'projects');
  await ensureDir(projectsRoot);
  const entries = await readdir(projectsRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectRoot = path.join(projectsRoot, entry.name);
    const manifest = await readJsonFile<ProjectManifest>(path.join(projectRoot, 'project.json'));
    if (manifest?.id === projectId) {
      return { projectRoot, manifest };
    }
  }

  return null;
}

async function applyMarkdownAppendIntent(
  projectRoot: string,
  manifest: ProjectManifest,
  intent: MarkdownAppendWriteIntent
): Promise<MarkdownAppendWriteIntent> {
  const documentPath = path.join(projectRoot, intent.target.path);
  const currentHash = await hashTextFile(documentPath);
  if (currentHash.value !== intent.baseHash.value) {
    return {
      ...intent,
      status: 'failed',
      error: `Document base hash mismatch. Expected ${intent.baseHash.value}, got ${currentHash.value}.`
    };
  }

  const previousMarkdown = await readFile(documentPath, 'utf8');
  const now = new Date().toISOString();
  await createDocumentVersionSnapshot(projectRoot, manifest, intent, previousMarkdown, currentHash, now);
  await writeTextFile(documentPath, `${previousMarkdown}${intent.operation.markdown}`);
  await writeDocumentSnapshot(projectRoot, manifest, await hashTextFile(documentPath), now);
  await touchProjectManifest(projectRoot, manifest, now);

  return {
    ...intent,
    status: 'applied',
    appliedAt: now,
    error: null
  };
}

async function createDocumentVersionSnapshot(
  projectRoot: string,
  manifest: ProjectManifest,
  intent: MarkdownAppendWriteIntent,
  previousMarkdown: string,
  previousHash: FileHash,
  now: string
): Promise<void> {
  const versionId = createId('ver');
  const versionRoot = path.join(projectRoot, '.podcast-artist', 'document-versions', 'episode', toSafeTimestamp(now));
  await ensureDir(versionRoot);
  await writeTextFile(path.join(versionRoot, 'episode.md'), previousMarkdown);
  await writeJsonFile(path.join(versionRoot, 'meta.json'), {
    schemaVersion: 'documentVersion.v1',
    id: versionId,
    documentId: manifest.document.id,
    documentPath: manifest.document.path,
    snapshotPath: 'episode.md',
    previousHash,
    nextIntentId: intent.id,
    reason: 'apply_write_intent',
    createdAt: now,
    retentionUntil: new Date(new Date(now).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
  });
}

async function writeDocumentSnapshot(
  projectRoot: string,
  manifest: ProjectManifest,
  hash: FileHash,
  now: string
): Promise<void> {
  await writeJsonFile(path.join(projectRoot, '.podcast-artist', 'documents', 'episode', 'snapshot.json'), {
    schemaVersion: 'documentSnapshot.v1',
    documentId: manifest.document.id,
    path: manifest.document.path,
    hash,
    parsedAt: now
  });
}

async function touchProjectManifest(projectRoot: string, manifest: ProjectManifest, updatedAt: string): Promise<void> {
  await writeJsonFile(path.join(projectRoot, 'project.json'), { ...manifest, updatedAt });
}

async function readAudioEditPlanForProject(projectRoot: string): Promise<AudioEditPlan> {
  const planPath = path.join(projectRoot, '.podcast-artist', 'edit-plans', 'pln_rough_cut.json');
  const plan = await readJsonFile<AudioEditPlan>(planPath);
  if (!plan) {
    throw new Error(`Audio edit plan not found: ${planPath}`);
  }
  return plan;
}

async function writeAudioEditPlanForProject(projectRoot: string, plan: AudioEditPlan): Promise<void> {
  await writeJsonFile(path.join(projectRoot, '.podcast-artist', 'edit-plans', 'pln_rough_cut.json'), plan);
}

async function writeExportJob(projectRoot: string, job: ExportJob): Promise<void> {
  await writeJsonFile(path.join(projectRoot, '.podcast-artist', 'renders', `${job.id}.json`), job);
}

async function getProjectAudioAsset(
  settings: AppSettings,
  projectId: string,
  assetId: string
): Promise<{
  projectRecord: { projectRoot: string; manifest: ProjectManifest };
  library: LibraryAssetsFile;
  asset: LibraryAsset;
  assetPath: string;
}> {
  const projectRecord = await findProjectById(settings, projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const assetsIndexPath = path.resolve(projectRecord.projectRoot, projectRecord.manifest.library.assetsIndexPath);
  const library = await readJsonFile<LibraryAssetsFile>(assetsIndexPath);
  if (!library) {
    throw new Error(`Assets index not found: ${assetsIndexPath}`);
  }

  const asset = library.assets.find((item) => item.id === assetId);
  if (!asset || asset.kind !== 'audio') {
    throw new Error(`Audio asset not found: ${assetId}`);
  }

  return {
    projectRecord,
    library,
    asset,
    assetPath: path.join(path.dirname(assetsIndexPath), asset.libraryPath)
  };
}

async function updateLibraryAsset(
  settings: AppSettings,
  projectId: string,
  assetId: string,
  nextAsset: LibraryAsset
): Promise<void> {
  const projectRecord = await findProjectById(settings, projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const assetsIndexPath = path.resolve(projectRecord.projectRoot, projectRecord.manifest.library.assetsIndexPath);
  const library = await readJsonFile<LibraryAssetsFile>(assetsIndexPath);
  if (!library) {
    throw new Error(`Assets index not found: ${assetsIndexPath}`);
  }

  await writeJsonFile(assetsIndexPath, {
    ...library,
    assets: library.assets.map((asset) => (asset.id === assetId ? nextAsset : asset))
  });
}

function parseFfprobeAudioAnalysis(rawJson: string): Pick<AudioAnalysis, 'durationMs' | 'sampleRate' | 'channels' | 'codecName' | 'bitRate'> {
  const parsed = JSON.parse(rawJson) as {
    format?: {
      duration?: string;
      bit_rate?: string;
    };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      sample_rate?: string;
      channels?: number;
      duration?: string;
      bit_rate?: string;
    }>;
  };
  const audioStream = parsed.streams?.find((stream) => stream.codec_type === 'audio') ?? parsed.streams?.[0];
  if (!audioStream) {
    throw new Error('ffprobe did not return an audio stream.');
  }

  const durationSeconds = Number(audioStream.duration ?? parsed.format?.duration ?? 0);
  return {
    durationMs: Math.round(durationSeconds * 1000),
    sampleRate: audioStream.sample_rate ? Number(audioStream.sample_rate) : null,
    channels: audioStream.channels ?? null,
    codecName: audioStream.codec_name ?? null,
    bitRate: Number(audioStream.bit_rate ?? parsed.format?.bit_rate) || null
  };
}

function getAssetDurationMs(asset: LibraryAsset): number | null {
  const audioMetadata = asset.metadata.audio as { durationMs?: unknown } | undefined;
  const durationMs = Number(audioMetadata?.durationMs);
  return Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null;
}

function buildPeaksFromFloat32Buffer(buffer: Buffer, desiredPoints: number): number[] {
  if (buffer.length < 4) {
    return [];
  }

  const sampleCount = Math.floor(buffer.length / 4);
  const samples = Array.from({ length: sampleCount }, (_, index) => Math.abs(buffer.readFloatLE(index * 4)));
  if (sampleCount <= desiredPoints) {
    return samples.map(roundPeak);
  }

  return Array.from({ length: desiredPoints }, (_, pointIndex) => {
    const start = Math.floor((pointIndex / desiredPoints) * sampleCount);
    const end = Math.max(start + 1, Math.floor(((pointIndex + 1) / desiredPoints) * sampleCount));
    return roundPeak(Math.max(...samples.slice(start, end)));
  });
}

function roundPeak(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 10000) / 10000;
}

async function toProjectSummary(workspacePath: string, projectRoot: string, manifest: ProjectManifest): Promise<ProjectSummary> {
  const assetsIndexPath = path.resolve(projectRoot, manifest.library.assetsIndexPath);
  const assetsIndex = await readJsonFile<LibraryAssetsFile>(assetsIndexPath);
  return {
    id: manifest.id,
    slug: manifest.slug,
    title: manifest.title,
    status: manifest.status,
    projectPath: path.relative(workspacePath, projectRoot),
    documentPath: path.join(path.relative(workspacePath, projectRoot), manifest.document.path),
    assetsIndexPath: manifest.library.assetsIndexPath,
    assetCount: assetsIndex?.assets.length ?? 0,
    updatedAt: manifest.updatedAt
  };
}

function assetSubdir(kind: LibraryAssetKind): string {
  return kind === 'audio' ? 'audio' : 'attachments';
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^\p{Letter}\p{Number}._-]+/gu, '_');
}

async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

async function hashTextFile(filePath: string): Promise<FileHash> {
  const content = await readFile(filePath, 'utf8');
  return {
    algorithm: 'sha256',
    value: createHash('sha256').update(content).digest('hex')
  };
}

function inferMimeType(fileName: string, kind: LibraryAssetKind): string {
  const ext = path.extname(fileName).toLowerCase();
  if (kind === 'audio') {
    if (ext === '.wav') return 'audio/wav';
    if (ext === '.mp3') return 'audio/mpeg';
    if (ext === '.m4a') return 'audio/mp4';
    if (ext === '.aac') return 'audio/aac';
    if (ext === '.flac') return 'audio/flac';
    if (ext === '.ogg') return 'audio/ogg';
    return 'audio/*';
  }
  if (ext === '.pdf') return 'application/pdf';
  return 'application/octet-stream';
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function toSafeTimestamp(timestamp: string): string {
  return timestamp.replace(/:/g, '-');
}

function formatSeconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(3);
}

function formatFfmpegDelay(milliseconds: number, channels: number): string {
  const delayMs = String(Math.max(0, Math.round(milliseconds)));
  return Array.from({ length: Math.max(1, channels) }, () => delayMs).join('|');
}

async function resolveFfmpegExecutable(settings: AppSettings): Promise<string | null> {
  if (settings.tools.ffmpeg.path && (await isExecutable(settings.tools.ffmpeg.path))) {
    return settings.tools.ffmpeg.path;
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
    const candidate = path.join(dir, 'ffmpeg');
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function resolveFfprobeExecutable(settings: AppSettings): Promise<string | null> {
  if (settings.tools.ffprobe.path && (await isExecutable(settings.tools.ffprobe.path))) {
    return settings.tools.ffprobe.path;
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
    const candidate = path.join(dir, 'ffprobe');
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function runFfmpeg(executablePath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, {
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-8000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `FFmpeg exited with code ${code ?? 'unknown'}.`));
    });
  });
}

async function runCommand(executablePath: string, args: string[]): Promise<void> {
  await runProcess(executablePath, args, 'ignore');
}

async function runCommandCaptureStdout(executablePath: string, args: string[]): Promise<string> {
  const output = await runProcess(executablePath, args, 'buffer');
  return output.toString('utf8');
}

async function runCommandCaptureBuffer(executablePath: string, args: string[]): Promise<Buffer> {
  return runProcess(executablePath, args, 'buffer');
}

function runProcess(executablePath: string, args: string[], stdoutMode: 'ignore' | 'buffer'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const child = spawn(executablePath, args, {
      stdio: ['ignore', stdoutMode === 'buffer' ? 'pipe' : 'ignore', 'pipe']
    });
    let stderr = '';
    if (stdoutMode === 'buffer' && child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });
    }
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-8000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks));
        return;
      }
      reject(new Error(stderr.trim() || `${path.basename(executablePath)} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

function createAudioTrack(name: string): AudioTrack {
  return {
    id: createId('trk'),
    name,
    kind: 'voice',
    muted: false,
    solo: false,
    gainDb: 0
  };
}

function createDefaultAudioTracks(): AudioTrack[] {
  return [createAudioTrack('音轨 1'), createAudioTrack('音轨 2')];
}

function normalizeTrackName(name: string | undefined, existingTrackCount: number): string {
  const trimmed = name?.trim();
  return trimmed || `音轨 ${existingTrackCount + 1}`;
}

function clipDurationMs(clip: Pick<AudioClip, 'sourceStartMs' | 'sourceEndMs'>): number {
  return clip.sourceEndMs - clip.sourceStartMs;
}

function sortClips(a: AudioClip, b: AudioClip): number {
  if (a.trackId !== b.trackId) return a.trackId.localeCompare(b.trackId);
  return a.timelineStartMs - b.timelineStartMs;
}

function createEmptyEditPlan(projectId: string, now: string): AudioEditPlan {
  return {
    schemaVersion: 'audioEditPlan.v1',
    id: 'pln_rough_cut',
    projectId,
    title: 'Rough Cut',
    timebase: {
      unit: 'ms',
      sampleRate: 48000
    },
    tracks: createDefaultAudioTracks(),
    clips: [],
    processing: {
      loudnessNormalization: {
        enabled: true,
        targetLufs: -16
      },
      denoise: {
        enabled: false,
        providerProfileId: null
      }
    },
    exportDefaults: {
      format: 'wav',
      sampleRate: 48000,
      channels: 2
    },
    updatedAt: now
  };
}
