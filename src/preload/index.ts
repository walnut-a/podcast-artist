import { contextBridge, ipcRenderer } from 'electron';
import type { PodcastArtistApi } from '../shared/api';
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
  InsertAudioGapInput,
  ProviderProfilesFile,
  ReadResearchTaskResultInput,
  RippleDeleteAudioClipInput,
  SplitAudioClipInput,
  UpdateAudioTrackInput,
  UpdateAudioClipTimingInput
} from '../shared/types';

const api: PodcastArtistApi = {
  getBootstrapState: () => ipcRenderer.invoke('app:getBootstrapState'),
  updateSettings: (settings: AppSettings) => ipcRenderer.invoke('settings:update', settings),
  updateProviderProfiles: (providers: ProviderProfilesFile) => ipcRenderer.invoke('providers:update', providers),
  runDependencyCheck: () => ipcRenderer.invoke('dependencies:check'),
  refreshWorkspace: () => ipcRenderer.invoke('workspace:refresh'),
  createProject: (input: CreateProjectInput) => ipcRenderer.invoke('workspace:createProject', input),
  importAudioAsset: (projectId: string) => ipcRenderer.invoke('workspace:importAudioAsset', projectId),
  readProjectDocument: (projectId: string) => ipcRenderer.invoke('document:readProjectDocument', projectId),
  appendMarkdownToProjectDocument: (input: CreateMarkdownAppendIntentInput) => ipcRenderer.invoke('document:appendMarkdown', input),
  createResearchTask: (input: CreateResearchTaskInput) => ipcRenderer.invoke('task:createResearchTask', input),
  readProjectTasks: (projectId: string) => ipcRenderer.invoke('task:readProjectTasks', projectId),
  readResearchTaskResult: (input: ReadResearchTaskResultInput) => ipcRenderer.invoke('task:readResearchTaskResult', input),
  appendTaskResultToDocument: (input: AppendTaskResultInput) => ipcRenderer.invoke('task:appendResultToDocument', input),
  readProjectLibrary: (projectId: string) => ipcRenderer.invoke('library:readProjectLibrary', projectId),
  readAudioEditPlan: (projectId: string) => ipcRenderer.invoke('audio:readEditPlan', projectId),
  createAudioTrack: (input: CreateAudioTrackInput) => ipcRenderer.invoke('audio:createTrack', input),
  updateAudioTrack: (input: UpdateAudioTrackInput) => ipcRenderer.invoke('audio:updateTrack', input),
  deleteAudioTrack: (input: DeleteAudioTrackInput) => ipcRenderer.invoke('audio:deleteTrack', input),
  addAudioClipToEditPlan: (input: AddAudioClipInput) => ipcRenderer.invoke('audio:addClipToEditPlan', input),
  rippleDeleteAudioClip: (input: RippleDeleteAudioClipInput) => ipcRenderer.invoke('audio:rippleDeleteClip', input),
  splitAudioClip: (input: SplitAudioClipInput) => ipcRenderer.invoke('audio:splitClip', input),
  updateAudioClipTiming: (input: UpdateAudioClipTimingInput) => ipcRenderer.invoke('audio:updateClipTiming', input),
  insertAudioGap: (input: InsertAudioGapInput) => ipcRenderer.invoke('audio:insertGap', input),
  exportAudioEditPlan: (input: ExportAudioInput) => ipcRenderer.invoke('audio:exportEditPlan', input),
  analyzeAudioAsset: (input: AudioAssetProcessingInput) => ipcRenderer.invoke('audio:analyzeAsset', input),
  generateAudioProxy: (input: AudioAssetProcessingInput) => ipcRenderer.invoke('audio:generateProxy', input),
  generateAudioPeaks: (input: GenerateAudioPeaksInput) => ipcRenderer.invoke('audio:generatePeaks', input),
  readAudioAssetPlaybackData: (input: AudioAssetProcessingInput) => ipcRenderer.invoke('audio:readAssetPlaybackData', input)
};

contextBridge.exposeInMainWorld('podcastArtist', api);
