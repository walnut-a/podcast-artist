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
  Wrench,
  X
} from 'lucide-react';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import type {
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
  ProviderProfilesFile
} from '../../shared/types';
import { podcastArtistApi } from './apiClient';

type ViewKey = 'workspace' | 'library' | 'documents' | 'audio' | 'settings';

const statusLabels: Record<DependencyCheckResult['status'], string> = {
  available: '可用',
  partial: '部分可用',
  not_configured: '未配置',
  unavailable: '不可用'
};

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
  const [clipDurationMs, setClipDurationMs] = useState('1:00.00');
  const [lastExportJob, setLastExportJob] = useState<ExportJob | null>(null);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isAudioBusy, setIsAudioBusy] = useState(false);
  const [selectedAudioAssetId, setSelectedAudioAssetId] = useState<string | null>(null);
  const [playbackData, setPlaybackData] = useState<AudioAssetPlaybackData | null>(null);
  const [isPlaybackLoading, setIsPlaybackLoading] = useState(false);
  const [playheadMs, setPlayheadMs] = useState(0);

  const audioAssets = useMemo(() => library?.assets.filter((asset) => asset.kind === 'audio') ?? [], [library]);
  const audioAssetById = useMemo(() => new Map(audioAssets.map((asset) => [asset.id, asset])), [audioAssets]);
  const trackById = useMemo(() => new Map(editPlan?.tracks.map((track) => [track.id, track]) ?? []), [editPlan]);
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
  const selectedAudioAsset = useMemo(
    () => audioAssets.find((asset) => asset.id === selectedAudioAssetId) ?? audioAssets[0] ?? null,
    [audioAssets, selectedAudioAssetId]
  );

  useEffect(() => {
    if (!currentProjectId) {
      setLibrary(null);
      setEditPlan(null);
      setSelectedAudioAssetId(null);
      setPlaybackData(null);
      setPlayheadMs(0);
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
      setPlayheadMs(0);
      return;
    }

    let isMounted = true;
    setIsPlaybackLoading(true);
    podcastArtistApi
      .readAudioAssetPlaybackData({ projectId: currentProjectId, assetId: selectedAudioAssetId })
      .then((nextPlaybackData) => {
        if (!isMounted) return;
        setPlaybackData(nextPlaybackData);
        setPlayheadMs(0);
      })
      .catch((playbackError) => {
        if (!isMounted) return;
        setPlaybackData(null);
        setAudioError(toErrorMessage(playbackError));
      })
      .finally(() => {
        if (isMounted) setIsPlaybackLoading(false);
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
    setIsPlaybackLoading(true);
    try {
      const nextPlaybackData = await podcastArtistApi.readAudioAssetPlaybackData({ projectId: currentProjectId, assetId });
      setPlaybackData(nextPlaybackData);
    } finally {
      setIsPlaybackLoading(false);
    }
  }

  async function handleAddClip(assetId: string): Promise<void> {
    if (!currentProjectId) return;
    const durationMs = parseTimeInputMs(clipDurationMs);
    if (!durationMs || durationMs <= 0) {
      setAudioError('片段长度需要大于 0，可以输入毫秒或 0:30.00 这样的时间码。');
      return;
    }
    const assetDurationMs = getAssetAudioDurationMs(audioAssetById.get(assetId));
    const sourceEndMs = assetDurationMs ? Math.min(durationMs, assetDurationMs) : durationMs;

    setAudioNotice(null);
    setAudioError(null);
    setIsAudioBusy(true);
    try {
      await podcastArtistApi.addAudioClipToEditPlan({
        projectId: currentProjectId,
        assetId,
        trackName: 'Voice',
        sourceStartMs: 0,
        sourceEndMs: Math.round(sourceEndMs)
      });
      await reloadAudioState(currentProjectId);
      setAudioNotice('已加入片段。');
    } catch (clipError) {
      setAudioError(toErrorMessage(clipError));
    } finally {
      setIsAudioBusy(false);
    }
  }

  async function handlePreparePreview(assetId: string): Promise<void> {
    if (!currentProjectId) return;
    setSelectedAudioAssetId(assetId);
    setAudioNotice(null);
    setAudioError(null);
    setIsAudioBusy(true);
    try {
      await podcastArtistApi.analyzeAudioAsset({ projectId: currentProjectId, assetId });
      await podcastArtistApi.generateAudioProxy({ projectId: currentProjectId, assetId });
      await podcastArtistApi.generateAudioPeaks({ projectId: currentProjectId, assetId, pointsPerSecond: 20 });
      await reloadAudioState(currentProjectId);
      await reloadPlaybackData(assetId);
      setAudioNotice('素材已准备好，可以预览和加入剪辑。');
    } catch (prepareError) {
      setAudioError(toErrorMessage(prepareError));
    } finally {
      setIsAudioBusy(false);
    }
  }

  async function handleRippleDelete(clipId: string): Promise<void> {
    if (!currentProjectId) return;
    setAudioNotice(null);
    setAudioError(null);
    setIsAudioBusy(true);
    try {
      const plan = await podcastArtistApi.rippleDeleteAudioClip({ projectId: currentProjectId, clipId });
      setEditPlan(plan);
      setAudioNotice('已删除片段，后续内容自动吸附。');
    } catch (deleteError) {
      setAudioError(toErrorMessage(deleteError));
    } finally {
      setIsAudioBusy(false);
    }
  }

  async function handleUpdateClipTiming(clipId: string, sourceStartMs: number, sourceEndMs: number): Promise<void> {
    if (!currentProjectId) return;
    if (sourceEndMs <= sourceStartMs) {
      setAudioError('出点必须晚于入点。');
      return;
    }

    setAudioNotice(null);
    setAudioError(null);
    setIsAudioBusy(true);
    try {
      const plan = await podcastArtistApi.updateAudioClipTiming({
        projectId: currentProjectId,
        clipId,
        sourceStartMs,
        sourceEndMs
      });
      setEditPlan(plan);
      setAudioNotice('片段时间已更新，后续片段已按波纹规则重新吸附。');
    } catch (updateError) {
      setAudioError(toErrorMessage(updateError));
    } finally {
      setIsAudioBusy(false);
    }
  }

  async function handleExportPlan(): Promise<void> {
    if (!currentProjectId) return;
    setAudioNotice(null);
    setAudioError(null);
    setIsAudioBusy(true);
    try {
      const job = await podcastArtistApi.exportAudioEditPlan({ projectId: currentProjectId });
      setLastExportJob(job);
      if (job.status === 'completed') {
        setAudioNotice(`导出完成：${job.outputPath}`);
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
          <div className={`audio-command-bar ${audioAssets.length ? '' : 'no-audio'}`}>
            <div className="audio-command-copy">
              <span className="panel-kicker">非破坏剪辑</span>
              <strong>从素材库选择音频，剪出一版能听的结构，再导出到专业工具精修。</strong>
            </div>
            {audioAssets.length ? (
              <>
                <label className="field compact-field">
                  <span>片段长度上限</span>
                  <input value={clipDurationMs} onChange={(event) => setClipDurationMs(event.target.value)} />
                </label>
                <div className="command-actions">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void handleExportPlan()}
                    disabled={!currentProject || !editPlan?.clips.length || isAudioBusy}
                  >
                    导出 WAV
                  </button>
                </div>
              </>
            ) : null}
          </div>

          {audioNotice ? <div className="notice success compact">{audioNotice}</div> : null}
          {audioError ? <div className="notice error compact">{audioError}</div> : null}
          {lastExportJob ? (
            <div className={`notice compact ${lastExportJob.status === 'completed' ? 'success' : 'error'}`}>
              {lastExportJob.status === 'completed' ? `导出完成：${lastExportJob.outputPath}` : lastExportJob.error ?? '导出失败。'}
            </div>
          ) : null}

          {audioAssets.length ? (
            <>
              <WaveformPlayer
                asset={selectedAudioAsset}
                playbackData={playbackData}
                isBusy={isAudioBusy}
                isLoading={isPlaybackLoading}
                onPlayheadChange={setPlayheadMs}
                onPreparePreview={handlePreparePreview}
              />

              <div className={`audio-workbench-grid ${editPlan?.clips.length ? 'with-inspector' : 'without-inspector'}`}>
                <section className="audio-track-sidebar">
                  <div className="column-heading">
                    <div>
                      <span className="panel-kicker">素材库</span>
                      <h3>本期音频</h3>
                    </div>
                    <span className="count-pill">{audioAssets.length}</span>
                  </div>
                  <div className="asset-list">
                    {audioAssets.map((asset) => (
                      <article className={`asset-row ${asset.id === selectedAudioAsset?.id ? 'selected' : ''}`} key={asset.id}>
                        <div>
                          <strong>{asset.originalFileName}</strong>
                          <span>{formatAssetAudioMetadata(asset.metadata.audio)}</span>
                        </div>
                        <div className="asset-actions">
                          <button className="secondary-button" type="button" onClick={() => setSelectedAudioAssetId(asset.id)} disabled={isAudioBusy}>
                            预览
                          </button>
                          <button className="secondary-button" type="button" onClick={() => void handlePreparePreview(asset.id)} disabled={isAudioBusy}>
                            准备预览
                          </button>
                          <button className="primary-button small" type="button" onClick={() => void handleAddClip(asset.id)} disabled={isAudioBusy}>
                            加入剪辑
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="timeline-panel" aria-label="剪辑时间线">
                  {editPlan?.clips.length ? (
                    <>
                      <div className="timeline-ruler" aria-hidden="true">
                        {Array.from({ length: 7 }, (_, index) => {
                          const second = (timelineDurationMs / 1000 / 6) * index;
                          return <span key={index}>{formatTimecode(second)}</span>;
                        })}
                      </div>
                      <div className="timeline-track-area">
                        {editPlan.tracks.map((track) => {
                          const clips = clipsByTrackId.get(track.id) ?? [];
                          return (
                            <div className="timeline-track-row" key={track.id}>
                              <div className="timeline-track-label">
                                <strong>{formatTrackName(track.name)}</strong>
                                <span>{clips.length} clips</span>
                              </div>
                              <div className="timeline-lane">
                                {clips.map((clip) => {
                                  const durationMs = Math.max(1, clip.sourceEndMs - clip.sourceStartMs);
                                  const asset = audioAssetById.get(clip.assetId);
                                  const left = Math.max(0, (clip.timelineStartMs / timelineDurationMs) * 100);
                                  const width = Math.min(100 - left, Math.max(7, (durationMs / timelineDurationMs) * 100));

                                  return (
                                    <button
                                      className="timeline-clip"
                                      key={clip.id}
                                      style={{ left: `${left}%`, width: `${width}%` }}
                                      type="button"
                                      onClick={() => onPreviewAssetFromClip(asset?.id)}
                                      disabled={!asset}
                                      title={asset?.originalFileName ?? clip.assetId}
                                    >
                                      <span>{asset?.originalFileName ?? '素材片段'}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="timeline-empty-state">
                      <ListMusic size={30} />
                      <strong>还没有剪辑片段</strong>
                      <span>从左侧素材加入剪辑后，这里才会出现轨道时间线。</span>
                    </div>
                  )}
                </section>

                {editPlan?.clips.length ? (
                  <aside className="audio-inspector-panel">
                    <div className="column-heading">
                      <div>
                        <span className="panel-kicker">编辑计划</span>
                        <h3>片段参数</h3>
                      </div>
                    </div>
                    <div className="plan-summary">
                      <span>{editPlan.tracks.length} 条轨道</span>
                      <span>{editPlan.clips.length} 个片段</span>
                      <span>{editPlan.processing.loudnessNormalization.enabled ? '响度标准化' : '未标准化'}</span>
                    </div>
                    <div className="clip-list inspector-clip-list">
                      {editPlan.clips.map((clip) => (
                        <ClipTimingCard
                          key={clip.id}
                          asset={audioAssetById.get(clip.assetId) ?? null}
                          clip={clip}
                          currentPlayheadAssetId={selectedAudioAsset?.id ?? null}
                          isBusy={isAudioBusy}
                          playheadMs={playheadMs}
                          trackName={trackById.get(clip.trackId)?.name ?? clip.trackId}
                          onPreviewAsset={setSelectedAudioAssetId}
                          onRippleDelete={handleRippleDelete}
                          onUpdateTiming={handleUpdateClipTiming}
                        />
                      ))}
                    </div>
                  </aside>
                ) : null}
              </div>
            </>
          ) : (
            <div className="audio-empty-workflow">
              <Scissors size={30} />
              <strong>还没有可剪辑的音频</strong>
              <span>剪辑只引用素材库里的音频。先到素材库导入原始音频，再回来加入剪辑。</span>
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

function ClipTimingCard({
  asset,
  clip,
  currentPlayheadAssetId,
  isBusy,
  playheadMs,
  trackName,
  onPreviewAsset,
  onRippleDelete,
  onUpdateTiming
}: {
  asset: LibraryAsset | null;
  clip: AudioClip;
  currentPlayheadAssetId: string | null;
  isBusy: boolean;
  playheadMs: number;
  trackName: string;
  onPreviewAsset: (assetId: string) => void;
  onRippleDelete: (clipId: string) => Promise<void>;
  onUpdateTiming: (clipId: string, sourceStartMs: number, sourceEndMs: number) => Promise<void>;
}): ReactElement {
  const [startDraft, setStartDraft] = useState(String(clip.sourceStartMs));
  const [endDraft, setEndDraft] = useState(String(clip.sourceEndMs));
  const canUsePlayhead = Boolean(asset && currentPlayheadAssetId === asset.id);
  const durationMs = clip.sourceEndMs - clip.sourceStartMs;

  useEffect(() => {
    setStartDraft(String(clip.sourceStartMs));
    setEndDraft(String(clip.sourceEndMs));
  }, [clip.sourceStartMs, clip.sourceEndMs]);

  function applyDraftTiming(): void {
    const sourceStartMs = parseTimeInputMs(startDraft);
    const sourceEndMs = parseTimeInputMs(endDraft);
    if (sourceStartMs === null || sourceEndMs === null) return;
    void onUpdateTiming(clip.id, sourceStartMs, sourceEndMs);
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyDraftTiming();
    }
  }

  function updateBoundary(boundary: 'start' | 'end', valueMs: number): void {
    const nextStartMs = boundary === 'start' ? Math.min(Math.max(0, valueMs), clip.sourceEndMs - 1) : clip.sourceStartMs;
    const nextEndMs = boundary === 'end' ? Math.max(clip.sourceStartMs + 1, valueMs) : clip.sourceEndMs;
    void onUpdateTiming(clip.id, nextStartMs, nextEndMs);
  }

  function nudgeBoundary(boundary: 'start' | 'end', deltaMs: number): void {
    updateBoundary(boundary, boundary === 'start' ? clip.sourceStartMs + deltaMs : clip.sourceEndMs + deltaMs);
  }

  return (
    <article className="clip-row editable-clip-row">
      <div className="clip-main">
        <div className="clip-title-line">
          <div>
            <strong>{asset?.originalFileName ?? clip.assetId}</strong>
            <span>
              {formatTrackName(trackName)} · 开始 {formatTimecode(clip.timelineStartMs / 1000)} · 长度 {formatTimecode(durationMs / 1000)}
            </span>
          </div>
          <button className="icon-button danger-button" type="button" onClick={() => void onRippleDelete(clip.id)} title="波纹删除" disabled={isBusy}>
            <Trash2 size={16} />
          </button>
        </div>

        <div className="clip-time-grid">
          <label className="field compact-field">
            <span>入点</span>
            <input value={startDraft} onChange={(event) => setStartDraft(event.target.value)} onKeyDown={handleDraftKeyDown} />
          </label>
          <label className="field compact-field">
            <span>出点</span>
            <input value={endDraft} onChange={(event) => setEndDraft(event.target.value)} onKeyDown={handleDraftKeyDown} />
          </label>
          <button className="secondary-button apply-time-button" type="button" onClick={applyDraftTiming} disabled={isBusy}>
            应用修改
          </button>
        </div>

        <details className="clip-adjustment">
          <summary>精调边界</summary>
          <div className="clip-adjustment-body">
            <div className="clip-boundary-tools">
              <div>
                <span>入点</span>
                <button className="secondary-button" type="button" onClick={() => nudgeBoundary('start', -1000)} disabled={isBusy}>
                  -1s
                </button>
                <button className="secondary-button" type="button" onClick={() => nudgeBoundary('start', -100)} disabled={isBusy}>
                  -100ms
                </button>
                <button className="secondary-button" type="button" onClick={() => nudgeBoundary('start', 100)} disabled={isBusy}>
                  +100ms
                </button>
                <button className="secondary-button" type="button" onClick={() => nudgeBoundary('start', 1000)} disabled={isBusy}>
                  +1s
                </button>
              </div>
              <div>
                <span>出点</span>
                <button className="secondary-button" type="button" onClick={() => nudgeBoundary('end', -1000)} disabled={isBusy}>
                  -1s
                </button>
                <button className="secondary-button" type="button" onClick={() => nudgeBoundary('end', -100)} disabled={isBusy}>
                  -100ms
                </button>
                <button className="secondary-button" type="button" onClick={() => nudgeBoundary('end', 100)} disabled={isBusy}>
                  +100ms
                </button>
                <button className="secondary-button" type="button" onClick={() => nudgeBoundary('end', 1000)} disabled={isBusy}>
                  +1s
                </button>
              </div>
            </div>

            <div className="clip-playhead-tools">
              <span>播放头 {formatTimecode(playheadMs / 1000)}</span>
              {asset ? (
                <button className="secondary-button" type="button" onClick={() => onPreviewAsset(asset.id)} disabled={isBusy}>
                  预览素材
                </button>
              ) : null}
              <button className="secondary-button" type="button" onClick={() => updateBoundary('start', playheadMs)} disabled={!canUsePlayhead || isBusy}>
                设为入点
              </button>
              <button className="secondary-button" type="button" onClick={() => updateBoundary('end', playheadMs)} disabled={!canUsePlayhead || isBusy}>
                设为出点
              </button>
            </div>
          </div>
        </details>
      </div>
    </article>
  );
}

function WaveformPlayer({
  asset,
  playbackData,
  isBusy,
  isLoading,
  onPlayheadChange,
  onPreparePreview
}: {
  asset: LibraryAsset | null;
  playbackData: AudioAssetPlaybackData | null;
  isBusy: boolean;
  isLoading: boolean;
  onPlayheadChange: (playheadMs: number) => void;
  onPreparePreview: (assetId: string) => Promise<void>;
}): ReactElement {
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveformError, setWaveformError] = useState<string | null>(null);
  const canRenderWaveform = Boolean(playbackData?.peaks?.peaks.length && playbackData.durationMs && playbackData.preferredUrl);

  useEffect(() => {
    setIsReady(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(playbackData?.durationMs ? playbackData.durationMs / 1000 : 0);
    setWaveformError(null);
    onPlayheadChange(0);

    if (!waveformRef.current || !playbackData || !canRenderWaveform) {
      wavesurferRef.current?.destroy();
      wavesurferRef.current = null;
      return;
    }

    wavesurferRef.current?.destroy();
    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      url: playbackData.preferredUrl,
      peaks: playbackData.peaks ? [playbackData.peaks.peaks] : undefined,
      duration: playbackData.durationMs ? playbackData.durationMs / 1000 : undefined,
      backend: 'MediaElement',
      height: 136,
      minPxPerSec: 32,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      cursorColor: '#e4ff9a',
      cursorWidth: 2,
      dragToSeek: true,
      normalize: true,
      waveColor: '#42624b',
      progressColor: '#c8f46a'
    });
    wavesurferRef.current = wavesurfer;

    wavesurfer.on('ready', (readyDuration) => {
      setDuration(readyDuration);
      setIsReady(true);
    });
    wavesurfer.on('play', () => setIsPlaying(true));
    wavesurfer.on('pause', () => setIsPlaying(false));
    wavesurfer.on('finish', () => setIsPlaying(false));
    wavesurfer.on('timeupdate', (nextTime) => {
      setCurrentTime(nextTime);
      onPlayheadChange(Math.max(0, Math.round(nextTime * 1000)));
    });
    wavesurfer.on('error', (error) => {
      setWaveformError(error.message);
      setIsReady(false);
      setIsPlaying(false);
    });

    return () => {
      wavesurfer.destroy();
      if (wavesurferRef.current === wavesurfer) {
        wavesurferRef.current = null;
      }
    };
  }, [playbackData, canRenderWaveform]);

  function handlePlayPause(): void {
    void wavesurferRef.current?.playPause();
  }

  return (
    <section className="waveform-panel">
      <div className="waveform-header">
        <div>
          <span className="panel-kicker">波形预览</span>
          <h3>{asset ? asset.originalFileName : '选择音频素材'}</h3>
        </div>
        <div className="waveform-status">
          <span>{playbackData?.proxyUrl ? '预览就绪' : '待准备'}</span>
          <span>{playbackData?.peaks ? '波形就绪' : '波形待准备'}</span>
          <span>{playbackData?.durationMs ? formatDuration(playbackData.durationMs) : '时长未知'}</span>
        </div>
      </div>

      {asset && canRenderWaveform ? (
        <>
          <div className="waveform-canvas">
            <div className="waveform-ruler" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => {
                const second = duration ? (duration / 5) * index : index * 10;
                return <span key={index}>{formatTimecode(second)}</span>;
              })}
            </div>
            <div className="waveform-shell" ref={waveformRef} />
          </div>
          <div className="waveform-controls">
            <button className="icon-button waveform-play-button" type="button" onClick={handlePlayPause} disabled={!isReady || isBusy}>
              {isPlaying ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <div className="time-readout">
              <span>{formatTimecode(currentTime)}</span>
              <span>{formatTimecode(duration)}</span>
            </div>
          </div>
          {waveformError ? <div className="notice error compact">{waveformError}</div> : null}
        </>
      ) : (
        <div className="waveform-empty">
          <ListMusic size={28} />
          <div>
            <strong>{isLoading ? '正在读取预览数据' : asset ? '先准备预览' : '还没有可预览素材'}</strong>
            <span>
              {asset
                ? '准备后会生成可播放预览和波形，长音频也不用在浏览器里整段解码。'
                : '导入音频后，这里会显示当前素材的可播放波形。'}
            </span>
          </div>
          {asset ? (
            <div className="waveform-empty-actions">
              <button className="primary-button small" type="button" onClick={() => void onPreparePreview(asset.id)} disabled={isBusy || isLoading}>
                准备预览
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
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
  const [document, setDocument] = useState<ProjectDocument | null>(null);
  const [appendDraft, setAppendDraft] = useState('');
  const [taskPrompt, setTaskPrompt] = useState('核实这段资料，并整理成可插入文稿的 Markdown。');
  const [taskContext, setTaskContext] = useState('');
  const [taskResult, setTaskResult] = useState('');
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentProjectId) {
      setDocument(null);
      return;
    }

    let isMounted = true;
    setIsLoadingDocument(true);
    setLocalError(null);
    podcastArtistApi
      .readProjectDocument(currentProjectId)
      .then((nextDocument) => {
        if (isMounted) setDocument(nextDocument);
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
    if (!currentProjectId || !taskPrompt.trim() || !taskResult.trim()) return;

    setIsLoadingDocument(true);
    setLocalNotice(null);
    setLocalError(null);
    try {
      const task = await podcastArtistApi.createResearchTask({
        projectId: currentProjectId,
        title: taskPrompt.trim().slice(0, 48),
        userPrompt: taskPrompt,
        contextMarkdown: taskContext || document?.content || '',
        resultMarkdown: taskResult
      });
      const result = await podcastArtistApi.appendTaskResultToDocument({
        projectId: currentProjectId,
        taskId: task.id,
        summary: '采纳资料任务结果'
      });
      setDocument(result.document);
      setTaskResult('');
      await onWorkspaceRefresh();
      setLocalNotice('资料任务已完成，结果已保存到文稿。');
    } catch (taskError) {
      setLocalError(toErrorMessage(taskError));
    } finally {
      setIsLoadingDocument(false);
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
              <article className="markdown-reader manuscript-reader" aria-label="episode.md 预览">
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
        <div className="task-form-grid">
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
          <label className="field span-2">
            <span>任务结果 Markdown</span>
            <textarea
              value={taskResult}
              onChange={(event) => setTaskResult(event.target.value)}
              placeholder="粘贴资料结果 Markdown。提交后会先写入本地任务缓存，再采纳到 episode.md。"
            />
          </label>
        </div>
        <button className="primary-button" type="submit" disabled={!currentProjectId || !taskPrompt.trim() || !taskResult.trim() || isLoadingDocument}>
          <Send size={16} />
          创建任务并采纳
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

function formatTimecode(secondsValue: number): string {
  const totalSeconds = Math.max(0, Math.floor(secondsValue));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((Math.max(0, secondsValue) - totalSeconds) * 100);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

function formatTrackName(trackName: string): string {
  return trackName === 'Voice' ? '人声轨' : trackName;
}

function parseTimeInputMs(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.includes(':')) {
    const numericValue = Number(trimmed);
    return Number.isFinite(numericValue) ? Math.max(0, Math.round(numericValue)) : null;
  }

  const parts = trimmed.split(':');
  if (parts.length > 3) return null;
  const secondsPart = Number(parts.at(-1));
  const minutesPart = Number(parts.at(-2) ?? '0');
  const hoursPart = Number(parts.at(-3) ?? '0');
  if (![secondsPart, minutesPart, hoursPart].every(Number.isFinite)) return null;
  const totalSeconds = hoursPart * 3600 + minutesPart * 60 + secondsPart;
  return Math.max(0, Math.round(totalSeconds * 1000));
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
