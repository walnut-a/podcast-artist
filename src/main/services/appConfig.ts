import { app } from 'electron';
import path from 'node:path';
import type { AppSettings, DependencyStatusFile, ProviderProfile, ProviderProfilesFile } from '../../shared/types';
import { ensureDir, readJsonFile, writeJsonFile } from './jsonFile';

export interface AppConfigStore {
  userDataPath: string;
  settingsPath: string;
  providerProfilesPath: string;
  dependencyStatusPath: string;
}

export function getAppConfigStore(): AppConfigStore {
  const userDataPath = app.getPath('userData');
  return {
    userDataPath,
    settingsPath: path.join(userDataPath, 'settings.json'),
    providerProfilesPath: path.join(userDataPath, 'provider-profiles.json'),
    dependencyStatusPath: path.join(userDataPath, 'dependency-status.json')
  };
}

export async function ensureAppConfig(): Promise<{
  store: AppConfigStore;
  settings: AppSettings;
  providers: ProviderProfilesFile;
  dependencies: DependencyStatusFile;
}> {
  const store = getAppConfigStore();
  await ensureDir(store.userDataPath);

  const settings = (await readJsonFile<AppSettings>(store.settingsPath)) ?? createDefaultSettings();
  const providers = normalizeProviderProfiles(
    (await readJsonFile<ProviderProfilesFile>(store.providerProfilesPath)) ?? createDefaultProviderProfiles()
  );
  const dependencies =
    (await readJsonFile<DependencyStatusFile>(store.dependencyStatusPath)) ?? createEmptyDependencyStatus();

  await writeJsonFile(store.settingsPath, settings);
  await writeJsonFile(store.providerProfilesPath, providers);
  await writeJsonFile(store.dependencyStatusPath, dependencies);

  return { store, settings, providers, dependencies };
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const store = getAppConfigStore();
  await writeJsonFile(store.settingsPath, settings);
  return settings;
}

export async function saveProviderProfiles(providers: ProviderProfilesFile): Promise<ProviderProfilesFile> {
  const store = getAppConfigStore();
  const normalized = normalizeProviderProfiles(providers);
  await writeJsonFile(store.providerProfilesPath, normalized);
  return normalized;
}

export async function saveDependencyStatus(dependencies: DependencyStatusFile): Promise<DependencyStatusFile> {
  const store = getAppConfigStore();
  await writeJsonFile(store.dependencyStatusPath, dependencies);
  return dependencies;
}

function createDefaultSettings(): AppSettings {
  return {
    schemaVersion: 'appSettings.v1',
    workspacePath: path.join(app.getPath('documents'), 'Podcast Artist Workspace'),
    defaultProviderProfileId: 'prv_local_openai_compatible',
    defaultTranscriptionProfileId: 'prv_local_whisper_cpp',
    tools: {
      ffmpeg: {
        path: null,
        autoDetect: true
      },
      ffprobe: {
        path: null,
        autoDetect: true
      },
      whisperCpp: {
        path: null,
        modelDirectory: null,
        defaultModelPath: null,
        autoDetect: true
      }
    }
  };
}

function createDefaultProviderProfiles(): ProviderProfilesFile {
  return {
    schemaVersion: 'providerProfiles.v1',
    profiles: [
      {
        id: 'prv_local_openai_compatible',
        kind: 'chat',
        displayName: 'Local OpenAI-compatible',
        baseUrl: 'http://localhost:11434/v1',
        model: null,
        credentialSource: { kind: 'none' },
        capabilities: ['chat', 'rewrite', 'research']
      },
      {
        id: 'prv_local_whisper_cpp',
        kind: 'transcription',
        displayName: 'Local whisper.cpp',
        baseUrl: null,
        model: null,
        credentialSource: { kind: 'none' },
        capabilities: ['transcription']
      },
      {
        id: 'prv_online_transcription',
        kind: 'transcription',
        displayName: 'User configured online transcription',
        baseUrl: null,
        model: null,
        credentialSource: { kind: 'runtime_prompt' },
        capabilities: ['transcription']
      }
    ]
  };
}

function normalizeProviderProfiles(providers: ProviderProfilesFile): ProviderProfilesFile {
  return {
    ...providers,
    profiles: providers.profiles.map((profile) => {
      const rawProfile = profile as Partial<ProviderProfile> & Omit<ProviderProfile, 'credentialSource'>;
      return {
        id: rawProfile.id,
        kind: rawProfile.kind,
        displayName: rawProfile.displayName,
        baseUrl: rawProfile.baseUrl,
        model: rawProfile.model,
        credentialSource: rawProfile.credentialSource ?? { kind: 'none' },
        capabilities: rawProfile.capabilities
      };
    })
  };
}

function createEmptyDependencyStatus(): DependencyStatusFile {
  return {
    schemaVersion: 'dependencyStatus.v1',
    checkedAt: null,
    dependencies: []
  };
}
