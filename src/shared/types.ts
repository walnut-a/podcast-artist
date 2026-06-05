export type DependencyStatusValue = 'available' | 'not_configured' | 'unavailable' | 'partial';

export type ProviderKind = 'chat' | 'research' | 'transcription' | 'denoise' | 'tool';

export type ProviderCredentialSource =
  | { kind: 'none' }
  | { kind: 'environment'; envVar: string }
  | { kind: 'runtime_prompt' };

export interface ToolPathSetting {
  path: string | null;
  autoDetect?: boolean;
}

export interface WhisperToolSetting {
  path: string | null;
  modelDirectory: string | null;
  defaultModelPath: string | null;
  autoDetect?: boolean;
}

export interface AppSettings {
  schemaVersion: 'appSettings.v1';
  workspacePath: string;
  defaultProviderProfileId: string | null;
  defaultTranscriptionProfileId: string | null;
  tools: {
    ffmpeg: ToolPathSetting;
    ffprobe: ToolPathSetting;
    whisperCpp: WhisperToolSetting;
  };
}

export interface ProviderProfile {
  id: string;
  kind: ProviderKind;
  displayName: string;
  baseUrl: string | null;
  model: string | null;
  credentialSource: ProviderCredentialSource;
  capabilities: string[];
}

export interface ProviderProfilesFile {
  schemaVersion: 'providerProfiles.v1';
  profiles: ProviderProfile[];
}

export interface DependencyCheckResult {
  id: 'ffmpeg' | 'ffprobe' | 'whisper_cpp';
  status: DependencyStatusValue;
  displayName: string;
  requiredFor: string[];
  resolvedPath: string | null;
  version: string | null;
  capabilities: Record<string, unknown>;
  checkedAt: string;
  error: string | null;
}

export interface DependencyStatusFile {
  schemaVersion: 'dependencyStatus.v1';
  checkedAt: string | null;
  dependencies: DependencyCheckResult[];
}

export interface WorkspaceManifest {
  schemaVersion: 'workspace.v1';
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  libraryPath: string;
  projectsPath: string;
  settings: {
    defaultProjectScope: 'project' | 'shared';
    allowCrossProjectAssetReference: boolean;
  };
}

export interface ProjectManifest {
  schemaVersion: 'project.v1';
  id: string;
  slug: string;
  title: string;
  status: 'drafting' | 'editing' | 'ready' | 'archived';
  createdAt: string;
  updatedAt: string;
  document: {
    id: string;
    path: string;
  };
  library: {
    scope: 'project';
    assetsIndexPath: string;
  };
  paths: {
    appData: '.podcast-artist';
    exports: 'exports';
    sqlite: 'project.sqlite';
  };
  defaultExportSettings: {
    format: 'wav';
    sampleRate: number;
    channels: number;
    loudnessTargetLufs: number;
  };
}

export interface LibraryAssetsFile {
  schemaVersion: 'assets.v1';
  scope: 'project' | 'shared';
  projectId: string | null;
  assets: LibraryAsset[];
}

export type LibraryAssetKind = 'audio' | 'attachment';

export interface LibraryAsset {
  id: string;
  workspaceId: string;
  projectId: string;
  scope: 'project' | 'shared';
  kind: LibraryAssetKind;
  libraryPath: string;
  originalPath: string;
  originalFileName: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  importedAt: string;
  importedBy: 'user';
  metadata: Record<string, unknown>;
}

export interface ImportLibraryAssetInput {
  projectId: string;
  sourcePath: string;
  kind: LibraryAssetKind;
}

export interface FileHash {
  algorithm: 'sha256';
  value: string;
}

export type WriteIntentStatus = 'pending' | 'applying' | 'applied' | 'failed';

export interface MarkdownAppendWriteIntent {
  schemaVersion: 'writeIntent.v1';
  id: string;
  projectId: string;
  sourceTaskId: string | null;
  target: {
    kind: 'markdown_document';
    path: string;
    documentId: string;
  };
  baseHash: FileHash;
  operation: {
    type: 'append_markdown';
    markdown: string;
  };
  summary: string;
  status: WriteIntentStatus;
  createdAt: string;
  appliedAt: string | null;
  error: string | null;
}

export interface CreateMarkdownAppendIntentInput {
  projectId: string;
  markdown: string;
  summary: string;
  sourceTaskId?: string | null;
}

export interface ProjectDocument {
  projectId: string;
  documentId: string;
  path: string;
  content: string;
  hash: FileHash;
}

export interface ApplyWriteIntentResult {
  projectId: string;
  applied: number;
  failed: number;
  skipped: number;
}

export interface AppendMarkdownDocumentResult {
  intent: MarkdownAppendWriteIntent;
  applyResult: ApplyWriteIntentResult;
  document: ProjectDocument;
}

export type AgentTaskStatus = 'running' | 'completed' | 'failed';

export interface AgentTask {
  schemaVersion: 'agentTask.v1';
  id: string;
  projectId: string;
  documentId: string;
  segmentId: string | null;
  type: 'research';
  title: string;
  status: AgentTaskStatus;
  provider: {
    kind: ProviderKind | null;
    profileId: string | null;
  };
  userPrompt: string;
  contextPath: string;
  resultPath: string;
  writeIntentPath: string | null;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface CreateResearchTaskInput {
  projectId: string;
  title: string;
  userPrompt: string;
  contextMarkdown: string;
  resultMarkdown: string;
  segmentId?: string | null;
  providerProfileId?: string | null;
}

export interface AppendTaskResultInput {
  projectId: string;
  taskId: string;
  summary: string;
}

export interface AudioEditPlan {
  schemaVersion: 'audioEditPlan.v1';
  id: 'pln_rough_cut';
  projectId: string;
  title: string;
  timebase: {
    unit: 'ms';
    sampleRate: number;
  };
  tracks: AudioTrack[];
  clips: AudioClip[];
  processing: {
    loudnessNormalization: {
      enabled: boolean;
      targetLufs: number;
    };
    denoise: {
      enabled: boolean;
      providerProfileId: string | null;
    };
  };
  exportDefaults: {
    format: 'wav';
    sampleRate: number;
    channels: number;
  };
  updatedAt: string;
}

export interface AudioTrack {
  id: string;
  name: string;
  kind: 'voice' | 'music' | 'sfx';
  muted: boolean;
  solo: boolean;
  gainDb: number;
}

export interface AudioClip {
  id: string;
  trackId: string;
  assetId: string;
  sourceStartMs: number;
  sourceEndMs: number;
  timelineStartMs: number;
  gainDb: number;
  fadeInMs: number;
  fadeOutMs: number;
}

export interface AddAudioClipInput {
  projectId: string;
  assetId: string;
  trackName: string;
  sourceStartMs: number;
  sourceEndMs: number;
}

export interface CreateAudioTrackInput {
  projectId: string;
  name?: string;
}

export interface UpdateAudioTrackInput {
  projectId: string;
  trackId: string;
  name?: string;
  muted?: boolean;
}

export interface DeleteAudioTrackInput {
  projectId: string;
  trackId: string;
}

export interface RippleDeleteAudioClipInput {
  projectId: string;
  clipId: string;
}

export interface UpdateAudioClipTimingInput {
  projectId: string;
  clipId: string;
  sourceStartMs: number;
  sourceEndMs: number;
}

export type ExportJobStatus = 'running' | 'completed' | 'failed';

export interface ExportAudioInput {
  projectId: string;
  planId?: 'pln_rough_cut';
}

export interface ExportJob {
  schemaVersion: 'exportJob.v1';
  id: string;
  projectId: string;
  sourcePlanId: 'pln_rough_cut';
  status: ExportJobStatus;
  settings: {
    format: 'wav';
    sampleRate: number;
    channels: number;
    loudnessTargetLufs: number;
  };
  outputPath: string;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface AudioAssetProcessingInput {
  projectId: string;
  assetId: string;
}

export interface GenerateAudioPeaksInput extends AudioAssetProcessingInput {
  pointsPerSecond?: number;
}

export interface AudioAnalysis {
  schemaVersion: 'audioAnalysis.v1';
  projectId: string;
  assetId: string;
  durationMs: number;
  sampleRate: number | null;
  channels: number | null;
  codecName: string | null;
  bitRate: number | null;
  sourceHash: string;
  analyzedAt: string;
}

export interface AudioProxy {
  schemaVersion: 'audioProxy.v1';
  projectId: string;
  assetId: string;
  proxyPath: string;
  format: 'wav';
  sampleRate: number;
  channels: number;
  sourceHash: string;
  generatedAt: string;
}

export interface AudioPeaks {
  schemaVersion: 'audioPeaks.v1';
  projectId: string;
  assetId: string;
  pointsPerSecond: number;
  durationMs: number;
  peaks: number[];
  sourceHash: string;
  generatedAt: string;
}

export interface AudioAssetPlaybackData {
  schemaVersion: 'audioAssetPlayback.v1';
  projectId: string;
  assetId: string;
  sourceUrl: string;
  proxyUrl: string | null;
  preferredUrl: string;
  durationMs: number | null;
  peaks: AudioPeaks | null;
  sourceHash: string;
  loadedAt: string;
}

export interface ProjectSummary {
  id: string;
  slug: string;
  title: string;
  status: ProjectManifest['status'];
  projectPath: string;
  documentPath: string;
  assetsIndexPath: string;
  assetCount: number;
  updatedAt: string;
}

export interface WorkspaceSummary {
  manifest: WorkspaceManifest;
  path: string;
  projects: ProjectSummary[];
}

export interface AppBootstrapState {
  userDataPath: string;
  settings: AppSettings;
  providers: ProviderProfilesFile;
  dependencies: DependencyStatusFile;
  workspace: WorkspaceSummary;
}

export interface CreateProjectInput {
  title: string;
}
