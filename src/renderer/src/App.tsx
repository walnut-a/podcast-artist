import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  FolderKanban,
  ListMusic,
  Pause,
  PenLine,
  Play,
  Plus,
  RefreshCcw,
  Scissors,
  Send,
  Settings,
  Terminal,
  Trash2,
  Volume2,
  VolumeX,
  Wrench,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent, ReactElement, ReactNode } from 'react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  MIN_SPLIT_CLIP_DURATION_MS,
  canSplitAudioClipAtTimelineMs
} from '../../shared/audioEditPlan';
import type {
  AgentTask,
  AppBootstrapState,
  AppSettings,
  AudioAssetPlaybackData,
  AudioClip,
  AudioEditPlan,
  DependencyCheckResult,
  ExportJob,
  LibraryAsset,
  LibraryAssetsFile,
  ProjectDocument,
  ProjectSummary,
  ProviderProfile,
  ProviderProfilesFile,
  ResearchTaskResult
} from '../../shared/types';
import { getActiveTimelineClipPlaybacks } from './audioTimeline';
import { podcastArtistApi } from './apiClient';

type ViewKey = 'workspace' | 'library' | 'documents' | 'audio' | 'settings';

const statusLabels: Record<DependencyCheckResult['status'], string> = {
  available: '可用',
  partial: '部分可用',
  not_configured: '未配置',
  unavailable: '不可用'
};

const taskStatusLabels: Record<AgentTask['status'], string> = {
  running: '运行中',
  completed: '已完成',
  failed: '失败'
};

const minTimelineZoom = 1;
const maxTimelineZoom = 4;
const timelineZoomButtonStep = 0.25;
const timelineZoomSliderStep = 0.05;
const timelineZoomMotionMs = 180;
const clipTrimStepMs = 1_000;
const clipGapStepMs = 1_000;
const minClipDurationMs = MIN_SPLIT_CLIP_DURATION_MS;

export function App(): ReactElement {
  const [state, setState] = useState<AppBootstrapState | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('workspace');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState('');
  const [isBusy, setIsBusy] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadBootstrap();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  async function loadBootstrap(): Promise<void> {
    setIsBusy(true);
    setError(null);
    try {
      setState(await podcastArtistApi.getBootstrapState());
    } catch (loadError) {
      setError(toErrorMessage(loadError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateProject(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const project = await podcastArtistApi.createProject({ title: projectTitle });
      setProjectTitle('');
      setSelectedProjectId(project.id);
      const workspace = await podcastArtistApi.refreshWorkspace();
      setState((current) => (current ? { ...current, workspace } : current));
      setActiveView('library');
      setNotice(`已创建项目：${project.title}`);
    } catch (createError) {
      setError(toErrorMessage(createError));
    }
  }

  async function refreshWorkspaceState(): Promise<void> {
    const workspace = await podcastArtistApi.refreshWorkspace();
    setState((current) => (current ? { ...current, workspace } : current));
  }

  function handleOpenProject(project: ProjectSummary): void {
    setSelectedProjectId(project.id);
    setActiveView('library');
  }

  function handleExitProject(): void {
    setSelectedProjectId(null);
    setActiveView('workspace');
  }

  async function handleImportAudio(project: ProjectSummary): Promise<void> {
    setError(null);
    setNotice(null);
    try {
      const asset = await podcastArtistApi.importAudioAsset(project.id);
      if (!asset) {
        setNotice('已取消导入。');
        return;
      }
      const workspace = await podcastArtistApi.refreshWorkspace();
      setState((current) => (current ? { ...current, workspace } : current));
      setNotice(`已导入音频素材：${asset.originalFileName}`);
    } catch (importError) {
      setError(toErrorMessage(importError));
    }
  }

  async function handleSettingsChange(settings: AppSettings): Promise<void> {
    setState((current) => (current ? { ...current, settings } : current));
    try {
      setState(await podcastArtistApi.updateSettings(settings));
      setNotice('设置已保存。');
    } catch (saveError) {
      setError(toErrorMessage(saveError));
    }
  }

  async function handleProviderProfilesChange(providers: ProviderProfilesFile): Promise<void> {
    setState((current) => (current ? { ...current, providers } : current));
    setError(null);
    try {
      setState(await podcastArtistApi.updateProviderProfiles(providers));
      setNotice('外部服务配置已保存。');
    } catch (saveError) {
      setError(toErrorMessage(saveError));
    }
  }

  async function handleDependencyCheck(): Promise<void> {
    setError(null);
    setNotice(null);
    setIsBusy(true);
    try {
      const dependencies = await podcastArtistApi.runDependencyCheck();
      setState((current) => (current ? { ...current, dependencies } : current));
      setNotice('依赖诊断完成。');
    } catch (checkError) {
      setError(toErrorMessage(checkError));
    } finally {
      setIsBusy(false);
    }
  }

  if (!state) {
    return (
      <main className="loading-screen">
        <div className="loading-mark">
          <Terminal size={28} />
        </div>
        <h1>Podcast Artist</h1>
        <p>{error ?? '正在初始化本地工作区...'}</p>
      </main>
    );
  }

  const selectedProject = state.workspace.projects.find((project) => project.id === selectedProjectId) ?? null;
  const isProjectMode = selectedProject !== null;
  const activeTitle =
    activeView === 'workspace'
      ? '项目'
      : activeView === 'settings'
        ? '设置'
        : activeView === 'library'
          ? '素材库'
          : activeView === 'audio'
            ? '剪辑'
            : '文稿';

  return (
    <div className="app-shell">
      <aside className={`sidebar ${isProjectMode ? 'project-sidebar' : 'workspace-sidebar'}`}>
        {isProjectMode ? (
          <>
            <button className="project-back-button" type="button" onClick={handleExitProject}>
              <ArrowLeft size={18} />
              <span>项目</span>
            </button>

            <div className="project-context">
              <span className="sidebar-section-label">当前项目</span>
              <strong>{selectedProject.title}</strong>
              <span>{selectedProject.assetCount} 个素材</span>
            </div>

            <nav className="nav project-modules" aria-label="项目模块">
              <NavButton active={activeView === 'library'} icon={<ListMusic />} label="素材库" onClick={() => setActiveView('library')} />
              <NavButton active={activeView === 'documents'} icon={<FileText />} label="文稿" onClick={() => setActiveView('documents')} />
              <NavButton active={activeView === 'audio'} icon={<Scissors />} label="剪辑" onClick={() => setActiveView('audio')} />
            </nav>
          </>
        ) : (
          <>
            <div className="brand">
              <div className="brand-mark">PA</div>
              <div>
                <strong>Podcast Artist</strong>
                <span>本地创作台</span>
              </div>
            </div>

            <nav className="nav">
              <NavButton active={activeView === 'workspace'} icon={<FolderKanban />} label="项目" onClick={() => setActiveView('workspace')} />
            </nav>

            <nav className="nav sidebar-footer-nav">
              <NavButton active={activeView === 'settings'} icon={<Settings />} label="设置" onClick={() => setActiveView('settings')} />
            </nav>
          </>
        )}
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">{activeView === 'workspace' || activeView === 'settings' ? 'Podcast Artist' : selectedProject?.title ?? '未选择项目'}</span>
            <h1>{activeTitle}</h1>
          </div>
          <button className="icon-button" type="button" onClick={() => void loadBootstrap()} title="刷新">
            <RefreshCcw size={18} />
          </button>
        </header>

        {activeView === 'workspace' ? (
          <WorkspaceView
            state={state}
            projectTitle={projectTitle}
            setProjectTitle={setProjectTitle}
            onCreateProject={handleCreateProject}
            onOpenProject={handleOpenProject}
          />
        ) : null}

        {activeView === 'library' ? (
          <LibraryView
            state={state}
            selectedProjectId={selectedProjectId}
            onImportAudio={handleImportAudio}
            onWorkspaceRefresh={refreshWorkspaceState}
          />
        ) : null}

        {activeView === 'settings' ? (
          <SettingsView
            state={state}
            isBusy={isBusy}
            onRunDependencyCheck={handleDependencyCheck}
            onSettingsChange={handleSettingsChange}
            onProviderProfilesChange={handleProviderProfilesChange}
          />
        ) : null}

        {activeView === 'audio' ? (
          <AudioView
            state={state}
            selectedProjectId={selectedProjectId}
          />
        ) : null}

        {activeView === 'documents' ? (
          <DocumentsView
            state={state}
            selectedProjectId={selectedProjectId}
            onWorkspaceRefresh={refreshWorkspaceState}
          />
        ) : null}
      </main>

      {notice || error ? (
        <div className="toast-stack" aria-live="polite">
          {notice ? <div className="notice success">{notice}</div> : null}
          {error ? <div className="notice error">{error}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceView({
  state,
  projectTitle,
  setProjectTitle,
  onCreateProject,
  onOpenProject
}: {
  state: AppBootstrapState;
  projectTitle: string;
  setProjectTitle: (value: string) => void;
  onCreateProject: (event: FormEvent) => Promise<void>;
  onOpenProject: (project: ProjectSummary) => void;
}): ReactElement {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isCreateOpen) return;
    const timeoutId = window.setTimeout(() => titleInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [isCreateOpen]);

  function closeCreateDialog(): void {
    setProjectTitle('');
    setIsCreateOpen(false);
  }

  async function handleCreateSubmit(event: FormEvent): Promise<void> {
    await onCreateProject(event);
    setIsCreateOpen(false);
  }

  return (
    <section className="view-grid">
      <div className="panel span-3">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">项目</span>
            <h2>最近的项目</h2>
          </div>
          <div className="panel-header-actions">
            <span className="count-pill">{state.workspace.projects.length}</span>
            <button className="primary-button small" type="button" onClick={() => setIsCreateOpen((current) => !current)}>
              <Plus size={15} />
              新建项目
            </button>
          </div>
        </div>
        {isCreateOpen ? (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeCreateDialog();
            }}
          >
            <form
              aria-labelledby="create-project-title"
              aria-modal="true"
              className="modal-panel create-project-dialog"
              role="dialog"
              onKeyDown={(event) => {
                if (event.key === 'Escape') closeCreateDialog();
              }}
              onMouseDown={(event) => event.stopPropagation()}
              onSubmit={(event) => void handleCreateSubmit(event)}
            >
              <div className="modal-header">
                <div>
                  <span className="panel-kicker">新建项目</span>
                  <h2 id="create-project-title">创建项目</h2>
                </div>
                <button className="icon-button ghost" type="button" aria-label="关闭创建项目弹窗" onClick={closeCreateDialog}>
                  <X size={17} />
                </button>
              </div>
              <label className="field">
                <span>项目标题</span>
                <input
                  ref={titleInputRef}
                  value={projectTitle}
                  onChange={(event) => setProjectTitle(event.target.value)}
                  placeholder="例如：第 24 期 本地优先"
                />
              </label>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={closeCreateDialog}>
                  取消
                </button>
                <button className="primary-button" type="submit" disabled={!projectTitle.trim()}>
                  创建项目
                </button>
              </div>
            </form>
          </div>
        ) : null}
        {state.workspace.projects.length ? (
          <div className="project-list">
            {state.workspace.projects.map((project) => (
              <ProjectRow key={project.id} project={project} onOpenProject={onOpenProject} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <FolderKanban size={34} />
            <strong>还没有项目</strong>
            <span>创建后可以写文稿、导入素材，并开始剪辑。</span>
          </div>
        )}
      </div>
    </section>
  );
}

function ProjectRow({
  project,
  onOpenProject
}: {
  project: ProjectSummary;
  onOpenProject: (project: ProjectSummary) => void;
}): ReactElement {
  return (
    <article className="project-row">
      <div className="project-row-main">
        <strong>{project.title}</strong>
        <div className="project-row-meta">
          <span>{project.status === 'drafting' ? '草稿' : project.status}</span>
          <span>{project.assetCount} 个素材</span>
          <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>
      <button className="primary-button small" type="button" onClick={() => onOpenProject(project)}>
        打开项目
      </button>
    </article>
  );
}

function SettingsView({
  state,
  isBusy,
  onRunDependencyCheck,
  onSettingsChange,
  onProviderProfilesChange
}: {
  state: AppBootstrapState;
  isBusy: boolean;
  onRunDependencyCheck: () => Promise<void>;
  onSettingsChange: (settings: AppSettings) => Promise<void>;
  onProviderProfilesChange: (providers: ProviderProfilesFile) => Promise<void>;
}): ReactElement {
  const settings = state.settings;
  const [providerDraft, setProviderDraft] = useState(state.providers);

  useEffect(() => {
    setProviderDraft(state.providers);
  }, [state.providers]);

  function updateToolPath(tool: 'ffmpeg' | 'ffprobe', value: string): void {
    void onSettingsChange({
      ...settings,
      tools: {
        ...settings.tools,
        [tool]: {
          ...settings.tools[tool],
          path: value.trim() || null
        }
      }
    });
  }

  function updateWhisperField(field: 'path' | 'modelDirectory' | 'defaultModelPath', value: string): void {
    void onSettingsChange({
      ...settings,
      tools: {
        ...settings.tools,
        whisperCpp: {
          ...settings.tools.whisperCpp,
          [field]: value.trim() || null
        }
      }
    });
  }

  function updateProviderProfile(profileId: string, patch: Partial<ProviderProfile>): void {
    setProviderDraft((current) => ({
      ...current,
      profiles: current.profiles.map((profile) => (profile.id === profileId ? { ...profile, ...patch } : profile))
    }));
  }

  function updateProviderCredentialKind(profile: ProviderProfile, kind: ProviderProfile['credentialSource']['kind']): void {
    updateProviderProfile(profile.id, {
      credentialSource:
        kind === 'environment'
          ? {
              kind,
              envVar: profile.credentialSource.kind === 'environment' ? profile.credentialSource.envVar : ''
            }
          : { kind }
    });
  }

  function updateProviderCredentialEnvVar(profile: ProviderProfile, envVar: string): void {
    updateProviderProfile(profile.id, {
      credentialSource: {
        kind: 'environment',
        envVar: envVar.trim()
      }
    });
  }

  return (
    <section className="settings-layout">
      <div className="panel">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">本地能力</span>
            <h2>外部工具</h2>
          </div>
          <button className="primary-button small" type="button" onClick={() => void onRunDependencyCheck()} disabled={isBusy}>
            <Activity size={16} />
            重新检测
          </button>
        </div>

        <div className="dependency-grid">
          {state.dependencies.dependencies.length ? (
            state.dependencies.dependencies.map((dependency) => (
              <DependencyCard key={dependency.id} dependency={dependency} />
            ))
          ) : (
            <div className="empty-state compact">
              <Wrench size={30} />
              <strong>尚未运行依赖诊断</strong>
              <span>点击“重新检测”后会检查 FFmpeg、ffprobe 和 whisper.cpp。</span>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">路径配置</span>
            <h2>工具路径</h2>
          </div>
        </div>
        <ToolInput label="FFmpeg 路径" value={settings.tools.ffmpeg.path ?? ''} onBlur={(value) => updateToolPath('ffmpeg', value)} />
        <ToolInput label="ffprobe 路径" value={settings.tools.ffprobe.path ?? ''} onBlur={(value) => updateToolPath('ffprobe', value)} />
        <ToolInput label="whisper.cpp 路径" value={settings.tools.whisperCpp.path ?? ''} onBlur={(value) => updateWhisperField('path', value)} />
        <ToolInput label="Whisper 模型目录" value={settings.tools.whisperCpp.modelDirectory ?? ''} onBlur={(value) => updateWhisperField('modelDirectory', value)} />
        <ToolInput label="默认 Whisper 模型文件" value={settings.tools.whisperCpp.defaultModelPath ?? ''} onBlur={(value) => updateWhisperField('defaultModelPath', value)} />
      </div>

      <div className="panel span-2">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">可配置服务</span>
            <h2>外部服务</h2>
          </div>
          <button className="primary-button small" type="button" onClick={() => void onProviderProfilesChange(providerDraft)} disabled={isBusy}>
            保存配置
          </button>
        </div>
        <div className="provider-list">
          {providerDraft.profiles.map((profile) => (
            <article className="provider-row editable" key={profile.id}>
              <div className="provider-title">
                <div>
                  <strong>{profile.displayName}</strong>
                  <span>{profile.id}</span>
                </div>
                <div className="provider-meta">
                  <span>{profile.kind}</span>
                  <span>{profile.capabilities.join(' / ')}</span>
                </div>
              </div>
              <div className="provider-form-grid">
                <label className="field">
                  <span>显示名称</span>
                  <input
                    value={profile.displayName}
                    onChange={(event) => updateProviderProfile(profile.id, { displayName: event.target.value })}
                    placeholder="Provider name"
                  />
                </label>
                <label className="field">
                  <span>服务地址</span>
                  <input
                    value={profile.baseUrl ?? ''}
                    onChange={(event) => updateProviderProfile(profile.id, { baseUrl: event.target.value.trim() || null })}
                    placeholder="例如：http://localhost:11434/v1"
                  />
                </label>
                <label className="field">
                  <span>模型</span>
                  <input
                    value={profile.model ?? ''}
                    onChange={(event) => updateProviderProfile(profile.id, { model: event.target.value.trim() || null })}
                    placeholder="未指定"
                  />
                </label>
                <label className="field compact-field">
                  <span>凭证来源</span>
                  <select
                    value={profile.credentialSource.kind}
                    onChange={(event) =>
                      updateProviderCredentialKind(profile, event.target.value as ProviderProfile['credentialSource']['kind'])
                    }
                  >
                    <option value="none">无需凭证</option>
                    <option value="environment">环境变量</option>
                    <option value="runtime_prompt">运行时输入</option>
                  </select>
                </label>
                {profile.credentialSource.kind === 'environment' ? (
                  <label className="field">
                    <span>环境变量</span>
                    <input
                      value={profile.credentialSource.envVar}
                      onChange={(event) => updateProviderCredentialEnvVar(profile, event.target.value)}
                      placeholder="例如：OPENAI_API_KEY"
                    />
                  </label>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function DependencyCard({ dependency }: { dependency: DependencyCheckResult }): ReactElement {
  return (
    <article className={`dependency-card ${dependency.status}`}>
      <div className="dependency-head">
        <div>
          <strong>{dependency.displayName}</strong>
          <span>{dependency.requiredFor.join(' / ')}</span>
        </div>
        <StatusIcon status={dependency.status} />
      </div>
      <span className="status-badge">{statusLabels[dependency.status]}</span>
      <dl className="mini-list">
        <div>
          <dt>路径</dt>
          <dd>{dependency.resolvedPath ?? '未配置'}</dd>
        </div>
        <div>
          <dt>版本</dt>
          <dd>{dependency.version ?? '未确认'}</dd>
        </div>
        <div>
          <dt>错误</dt>
          <dd>{dependency.error ?? '无'}</dd>
        </div>
      </dl>
    </article>
  );
}

function ToolInput({
  label,
  value,
  onBlur,
  placeholder = '未配置，允许自动检测'
}: {
  label: string;
  value: string;
  onBlur: (value: string) => void;
  placeholder?: string;
}): ReactElement {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <label className="field">
      <span>{label}</span>
      <input value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => onBlur(draft)} placeholder={placeholder} />
    </label>
  );
}

function LibraryView({
  state,
  selectedProjectId,
  onImportAudio,
  onWorkspaceRefresh
}: {
  state: AppBootstrapState;
  selectedProjectId: string | null;
  onImportAudio: (project: ProjectSummary) => Promise<void>;
  onWorkspaceRefresh: () => Promise<void>;
}): ReactElement {
  const currentProject = state.workspace.projects.find((project) => project.id === selectedProjectId) ?? null;
  const currentProjectId = currentProject?.id ?? null;
  const [library, setLibrary] = useState<LibraryAssetsFile | null>(null);
  const [isLibraryBusy, setIsLibraryBusy] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const audioAssets = useMemo(() => library?.assets.filter((asset) => asset.kind === 'audio') ?? [], [library]);

  useEffect(() => {
    if (!currentProjectId) {
      setLibrary(null);
      return;
    }

    let isMounted = true;
    setIsLibraryBusy(true);
    setLibraryError(null);
    podcastArtistApi
      .readProjectLibrary(currentProjectId)
      .then((nextLibrary) => {
        if (isMounted) setLibrary(nextLibrary);
      })
      .catch((readError) => {
        if (isMounted) setLibraryError(toErrorMessage(readError));
      })
      .finally(() => {
        if (isMounted) setIsLibraryBusy(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentProjectId]);

  async function handleImportProjectAudio(): Promise<void> {
    if (!currentProject || !currentProjectId) return;
    setIsLibraryBusy(true);
    setLibraryError(null);
    try {
      await onImportAudio(currentProject);
      await onWorkspaceRefresh();
      setLibrary(await podcastArtistApi.readProjectLibrary(currentProjectId));
    } catch (importError) {
      setLibraryError(toErrorMessage(importError));
    } finally {
      setIsLibraryBusy(false);
    }
  }

  if (!currentProject) {
    return (
      <section className="view-grid">
        <div className="panel span-3">
          <div className="empty-state">
            <FolderKanban size={34} />
            <strong>先打开一个项目</strong>
            <span>素材库、文稿和剪辑都属于具体项目。</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="view-grid">
      <div className="panel span-3">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">项目素材</span>
            <h2>原始音频</h2>
          </div>
          <button className="primary-button small" type="button" onClick={() => void handleImportProjectAudio()} disabled={isLibraryBusy}>
            <Plus size={15} />
            导入音频
          </button>
        </div>

        {libraryError ? <div className="notice error compact">{libraryError}</div> : null}

        {audioAssets.length ? (
          <div className="asset-list">
            {audioAssets.map((asset) => (
              <article className="asset-row" key={asset.id}>
                <div>
                  <strong>{asset.originalFileName}</strong>
                  <span>{formatAssetAudioMetadata(asset.metadata.audio)}</span>
                </div>
                <div className="asset-actions">
                  <button className="secondary-button" type="button" disabled>
                    转写
                  </button>
                  <button className="secondary-button" type="button" disabled>
                    翻译
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <ListMusic size={34} />
            <strong>还没有音频素材</strong>
            <span>导入的原始音频会留在素材库，剪辑模块只引用它们。</span>
          </div>
        )}
      </div>
    </section>
  );
}

function AudioView({
  state,
  selectedProjectId
}: {
  state: AppBootstrapState;
  selectedProjectId: string | null;
}): ReactElement {
  const currentProjectId = selectedProjectId;
  const currentProject = state.workspace.projects.find((project) => project.id === currentProjectId) ?? null;
  const [library, setLibrary] = useState<LibraryAssetsFile | null>(null);
  const [editPlan, setEditPlan] = useState<AudioEditPlan | null>(null);
  const [lastExportJob, setLastExportJob] = useState<ExportJob | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isAudioBusy, setIsAudioBusy] = useState(false);
  const [selectedAudioAssetId, setSelectedAudioAssetId] = useState<string | null>(null);
  const [draggedAudioAssetId, setDraggedAudioAssetId] = useState<string | null>(null);
  const [playbackData, setPlaybackData] = useState<AudioAssetPlaybackData | null>(null);
  const [playbackDataByAssetId, setPlaybackDataByAssetId] = useState<Map<string, AudioAssetPlaybackData>>(() => new Map());
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const timelinePanelRef = useRef<HTMLElement | null>(null);
  const timelineZoomAnchorRef = useRef<number | null>(null);
  const editPlanRef = useRef<AudioEditPlan | null>(null);
  const playbackDataByAssetIdRef = useRef<Map<string, AudioAssetPlaybackData>>(new Map());
  const timelineContentDurationRef = useRef(0);
  const timelineAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const timelineAnimationFrameRef = useRef<number | null>(null);
  const timelinePlaybackStartedAtRef = useRef(0);
  const timelinePlaybackStartMsRef = useRef(0);

  const audioAssets = useMemo(() => library?.assets.filter((asset) => asset.kind === 'audio') ?? [], [library]);
  const audioAssetById = useMemo(() => new Map(audioAssets.map((asset) => [asset.id, asset])), [audioAssets]);
  const timelineTracks = editPlan?.tracks ?? [];
  const clipsByTrackId = useMemo(() => {
    const nextMap = new Map<string, AudioClip[]>();
    editPlan?.tracks.forEach((track) => nextMap.set(track.id, []));
    editPlan?.clips.forEach((clip) => {
      const existing = nextMap.get(clip.trackId) ?? [];
      existing.push(clip);
      nextMap.set(clip.trackId, existing);
    });
    return nextMap;
  }, [editPlan]);
  const timelineDurationMs = useMemo(() => {
    const clipEnds =
      editPlan?.clips.map((clip) => clip.timelineStartMs + Math.max(0, clip.sourceEndMs - clip.sourceStartMs)) ?? [];
    return Math.max(60_000, ...clipEnds);
  }, [editPlan]);
  const timelineContentDurationMs = useMemo(() => {
    const clipEnds =
      editPlan?.clips.map((clip) => clip.timelineStartMs + Math.max(0, clip.sourceEndMs - clip.sourceStartMs)) ?? [];
    return Math.max(0, ...clipEnds);
  }, [editPlan]);
  const timelineZoomPercent = Math.round(timelineZoom * 100);
  const timelineTickIntervalMs = useMemo(
    () => getTimelineTickIntervalMs(timelineZoom, timelineDurationMs),
    [timelineDurationMs, timelineZoom]
  );
  const timelineZoomStyle = useMemo(
    () =>
      ({
        '--timeline-content-width': `${timelineZoom * 100}%`,
        '--timeline-grid-step': `${(timelineTickIntervalMs / timelineDurationMs) * 100}%`
      }) as CSSProperties,
    [timelineDurationMs, timelineTickIntervalMs, timelineZoom]
  );
  const timelineRulerTicks = useMemo(() => {
    const tickCount = Math.floor(timelineDurationMs / timelineTickIntervalMs);
    return Array.from({ length: tickCount + 1 }, (_, index) => {
      const timeMs = index * timelineTickIntervalMs;
      return {
        label: formatTimecode(timeMs / 1000),
        left: `${Math.min(100, (timeMs / timelineDurationMs) * 100)}%`,
        timeMs
      };
    });
  }, [timelineDurationMs, timelineTickIntervalMs]);
  const timelinePlayheadStyle = useMemo(
    () =>
      ({
        '--timeline-playhead-ratio': String(timelineDurationMs > 0 ? Math.min(1, Math.max(0, playheadMs / timelineDurationMs)) : 0)
      }) as CSSProperties,
    [playheadMs, timelineDurationMs]
  );
  const canPlayTimeline = Boolean(editPlan?.clips.length && timelineContentDurationMs > 0);
  const selectedClipExists = useMemo(
    () => Boolean(selectedClipId && editPlan?.clips.some((clip) => clip.id === selectedClipId)),
    [editPlan, selectedClipId]
  );
  const selectedClip = useMemo(
    () => (selectedClipId ? editPlan?.clips.find((clip) => clip.id === selectedClipId) ?? null : null),
    [editPlan, selectedClipId]
  );
  const canSplitSelectedClip = Boolean(
    selectedClip && canSplitAudioClipAtTimelineMs(selectedClip, playheadMs)
  );
  const selectedClipAssetDurationMs = selectedClip ? getAssetAudioDurationMs(audioAssetById.get(selectedClip.assetId)) : null;
  const selectedClipDurationMs = selectedClip ? selectedClip.sourceEndMs - selectedClip.sourceStartMs : 0;
  const canRestoreClipStart = Boolean(selectedClip && selectedClip.sourceStartMs > 0);
  const canTrimClipStart = Boolean(selectedClip && selectedClipDurationMs > minClipDurationMs);
  const canTrimClipEnd = canTrimClipStart;
  const canRestoreClipEnd = Boolean(
    selectedClip && selectedClipAssetDurationMs !== null && selectedClip.sourceEndMs < selectedClipAssetDurationMs
  );

  useEffect(() => {
    editPlanRef.current = editPlan;
  }, [editPlan]);

  useEffect(() => {
    playbackDataByAssetIdRef.current = playbackDataByAssetId;
  }, [playbackDataByAssetId]);

  useEffect(() => {
    timelineContentDurationRef.current = timelineContentDurationMs;
    setPlayheadMs((current) => Math.min(current, timelineContentDurationMs));
  }, [timelineContentDurationMs]);

  useEffect(() => () => stopTimelinePlayback(false), []);

  useEffect(() => {
    stopTimelinePlayback();
    setPlayheadMs(0);
    setPlaybackDataByAssetId(new Map());
    playbackDataByAssetIdRef.current = new Map();
  }, [currentProjectId]);

  useEffect(() => {
    const panel = timelinePanelRef.current;
    const zoomAnchor = timelineZoomAnchorRef.current;
    if (!panel || zoomAnchor === null) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const startedAt = window.performance.now();
    let animationFrameId = 0;

    const keepZoomAnchor = (): void => {
      const targetScrollLeft = Math.max(0, panel.scrollWidth * zoomAnchor - panel.clientWidth / 2);
      panel.scrollLeft = targetScrollLeft;

      if (!prefersReducedMotion && window.performance.now() - startedAt < timelineZoomMotionMs + 40) {
        animationFrameId = window.requestAnimationFrame(keepZoomAnchor);
        return;
      }

      timelineZoomAnchorRef.current = null;
    };

    animationFrameId = window.requestAnimationFrame(keepZoomAnchor);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [timelineZoom]);

  useEffect(() => {
    if (!currentProjectId) {
      setLibrary(null);
      setEditPlan(null);
      setSelectedAudioAssetId(null);
      setSelectedClipId(null);
      setPlaybackData(null);
      return;
    }

    let isMounted = true;
    setIsAudioBusy(true);
    setAudioError(null);
    Promise.all([podcastArtistApi.readProjectLibrary(currentProjectId), podcastArtistApi.readAudioEditPlan(currentProjectId)])
      .then(([nextLibrary, nextPlan]) => {
        if (!isMounted) return;
        setLibrary(nextLibrary);
        setEditPlan(nextPlan);
      })
      .catch((loadError) => {
        if (isMounted) setAudioError(toErrorMessage(loadError));
      })
      .finally(() => {
        if (isMounted) setIsAudioBusy(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentProjectId]);

  useEffect(() => {
    if (selectedClipId && !selectedClipExists) {
      setSelectedClipId(null);
    }
  }, [selectedClipExists, selectedClipId]);

  useEffect(() => {
    if (!audioAssets.length) {
      setSelectedAudioAssetId(null);
      setPlaybackData(null);
      return;
    }

    if (!selectedAudioAssetId || !audioAssets.some((asset) => asset.id === selectedAudioAssetId)) {
      setSelectedAudioAssetId(audioAssets[0]?.id ?? null);
    }
  }, [audioAssets, selectedAudioAssetId]);

  useEffect(() => {
    if (!currentProjectId || !selectedAudioAssetId) {
      setPlaybackData(null);
      return;
    }

    let isMounted = true;
    podcastArtistApi
      .readAudioAssetPlaybackData({ projectId: currentProjectId, assetId: selectedAudioAssetId })
      .then((nextPlaybackData) => {
        if (!isMounted) return;
        setPlaybackData(nextPlaybackData);
        setPlaybackDataByAssetId((current) => {
          const nextCache = new Map(current);
          nextCache.set(nextPlaybackData.assetId, nextPlaybackData);
          playbackDataByAssetIdRef.current = nextCache;
          return nextCache;
        });
      })
      .catch((playbackError) => {
        if (!isMounted) return;
        setPlaybackData(null);
        setAudioError(toErrorMessage(playbackError));
      });

    return () => {
      isMounted = false;
    };
  }, [currentProjectId, selectedAudioAssetId]);

  async function reloadAudioState(projectId: string): Promise<void> {
    const [nextLibrary, nextPlan] = await Promise.all([
      podcastArtistApi.readProjectLibrary(projectId),
      podcastArtistApi.readAudioEditPlan(projectId)
    ]);
    setLibrary(nextLibrary);
    setEditPlan(nextPlan);
  }

  async function reloadPlaybackData(assetId: string): Promise<void> {
    if (!currentProjectId) return;
    const nextPlaybackData = await podcastArtistApi.readAudioAssetPlaybackData({ projectId: currentProjectId, assetId });
    setPlaybackData(nextPlaybackData);
  }

  function updateTimelineZoom(nextZoom: number, step = timelineZoomSliderStep): void {
    const steppedZoom = Math.round(nextZoom / step) * step;
    const boundedZoom = Number(Math.min(maxTimelineZoom, Math.max(minTimelineZoom, steppedZoom)).toFixed(2));
    if (boundedZoom === timelineZoom) return;

    const panel = timelinePanelRef.current;
    if (panel) {
      timelineZoomAnchorRef.current = (panel.scrollLeft + panel.clientWidth / 2) / Math.max(panel.scrollWidth, panel.clientWidth);
    }
    setTimelineZoom(boundedZoom);
  }

  async function ensurePlaybackDataForAssets(assetIds: string[]): Promise<Map<string, AudioAssetPlaybackData>> {
    if (!currentProjectId) return playbackDataByAssetIdRef.current;

    const uniqueAssetIds = [...new Set(assetIds)].filter(Boolean);
    const missingAssetIds = uniqueAssetIds.filter((assetId) => !playbackDataByAssetIdRef.current.has(assetId));
    if (!missingAssetIds.length) return playbackDataByAssetIdRef.current;

    const loadedPlaybackData = await Promise.all(
      missingAssetIds.map((assetId) => podcastArtistApi.readAudioAssetPlaybackData({ projectId: currentProjectId, assetId }))
    );
    const nextCache = new Map(playbackDataByAssetIdRef.current);
    loadedPlaybackData.forEach((item) => nextCache.set(item.assetId, item));
    playbackDataByAssetIdRef.current = nextCache;
    setPlaybackDataByAssetId(nextCache);
    return nextCache;
  }

  function getMissingPlaybackAssetIds(assetIds: string[]): string[] {
    return [...new Set(assetIds)].filter((assetId) => !playbackDataByAssetIdRef.current.has(assetId));
  }

  function stopTimelinePlayback(updateState = true): void {
    if (timelineAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(timelineAnimationFrameRef.current);
      timelineAnimationFrameRef.current = null;
    }

    timelineAudioElementsRef.current.forEach((audio) => {
      audio.pause();
      audio.src = '';
    });
    timelineAudioElementsRef.current.clear();
    if (updateState) {
      setIsTimelinePlaying(false);
    }
  }

  function syncTimelineAudioElements(playheadTimeMs: number, cache: Map<string, AudioAssetPlaybackData>): void {
    const plan = editPlanRef.current;
    if (!plan) return;

    const activeClipPlaybacks = getActiveTimelineClipPlaybacks({
      tracks: plan.tracks,
      clips: plan.clips,
      playheadMs: playheadTimeMs
    });
    const activeClipIds = new Set(activeClipPlaybacks.map((item) => item.clipId));

    timelineAudioElementsRef.current.forEach((audio, clipId) => {
      if (!activeClipIds.has(clipId)) {
        audio.pause();
        audio.src = '';
        timelineAudioElementsRef.current.delete(clipId);
      }
    });

    activeClipPlaybacks.forEach((clipPlayback) => {
      if (timelineAudioElementsRef.current.has(clipPlayback.clipId)) return;

      const data = cache.get(clipPlayback.assetId);
      if (!data) return;

      const clip = plan.clips.find((item) => item.id === clipPlayback.clipId);
      const audio = new Audio(data.preferredUrl);
      audio.preload = 'auto';
      audio.currentTime = Math.max(0, clipPlayback.sourceOffsetMs / 1000);
      audio.volume = Math.min(1, Math.max(0, Math.pow(10, (clip?.gainDb ?? 0) / 20)));
      timelineAudioElementsRef.current.set(clipPlayback.clipId, audio);
      audio.play().catch((playError: unknown) => {
        const errorMessage = toErrorMessage(playError);
        setAudioError(errorMessage.includes("play() failed") ? '试听音频已准备好，请再点一次播放。' : errorMessage);
        stopTimelinePlayback();
      });
    });
  }

  function startTimelineAnimation(cache: Map<string, AudioAssetPlaybackData>): void {
    const tick = (): void => {
      const nextPlayheadMs =
        timelinePlaybackStartMsRef.current + (window.performance.now() - timelinePlaybackStartedAtRef.current);
      const endMs = timelineContentDurationRef.current;

      if (endMs <= 0 || nextPlayheadMs >= endMs) {
        setPlayheadMs(Math.max(0, endMs));
        stopTimelinePlayback();
        return;
      }

      setPlayheadMs(nextPlayheadMs);
      syncTimelineAudioElements(nextPlayheadMs, cache);
      timelineAnimationFrameRef.current = window.requestAnimationFrame(tick);
    };

    timelineAnimationFrameRef.current = window.requestAnimationFrame(tick);
  }

  function beginTimelinePlayback(startMs = playheadMs): void {
    if (!editPlan || !canPlayTimeline) return;

    const trackById = new Map(editPlan.tracks.map((track) => [track.id, track]));
    const assetIds = editPlan.clips.filter((clip) => !trackById.get(clip.trackId)?.muted).map((clip) => clip.assetId);
    if (!assetIds.length) return;

    const boundedStartMs = Math.min(Math.max(0, startMs), timelineContentDurationMs);
    const missingAssetIds = getMissingPlaybackAssetIds(assetIds);
    setAudioError(null);

    if (missingAssetIds.length) {
      void ensurePlaybackDataForAssets(missingAssetIds)
        .then(() => setAudioError('试听音频已准备好，请再点一次播放。'))
        .catch((playError) => setAudioError(toErrorMessage(playError)));
      return;
    }

    const cache = playbackDataByAssetIdRef.current;
    stopTimelinePlayback();
    setPlayheadMs(boundedStartMs);
    timelinePlaybackStartMsRef.current = boundedStartMs;
    timelinePlaybackStartedAtRef.current = window.performance.now();
    setIsTimelinePlaying(true);
    syncTimelineAudioElements(boundedStartMs, cache);
    startTimelineAnimation(cache);
  }

  function handleToggleTimelinePlayback(): void {
    if (isTimelinePlaying) {
      stopTimelinePlayback();
      return;
    }

    beginTimelinePlayback(playheadMs >= timelineContentDurationMs ? 0 : playheadMs);
  }

  function seekTimeline(nextPlayheadMs: number): void {
    const boundedPlayheadMs = Math.min(Math.max(0, nextPlayheadMs), timelineContentDurationMs);
    setPlayheadMs(boundedPlayheadMs);
    if (isTimelinePlaying) {
      beginTimelinePlayback(boundedPlayheadMs);
    }
  }

  function handleTimelineRulerClick(event: MouseEvent<HTMLDivElement>): void {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0;
    seekTimeline(ratio * timelineDurationMs);
  }

  async function handleAddClipToTrack(assetId: string, trackName: string): Promise<void> {
    if (!currentProjectId) return;
    const assetDurationMs = getAssetAudioDurationMs(audioAssetById.get(assetId));
    const sourceEndMs = assetDurationMs ?? 60_000;

    setAudioError(null);
    setIsAudioBusy(true);
    try {
      const clip = await podcastArtistApi.addAudioClipToEditPlan({
        projectId: currentProjectId,
        assetId,
        trackName,
        sourceStartMs: 0,
        sourceEndMs: Math.round(sourceEndMs)
      });
      setSelectedAudioAssetId(assetId);
      await reloadAudioState(currentProjectId);
      setSelectedClipId(clip.id);
    } catch (clipError) {
      setAudioError(toErrorMessage(clipError));
    } finally {
      setIsAudioBusy(false);
    }
  }

  async function handleCreateAudioTrack(): Promise<void> {
    if (!currentProjectId) return;
    setAudioError(null);
    setIsAudioBusy(true);
    try {
      const plan = await podcastArtistApi.createAudioTrack({
        projectId: currentProjectId,
        name: `音轨 ${(editPlan?.tracks.length ?? 0) + 1}`
      });
      setEditPlan(plan);
    } catch (trackError) {
      setAudioError(toErrorMessage(trackError));
    } finally {
      setIsAudioBusy(false);
    }
  }

  async function handleUpdateAudioTrack(trackId: string, input: { name?: string; muted?: boolean }): Promise<void> {
    if (!currentProjectId) return;
    setAudioError(null);
    setIsAudioBusy(true);
    try {
      const plan = await podcastArtistApi.updateAudioTrack({
        projectId: currentProjectId,
        trackId,
        ...input
      });
      setEditPlan(plan);
    } catch (trackError) {
      setAudioError(toErrorMessage(trackError));
    } finally {
      setIsAudioBusy(false);
    }
  }

  function handleTrackNameBlur(trackId: string, currentName: string, nextName: string): void {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === currentName) return;
    void handleUpdateAudioTrack(trackId, { name: trimmed });
  }

  function handleTrackNameKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    }
    if (event.key === 'Escape') {
      event.currentTarget.value = event.currentTarget.defaultValue;
      event.currentTarget.blur();
    }
  }

  async function handleDeleteAudioTrack(trackId: string): Promise<void> {
    if (!currentProjectId) return;
    setAudioError(null);
    setIsAudioBusy(true);
    try {
      const plan = await podcastArtistApi.deleteAudioTrack({ projectId: currentProjectId, trackId });
      setEditPlan(plan);
    } catch (trackError) {
      setAudioError(toErrorMessage(trackError));
    } finally {
      setIsAudioBusy(false);
    }
  }

  function handleAssetDragStart(assetId: string, event: DragEvent<HTMLButtonElement>): void {
    setDraggedAudioAssetId(assetId);
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', assetId);
  }

  function handleTrackDragOver(event: DragEvent<HTMLDivElement>): void {
    if (!draggedAudioAssetId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  async function handleTrackDrop(trackName: string, event: DragEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault();
    const assetId = event.dataTransfer.getData('text/plain') || draggedAudioAssetId;
    setDraggedAudioAssetId(null);
    if (!assetId || !audioAssetById.has(assetId)) return;
    await handleAddClipToTrack(assetId, trackName);
  }

  async function handleTrackLaneClick(trackName: string, event: MouseEvent<HTMLDivElement>): Promise<void> {
    if (event.target !== event.currentTarget || isAudioBusy || !selectedAudioAssetId) return;
    await handleAddClipToTrack(selectedAudioAssetId, trackName);
  }

  async function handleSplitSelectedClip(): Promise<void> {
    if (!currentProjectId || !selectedClip || !canSplitSelectedClip) return;

    const timelineSplitMs = Math.round(playheadMs);
    stopTimelinePlayback();
    setAudioError(null);
    setIsAudioBusy(true);
    try {
      const result = await podcastArtistApi.splitAudioClip({
        projectId: currentProjectId,
        clipId: selectedClip.id,
        timelineSplitMs
      });
      setEditPlan(result.plan);
      setSelectedClipId(result.rightClipId);
      setPlayheadMs(timelineSplitMs);
      timelinePanelRef.current?.focus();
    } catch (splitError) {
      setAudioError(toErrorMessage(splitError));
    } finally {
      setIsAudioBusy(false);
    }
  }

  function handleTimelineKeyDown(event: KeyboardEvent<HTMLElement>): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, [contenteditable="true"]')) return;
    if (!selectedClipId || isAudioBusy) return;

    if (event.key.toLowerCase() === 's') {
      if (!canSplitSelectedClip) return;
      event.preventDefault();
      void handleSplitSelectedClip();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      void handleRippleDelete(selectedClipId);
    }
  }

  async function handleAdjustSelectedClip(edge: 'start' | 'end', deltaMs: number): Promise<void> {
    if (!currentProjectId || !selectedClip) return;

    const assetDurationMs = getAssetAudioDurationMs(audioAssetById.get(selectedClip.assetId));
    let sourceStartMs = selectedClip.sourceStartMs;
    let sourceEndMs = selectedClip.sourceEndMs;

    if (edge === 'start') {
      sourceStartMs = Math.max(0, Math.min(selectedClip.sourceStartMs + deltaMs, sourceEndMs - minClipDurationMs));
    } else {
      const maxSourceEndMs = assetDurationMs ?? selectedClip.sourceEndMs;
      sourceEndMs = Math.min(maxSourceEndMs, Math.max(selectedClip.sourceEndMs + deltaMs, sourceStartMs + minClipDurationMs));
    }

    if (sourceStartMs === selectedClip.sourceStartMs && sourceEndMs === selectedClip.sourceEndMs) return;

    setAudioError(null);
    setIsAudioBusy(true);
    try {
      const plan = await podcastArtistApi.updateAudioClipTiming({
        projectId: currentProjectId,
        clipId: selectedClip.id,
        sourceStartMs,
        sourceEndMs
      });
      setEditPlan(plan);
      setSelectedClipId(selectedClip.id);
    } catch (timingError) {
      setAudioError(toErrorMessage(timingError));
    } finally {
      setIsAudioBusy(false);
    }
  }

  async function handleInsertGapNearSelectedClip(position: 'before' | 'after'): Promise<void> {
    if (!currentProjectId || !selectedClip) return;

    const timelineStartMs =
      position === 'before' ? selectedClip.timelineStartMs : selectedClip.timelineStartMs + selectedClipDurationMs;

    setAudioError(null);
    setIsAudioBusy(true);
    try {
      const plan = await podcastArtistApi.insertAudioGap({
        projectId: currentProjectId,
        trackId: selectedClip.trackId,
        timelineStartMs,
        durationMs: clipGapStepMs
      });
      setEditPlan(plan);
      setSelectedClipId(selectedClip.id);
    } catch (gapError) {
      setAudioError(toErrorMessage(gapError));
    } finally {
      setIsAudioBusy(false);
    }
  }

  async function handleRippleDelete(clipId: string): Promise<void> {
    if (!currentProjectId) return;
    setAudioError(null);
    setIsAudioBusy(true);
    try {
      const plan = await podcastArtistApi.rippleDeleteAudioClip({ projectId: currentProjectId, clipId });
      if (selectedClipId === clipId) {
        setSelectedClipId(null);
      }
      setEditPlan(plan);
    } catch (deleteError) {
      setAudioError(toErrorMessage(deleteError));
    } finally {
      setIsAudioBusy(false);
    }
  }

  async function handleExportPlan(): Promise<void> {
    if (!currentProjectId) return;
    setAudioError(null);
    setIsAudioBusy(true);
    try {
      const job = await podcastArtistApi.exportAudioEditPlan({ projectId: currentProjectId });
      setLastExportJob(job);
      if (job.status === 'completed') {
        return;
      } else {
        setAudioError(job.error ?? '导出失败。');
      }
    } catch (exportError) {
      setAudioError(toErrorMessage(exportError));
    } finally {
      setIsAudioBusy(false);
    }
  }

  function onPreviewAssetFromClip(assetId: string | undefined): void {
    if (!assetId) return;
    setSelectedAudioAssetId(assetId);
  }

  return (
    <section className="audio-view">
      {currentProject ? (
        <div className="audio-layout">
          <div className="audio-command-bar">
            <div className="audio-command-left">
              <div className="timeline-transport" aria-label="时间线播放">
                <button
                  aria-pressed={isTimelinePlaying}
                  className="timeline-transport-button"
                  type="button"
                  onClick={handleToggleTimelinePlayback}
                  disabled={!canPlayTimeline || isAudioBusy}
                  title={isTimelinePlaying ? '暂停' : '播放'}
                >
                  {isTimelinePlaying ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <span>{formatTimecode(playheadMs / 1000)}</span>
                <span className="timeline-transport-separator">/</span>
                <span>{formatTimecode(timelineContentDurationMs / 1000)}</span>
              </div>

              <div className="timeline-zoom-control" aria-label="时间线缩放">
                <button
                  className="timeline-zoom-button"
                  type="button"
                  onClick={() => updateTimelineZoom(timelineZoom - timelineZoomButtonStep, timelineZoomButtonStep)}
                  disabled={timelineZoom <= minTimelineZoom}
                  title="缩小时间线"
                >
                  <ZoomOut size={14} />
                </button>
                <input
                  aria-label="时间线缩放比例"
                  max={maxTimelineZoom}
                  min={minTimelineZoom}
                  onChange={(event) => updateTimelineZoom(Number(event.currentTarget.value))}
                  step={timelineZoomSliderStep}
                  type="range"
                  value={timelineZoom}
                />
                <button
                  className="timeline-zoom-button"
                  type="button"
                  onClick={() => updateTimelineZoom(timelineZoom + timelineZoomButtonStep, timelineZoomButtonStep)}
                  disabled={timelineZoom >= maxTimelineZoom}
                  title="放大时间线"
                >
                  <ZoomIn size={14} />
                </button>
                <span>{timelineZoomPercent}%</span>
              </div>
            </div>
            <div className="audio-command-actions">
              {selectedClip ? (
                <div className="clip-trim-toolbar" aria-label="修剪片段">
                  <span>{formatDuration(selectedClipDurationMs)}</span>
                  <button
                    type="button"
                    onClick={() => void handleSplitSelectedClip()}
                    disabled={isAudioBusy || !canSplitSelectedClip}
                    title={
                      canSplitSelectedClip
                        ? '在播放头切开（S）'
                        : `将播放头移到片段内部，且距离边界至少 ${MIN_SPLIT_CLIP_DURATION_MS}ms`
                    }
                  >
                    <Scissors size={13} />
                    在播放头切开
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleInsertGapNearSelectedClip('before')}
                    disabled={isAudioBusy}
                    title="在片段前插入 1 秒空白"
                  >
                    前插 1s
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleInsertGapNearSelectedClip('after')}
                    disabled={isAudioBusy}
                    title="在片段后插入 1 秒空白"
                  >
                    后插 1s
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAdjustSelectedClip('start', -clipTrimStepMs)}
                    disabled={isAudioBusy || !canRestoreClipStart}
                    title="开头向前 1 秒"
                  >
                    开头 -1s
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAdjustSelectedClip('start', clipTrimStepMs)}
                    disabled={isAudioBusy || !canTrimClipStart}
                    title="开头向后 1 秒"
                  >
                    开头 +1s
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAdjustSelectedClip('end', -clipTrimStepMs)}
                    disabled={isAudioBusy || !canTrimClipEnd}
                    title="结尾向前 1 秒"
                  >
                    结尾 -1s
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAdjustSelectedClip('end', clipTrimStepMs)}
                    disabled={isAudioBusy || !canRestoreClipEnd}
                    title="结尾向后 1 秒"
                  >
                    结尾 +1s
                  </button>
                </div>
              ) : null}
              <button
                className="secondary-button small"
                type="button"
                onClick={() => void handleCreateAudioTrack()}
                disabled={!currentProject || isAudioBusy}
              >
                <Plus size={15} />
                添加音轨
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => void handleExportPlan()}
                disabled={!currentProject || !editPlan?.clips.length || isAudioBusy}
              >
                导出 WAV
              </button>
            </div>
          </div>

          {audioError ? <div className="notice error compact">{audioError}</div> : null}
          {lastExportJob ? (
            <div className={`notice compact ${lastExportJob.status === 'completed' ? 'success' : 'error'}`}>
              {lastExportJob.status === 'completed' ? `导出完成：${lastExportJob.outputPath}` : lastExportJob.error ?? '导出失败。'}
            </div>
          ) : null}

          {audioAssets.length ? (
            <>
              <div className="audio-timeline-workspace">
                <section className="audio-asset-tray" aria-label="素材">
                  {audioAssets.map((asset) => (
                    <button
                      className={`audio-asset-chip ${selectedAudioAssetId === asset.id ? 'selected' : ''}`}
                      draggable
                      key={asset.id}
                      type="button"
                      onClick={() => setSelectedAudioAssetId(asset.id)}
                      onDragStart={(event) => handleAssetDragStart(asset.id, event)}
                      onDragEnd={() => setDraggedAudioAssetId(null)}
                      title={asset.originalFileName}
                    >
                      {asset.originalFileName}
                    </button>
                  ))}
                </section>

                <section
                  className="timeline-panel"
                  aria-label="剪辑音轨"
                  onKeyDown={handleTimelineKeyDown}
                  ref={timelinePanelRef}
                  tabIndex={0}
                >
                  <div className="timeline-scroll-content" style={timelineZoomStyle}>
                    <div className="timeline-playhead" style={timelinePlayheadStyle} aria-hidden="true" />
                    <div className="timeline-ruler" aria-label="时间尺">
                      <span className="timeline-ruler-spacer" />
                      <div className="timeline-ruler-ticks" onClick={handleTimelineRulerClick}>
                        {timelineRulerTicks.map((tick) => (
                          <span className="timeline-ruler-tick" key={tick.timeMs} style={{ left: tick.left }}>
                            {tick.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="timeline-track-area">
                      {timelineTracks.map((track) => {
                        const clips = clipsByTrackId.get(track.id) ?? [];
                        return (
                          <div className={`timeline-track-row ${track.muted ? 'muted' : ''}`} key={track.id}>
                            <div className="timeline-track-label">
                              <input
                                aria-label={`${track.name} 名称`}
                                className="timeline-track-name-input"
                                defaultValue={track.name}
                                disabled={isAudioBusy}
                                onBlur={(event) => handleTrackNameBlur(track.id, track.name, event.currentTarget.value)}
                                onKeyDown={handleTrackNameKeyDown}
                              />
                              <div className="timeline-track-actions">
                                <button
                                  className={`timeline-track-icon-button ${track.muted ? 'active' : ''}`}
                                  type="button"
                                  onClick={() => void handleUpdateAudioTrack(track.id, { muted: !track.muted })}
                                  disabled={isAudioBusy}
                                  title={track.muted ? '取消静音' : '静音'}
                                >
                                  {track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                                </button>
                                <button
                                  className="timeline-track-icon-button danger"
                                  type="button"
                                  onClick={() => void handleDeleteAudioTrack(track.id)}
                                  disabled={isAudioBusy || clips.length > 0 || timelineTracks.length <= 1}
                                  title={clips.length > 0 ? '先移除音轨里的音频' : '删除音轨'}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                            <div
                              className={`timeline-lane ${selectedAudioAssetId && !isAudioBusy ? 'can-place' : ''} ${
                                draggedAudioAssetId ? 'drop-ready' : ''
                              }`}
                              onClick={(event) => void handleTrackLaneClick(track.name, event)}
                              onDragOver={handleTrackDragOver}
                              onDrop={(event) => void handleTrackDrop(track.name, event)}
                            >
                              {clips.map((clip) => {
                                const durationMs = Math.max(1, clip.sourceEndMs - clip.sourceStartMs);
                                const asset = audioAssetById.get(clip.assetId);
                                const left = Math.max(0, (clip.timelineStartMs / timelineDurationMs) * 100);
                                const width = Math.min(100 - left, Math.max(7, (durationMs / timelineDurationMs) * 100));
                                const waveformBarCount = Math.min(220, Math.max(36, Math.round((durationMs / 1000) * timelineZoom * 8)));

                                return (
                                  <div className="timeline-clip-group" key={clip.id} style={{ left: `${left}%`, width: `${width}%` }}>
                                    <button
                                      aria-pressed={selectedClipId === clip.id}
                                      className={`timeline-clip ${selectedClipId === clip.id ? 'selected' : ''}`}
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedClipId(clip.id);
                                        onPreviewAssetFromClip(asset?.id);
                                      }}
                                      disabled={!asset}
                                      title={asset?.originalFileName ?? clip.assetId}
                                    >
                                      <TimelineClipWaveform
                                        barCount={waveformBarCount}
                                        playbackData={playbackData?.assetId === clip.assetId ? playbackData : null}
                                        sourceEndMs={clip.sourceEndMs}
                                        sourceStartMs={clip.sourceStartMs}
                                      />
                                      <span className="timeline-clip-label">{asset?.originalFileName ?? '音频'}</span>
                                    </button>
                                    <button
                                      className="timeline-clip-remove"
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleRippleDelete(clip.id);
                                      }}
                                      disabled={isAudioBusy}
                                      title="移除音频"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className="audio-empty-workflow">
              <Scissors size={30} />
              <strong>还没有可剪辑的音频</strong>
              <span>先到素材库导入原始音频，再拖入音轨。</span>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <FolderKanban size={34} />
          <strong>先打开一个项目</strong>
          <span>剪辑模块属于具体项目，请先从项目列表打开一期节目。</span>
        </div>
      )}
    </section>
  );
}

function TimelineClipWaveform({
  barCount,
  playbackData,
  sourceEndMs,
  sourceStartMs
}: {
  barCount: number;
  playbackData: AudioAssetPlaybackData | null;
  sourceEndMs: number;
  sourceStartMs: number;
}): ReactElement {
  const bars = getTimelineWaveBars(playbackData, sourceStartMs, sourceEndMs, barCount);
  return (
    <div className="timeline-clip-waveform" aria-hidden="true">
      {bars.map((barHeight, index) => (
        <span key={index} style={{ height: `${barHeight}%` }} />
      ))}
    </div>
  );
}

function DocumentsView({
  state,
  selectedProjectId,
  onWorkspaceRefresh
}: {
  state: AppBootstrapState;
  selectedProjectId: string | null;
  onWorkspaceRefresh: () => Promise<void>;
}): ReactElement {
  const currentProjectId = selectedProjectId;
  const currentProject = state.workspace.projects.find((project) => project.id === currentProjectId) ?? null;
  const researchProfiles = useMemo(
    () =>
      state.providers.profiles.filter(
        (profile) => (profile.kind === 'chat' || profile.kind === 'research') && profile.capabilities.includes('research')
      ),
    [state.providers.profiles]
  );
  const manuscriptReaderRef = useRef<HTMLElement | null>(null);
  const [document, setDocument] = useState<ProjectDocument | null>(null);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [appendDraft, setAppendDraft] = useState('');
  const [taskPrompt, setTaskPrompt] = useState('核实这段资料，并整理成可插入文稿的 Markdown。');
  const [taskContext, setTaskContext] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskResult, setSelectedTaskResult] = useState<ResearchTaskResult | null>(null);
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [adoptingTaskId, setAdoptingTaskId] = useState<string | null>(null);
  const [selectedProviderProfileId, setSelectedProviderProfileId] = useState(
    () =>
      researchProfiles.find((profile) => profile.id === state.settings.defaultProviderProfileId)?.id ??
      researchProfiles[0]?.id ??
      ''
  );
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const hasRunningTasks = tasks.some((task) => task.status === 'running');
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  useEffect(() => {
    setSelectedProviderProfileId((current) => {
      if (researchProfiles.some((profile) => profile.id === current)) return current;
      return (
        researchProfiles.find((profile) => profile.id === state.settings.defaultProviderProfileId)?.id ??
        researchProfiles[0]?.id ??
        ''
      );
    });
  }, [researchProfiles, state.settings.defaultProviderProfileId]);

  useEffect(() => {
    setSelectedTaskId(null);
    setSelectedTaskResult(null);
    if (!currentProjectId) {
      setDocument(null);
      setTasks([]);
      return;
    }

    let isMounted = true;
    setIsLoadingDocument(true);
    setLocalError(null);
    Promise.all([podcastArtistApi.readProjectDocument(currentProjectId), podcastArtistApi.readProjectTasks(currentProjectId)])
      .then(([nextDocument, nextTasks]) => {
        if (!isMounted) return;
        setDocument(nextDocument);
        setTasks(nextTasks);
      })
      .catch((readError) => {
        if (isMounted) setLocalError(toErrorMessage(readError));
      })
      .finally(() => {
        if (isMounted) setIsLoadingDocument(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentProjectId]);

  useEffect(() => {
    if (!currentProjectId || !hasRunningTasks) return;

    let isMounted = true;
    const intervalId = window.setInterval(() => {
      void podcastArtistApi
        .readProjectTasks(currentProjectId)
        .then((nextTasks) => {
          if (isMounted) setTasks(nextTasks);
        })
        .catch((readError) => {
          if (isMounted) setLocalError(toErrorMessage(readError));
        });
    }, 750);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [currentProjectId, hasRunningTasks]);

  async function handleAppendMarkdown(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!currentProjectId || !appendDraft.trim()) return;

    setIsLoadingDocument(true);
    setLocalNotice(null);
    setLocalError(null);
    try {
      const result = await podcastArtistApi.appendMarkdownToProjectDocument({
        projectId: currentProjectId,
        markdown: normalizeMarkdownAppend(appendDraft),
        summary: '手动追加文稿内容'
      });
      setDocument(result.document);
      setAppendDraft('');
      await onWorkspaceRefresh();
      if (result.applyResult.failed > 0) {
        setLocalError('有一条写入没有成功，请在项目的写入记录里查看失败原因。');
      } else {
        setLocalNotice('文稿已保存，并为旧版本生成快照。');
      }
    } catch (appendError) {
      setLocalError(toErrorMessage(appendError));
    } finally {
      setIsLoadingDocument(false);
    }
  }

  async function handleCreateResearchTask(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!currentProjectId || !taskPrompt.trim() || !selectedProviderProfileId) return;

    setIsSubmittingTask(true);
    setLocalNotice(null);
    setLocalError(null);
    try {
      const task = await podcastArtistApi.createResearchTask({
        projectId: currentProjectId,
        title: taskPrompt.trim().slice(0, 48),
        userPrompt: taskPrompt.trim(),
        contextMarkdown: taskContext.trim() || document?.content || '',
        providerProfileId: selectedProviderProfileId
      });
      setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
      setLocalNotice('资料任务已启动，可以继续阅读或发起下一条任务。');
    } catch (taskError) {
      setLocalError(toErrorMessage(taskError));
    } finally {
      setIsSubmittingTask(false);
    }
  }

  function captureSelectedManuscript(): void {
    const manuscriptReader = manuscriptReaderRef.current;
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? '';
    const isInsideManuscript = Boolean(
      manuscriptReader &&
        selection?.rangeCount &&
        selection.anchorNode &&
        selection.focusNode &&
        manuscriptReader.contains(selection.anchorNode) &&
        manuscriptReader.contains(selection.focusNode)
    );

    if (!selectedText || !isInsideManuscript) {
      setLocalNotice(null);
      setLocalError('请先在文稿中选中一段文字。');
      return;
    }

    setTaskContext(selectedText);
    setLocalError(null);
    setLocalNotice('已将选中的文稿放入任务上下文。');
  }

  async function loadTaskResult(task: AgentTask): Promise<void> {
    if (!currentProjectId || task.status !== 'completed') return;

    setLocalNotice(null);
    setLocalError(null);
    try {
      const result = await podcastArtistApi.readResearchTaskResult({
        projectId: currentProjectId,
        taskId: task.id
      });
      setSelectedTaskId(task.id);
      setSelectedTaskResult(result);
    } catch (readError) {
      setLocalError(toErrorMessage(readError));
    }
  }

  async function adoptTaskResult(task: AgentTask): Promise<void> {
    if (!currentProjectId || task.status !== 'completed' || task.writeIntentPath || adoptingTaskId) return;

    setAdoptingTaskId(task.id);
    setLocalNotice(null);
    setLocalError(null);
    try {
      const result = await podcastArtistApi.appendTaskResultToDocument({
        projectId: currentProjectId,
        taskId: task.id,
        summary: '采纳资料任务结果'
      });
      setDocument(result.document);
      setTasks(await podcastArtistApi.readProjectTasks(currentProjectId));
      await onWorkspaceRefresh();
      setLocalNotice('资料候选已采纳到文稿。');
    } catch (adoptError) {
      setLocalError(toErrorMessage(adoptError));
    } finally {
      setAdoptingTaskId(null);
    }
  }

  return (
    <section className="document-view">
      <div className="panel document-main-panel">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">明文文稿</span>
            <h2>正式文稿</h2>
          </div>
          <PenLine size={22} />
        </div>
        {currentProject ? (
          <div className="document-layout">
            <div className="document-meta">
              <span>{currentProject?.documentPath ?? '未选择文稿'}</span>
              <span>{document ? document.hash.value.slice(0, 12) : 'hash 未读取'}</span>
            </div>

            {localNotice ? <div className="notice success compact">{localNotice}</div> : null}
            {localError ? <div className="notice error compact">{localError}</div> : null}

            <div className="manuscript-frame">
              <article ref={manuscriptReaderRef} className="markdown-reader manuscript-reader" aria-label="episode.md 预览">
                {isLoadingDocument && !document ? <p>正在读取 episode.md...</p> : renderMarkdownPreview(document?.content ?? '')}
              </article>
            </div>

            <form className="append-form" onSubmit={(event) => void handleAppendMarkdown(event)}>
              <label className="field">
                <span>追加到 episode.md</span>
                <textarea
                  value={appendDraft}
                  onChange={(event) => setAppendDraft(event.target.value)}
                  placeholder="例如：&#10;## 资料补充&#10;&#10;这里放一段通过 agent 核实后的资料。"
                />
              </label>
              <button className="primary-button" type="submit" disabled={!appendDraft.trim() || isLoadingDocument}>
                <Send size={16} />
                保存到文稿
              </button>
            </form>
          </div>
        ) : (
          <div className="empty-state">
            <FileText size={34} />
            <strong>先打开一个项目</strong>
            <span>文稿模块属于具体项目，请先从项目列表打开一期节目。</span>
          </div>
        )}
      </div>

      <form className="panel document-side-panel task-panel" onSubmit={(event) => void handleCreateResearchTask(event)}>
        <div className="panel-header">
          <div>
            <span className="panel-kicker">资料任务</span>
            <h2>资料任务</h2>
          </div>
          <ListMusic size={22} />
        </div>
        <div className="task-ledger-list" aria-label="资料任务历史">
          {tasks.length ? (
            tasks.map((task) => (
              <article className="task-ledger-row" key={task.id}>
                <div className="task-ledger-title">
                  <strong>{task.title}</strong>
                  <span className={`task-status ${task.status}`}>{taskStatusLabels[task.status]}</span>
                </div>
                <p>{task.userPrompt}</p>
                <div className="task-ledger-meta">
                  <span>{formatTaskTimestamp(task.createdAt)}</span>
                  <span>{task.writeIntentPath ? '已采纳' : '未采纳'}</span>
                </div>
                {task.status === 'failed' && task.error ? <p className="task-ledger-error">{task.error}</p> : null}
                <div className="task-ledger-actions">
                  {task.status === 'completed' ? (
                    <button className="secondary-button" type="button" onClick={() => void loadTaskResult(task)}>
                      查看结果
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <div className="task-ledger-empty">
              <strong>暂无资料任务</strong>
              <span>创建后会在项目文件夹内留下 task.json、context.md 和 result.md。</span>
            </div>
          )}
        </div>
        {selectedTask && selectedTaskResult?.taskId === selectedTask.id ? (
          <section className="task-result-candidate" aria-label="资料候选结果">
            <div className="task-ledger-title">
              <strong>{selectedTask.title}</strong>
              <span>{selectedTask.writeIntentPath ? '已采纳' : '待采纳'}</span>
            </div>
            <div className="task-result-content">{renderMarkdownPreview(selectedTaskResult.resultMarkdown)}</div>
            <button
              className="primary-button"
              type="button"
              onClick={() => void adoptTaskResult(selectedTask)}
              disabled={Boolean(selectedTask.writeIntentPath) || adoptingTaskId === selectedTask.id}
            >
              {selectedTask.writeIntentPath ? '已采纳' : adoptingTaskId === selectedTask.id ? '正在采纳...' : '采纳到文稿'}
            </button>
          </section>
        ) : null}
        <div className="task-form-grid">
          <label className="field">
            <span>资料服务</span>
            <select value={selectedProviderProfileId} onChange={(event) => setSelectedProviderProfileId(event.target.value)}>
              {researchProfiles.length ? null : <option value="">没有可用的资料服务</option>}
              {researchProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>任务指令</span>
            <textarea value={taskPrompt} onChange={(event) => setTaskPrompt(event.target.value)} />
          </label>
          <label className="field">
            <span>任务上下文</span>
            <textarea
              value={taskContext}
              onChange={(event) => setTaskContext(event.target.value)}
              placeholder="留空时使用当前 episode.md 内容作为 context.md。"
            />
          </label>
          <button type="button" className="secondary-button" onClick={captureSelectedManuscript}>
            使用选中文稿
          </button>
        </div>
        <button className="primary-button" type="submit" disabled={!currentProjectId || isSubmittingTask || !selectedProviderProfileId || !taskPrompt.trim()}>
          <Send size={16} />
          {isSubmittingTask ? '正在启动...' : '启动资料任务'}
        </button>
      </form>
    </section>
  );
}

function normalizeMarkdownAppend(markdown: string): string {
  const trimmedRight = markdown.trimEnd();
  return `\n${trimmedRight}\n`;
}

function renderMarkdownPreview(markdown: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const lines = markdown.split(/\r?\n/);
  let paragraph: string[] = [];
  let listItems: string[] = [];

  function flushParagraph(): void {
    if (!paragraph.length) return;
    nodes.push(<p key={`p-${nodes.length}`}>{paragraph.join(' ')}</p>);
    paragraph = [];
  }

  function flushList(): void {
    if (!listItems.length) return;
    nodes.push(
      <ul key={`ul-${nodes.length}`}>
        {listItems.map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
      </ul>
    );
    listItems = [];
  }

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const content = heading[2];
      if (level === 1) {
        nodes.push(<h1 key={`h-${nodes.length}`}>{content}</h1>);
      } else if (level === 2) {
        nodes.push(<h2 key={`h-${nodes.length}`}>{content}</h2>);
      } else {
        nodes.push(<h3 key={`h-${nodes.length}`}>{content}</h3>);
      }
      return;
    }

    const listMatch = /^(?:[-*+]|\d+\.)\s+(.+)$/.exec(trimmed);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1]);
      return;
    }

    flushList();
    paragraph.push(trimmed);
  });

  flushParagraph();
  flushList();

  return nodes.length ? nodes : [<p className="manuscript-placeholder" key="empty">episode.md 还是空的，可以从下方追加大纲或节目文稿。</p>];
}

function formatAssetAudioMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') {
    return '未检查';
  }

  const audio = metadata as {
    durationMs?: unknown;
    sampleRate?: unknown;
    channels?: unknown;
  };
  const details = [
    typeof audio.durationMs === 'number' ? formatDuration(audio.durationMs) : null,
    typeof audio.channels === 'number' ? formatChannelCount(audio.channels) : null,
    typeof audio.sampleRate === 'number' ? formatSampleRate(audio.sampleRate) : null
  ].filter(Boolean);

  return details.length ? details.join(' · ') : '未检查';
}

function getAssetAudioDurationMs(asset: LibraryAsset | null | undefined): number | null {
  const audio = asset?.metadata.audio;
  if (!audio || typeof audio !== 'object') return null;
  const durationMs = (audio as { durationMs?: unknown }).durationMs;
  return typeof durationMs === 'number' && durationMs > 0 ? durationMs : null;
}

function formatChannelCount(channels: number): string {
  if (channels === 1) return '单声道';
  if (channels === 2) return '双声道';
  return `${channels} 声道`;
}

function formatSampleRate(sampleRate: number): string {
  if (sampleRate >= 1000) return `${Math.round(sampleRate / 100) / 10} kHz`;
  return `${sampleRate} Hz`;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatTaskTimestamp(isoValue: string): string {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatTimecode(secondsValue: number): string {
  const totalSeconds = Math.max(0, Math.floor(secondsValue));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((Math.max(0, secondsValue) - totalSeconds) * 100);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

function getTimelineTickIntervalMs(zoom: number, durationMs: number): number {
  const preferredIntervalMs = zoom >= 3.5 ? 2_000 : zoom >= 2.5 ? 2_500 : zoom >= 1.75 ? 5_000 : 10_000;
  const maxTickCount = zoom >= 3.5 ? 90 : zoom >= 2.5 ? 72 : zoom >= 1.75 ? 48 : 30;
  const minIntervalForDuration = durationMs / maxTickCount;
  const niceIntervalsMs = [
    1_000,
    2_000,
    2_500,
    5_000,
    10_000,
    15_000,
    30_000,
    60_000,
    120_000,
    300_000,
    600_000,
    900_000,
    1_800_000,
    3_600_000
  ];
  return niceIntervalsMs.find((intervalMs) => intervalMs >= preferredIntervalMs && intervalMs >= minIntervalForDuration) ?? 3_600_000;
}

function getTimelineWaveBars(
  playbackData: AudioAssetPlaybackData | null,
  sourceStartMs: number,
  sourceEndMs: number,
  barCount: number
): number[] {
  const peaks = playbackData?.peaks;
  if (!peaks?.peaks.length) return getFallbackTimelineWaveBars(barCount);

  const startIndex = Math.max(0, Math.floor((sourceStartMs / 1000) * peaks.pointsPerSecond));
  const endIndex = Math.min(peaks.peaks.length, Math.max(startIndex + 1, Math.ceil((sourceEndMs / 1000) * peaks.pointsPerSecond)));
  const segment = peaks.peaks.slice(startIndex, endIndex).map((peak) => Math.abs(peak));
  if (!segment.length) return getFallbackTimelineWaveBars(barCount);

  const maxPeak = Math.max(0.05, ...segment);
  return Array.from({ length: barCount }, (_, index) => {
    const start = Math.floor((index / barCount) * segment.length);
    const end = Math.max(start + 1, Math.ceil(((index + 1) / barCount) * segment.length));
    const windowPeak = Math.max(...segment.slice(start, end));
    return Math.round(16 + (windowPeak / maxPeak) * 78);
  });
}

function getFallbackTimelineWaveBars(barCount: number): number[] {
  return Array.from({ length: barCount }, (_, index) => {
    const shape = Math.abs(Math.sin(index * 0.68)) * 0.72 + Math.abs(Math.cos(index * 0.27)) * 0.28;
    return Math.round(18 + Math.min(1, shape) * 70);
  });
}

function NavButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}): ReactElement {
  return (
    <button className={active ? 'active' : ''} type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function StatusIcon({ status }: { status: DependencyCheckResult['status'] }): ReactElement {
  if (status === 'available') return <CheckCircle2 className="status-icon ok" size={20} />;
  if (status === 'partial') return <AlertTriangle className="status-icon warn" size={20} />;
  return <AlertTriangle className="status-icon danger" size={20} />;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
