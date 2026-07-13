# 真实资料任务闭环实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户从当前文稿或选中文本发起真实 OpenAI-compatible 资料任务，后台完成后在候选区查看结果，并由用户明确采纳到 `episode.md`。

**Architecture:** 新增一个只负责 OpenAI-compatible `/chat/completions` 的 provider client，以及一个把 provider 调用和现有本地任务账本串起来的 research task runner。workspace 服务继续负责 task/context/result/write-intent 的文件生命周期；Electron IPC 只启动任务并立即返回 running task，renderer 通过轮询读取状态和结果，不阻塞文稿阅读与编辑。

**Tech Stack:** Electron 42、Node fetch、React 19、TypeScript 6、Vitest 4、本地 JSON/Markdown 文件。

## Global Constraints

- 第一版只支持 OpenAI-compatible `POST /chat/completions`，不同时实现 Responses API、流式输出、工具调用或 web search。
- provider 只允许 `chat` / `research` 且包含 `research` capability；服务地址和模型必须显式配置。
- 凭证只支持现有的 `none` 与 `environment`；`runtime_prompt` 明确返回“不支持”错误，不保存密钥明文。
- task 必须先以 `running` 状态写入 `task.json`；成功后写 `result.md` 并标记 `completed`，失败后保留 task/context 并标记 `failed`。
- provider 结果不得自动写入正式文稿；只有用户点击“采纳到文稿”后才创建 write intent。
- 选中文稿作为不可变的 `context.md` 快照；本切片不引入不稳定的伪段落 ID，`segmentId` 保持 `null`。
- 浏览器 mock 必须保留可演示的异步 running → completed → adopt 流程，但不得向外部服务发请求。
- 不修改音频、样式主题或现有项目文件 schemaVersion。

---

### Task 1: OpenAI-compatible provider client

**Files:**
- Create: `src/main/services/openAiCompatibleProvider.ts`
- Create: `src/main/services/openAiCompatibleProvider.test.ts`

**Interfaces:**
- Consumes: `ProviderProfile` from `src/shared/types.ts` and global `fetch`.
- Produces: `requestResearchMarkdown(input, fetchImpl?): Promise<string>`.

- [ ] **Step 1: Write failing tests for request construction, environment credentials, and response validation**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderProfile } from '../../shared/types';
import { requestResearchMarkdown } from './openAiCompatibleProvider';

const profile: ProviderProfile = {
  id: 'prv_test',
  kind: 'chat',
  displayName: 'Test provider',
  baseUrl: 'http://localhost:11434/v1/',
  model: 'test-model',
  credentialSource: { kind: 'none' },
  capabilities: ['research']
};

afterEach(() => vi.unstubAllEnvs());

describe('requestResearchMarkdown', () => {
  it('posts prompt and context to chat completions', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const result = await requestResearchMarkdown(
      { profile, prompt: '核实这段', contextMarkdown: '原始文稿' },
      async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ choices: [{ message: { content: '## 核查结果' } }] }), { status: 200 });
      }
    );
    expect(result).toBe('## 核查结果');
    expect(requests[0]?.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(JSON.parse(String(requests[0]?.init.body))).toMatchObject({ model: 'test-model', stream: false });
  });

  it('reads bearer credentials from the configured environment variable', async () => {
    vi.stubEnv('PODCAST_ARTIST_TEST_KEY', 'secret');
    let authorization = '';
    await requestResearchMarkdown(
      { profile: { ...profile, credentialSource: { kind: 'environment', envVar: 'PODCAST_ARTIST_TEST_KEY' } }, prompt: 'p', contextMarkdown: 'c' },
      async (_url, init) => {
        authorization = new Headers(init?.headers).get('authorization') ?? '';
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
      }
    );
    expect(authorization).toBe('Bearer secret');
  });

  it('rejects missing configuration and malformed provider responses', async () => {
    await expect(requestResearchMarkdown({ profile: { ...profile, model: null }, prompt: 'p', contextMarkdown: 'c' })).rejects.toThrow('model');
    await expect(
      requestResearchMarkdown(
        { profile, prompt: 'p', contextMarkdown: 'c' },
        async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })
      )
    ).rejects.toThrow('content');
  });
});
```

- [ ] **Step 2: Run the provider test and verify RED**

Run: `npm test -- src/main/services/openAiCompatibleProvider.test.ts`

Expected: FAIL because `openAiCompatibleProvider.ts` does not exist.

- [ ] **Step 3: Implement the minimal provider client**

```ts
import type { ProviderProfile } from '../../shared/types';

export interface ResearchProviderRequest {
  profile: ProviderProfile;
  prompt: string;
  contextMarkdown: string;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function requestResearchMarkdown(
  input: ResearchProviderRequest,
  fetchImpl: FetchLike = fetch
): Promise<string> {
  const { profile } = input;
  if (!profile.baseUrl?.trim()) throw new Error(`Provider ${profile.displayName} is missing a base URL.`);
  if (!profile.model?.trim()) throw new Error(`Provider ${profile.displayName} is missing a model.`);
  if (!['chat', 'research'].includes(profile.kind) || !profile.capabilities.includes('research')) {
    throw new Error(`Provider ${profile.displayName} does not support research tasks.`);
  }

  const headers = new Headers({ 'content-type': 'application/json' });
  if (profile.credentialSource.kind === 'environment') {
    const token = process.env[profile.credentialSource.envVar]?.trim();
    if (!token) throw new Error(`Credential environment variable ${profile.credentialSource.envVar} is not set.`);
    headers.set('authorization', `Bearer ${token}`);
  } else if (profile.credentialSource.kind === 'runtime_prompt') {
    throw new Error('Runtime credential input is not supported for research tasks yet.');
  }

  const response = await fetchImpl(`${profile.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: profile.model,
      stream: false,
      messages: [
        { role: 'system', content: '你是播客资料助手。返回可供用户审阅的 Markdown，不要声称已经写入文稿。' },
        { role: 'user', content: `任务：\n${input.prompt}\n\n上下文：\n${input.contextMarkdown}` }
      ]
    })
  });
  if (!response.ok) {
    const detail = (await response.text()).trim().slice(0, 1000);
    throw new Error(`Provider request failed (${response.status}): ${detail || response.statusText}`);
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Provider response did not contain message content.');
  return content.trim();
}
```

- [ ] **Step 4: Run the provider test and verify GREEN**

Run: `npm test -- src/main/services/openAiCompatibleProvider.test.ts`

Expected: 3 tests pass with no warnings.

- [ ] **Step 5: Commit the provider client**

```bash
git add src/main/services/openAiCompatibleProvider.ts src/main/services/openAiCompatibleProvider.test.ts
git commit -m "实现兼容 OpenAI 的资料任务调用"
```

---

### Task 2: Persistent task lifecycle and background runner

**Files:**
- Modify: `src/shared/types.ts:199-237`
- Modify: `src/main/services/workspace.ts:337-430`
- Modify: `src/main/services/workspace.test.ts:169-199`
- Create: `src/main/services/researchTaskRunner.ts`
- Create: `src/main/services/researchTaskRunner.test.ts`

**Interfaces:**
- Consumes: `requestResearchMarkdown()` from Task 1 and existing workspace/project file helpers.
- Produces: `completeResearchTask()`, `failResearchTask()`, `readResearchTaskResult()`, and `startResearchTask()`.

- [ ] **Step 1: Change the workspace test to require a running task before completion**

```ts
it('persists running, completed, and adopted task states separately', async () => {
  const settings = createSettings(tempDir);
  const project = await createProject(settings, { title: '第 24 期 本地优先' });
  const task = await createResearchTask(settings, {
    projectId: project.id,
    userPrompt: '核实这一段说法',
    contextMarkdown: '用户正在查看：本地优先工具为什么重要。',
    title: '本地优先资料核实',
    providerProfileId: 'prv_test'
  }, 'chat');
  expect(task.status).toBe('running');
  await expect(appendTaskResultToDocument(settings, { projectId: project.id, taskId: task.id, summary: '采纳结果' })).rejects.toThrow('completed');

  const completed = await completeResearchTask(settings, {
    projectId: project.id,
    taskId: task.id,
    resultMarkdown: '## 资料补充\n\n本地优先可以降低长期维护成本。'
  });
  expect(completed.status).toBe('completed');
  expect((await readResearchTaskResult(settings, { projectId: project.id, taskId: task.id })).resultMarkdown).toContain('长期维护成本');

  const appendResult = await appendTaskResultToDocument(settings, { projectId: project.id, taskId: task.id, summary: '采纳资料任务结果' });
  expect(appendResult.document.content).toContain('长期维护成本');
  await expect(appendTaskResultToDocument(settings, { projectId: project.id, taskId: task.id, summary: '重复采纳' })).rejects.toThrow('already');
});
```

- [ ] **Step 2: Run the workspace lifecycle test and verify RED**

Run: `npm test -- src/main/services/workspace.test.ts -t "persists running"`

Expected: FAIL because completion/result APIs and the new create signature do not exist.

- [ ] **Step 3: Add task lifecycle types and workspace operations**

```ts
export interface CompleteResearchTaskInput {
  projectId: string;
  taskId: string;
  resultMarkdown: string;
}

export interface FailResearchTaskInput {
  projectId: string;
  taskId: string;
  error: string;
}

export interface ReadResearchTaskResultInput {
  projectId: string;
  taskId: string;
}

export interface ResearchTaskResult {
  taskId: string;
  resultMarkdown: string;
}
```

Update `CreateResearchTaskInput` to remove `resultMarkdown`. Make `createResearchTask(settings, input, providerKind)` write `context.md`, an empty `result.md`, and a `running` task with `completedAt: null`. `completeResearchTask` must require a running task, write the trimmed result plus a trailing newline, then atomically rewrite `task.json` as completed. `failResearchTask` must preserve context/result paths and store a bounded error string. `appendTaskResultToDocument` must reject non-completed or already-adopted tasks.

- [ ] **Step 4: Run the workspace lifecycle test and verify GREEN**

Run: `npm test -- src/main/services/workspace.test.ts -t "persists running"`

Expected: PASS.

- [ ] **Step 5: Write failing runner tests for success and provider failure**

```ts
it('returns a running task immediately and persists provider completion', async () => {
  const started = await startResearchTask(settings, providers, input, async () => '## 候选资料');
  expect(started.task.status).toBe('running');
  expect((await started.completion).status).toBe('completed');
  expect((await readResearchTaskResult(settings, { projectId: project.id, taskId: started.task.id })).resultMarkdown).toContain('候选资料');
});

it('persists provider failures instead of losing the task', async () => {
  const started = await startResearchTask(settings, providers, input, async () => { throw new Error('provider offline'); });
  const failed = await started.completion;
  expect(failed.status).toBe('failed');
  expect(failed.error).toContain('provider offline');
});
```

- [ ] **Step 6: Run the runner test and verify RED**

Run: `npm test -- src/main/services/researchTaskRunner.test.ts`

Expected: FAIL because `startResearchTask` does not exist.

- [ ] **Step 7: Implement the runner**

```ts
export async function startResearchTask(
  settings: AppSettings,
  providers: ProviderProfilesFile,
  input: CreateResearchTaskInput,
  request: ResearchRequester = requestResearchMarkdown
): Promise<{ task: AgentTask; completion: Promise<AgentTask> }> {
  const profileId = input.providerProfileId ?? settings.defaultProviderProfileId;
  const profile = providers.profiles.find((item) => item.id === profileId);
  if (!profile) throw new Error('A valid research provider profile is required.');
  const task = await createResearchTask(settings, { ...input, providerProfileId: profile.id }, profile.kind);
  const completion = request({ profile, prompt: input.userPrompt, contextMarkdown: input.contextMarkdown })
    .then((resultMarkdown) => completeResearchTask(settings, { projectId: input.projectId, taskId: task.id, resultMarkdown }))
    .catch((error) => failResearchTask(settings, { projectId: input.projectId, taskId: task.id, error: error instanceof Error ? error.message : String(error) }));
  return { task, completion };
}
```

- [ ] **Step 8: Run runner and workspace tests together**

Run: `npm test -- src/main/services/researchTaskRunner.test.ts src/main/services/workspace.test.ts`

Expected: both files pass.

- [ ] **Step 9: Commit task lifecycle**

```bash
git add src/shared/types.ts src/main/services/workspace.ts src/main/services/workspace.test.ts src/main/services/researchTaskRunner.ts src/main/services/researchTaskRunner.test.ts
git commit -m "建立资料任务运行与候选结果生命周期"
```

---

### Task 3: Electron bridge and explicit candidate adoption UI

**Files:**
- Modify: `src/shared/api.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/src/App.tsx:1768-1985`
- Modify: `src/renderer/src/styles.css:1016-1138`
- Modify: `src/renderer/src/apiClient.ts`

**Interfaces:**
- Consumes: `startResearchTask()` and `readResearchTaskResult()` from Task 2.
- Produces: renderer API `readResearchTaskResult(input): Promise<ResearchTaskResult>` and a visible running/completed/failed/adopted flow.

- [ ] **Step 1: Add the result-reading API contract and IPC bridge**

```ts
// src/shared/api.ts
readResearchTaskResult(input: ReadResearchTaskResultInput): Promise<ResearchTaskResult>;

// src/preload/index.ts
readResearchTaskResult: (input) => ipcRenderer.invoke('task:readResearchTaskResult', input),

// src/main/index.ts
ipcMain.handle('task:createResearchTask', async (_event, input) => {
  const { settings, providers } = await ensureAppConfig();
  const started = await startResearchTask(settings, providers, input);
  void started.completion;
  return started.task;
});
ipcMain.handle('task:readResearchTaskResult', async (_event, input) => {
  const { settings } = await ensureAppConfig();
  return readResearchTaskResult(settings, input);
});
```

- [ ] **Step 2: Replace the manual result form with provider selection and selected-text capture**

Add `manuscriptReaderRef`, `selectedTaskId`, `selectedTaskResult`, `isSubmittingTask`, and `selectedProviderProfileId` state. Eligible profiles are `chat`/`research` profiles that contain the `research` capability. The “使用选中文稿” button must call `window.getSelection()`, verify the selected nodes are inside `manuscriptReaderRef.current`, and copy the selected text into `taskContext`; when no selection exists, show `请先在文稿中选中一段文字。`.

```tsx
<select value={selectedProviderProfileId} onChange={(event) => setSelectedProviderProfileId(event.target.value)}>
  {researchProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}
</select>
<button type="button" className="secondary-button" onClick={captureSelectedManuscript}>使用选中文稿</button>
```

- [ ] **Step 3: Start tasks without auto-adoption or document-wide busy state**

```ts
const task = await podcastArtistApi.createResearchTask({
  projectId: currentProjectId,
  title: taskPrompt.trim().slice(0, 48),
  userPrompt: taskPrompt.trim(),
  contextMarkdown: taskContext.trim() || document?.content || '',
  providerProfileId: selectedProviderProfileId
});
setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
setLocalNotice('资料任务已启动，可以继续阅读或发起下一条任务。');
```

The submit button copy becomes `启动资料任务`. It is disabled only while the start IPC is in flight or when no eligible provider/prompt exists.

- [ ] **Step 4: Poll running tasks and expose completed results**

Add an effect that refreshes `readProjectTasks(currentProjectId)` every 750ms only while at least one task is running. Each completed row gets `查看结果`; the selected result renders in a candidate panel with `采纳到文稿`. Failed rows display `task.error`. Adopted rows show `已采纳` and disable repeat adoption.

```tsx
<button type="button" onClick={() => void loadTaskResult(task)} disabled={task.status !== 'completed'}>查看结果</button>
<button type="button" onClick={() => void adoptTaskResult(task)} disabled={Boolean(task.writeIntentPath)}>采纳到文稿</button>
```

- [ ] **Step 5: Add focused styles for task row actions and result candidate**

Add `.task-ledger-actions`, `.task-result-candidate`, and `.task-result-content` rules using the existing neutral/reference tokens. Do not change the global green theme in this task.

- [ ] **Step 6: Migrate the browser mock to the new asynchronous task contract**

`createResearchTask` must return a running task immediately, store an empty result, then use a short timer to replace it with a completed task and deterministic Markdown. `readResearchTaskResult` must reject running/failed tasks and return the stored Markdown for completed tasks. `appendTaskResultToDocument` must reject duplicate adoption.

```ts
const task = { ...baseTask, status: 'running', completedAt: null } satisfies AgentTask;
previewTasks.set(task.id, { task, resultMarkdown: '' });
window.setTimeout(() => {
  previewTasks.set(task.id, {
    task: { ...task, status: 'completed', completedAt: new Date().toISOString() },
    resultMarkdown: `## 资料候选\n\n这是浏览器预览生成的候选结果：${input.userPrompt}`
  });
}, 500);
return task;
```

- [ ] **Step 7: Run typecheck and fix contract mismatches**

Run: `npm run typecheck`

Expected: exit 0; no remaining `resultMarkdown` input usage and every bridge implements the updated `PodcastArtistApi`.

- [ ] **Step 8: Commit the Electron and UI flow**

```bash
git add src/shared/api.ts src/preload/index.ts src/main/index.ts src/renderer/src/App.tsx src/renderer/src/styles.css src/renderer/src/apiClient.ts
git commit -m "接通资料任务候选结果与明确采纳交互"
```

---

### Task 4: Browser mock, documentation, and full verification

**Files:**
- Modify: `README.md`
- Modify: `docs/doc/repository-analysis.md`

**Interfaces:**
- Consumes: updated `PodcastArtistApi` and task lifecycle types.
- Produces: browser-only deterministic task completion for visual testing; updated project capability documentation.

- [ ] **Step 1: Update README capability boundaries**

Move “真实 AI provider 调用” out of the unimplemented list and document the exact boundary: OpenAI-compatible chat completions, `none`/environment credentials, background task ledger, candidate review and explicit adoption. Keep streaming, runtime credential prompt, provider health checks, stable paragraph indexing and retries in the unimplemented list.

- [ ] **Step 2: Update repository analysis**

Record the two new service boundaries (`openAiCompatibleProvider.ts`, `researchTaskRunner.ts`) and the task state transition `running → completed|failed → adopted through write intent`.

- [ ] **Step 3: Run the full automated verification**

Run: `npm test && npm run build`

Expected: all Vitest files pass; TypeScript, main, preload and renderer production builds exit 0.

- [ ] **Step 4: Run the browser mock vertical slice**

Run: `npx vite preview --outDir out/renderer --host 127.0.0.1 --port 4517 --strictPort`

Using a named browser session:

1. Create a project and open 文稿.
2. Append a paragraph, select part of it, and click 使用选中文稿.
3. Start a task and verify the row first shows 运行中.
4. Wait for completion, open the candidate result, and confirm the document is unchanged.
5. Click 采纳到文稿 and confirm the document now contains the candidate result and the task says 已采纳.

Expected: the task can run while the document remains readable; no result reaches `episode.md` before the explicit adoption click.

- [ ] **Step 5: Confirm worktree scope**

Run: `git status --short && git diff --check`

Expected: only the planned source, test, plan and documentation files are changed; the pre-existing untracked `.claude/launch.json` remains untouched; `git diff --check` exits 0.

- [ ] **Step 6: Commit documentation updates**

```bash
git add README.md docs/doc/repository-analysis.md docs/superpowers/plans/2026-07-11-real-research-task-flow.md
git commit -m "完善真实资料任务闭环说明与预览"
```

## Self-Review

- Spec coverage: provider selection/call, immutable context snapshot, persistent running/completed/failed states, visible candidate result, explicit adoption, browser mock and docs all have a task.
- Deliberate exclusions: stable paragraph IDs, streaming, retry/cancel, Responses API, runtime credential input, provider health checks and source citation extraction are not claimed by this slice.
- Placeholder scan: no TBD/TODO/“类似上一步” placeholders; every test and command has a concrete expected result.
- Type consistency: `CreateResearchTaskInput` no longer contains `resultMarkdown`; result reading consistently uses `ReadResearchTaskResultInput` and `ResearchTaskResult`; runner returns `{ task, completion }`.
