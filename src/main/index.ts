import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AddAudioClipInput,
  AppendTaskResultInput,
  AppSettings,
  AudioAssetProcessingInput,
  CreateAudioTrackInput,
  CreateMarkdownAppendIntentInput,
  CreateProjectInput,
  CreateResearchTaskInput,
  DeleteAudioTrackInput,
  ExportAudioInput,
  GenerateAudioPeaksInput,
  ProviderProfilesFile,
  RippleDeleteAudioClipInput,
  UpdateAudioTrackInput,
  UpdateAudioClipTimingInput
} from '../shared/types';
import { ensureAppConfig, saveDependencyStatus, saveProviderProfiles, saveSettings } from './services/appConfig';
import { runDependencyChecks } from './services/dependencies';
import {
  appendMarkdownToProjectDocument,
  addAudioClipToEditPlan,
  analyzeAudioAsset,
  appendTaskResultToDocument,
  createAudioTrackInEditPlan,
  createResearchTask,
  createProject,
  ensureWorkspace,
  exportAudioEditPlan,
  generateAudioPeaks,
  generateAudioProxy,
  importLibraryAsset,
  readAudioEditPlan,
  readAudioAssetPlaybackData,
  readProjectLibrary,
  readProjectDocument,
  readProjectTasks,
  rippleDeleteAudioClip,
  updateAudioTrackInEditPlan,
  deleteAudioTrackInEditPlan,
  updateAudioClipTiming
} from './services/workspace';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#0b0d0b',
    title: 'Podcast Artist',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function registerIpc(): void {
  ipcMain.handle('app:getBootstrapState', async () => {
    const { store, settings, providers, dependencies } = await ensureAppConfig();
    const workspace = await ensureWorkspace(settings);
    return {
      userDataPath: store.userDataPath,
      settings,
      providers,
      dependencies,
      workspace
    };
  });

  ipcMain.handle('settings:update', async (_event, settings: AppSettings) => {
    const saved = await saveSettings(settings);
    const { store, providers, dependencies } = await ensureAppConfig();
    const workspace = await ensureWorkspace(saved);
    return {
      userDataPath: store.userDataPath,
      settings: saved,
      providers,
      dependencies,
      workspace
    };
  });

  ipcMain.handle('providers:update', async (_event, providers: ProviderProfilesFile) => {
    const savedProviders = await saveProviderProfiles(providers);
    const { store, settings, dependencies } = await ensureAppConfig();
    const workspace = await ensureWorkspace(settings);
    return {
      userDataPath: store.userDataPath,
      settings,
      providers: savedProviders,
      dependencies,
      workspace
    };
  });

  ipcMain.handle('dependencies:check', async () => {
    const { settings } = await ensureAppConfig();
    const result = await runDependencyChecks(settings);
    return saveDependencyStatus(result);
  });

  ipcMain.handle('workspace:refresh', async () => {
    const { settings } = await ensureAppConfig();
    return ensureWorkspace(settings);
  });

  ipcMain.handle('workspace:createProject', async (_event, input: CreateProjectInput) => {
    const { settings } = await ensureAppConfig();
    return createProject(settings, input);
  });

  ipcMain.handle('workspace:importAudioAsset', async (_event, projectId: string) => {
    const dialogOptions = {
      title: '导入音频素材',
      properties: ['openFile'],
      filters: [
        {
          name: 'Audio files',
          extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg']
        },
        {
          name: 'All files',
          extensions: ['*']
        }
      ]
    } satisfies Electron.OpenDialogOptions;
    const { canceled, filePaths } = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (canceled || !filePaths[0]) {
      return null;
    }

    const { settings } = await ensureAppConfig();
    return importLibraryAsset(settings, {
      projectId,
      sourcePath: filePaths[0],
      kind: 'audio'
    });
  });

  ipcMain.handle('document:readProjectDocument', async (_event, projectId: string) => {
    const { settings } = await ensureAppConfig();
    return readProjectDocument(settings, projectId);
  });

  ipcMain.handle('document:appendMarkdown', async (_event, input: CreateMarkdownAppendIntentInput) => {
    const { settings } = await ensureAppConfig();
    return appendMarkdownToProjectDocument(settings, input);
  });

  ipcMain.handle('task:createResearchTask', async (_event, input: CreateResearchTaskInput) => {
    const { settings } = await ensureAppConfig();
    return createResearchTask(settings, input);
  });

  ipcMain.handle('task:readProjectTasks', async (_event, projectId: string) => {
    const { settings } = await ensureAppConfig();
    return readProjectTasks(settings, projectId);
  });

  ipcMain.handle('task:appendResultToDocument', async (_event, input: AppendTaskResultInput) => {
    const { settings } = await ensureAppConfig();
    return appendTaskResultToDocument(settings, input);
  });

  ipcMain.handle('library:readProjectLibrary', async (_event, projectId: string) => {
    const { settings } = await ensureAppConfig();
    return readProjectLibrary(settings, projectId);
  });

  ipcMain.handle('audio:readEditPlan', async (_event, projectId: string) => {
    const { settings } = await ensureAppConfig();
    return readAudioEditPlan(settings, projectId);
  });

  ipcMain.handle('audio:createTrack', async (_event, input: CreateAudioTrackInput) => {
    const { settings } = await ensureAppConfig();
    return createAudioTrackInEditPlan(settings, input);
  });

  ipcMain.handle('audio:updateTrack', async (_event, input: UpdateAudioTrackInput) => {
    const { settings } = await ensureAppConfig();
    return updateAudioTrackInEditPlan(settings, input);
  });

  ipcMain.handle('audio:deleteTrack', async (_event, input: DeleteAudioTrackInput) => {
    const { settings } = await ensureAppConfig();
    return deleteAudioTrackInEditPlan(settings, input);
  });

  ipcMain.handle('audio:addClipToEditPlan', async (_event, input: AddAudioClipInput) => {
    const { settings } = await ensureAppConfig();
    return addAudioClipToEditPlan(settings, input);
  });

  ipcMain.handle('audio:rippleDeleteClip', async (_event, input: RippleDeleteAudioClipInput) => {
    const { settings } = await ensureAppConfig();
    return rippleDeleteAudioClip(settings, input);
  });

  ipcMain.handle('audio:updateClipTiming', async (_event, input: UpdateAudioClipTimingInput) => {
    const { settings } = await ensureAppConfig();
    return updateAudioClipTiming(settings, input);
  });

  ipcMain.handle('audio:exportEditPlan', async (_event, input: ExportAudioInput) => {
    const { settings } = await ensureAppConfig();
    return exportAudioEditPlan(settings, input);
  });

  ipcMain.handle('audio:analyzeAsset', async (_event, input: AudioAssetProcessingInput) => {
    const { settings } = await ensureAppConfig();
    return analyzeAudioAsset(settings, input);
  });

  ipcMain.handle('audio:generateProxy', async (_event, input: AudioAssetProcessingInput) => {
    const { settings } = await ensureAppConfig();
    return generateAudioProxy(settings, input);
  });

  ipcMain.handle('audio:generatePeaks', async (_event, input: GenerateAudioPeaksInput) => {
    const { settings } = await ensureAppConfig();
    return generateAudioPeaks(settings, input);
  });

  ipcMain.handle('audio:readAssetPlaybackData', async (_event, input: AudioAssetProcessingInput) => {
    const { settings } = await ensureAppConfig();
    return readAudioAssetPlaybackData(settings, input);
  });
}

void app.whenReady().then(async () => {
  registerIpc();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
