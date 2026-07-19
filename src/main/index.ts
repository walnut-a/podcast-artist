import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
  ExportOutputInput,
  GenerateAudioPeaksInput,
  InsertAudioGapInput,
  ProviderProfilesFile,
  ReadResearchTaskResultInput,
  ReplaceAudioEditPlanInput,
  RippleDeleteAudioClipInput,
  SplitAudioClipInput,
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
  createProject,
  ensureWorkspace,
  exportAudioEditPlan,
  generateAudioPeaks,
  generateAudioProxy,
  importLibraryAsset,
  insertAudioGap,
  readAudioEditPlan,
  readAudioAssetPlaybackData,
  readProjectLibrary,
  readProjectDocument,
  readProjectTasks,
  readResearchTaskResult,
  replaceAudioEditPlan,
  resolveAudioAssetPlaybackPath,
  resolveExportOutputPath,
  rippleDeleteAudioClip,
  splitAudioClip,
  updateAudioTrackInEditPlan,
  deleteAudioTrackInEditPlan,
  updateAudioClipTiming
} from './services/workspace';
import {
  audioProtocolScheme,
  createAudioProtocolRequestHandler
} from './services/audioProtocol';
import { startResearchTask } from './services/researchTaskRunner';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

protocol.registerSchemesAsPrivileged([
  {
    scheme: audioProtocolScheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

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
    const { settings, providers } = await ensureAppConfig();
    const started = await startResearchTask(settings, providers, input);
    void started.completion.catch((completionError) => {
      console.error(`Research task completion failed for ${started.task.id}:`, completionError);
    });
    return started.task;
  });

  ipcMain.handle('task:readProjectTasks', async (_event, projectId: string) => {
    const { settings } = await ensureAppConfig();
    return readProjectTasks(settings, projectId);
  });

  ipcMain.handle('task:readResearchTaskResult', async (_event, input: ReadResearchTaskResultInput) => {
    const { settings } = await ensureAppConfig();
    return readResearchTaskResult(settings, input);
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

  ipcMain.handle('audio:replaceEditPlan', async (_event, input: ReplaceAudioEditPlanInput) => {
    const { settings } = await ensureAppConfig();
    return replaceAudioEditPlan(settings, input);
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

  ipcMain.handle('audio:splitClip', async (_event, input: SplitAudioClipInput) => {
    const { settings } = await ensureAppConfig();
    return splitAudioClip(settings, input);
  });

  ipcMain.handle('audio:updateClipTiming', async (_event, input: UpdateAudioClipTimingInput) => {
    const { settings } = await ensureAppConfig();
    return updateAudioClipTiming(settings, input);
  });

  ipcMain.handle('audio:insertGap', async (_event, input: InsertAudioGapInput) => {
    const { settings } = await ensureAppConfig();
    return insertAudioGap(settings, input);
  });

  ipcMain.handle('audio:exportEditPlan', async (_event, input: ExportAudioInput) => {
    const { settings } = await ensureAppConfig();
    return exportAudioEditPlan(settings, input);
  });

  ipcMain.handle('audio:revealExportOutput', async (_event, input: ExportOutputInput) => {
    const { settings } = await ensureAppConfig();
    const outputPath = await resolveExportOutputPath(settings, input);
    shell.showItemInFolder(outputPath);
  });

  ipcMain.handle('audio:openExportOutput', async (_event, input: ExportOutputInput) => {
    const { settings } = await ensureAppConfig();
    const outputPath = await resolveExportOutputPath(settings, input);
    const errorMessage = await shell.openPath(outputPath);
    if (errorMessage) throw new Error(errorMessage);
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

async function registerAudioProtocol(): Promise<void> {
  await protocol.handle(
    audioProtocolScheme,
    createAudioProtocolRequestHandler({
      resolvePath: async (input) => {
        const { settings } = await ensureAppConfig();
        return resolveAudioAssetPlaybackPath(settings, input);
      },
      fetchFile: async (filePath, request) =>
        net.fetch(pathToFileURL(filePath).toString(), {
          headers: request.headers
        })
    })
  );
}

void app.whenReady().then(async () => {
  await registerAudioProtocol();
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
