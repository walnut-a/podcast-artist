import type {
  AddAudioClipInput,
  AppendMarkdownDocumentResult,
  AppendTaskResultInput,
  AppBootstrapState,
  AppSettings,
  AudioAnalysis,
  AudioAssetPlaybackData,
  AgentTask,
  AudioClip,
  AudioEditPlan,
  AudioPeaks,
  AudioProxy,
  AudioAssetProcessingInput,
  CreateMarkdownAppendIntentInput,
  CreateProjectInput,
  CreateResearchTaskInput,
  DependencyStatusFile,
  ExportAudioInput,
  ExportJob,
  GenerateAudioPeaksInput,
  LibraryAsset,
  LibraryAssetsFile,
  ProjectDocument,
  ProviderProfilesFile,
  ProjectSummary,
  RippleDeleteAudioClipInput,
  UpdateAudioClipTimingInput,
  WorkspaceSummary
} from './types';

export interface PodcastArtistApi {
  getBootstrapState(): Promise<AppBootstrapState>;
  updateSettings(settings: AppSettings): Promise<AppBootstrapState>;
  updateProviderProfiles(providers: ProviderProfilesFile): Promise<AppBootstrapState>;
  runDependencyCheck(): Promise<DependencyStatusFile>;
  refreshWorkspace(): Promise<WorkspaceSummary>;
  createProject(input: CreateProjectInput): Promise<ProjectSummary>;
  importAudioAsset(projectId: string): Promise<LibraryAsset | null>;
  readProjectDocument(projectId: string): Promise<ProjectDocument>;
  appendMarkdownToProjectDocument(input: CreateMarkdownAppendIntentInput): Promise<AppendMarkdownDocumentResult>;
  createResearchTask(input: CreateResearchTaskInput): Promise<AgentTask>;
  appendTaskResultToDocument(input: AppendTaskResultInput): Promise<AppendMarkdownDocumentResult>;
  readProjectLibrary(projectId: string): Promise<LibraryAssetsFile>;
  readAudioEditPlan(projectId: string): Promise<AudioEditPlan>;
  addAudioClipToEditPlan(input: AddAudioClipInput): Promise<AudioClip>;
  rippleDeleteAudioClip(input: RippleDeleteAudioClipInput): Promise<AudioEditPlan>;
  updateAudioClipTiming(input: UpdateAudioClipTimingInput): Promise<AudioEditPlan>;
  exportAudioEditPlan(input: ExportAudioInput): Promise<ExportJob>;
  analyzeAudioAsset(input: AudioAssetProcessingInput): Promise<AudioAnalysis>;
  generateAudioProxy(input: AudioAssetProcessingInput): Promise<AudioProxy>;
  generateAudioPeaks(input: GenerateAudioPeaksInput): Promise<AudioPeaks>;
  readAudioAssetPlaybackData(input: AudioAssetProcessingInput): Promise<AudioAssetPlaybackData>;
}
