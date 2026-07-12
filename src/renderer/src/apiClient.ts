import type { PodcastArtistApi } from '../../shared/api';
import type {
  AgentTask,
  AddAudioClipInput,
  AppendTaskResultInput,
  AppBootstrapState,
  AppSettings,
  AudioAnalysis,
  AudioAssetPlaybackData,
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
  DependencyStatusFile,
  ExportAudioInput,
  ExportJob,
  GenerateAudioPeaksInput,
  InsertAudioGapInput,
  LibraryAsset,
  LibraryAssetsFile,
  ProjectDocument,
  ProviderProfilesFile,
  ProjectSummary,
  ReadResearchTaskResultInput,
  RippleDeleteAudioClipInput,
  UpdateAudioTrackInput,
  UpdateAudioClipTimingInput
} from '../../shared/types';

export const isBrowserPreview = !window.podcastArtist;

let previewState: AppBootstrapState = createPreviewState();
const previewDocuments = new Map<string, string>();
const previewLibraries = new Map<string, LibraryAssetsFile>();
const previewTasks = new Map<string, { task: AgentTask; resultMarkdown: string }>();
const previewEditPlans = new Map<string, AudioEditPlan>();
const previewExportJobs = new Map<string, ExportJob[]>();
const previewAudioProxies = new Map<string, AudioProxy>();
const previewAudioPeaks = new Map<string, AudioPeaks>();

const localPreviewAudioFileName = '一周年纪念_缩混.wav';
const localPreviewAudioUrl = `/dev-local/${encodeURIComponent(localPreviewAudioFileName)}`;
const localPreviewAudioDurationMs = 7174;
const localPreviewAudioSizeBytes = 2764606;
const localPreviewAudioBitRate = 3082952;
const localPreviewAudioSampleRate = 48000;
const localPreviewAudioChannels = 2;

export const podcastArtistApi: PodcastArtistApi = window.podcastArtist ?? {
  async getBootstrapState() {
    return previewState;
  },
  async updateSettings(settings: AppSettings) {
    previewState = {
      ...previewState,
      settings
    };
    return previewState;
  },
  async updateProviderProfiles(providers: ProviderProfilesFile) {
    previewState = {
      ...previewState,
      providers
    };
    return previewState;
  },
  async runDependencyCheck() {
    const checkedAt = new Date().toISOString();
    const dependencies: DependencyStatusFile = {
      schemaVersion: 'dependencyStatus.v1',
      checkedAt,
      dependencies: [
        {
          id: 'ffmpeg',
          displayName: 'FFmpeg',
          requiredFor: ['proxy', 'peaks', 'normalization', 'export'],
          status: 'not_configured',
          resolvedPath: null,
          version: null,
          capabilities: {},
          checkedAt,
          error: '当前预览环境不能访问本机可执行文件。'
        },
        {
          id: 'ffprobe',
          displayName: 'ffprobe',
          requiredFor: ['audio probing', 'import metadata'],
          status: 'not_configured',
          resolvedPath: null,
          version: null,
          capabilities: {},
          checkedAt,
          error: '当前预览环境不能访问本机可执行文件。'
        },
        {
          id: 'whisper_cpp',
          displayName: 'whisper.cpp',
          requiredFor: ['transcription'],
          status: 'not_configured',
          resolvedPath: null,
          version: null,
          capabilities: {
            binaryExecutable: false,
            modelAvailable: false
          },
          checkedAt,
          error: '当前预览环境不能访问本机可执行文件。'
        }
      ]
    };
    previewState = { ...previewState, dependencies };
    return dependencies;
  },
  async refreshWorkspace() {
    return previewState.workspace;
  },
  async createProject(input: CreateProjectInput) {
    const now = new Date().toISOString();
    const slug = input.title.trim().toLowerCase().replace(/\s+/g, '-') || `project-${Date.now()}`;
    const project: ProjectSummary = {
      id: `prj_preview_${Date.now()}`,
      slug,
      title: input.title,
      status: 'drafting',
      projectPath: `projects/${slug}`,
      documentPath: `projects/${slug}/episode.md`,
      assetsIndexPath: `../../library/projects/${slug}/assets.json`,
      assetCount: 0,
      updatedAt: now
    };
    previewDocuments.set(project.id, `# ${project.title}\n\n`);
    previewLibraries.set(project.id, {
      schemaVersion: 'assets.v1',
      scope: 'project',
      projectId: project.id,
      assets: []
    });
    previewEditPlans.set(project.id, createPreviewEditPlan(project.id, now));
    previewExportJobs.set(project.id, []);
    previewState = {
      ...previewState,
      workspace: {
        ...previewState.workspace,
        projects: [project, ...previewState.workspace.projects]
      }
    };
    return project;
  },
  async importAudioAsset(projectId: string) {
    const project = previewState.workspace.projects.find((item) => item.id === projectId);
    if (!project) return null;
    const now = new Date().toISOString();
    const asset: LibraryAsset = {
      id: `ast_preview_${Date.now()}`,
      workspaceId: previewState.workspace.manifest.id,
      projectId,
      scope: 'project' as const,
      kind: 'audio' as const,
      libraryPath: `assets/audio/${localPreviewAudioFileName}`,
      originalPath: `dev-local/${localPreviewAudioFileName}`,
      originalFileName: localPreviewAudioFileName,
      sha256: 'preview-local-audio'.padEnd(64, '0'),
      sizeBytes: localPreviewAudioSizeBytes,
      mimeType: 'audio/wav',
      importedAt: now,
      importedBy: 'user' as const,
      metadata: {
        audio: {
          durationMs: localPreviewAudioDurationMs,
          sampleRate: localPreviewAudioSampleRate,
          channels: localPreviewAudioChannels,
          codecName: 'pcm_f32le',
          bitRate: localPreviewAudioBitRate,
          analyzedAt: now
        }
      }
    };
    const library = previewLibraries.get(projectId) ?? {
      schemaVersion: 'assets.v1',
      scope: 'project' as const,
      projectId,
      assets: []
    };
    previewLibraries.set(projectId, { ...library, assets: [...library.assets, asset] });
    previewState = {
      ...previewState,
      workspace: {
        ...previewState.workspace,
        projects: previewState.workspace.projects.map((item) =>
          item.id === projectId ? { ...item, assetCount: item.assetCount + 1, updatedAt: now } : item
        )
      }
    };
    return asset;
  },
  async readProjectDocument(projectId: string) {
    return readPreviewDocument(projectId);
  },
  async appendMarkdownToProjectDocument(input: CreateMarkdownAppendIntentInput) {
    const existing = previewDocuments.get(input.projectId) ?? '';
    previewDocuments.set(input.projectId, `${existing}${input.markdown}`);
    const document = await readPreviewDocument(input.projectId);
    return {
      intent: {
        schemaVersion: 'writeIntent.v1',
        id: `wit_preview_${Date.now()}`,
        projectId: input.projectId,
        sourceTaskId: null,
        target: {
          kind: 'markdown_document',
          path: document.path,
          documentId: document.documentId
        },
        baseHash: {
          algorithm: 'sha256',
          value: 'preview'
        },
        operation: {
          type: 'append_markdown',
          markdown: input.markdown
        },
        summary: input.summary,
        status: 'applied',
        createdAt: new Date().toISOString(),
        appliedAt: new Date().toISOString(),
        error: null
      },
      applyResult: {
        projectId: input.projectId,
        applied: 1,
        failed: 0,
        skipped: 0
      },
      document
    };
  },
  async createResearchTask(input: CreateResearchTaskInput) {
    const project = previewState.workspace.projects.find((item) => item.id === input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);
    const now = new Date().toISOString();
    const task = {
      schemaVersion: 'agentTask.v1',
      id: `tsk_preview_${Date.now()}`,
      projectId: input.projectId,
      documentId: 'doc_episode',
      segmentId: null,
      type: 'research',
      title: input.title,
      status: 'running',
      provider: {
        kind: 'research',
        profileId: input.providerProfileId ?? null
      },
      userPrompt: input.userPrompt,
      contextPath: 'context.md',
      resultPath: 'result.md',
      writeIntentPath: null,
      createdAt: now,
      completedAt: null,
      error: null
    } satisfies AgentTask;
    previewTasks.set(task.id, { task, resultMarkdown: '' });
    window.setTimeout(() => {
      const current = previewTasks.get(task.id);
      if (!current || current.task.status !== 'running') return;
      previewTasks.set(task.id, {
        task: { ...task, status: 'completed', completedAt: new Date().toISOString() },
        resultMarkdown: `## 资料候选\n\n这是浏览器预览生成的候选结果：${input.userPrompt}`
      });
    }, 500);
    return task;
  },
  async readProjectTasks(projectId: string) {
    return Array.from(previewTasks.values())
      .map(({ task }) => task)
      .filter((task) => task.projectId === projectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  },
  async readResearchTaskResult(input: ReadResearchTaskResultInput) {
    const record = previewTasks.get(input.taskId);
    if (!record || record.task.projectId !== input.projectId) throw new Error(`Task not found: ${input.taskId}`);
    if (record.task.status === 'running') throw new Error(`Task is still running: ${input.taskId}`);
    if (record.task.status === 'failed') throw new Error(record.task.error ?? `Task failed: ${input.taskId}`);
    return {
      taskId: record.task.id,
      resultMarkdown: record.resultMarkdown
    };
  },
  async appendTaskResultToDocument(input: AppendTaskResultInput) {
    const record = previewTasks.get(input.taskId);
    if (!record || record.task.projectId !== input.projectId) throw new Error(`Task not found: ${input.taskId}`);
    if (record.task.status !== 'completed') throw new Error(`Task must be completed before adoption: ${input.taskId}`);
    if (record.task.writeIntentPath) throw new Error(`Task result was already adopted: ${input.taskId}`);
    const result = await podcastArtistApi.appendMarkdownToProjectDocument({
      projectId: input.projectId,
      markdown: `\n${record.resultMarkdown.trimEnd()}\n`,
      summary: input.summary
    });
    previewTasks.set(record.task.id, {
      ...record,
      task: {
        ...record.task,
        writeIntentPath: `../../write-journal/applied/${result.intent.id}.json`
      }
    });
    return result;
  },
  async readProjectLibrary(projectId: string) {
    return getPreviewLibrary(projectId);
  },
  async readAudioEditPlan(projectId: string) {
    return getPreviewEditPlan(projectId);
  },
  async createAudioTrack(input: CreateAudioTrackInput) {
    const plan = getPreviewEditPlan(input.projectId);
    const trackName = normalizePreviewTrackName(input.name, plan.tracks.length);
    if (plan.tracks.some((track) => track.name === trackName)) return plan;
    const nextPlan = {
      ...plan,
      tracks: [...plan.tracks, createPreviewTrack(trackName)],
      updatedAt: new Date().toISOString()
    } satisfies AudioEditPlan;
    previewEditPlans.set(input.projectId, nextPlan);
    return nextPlan;
  },
  async updateAudioTrack(input: UpdateAudioTrackInput) {
    const plan = getPreviewEditPlan(input.projectId);
    const track = plan.tracks.find((item) => item.id === input.trackId);
    if (!track) throw new Error(`Audio track not found: ${input.trackId}`);
    const nextName = input.name === undefined ? track.name : input.name.trim() || track.name;
    if (nextName !== track.name && plan.tracks.some((item) => item.id !== track.id && item.name === nextName)) {
      throw new Error(`Audio track name already exists: ${nextName}`);
    }
    const nextPlan = {
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
      updatedAt: new Date().toISOString()
    } satisfies AudioEditPlan;
    previewEditPlans.set(input.projectId, nextPlan);
    return nextPlan;
  },
  async deleteAudioTrack(input: DeleteAudioTrackInput) {
    const plan = getPreviewEditPlan(input.projectId);
    const track = plan.tracks.find((item) => item.id === input.trackId);
    if (!track) throw new Error(`Audio track not found: ${input.trackId}`);
    if (plan.clips.some((clip) => clip.trackId === track.id)) {
      throw new Error('Cannot delete an audio track that contains clips.');
    }
    if (plan.tracks.length <= 1) {
      throw new Error('At least one audio track is required.');
    }
    const nextPlan = {
      ...plan,
      tracks: plan.tracks.filter((item) => item.id !== track.id),
      updatedAt: new Date().toISOString()
    } satisfies AudioEditPlan;
    previewEditPlans.set(input.projectId, nextPlan);
    return nextPlan;
  },
  async addAudioClipToEditPlan(input: AddAudioClipInput) {
    const library = getPreviewLibrary(input.projectId);
    const asset = library.assets.find((item) => item.id === input.assetId);
    if (!asset || asset.kind !== 'audio') throw new Error(`Audio asset not found: ${input.assetId}`);
    const plan = getPreviewEditPlan(input.projectId);
    const trackName = normalizePreviewTrackName(input.trackName, plan.tracks.length);
    const existingTrack = plan.tracks.find((track) => track.name === trackName);
    const track = existingTrack ?? createPreviewTrack(trackName);
    const timelineStartMs = plan.clips
      .filter((clip) => clip.trackId === track.id)
      .reduce((max, clip) => Math.max(max, clip.timelineStartMs + clip.sourceEndMs - clip.sourceStartMs), 0);
    const clip: AudioClip = {
      id: `clp_preview_${Date.now()}`,
      trackId: track.id,
      assetId: asset.id,
      sourceStartMs: input.sourceStartMs,
      sourceEndMs: input.sourceEndMs,
      timelineStartMs,
      gainDb: 0,
      fadeInMs: 20,
      fadeOutMs: 20
    };
    previewEditPlans.set(input.projectId, {
      ...plan,
      tracks: existingTrack ? plan.tracks : [...plan.tracks, track],
      clips: [...plan.clips, clip].sort((a, b) => a.timelineStartMs - b.timelineStartMs),
      updatedAt: new Date().toISOString()
    });
    return clip;
  },
  async rippleDeleteAudioClip(input: RippleDeleteAudioClipInput) {
    const plan = getPreviewEditPlan(input.projectId);
    const removedClip = plan.clips.find((clip) => clip.id === input.clipId);
    if (!removedClip) throw new Error(`Clip not found: ${input.clipId}`);
    const removedDurationMs = removedClip.sourceEndMs - removedClip.sourceStartMs;
    const nextPlan = {
      ...plan,
      clips: plan.clips
        .filter((clip) => clip.id !== removedClip.id)
        .map((clip) =>
          clip.trackId === removedClip.trackId && clip.timelineStartMs > removedClip.timelineStartMs
            ? { ...clip, timelineStartMs: Math.max(0, clip.timelineStartMs - removedDurationMs) }
            : clip
        ),
      updatedAt: new Date().toISOString()
    };
    previewEditPlans.set(input.projectId, nextPlan);
    return nextPlan;
  },
  async updateAudioClipTiming(input: UpdateAudioClipTimingInput) {
    const sourceStartMs = Math.max(0, Math.round(input.sourceStartMs));
    const sourceEndMs = Math.max(0, Math.round(input.sourceEndMs));
    if (sourceEndMs <= sourceStartMs) {
      throw new Error('Clip sourceEndMs must be greater than sourceStartMs.');
    }

    const plan = getPreviewEditPlan(input.projectId);
    const existingClip = plan.clips.find((clip) => clip.id === input.clipId);
    if (!existingClip) throw new Error(`Clip not found: ${input.clipId}`);

    const previousDurationMs = existingClip.sourceEndMs - existingClip.sourceStartMs;
    const nextDurationMs = sourceEndMs - sourceStartMs;
    const durationDeltaMs = nextDurationMs - previousDurationMs;
    const nextPlan = {
      ...plan,
      clips: plan.clips
        .map((clip) => {
          if (clip.id === existingClip.id) return { ...clip, sourceStartMs, sourceEndMs };
          if (clip.trackId === existingClip.trackId && clip.timelineStartMs > existingClip.timelineStartMs) {
            return { ...clip, timelineStartMs: Math.max(0, clip.timelineStartMs + durationDeltaMs) };
          }
          return clip;
        })
        .sort((a, b) => (a.trackId === b.trackId ? a.timelineStartMs - b.timelineStartMs : a.trackId.localeCompare(b.trackId))),
      updatedAt: new Date().toISOString()
    };
    previewEditPlans.set(input.projectId, nextPlan);
    return nextPlan;
  },
  async insertAudioGap(input: InsertAudioGapInput) {
    const timelineStartMs = Math.max(0, Math.round(input.timelineStartMs));
    const durationMs = Math.max(0, Math.round(input.durationMs));
    if (durationMs <= 0) {
      throw new Error('Gap durationMs must be greater than 0.');
    }

    const plan = getPreviewEditPlan(input.projectId);
    if (!plan.tracks.some((track) => track.id === input.trackId)) {
      throw new Error(`Track not found: ${input.trackId}`);
    }

    const nextPlan = {
      ...plan,
      clips: plan.clips
        .map((clip) =>
          clip.trackId === input.trackId && clip.timelineStartMs >= timelineStartMs
            ? { ...clip, timelineStartMs: clip.timelineStartMs + durationMs }
            : clip
        )
        .sort((a, b) => (a.trackId === b.trackId ? a.timelineStartMs - b.timelineStartMs : a.trackId.localeCompare(b.trackId))),
      updatedAt: new Date().toISOString()
    };
    previewEditPlans.set(input.projectId, nextPlan);
    return nextPlan;
  },
  async exportAudioEditPlan(input: ExportAudioInput) {
    const plan = getPreviewEditPlan(input.projectId);
    const trackById = new Map(plan.tracks.map((track) => [track.id, track]));
    const renderableClips = plan.clips.filter((clip) => !trackById.get(clip.trackId)?.muted);
    const now = new Date().toISOString();
    const job: ExportJob = {
      schemaVersion: 'exportJob.v1',
      id: `exp_preview_${Date.now()}`,
      projectId: input.projectId,
      sourcePlanId: plan.id,
      status: renderableClips.length ? 'completed' : 'failed',
      settings: {
        format: 'wav',
        sampleRate: plan.exportDefaults.sampleRate,
        channels: plan.exportDefaults.channels,
        loudnessTargetLufs: plan.processing.loudnessNormalization.targetLufs
      },
      outputPath: `exports/preview-${Date.now()}.wav`,
      createdAt: now,
      completedAt: now,
      error: renderableClips.length ? null : 'No unmuted clips in edit plan.'
    };
    previewExportJobs.set(input.projectId, [...(previewExportJobs.get(input.projectId) ?? []), job]);
    return job;
  },
  async analyzeAudioAsset(input: AudioAssetProcessingInput) {
    const library = getPreviewLibrary(input.projectId);
    const asset = library.assets.find((item) => item.id === input.assetId);
    if (!asset) throw new Error(`Audio asset not found: ${input.assetId}`);
    const now = new Date().toISOString();
    const analysis: AudioAnalysis = {
      schemaVersion: 'audioAnalysis.v1',
      projectId: input.projectId,
      assetId: input.assetId,
      durationMs: localPreviewAudioDurationMs,
      sampleRate: localPreviewAudioSampleRate,
      channels: localPreviewAudioChannels,
      codecName: 'pcm_f32le',
      bitRate: localPreviewAudioBitRate,
      sourceHash: asset.sha256,
      analyzedAt: now
    };
    previewLibraries.set(input.projectId, {
      ...library,
      assets: library.assets.map((item) =>
        item.id === input.assetId
          ? {
              ...item,
              metadata: {
                ...item.metadata,
                audio: {
                  durationMs: analysis.durationMs,
                  sampleRate: analysis.sampleRate,
                  channels: analysis.channels,
                  codecName: analysis.codecName,
                  bitRate: analysis.bitRate,
                  analyzedAt: analysis.analyzedAt
                }
              }
            }
          : item
      )
    });
    return analysis;
  },
  async generateAudioProxy(input: AudioAssetProcessingInput) {
    const asset = getPreviewLibrary(input.projectId).assets.find((item) => item.id === input.assetId);
    if (!asset) throw new Error(`Audio asset not found: ${input.assetId}`);
    const proxy = {
      schemaVersion: 'audioProxy.v1',
      projectId: input.projectId,
      assetId: input.assetId,
      proxyPath: `.podcast-artist/audio-cache/proxy/${input.assetId}.wav`,
      format: 'wav',
      sampleRate: 48000,
      channels: 2,
      sourceHash: asset.sha256,
      generatedAt: new Date().toISOString()
    } satisfies AudioProxy;
    previewAudioProxies.set(input.assetId, proxy);
    return proxy;
  },
  async generateAudioPeaks(input: GenerateAudioPeaksInput) {
    const asset = getPreviewLibrary(input.projectId).assets.find((item) => item.id === input.assetId);
    if (!asset) throw new Error(`Audio asset not found: ${input.assetId}`);
    const pointsPerSecond = input.pointsPerSecond ?? 20;
    const peaks = {
      schemaVersion: 'audioPeaks.v1',
      projectId: input.projectId,
      assetId: input.assetId,
      pointsPerSecond,
      durationMs: localPreviewAudioDurationMs,
      peaks: createPreviewPeaks(Math.max(1, Math.ceil((localPreviewAudioDurationMs / 1000) * pointsPerSecond))),
      sourceHash: asset.sha256,
      generatedAt: new Date().toISOString()
    } satisfies AudioPeaks;
    previewAudioPeaks.set(input.assetId, peaks);
    return peaks;
  },
  async readAudioAssetPlaybackData(input: AudioAssetProcessingInput) {
    const asset = getPreviewLibrary(input.projectId).assets.find((item) => item.id === input.assetId);
    if (!asset) throw new Error(`Audio asset not found: ${input.assetId}`);
    const proxy = previewAudioProxies.get(input.assetId);
    const peaks = previewAudioPeaks.get(input.assetId) ?? null;
    const sourceUrl = asset.originalFileName === localPreviewAudioFileName ? localPreviewAudioUrl : createPreviewToneDataUrl();
    return {
      schemaVersion: 'audioAssetPlayback.v1',
      projectId: input.projectId,
      assetId: input.assetId,
      sourceUrl,
      proxyUrl: proxy ? sourceUrl : null,
      preferredUrl: sourceUrl,
      durationMs: peaks?.durationMs ?? localPreviewAudioDurationMs,
      peaks,
      sourceHash: asset.sha256,
      loadedAt: new Date().toISOString()
    } satisfies AudioAssetPlaybackData;
  }
};

async function readPreviewDocument(projectId: string): Promise<ProjectDocument> {
  const project = previewState.workspace.projects.find((item) => item.id === projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const content = previewDocuments.get(projectId) ?? `# ${project.title}\n\n`;
  previewDocuments.set(projectId, content);
  return {
    projectId,
    documentId: 'doc_episode',
    path: 'episode.md',
    content,
    hash: {
      algorithm: 'sha256',
      value: 'preview'
    }
  };
}

function getPreviewLibrary(projectId: string): LibraryAssetsFile {
  const library = previewLibraries.get(projectId);
  if (!library) {
    throw new Error(`Project library not found: ${projectId}`);
  }
  return library;
}

function getPreviewEditPlan(projectId: string): AudioEditPlan {
  const plan = previewEditPlans.get(projectId);
  if (!plan) {
    throw new Error(`Audio edit plan not found: ${projectId}`);
  }
  return plan;
}

function createPreviewEditPlan(projectId: string, now: string): AudioEditPlan {
  return {
    schemaVersion: 'audioEditPlan.v1',
    id: 'pln_rough_cut',
    projectId,
    title: 'Rough Cut',
    timebase: {
      unit: 'ms',
      sampleRate: 48000
    },
    tracks: [createPreviewTrack('音轨 1'), createPreviewTrack('音轨 2')],
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

function createPreviewTrack(name: string): AudioTrack {
  return {
    id: `trk_preview_${crypto.randomUUID()}`,
    name,
    kind: 'voice',
    muted: false,
    solo: false,
    gainDb: 0
  };
}

function normalizePreviewTrackName(name: string | undefined, existingTrackCount: number): string {
  const trimmed = name?.trim();
  return trimmed || `音轨 ${existingTrackCount + 1}`;
}

function createPreviewPeaks(pointCount: number): number[] {
  return Array.from({ length: pointCount }, (_, index) => {
    const wave = Math.sin(index * 0.42) * 0.32 + Math.sin(index * 0.09) * 0.38;
    const pulse = index % 17 === 0 ? 0.35 : 0;
    return Math.round(Math.min(1, Math.max(0.04, Math.abs(wave) + pulse)) * 10000) / 10000;
  });
}

function createPreviewToneDataUrl(): string {
  const sampleRate = 8000;
  const durationSeconds = 8;
  const sampleCount = sampleRate * durationSeconds;
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, sampleCount * 2, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = 0.3 + 0.25 * Math.sin(index / 900);
    const sample = Math.sin((2 * Math.PI * 220 * index) / sampleRate) * envelope;
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
  }

  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function createPreviewState(): AppBootstrapState {
  const now = new Date().toISOString();
  return {
    userDataPath: '本地应用设置目录',
    settings: {
      schemaVersion: 'appSettings.v1',
      workspacePath: 'Podcast Artist Workspace',
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
    },
    providers: {
      schemaVersion: 'providerProfiles.v1',
      profiles: [
        {
          id: 'prv_local_openai_compatible',
          kind: 'chat',
          displayName: '本地 OpenAI 兼容服务',
          baseUrl: 'http://localhost:11434/v1',
          model: null,
          credentialSource: { kind: 'none' },
          capabilities: ['chat', 'rewrite', 'research']
        },
        {
          id: 'prv_local_whisper_cpp',
          kind: 'transcription',
          displayName: '本地 whisper.cpp',
          baseUrl: null,
          model: null,
          credentialSource: { kind: 'none' },
          capabilities: ['transcription']
        }
      ]
    },
    dependencies: {
      schemaVersion: 'dependencyStatus.v1',
      checkedAt: null,
      dependencies: []
    },
    workspace: {
      path: 'Podcast Artist Workspace',
      manifest: {
        schemaVersion: 'workspace.v1',
        id: 'wks_preview',
        name: 'Podcast Artist Workspace',
        createdAt: now,
        updatedAt: now,
        libraryPath: 'library',
        projectsPath: 'projects',
        settings: {
          defaultProjectScope: 'project',
          allowCrossProjectAssetReference: true
        }
      },
      projects: []
    }
  };
}
