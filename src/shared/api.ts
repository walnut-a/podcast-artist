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
  CreateAudioTrackInput,
  CreateProjectInput,
  CreateResearchTaskInput,
  DeleteAudioTrackInput,
  DependencyStatusFile,
  ExportAudioInput,
  ExportJob,
  ExportOutputInput,
  GenerateAudioPeaksInput,
  InsertAudioGapInput,
  LibraryAsset,
  LibraryAssetsFile,
  ProjectDocument,
  ProviderProfilesFile,
  ProjectSummary,
  ReadResearchTaskResultInput,
  ReplaceAudioEditPlanInput,
  ResearchTaskResult,
  RippleDeleteAudioClipInput,
  SplitAudioClipInput,
  SplitAudioClipResult,
  UpdateAudioTrackInput,
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
  readProjectTasks(projectId: string): Promise<AgentTask[]>;
  readResearchTaskResult(input: ReadResearchTaskResultInput): Promise<ResearchTaskResult>;
  appendTaskResultToDocument(input: AppendTaskResultInput): Promise<AppendMarkdownDocumentResult>;
  readProjectLibrary(projectId: string): Promise<LibraryAssetsFile>;
  readAudioEditPlan(projectId: string): Promise<AudioEditPlan>;
  replaceAudioEditPlan(input: ReplaceAudioEditPlanInput): Promise<AudioEditPlan>;
  createAudioTrack(input: CreateAudioTrackInput): Promise<AudioEditPlan>;
  updateAudioTrack(input: UpdateAudioTrackInput): Promise<AudioEditPlan>;
  deleteAudioTrack(input: DeleteAudioTrackInput): Promise<AudioEditPlan>;
  addAudioClipToEditPlan(input: AddAudioClipInput): Promise<AudioClip>;
  rippleDeleteAudioClip(input: RippleDeleteAudioClipInput): Promise<AudioEditPlan>;
  splitAudioClip(input: SplitAudioClipInput): Promise<SplitAudioClipResult>;
  updateAudioClipTiming(input: UpdateAudioClipTimingInput): Promise<AudioEditPlan>;
  insertAudioGap(input: InsertAudioGapInput): Promise<AudioEditPlan>;
  exportAudioEditPlan(input: ExportAudioInput): Promise<ExportJob>;
  revealExportOutput(input: ExportOutputInput): Promise<void>;
  openExportOutput(input: ExportOutputInput): Promise<void>;
  analyzeAudioAsset(input: AudioAssetProcessingInput): Promise<AudioAnalysis>;
  generateAudioProxy(input: AudioAssetProcessingInput): Promise<AudioProxy>;
  generateAudioPeaks(input: GenerateAudioPeaksInput): Promise<AudioPeaks>;
  readAudioAssetPlaybackData(input: AudioAssetProcessingInput): Promise<AudioAssetPlaybackData>;
}
