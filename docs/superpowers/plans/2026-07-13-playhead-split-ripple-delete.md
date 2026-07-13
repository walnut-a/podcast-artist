# 播放头切割与波纹删除实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户在选中音频片段内部的播放头位置执行一次原子切割，并能立即选中新生成的右段，复用现有 Delete 波纹删除完成最低可用剪辑闭环。

**Architecture:** 把切割校验和 `AudioEditPlan` 变换放进 `src/shared/audioEditPlan.ts` 纯函数，主进程与浏览器 mock 共用同一规则。主进程服务只负责读取 plan、生成 ID 与时间、原子持久化和更新项目 manifest；renderer 通过新增 IPC 方法提交切割意图，并使用返回的 `rightClipId` 更新选择。

**Tech Stack:** Electron 42、React 19、TypeScript 6、Vitest 4、本地 JSON edit plan、现有浏览器 mock。

## Global Constraints

- 第一版只实现“选中片段 → 播放头切开 → 选中一段 → 现有波纹删除”，不实现任意时间范围拖拽框选。
- 切割后左右片段都必须不少于 250ms；共享模块导出 `MIN_SPLIT_CLIP_DURATION_MS = 250`，renderer 与纯函数共用。
- 左段沿用原 ID、原淡入和增益，`fadeOutMs` 设为 `0`；右段生成新 `clp_` ID、保留原淡出和增益，`fadeInMs` 设为 `0`。
- 切割不移动任何已有片段，不修改素材文件，不改变 `AudioEditPlan.schemaVersion`。
- 主进程必须用一次现有原子 JSON 写入持久化完整 plan，不能组合“先修剪、再新增”两次写入。
- Electron 主进程和浏览器 mock 必须调用同一个 `splitAudioClipInPlan`，不能复制切割规则。
- 切割触发时先停止当前试听；成功后播放头保持在切口，默认选中新生成的右段。
- 不引入 undo/redo、Web Audio、时间线缩放重构、音频编辑队列或跨进程锁。
- 不创建 worktree；保留预先存在且未跟踪的 `.claude/`，不暂存、不修改。

---

### Task 1: 共享切割规则与边界校验

**Files:**
- Create: `src/shared/audioEditPlan.ts`
- Create: `src/shared/audioEditPlan.test.ts`
- Modify: `src/shared/types.ts:316-336`

**Interfaces:**
- Consumes: `AudioClip`、`AudioEditPlan` from `src/shared/types.ts`。
- Produces: `MIN_SPLIT_CLIP_DURATION_MS`、`canSplitAudioClipAtTimelineMs()`、`SplitAudioClipInPlanInput`、`splitAudioClipInPlan()`、`SplitAudioClipInput`、`SplitAudioClipResult`。

- [ ] **Step 1: 在共享类型中定义公共 API 输入和结果**

在 `RippleDeleteAudioClipInput` 后加入：

```ts
export interface SplitAudioClipInput {
  projectId: string;
  clipId: string;
  timelineSplitMs: number;
}

export interface SplitAudioClipResult {
  plan: AudioEditPlan;
  leftClipId: string;
  rightClipId: string;
}
```

- [ ] **Step 2: 写共享纯函数的失败测试**

创建 `src/shared/audioEditPlan.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { AudioClip, AudioEditPlan } from './types';
import {
  MIN_SPLIT_CLIP_DURATION_MS,
  canSplitAudioClipAtTimelineMs,
  splitAudioClipInPlan
} from './audioEditPlan';

function createClip(input: Partial<AudioClip> & Pick<AudioClip, 'id' | 'trackId' | 'assetId'>): AudioClip {
  return {
    sourceStartMs: 0,
    sourceEndMs: 1_000,
    timelineStartMs: 0,
    gainDb: 0,
    fadeInMs: 20,
    fadeOutMs: 20,
    ...input
  };
}

function createPlan(): AudioEditPlan {
  return {
    schemaVersion: 'audioEditPlan.v1',
    id: 'pln_rough_cut',
    projectId: 'prj_test',
    title: 'Rough Cut',
    timebase: { unit: 'ms', sampleRate: 48_000 },
    tracks: [
      { id: 'trk_host', name: '主持人', kind: 'voice', muted: false, solo: false, gainDb: 0 },
      { id: 'trk_music', name: '音乐', kind: 'music', muted: false, solo: false, gainDb: -6 }
    ],
    clips: [
      createClip({
        id: 'clp_target',
        trackId: 'trk_host',
        assetId: 'ast_host',
        sourceStartMs: 1_000,
        sourceEndMs: 5_000,
        timelineStartMs: 2_000,
        gainDb: -3,
        fadeInMs: 20,
        fadeOutMs: 30
      }),
      createClip({
        id: 'clp_later',
        trackId: 'trk_host',
        assetId: 'ast_host',
        sourceStartMs: 5_000,
        sourceEndMs: 6_000,
        timelineStartMs: 6_000
      }),
      createClip({
        id: 'clp_music',
        trackId: 'trk_music',
        assetId: 'ast_music',
        sourceStartMs: 0,
        sourceEndMs: 8_000,
        timelineStartMs: 0
      })
    ],
    processing: {
      loudnessNormalization: { enabled: true, targetLufs: -16 },
      denoise: { enabled: false, providerProfileId: null }
    },
    exportDefaults: { format: 'wav', sampleRate: 48_000, channels: 2 },
    updatedAt: '2026-07-13T08:00:00.000Z'
  };
}

describe('splitAudioClipInPlan', () => {
  it('splits source time at the playhead without moving existing clips', () => {
    const original = createPlan();
    const result = splitAudioClipInPlan({
      plan: original,
      clipId: 'clp_target',
      timelineSplitMs: 3_500,
      rightClipId: 'clp_right',
      updatedAt: '2026-07-13T08:05:00.000Z'
    });

    expect(result.leftClipId).toBe('clp_target');
    expect(result.rightClipId).toBe('clp_right');
    expect(result.plan.clips.find((clip) => clip.id === 'clp_target')).toMatchObject({
      sourceStartMs: 1_000,
      sourceEndMs: 2_500,
      timelineStartMs: 2_000,
      gainDb: -3,
      fadeInMs: 20,
      fadeOutMs: 0
    });
    expect(result.plan.clips.find((clip) => clip.id === 'clp_right')).toMatchObject({
      trackId: 'trk_host',
      assetId: 'ast_host',
      sourceStartMs: 2_500,
      sourceEndMs: 5_000,
      timelineStartMs: 3_500,
      gainDb: -3,
      fadeInMs: 0,
      fadeOutMs: 30
    });
    expect(result.plan.clips.find((clip) => clip.id === 'clp_later')?.timelineStartMs).toBe(6_000);
    expect(result.plan.clips.find((clip) => clip.id === 'clp_music')?.timelineStartMs).toBe(0);
    expect(result.plan.updatedAt).toBe('2026-07-13T08:05:00.000Z');
    expect(original.clips.find((clip) => clip.id === 'clp_target')?.sourceEndMs).toBe(5_000);
    expect(original.clips.find((clip) => clip.id === 'clp_target')?.fadeOutMs).toBe(30);
  });

  it('uses the same inclusive 250ms boundary for eligibility and mutation', () => {
    const clip = createPlan().clips.find((item) => item.id === 'clp_target')!;
    expect(MIN_SPLIT_CLIP_DURATION_MS).toBe(250);
    expect(canSplitAudioClipAtTimelineMs(clip, 2_250)).toBe(true);
    expect(canSplitAudioClipAtTimelineMs(clip, 5_750)).toBe(true);
    expect(canSplitAudioClipAtTimelineMs(clip, 2_249)).toBe(false);
    expect(canSplitAudioClipAtTimelineMs(clip, 5_751)).toBe(false);
    expect(canSplitAudioClipAtTimelineMs(clip, Number.NaN)).toBe(false);
  });

  it('rejects invalid positions, missing clips, and duplicate right ids', () => {
    const plan = createPlan();
    expect(() =>
      splitAudioClipInPlan({
        plan,
        clipId: 'clp_target',
        timelineSplitMs: Number.NaN,
        rightClipId: 'clp_right',
        updatedAt: '2026-07-13T08:05:00.000Z'
      })
    ).toThrow('finite');
    expect(() =>
      splitAudioClipInPlan({
        plan,
        clipId: 'clp_missing',
        timelineSplitMs: 3_500,
        rightClipId: 'clp_right',
        updatedAt: '2026-07-13T08:05:00.000Z'
      })
    ).toThrow('not found');
    expect(() =>
      splitAudioClipInPlan({
        plan,
        clipId: 'clp_target',
        timelineSplitMs: 2_249,
        rightClipId: 'clp_right',
        updatedAt: '2026-07-13T08:05:00.000Z'
      })
    ).toThrow('250ms');
    expect(() =>
      splitAudioClipInPlan({
        plan,
        clipId: 'clp_target',
        timelineSplitMs: 3_500,
        rightClipId: 'clp_later',
        updatedAt: '2026-07-13T08:05:00.000Z'
      })
    ).toThrow('unique');
  });
});
```

- [ ] **Step 3: 运行共享测试并确认 RED**

Run: `npm test -- src/shared/audioEditPlan.test.ts`

Expected: FAIL because `src/shared/audioEditPlan.ts` does not exist.

- [ ] **Step 4: 实现共享常量、资格判断和纯切割函数**

创建 `src/shared/audioEditPlan.ts`：

```ts
import type { AudioClip, AudioEditPlan, SplitAudioClipResult } from './types';

export const MIN_SPLIT_CLIP_DURATION_MS = 250;

export interface SplitAudioClipInPlanInput {
  plan: AudioEditPlan;
  clipId: string;
  timelineSplitMs: number;
  rightClipId: string;
  updatedAt: string;
}

export function canSplitAudioClipAtTimelineMs(clip: AudioClip, timelineSplitMs: number): boolean {
  if (!Number.isFinite(timelineSplitMs)) return false;
  const roundedSplitMs = Math.round(timelineSplitMs);
  const timelineEndMs = clip.timelineStartMs + clip.sourceEndMs - clip.sourceStartMs;
  return (
    roundedSplitMs - clip.timelineStartMs >= MIN_SPLIT_CLIP_DURATION_MS &&
    timelineEndMs - roundedSplitMs >= MIN_SPLIT_CLIP_DURATION_MS
  );
}

export function splitAudioClipInPlan(input: SplitAudioClipInPlanInput): SplitAudioClipResult {
  if (!Number.isFinite(input.timelineSplitMs)) {
    throw new Error('Split timeline position must be a finite number.');
  }

  const clip = input.plan.clips.find((item) => item.id === input.clipId);
  if (!clip) {
    throw new Error(`Audio clip not found: ${input.clipId}`);
  }

  const rightClipId = input.rightClipId.trim();
  if (!rightClipId || input.plan.clips.some((item) => item.id === rightClipId)) {
    throw new Error('Split right clip id must be unique.');
  }

  const timelineSplitMs = Math.round(input.timelineSplitMs);
  if (!canSplitAudioClipAtTimelineMs(clip, timelineSplitMs)) {
    throw new Error(`Split must leave at least ${MIN_SPLIT_CLIP_DURATION_MS}ms on both sides.`);
  }

  const sourceSplitMs = clip.sourceStartMs + timelineSplitMs - clip.timelineStartMs;
  const leftClip: AudioClip = {
    ...clip,
    sourceEndMs: sourceSplitMs,
    fadeOutMs: 0
  };
  const rightClip: AudioClip = {
    ...clip,
    id: rightClipId,
    sourceStartMs: sourceSplitMs,
    timelineStartMs: timelineSplitMs,
    fadeInMs: 0
  };
  const nextPlan: AudioEditPlan = {
    ...input.plan,
    clips: [...input.plan.clips.map((item) => (item.id === clip.id ? leftClip : item)), rightClip].sort(sortAudioClips),
    updatedAt: input.updatedAt
  };

  return {
    plan: nextPlan,
    leftClipId: leftClip.id,
    rightClipId: rightClip.id
  };
}

function sortAudioClips(a: AudioClip, b: AudioClip): number {
  if (a.trackId !== b.trackId) return a.trackId.localeCompare(b.trackId);
  if (a.timelineStartMs !== b.timelineStartMs) return a.timelineStartMs - b.timelineStartMs;
  return a.id.localeCompare(b.id);
}
```

- [ ] **Step 5: 运行共享测试并确认 GREEN**

Run: `npm test -- src/shared/audioEditPlan.test.ts`

Expected: 3 tests pass, including the exact 250ms boundaries and non-mutating plan transform.

- [ ] **Step 6: 提交共享切割规则**

```bash
git add src/shared/types.ts src/shared/audioEditPlan.ts src/shared/audioEditPlan.test.ts
git commit -m "实现共享音频片段切割规则"
```

---

### Task 2: 主进程持久化切割结果

**Files:**
- Modify: `src/main/services/workspace.ts:1-60,929-1005`
- Modify: `src/main/services/workspace.test.ts:1-40,562-652`

**Interfaces:**
- Consumes: `splitAudioClipInPlan()`、`SplitAudioClipInput`、`SplitAudioClipResult` from Task 1；现有 `createId()`、`readAudioEditPlanForProject()`、`writeAudioEditPlanForProject()`、`touchProjectManifest()`。
- Produces: `splitAudioClip(settings, input): Promise<SplitAudioClipResult>`。

- [ ] **Step 1: 写主进程持久化失败测试**

把 `splitAudioClip` 加入 `workspace.test.ts` 的 workspace 导入列表，并在现有 ripple delete 测试后加入：

```ts
it('splits an audio clip at the playhead and persists both source ranges', async () => {
  const settings = createSettings(tempDir);
  const project = await createProject(settings, { title: 'Split clip' });
  const sourcePath = path.join(tempDir, 'host.wav');
  await writeFile(sourcePath, Buffer.from('host audio data'));
  const asset = await importLibraryAsset(settings, {
    projectId: project.id,
    sourcePath,
    kind: 'audio'
  });

  const firstClip = await addAudioClipToEditPlan(settings, {
    projectId: project.id,
    assetId: asset.id,
    trackName: '音轨 1',
    sourceStartMs: 1_000,
    sourceEndMs: 5_000
  });
  const laterClip = await addAudioClipToEditPlan(settings, {
    projectId: project.id,
    assetId: asset.id,
    trackName: '音轨 1',
    sourceStartMs: 5_000,
    sourceEndMs: 6_000
  });

  const result = await splitAudioClip(settings, {
    projectId: project.id,
    clipId: firstClip.id,
    timelineSplitMs: 1_500
  });
  const persisted = await readAudioEditPlan(settings, project.id);
  const leftClip = persisted.clips.find((clip) => clip.id === result.leftClipId);
  const rightClip = persisted.clips.find((clip) => clip.id === result.rightClipId);

  expect(result.rightClipId).toMatch(/^clp_/);
  expect(leftClip).toMatchObject({
    sourceStartMs: 1_000,
    sourceEndMs: 2_500,
    timelineStartMs: 0,
    fadeInMs: 20,
    fadeOutMs: 0
  });
  expect(rightClip).toMatchObject({
    sourceStartMs: 2_500,
    sourceEndMs: 5_000,
    timelineStartMs: 1_500,
    fadeInMs: 0,
    fadeOutMs: 20
  });
  expect(persisted.clips.find((clip) => clip.id === laterClip.id)?.timelineStartMs).toBe(4_000);
  expect(result.plan).toEqual(persisted);
  const manifest = JSON.parse(
    await readFile(path.join(tempDir, 'projects', project.slug, 'project.json'), 'utf8')
  ) as { updatedAt: string };
  expect(manifest.updatedAt).toBe(persisted.updatedAt);
  expect(
    await readFile(path.join(tempDir, 'library', 'projects', project.slug, asset.libraryPath), 'utf8')
  ).toBe('host audio data');
});
```

- [ ] **Step 2: 运行持久化测试并确认 RED**

Run: `npm test -- src/main/services/workspace.test.ts -t "splits an audio clip"`

Expected: FAIL because `workspace.ts` does not export `splitAudioClip`.

- [ ] **Step 3: 实现主进程切割服务**

在 `workspace.ts` 的共享类型导入中加入 `SplitAudioClipInput`、`SplitAudioClipResult`，并加入共享函数导入：

```ts
import { splitAudioClipInPlan } from '../../shared/audioEditPlan';
```

在 `rippleDeleteAudioClip` 后加入：

```ts
export async function splitAudioClip(
  settings: AppSettings,
  input: SplitAudioClipInput
): Promise<SplitAudioClipResult> {
  const projectRecord = await findProjectById(settings, input.projectId);
  if (!projectRecord) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const plan = await readAudioEditPlanForProject(projectRecord.projectRoot);
  const result = splitAudioClipInPlan({
    plan,
    clipId: input.clipId,
    timelineSplitMs: input.timelineSplitMs,
    rightClipId: createId('clp'),
    updatedAt: new Date().toISOString()
  });
  await writeAudioEditPlanForProject(projectRecord.projectRoot, result.plan);
  await touchProjectManifest(projectRecord.projectRoot, projectRecord.manifest, result.plan.updatedAt);
  return result;
}
```

- [ ] **Step 4: 运行主进程音频测试并确认 GREEN**

Run: `npm test -- src/main/services/workspace.test.ts -t "audio|clip|track|gap"`

Expected: the new split test and existing track, clip timing, gap and ripple delete tests all pass.

- [ ] **Step 5: 提交持久化切割服务**

```bash
git add src/main/services/workspace.ts src/main/services/workspace.test.ts
git commit -m "持久化播放头片段切割结果"
```

---

### Task 3: Electron API、浏览器 mock 与时间线交互

**Files:**
- Modify: `src/shared/api.ts:1-70`
- Modify: `src/main/index.ts:1-60,220-245`
- Modify: `src/preload/index.ts:1-55`
- Modify: `src/renderer/src/apiClient.ts:1-45,400-480`
- Modify: `src/renderer/src/App.tsx:1-75,918-935,1351-1435,1513-1566`
- Modify: `src/renderer/src/App.test.ts:1-18`
- Modify: `README.md:38-58`
- Modify: `docs/podcast-artist-local-file-contract.md:637`

**Interfaces:**
- Consumes: `splitAudioClip()` from Task 2；`splitAudioClipInPlan()`、`canSplitAudioClipAtTimelineMs()`、`MIN_SPLIT_CLIP_DURATION_MS` from Task 1；现有播放头、片段选择、`isAudioBusy` 和波纹删除交互。
- Produces: `PodcastArtistApi.splitAudioClip()`、`audio:splitClip` IPC、浏览器 mock 切割、按钮与 `S` 快捷键、右段默认选择。

- [ ] **Step 1: 写 API 与渲染接线的失败测试**

在 `src/renderer/src/App.test.ts` 的 describe 中加入：

```ts
it('wires playhead split through Electron, browser mock, and right-clip selection', async () => {
  const [appSource, apiClientSource, mainSource, preloadSource] = await Promise.all([
    readFile(new URL('./App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./apiClient.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../main/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../preload/index.ts', import.meta.url), 'utf8')
  ]);

  expect(mainSource).toContain("ipcMain.handle('audio:splitClip'");
  expect(preloadSource).toContain("ipcRenderer.invoke('audio:splitClip', input)");
  expect(apiClientSource).toContain('splitAudioClipInPlan({');
  expect(appSource).toContain("event.key.toLowerCase() === 's'");
  expect(appSource).toContain('podcastArtistApi.splitAudioClip({');
  expect(appSource).toContain('setSelectedClipId(result.rightClipId)');
  expect(appSource).toContain('在播放头切开');
});
```

- [ ] **Step 2: 运行渲染接线测试并确认 RED**

Run: `npm test -- src/renderer/src/App.test.ts`

Expected: the existing research-task control test passes and the new split wiring test fails on the first missing IPC assertion.

- [ ] **Step 3: 扩展共享 API、主进程 IPC 和 preload bridge**

在 `src/shared/api.ts` 的类型导入中加入 `SplitAudioClipInput`、`SplitAudioClipResult`，并在 `rippleDeleteAudioClip` 后加入：

```ts
splitAudioClip(input: SplitAudioClipInput): Promise<SplitAudioClipResult>;
```

在 `src/main/index.ts` 的共享类型导入中加入 `SplitAudioClipInput`，在 workspace 服务导入中加入 `splitAudioClip`，并在 `audio:rippleDeleteClip` handler 后加入：

```ts
ipcMain.handle('audio:splitClip', async (_event, input: SplitAudioClipInput) => {
  const { settings } = await ensureAppConfig();
  return splitAudioClip(settings, input);
});
```

在 `src/preload/index.ts` 的共享类型导入中加入 `SplitAudioClipInput`，并在 `rippleDeleteAudioClip` bridge 后加入：

```ts
splitAudioClip: (input: SplitAudioClipInput) => ipcRenderer.invoke('audio:splitClip', input),
```

- [ ] **Step 4: 让浏览器 mock 共用共享切割函数**

在 `src/renderer/src/apiClient.ts` 顶部加入：

```ts
import { splitAudioClipInPlan } from '../../shared/audioEditPlan';
```

把 `SplitAudioClipInput` 加入共享类型导入，并在 preview 状态变量后加入：

```ts
let previewSplitClipSequence = 0;
```

在 mock 的 `rippleDeleteAudioClip` 后加入：

```ts
async splitAudioClip(input: SplitAudioClipInput) {
  const plan = getPreviewEditPlan(input.projectId);
  previewSplitClipSequence += 1;
  const result = splitAudioClipInPlan({
    plan,
    clipId: input.clipId,
    timelineSplitMs: input.timelineSplitMs,
    rightClipId: `clp_preview_split_${previewSplitClipSequence}`,
    updatedAt: new Date().toISOString()
  });
  previewEditPlans.set(input.projectId, result.plan);
  return result;
},
```

- [ ] **Step 5: 接入 renderer 切割资格、按钮、快捷键和右段选择**

在 `App.tsx` 的共享类型导入前加入：

```ts
import {
  MIN_SPLIT_CLIP_DURATION_MS,
  canSplitAudioClipAtTimelineMs
} from '../../shared/audioEditPlan';
```

把现有最短片段常量改为：

```ts
const minClipDurationMs = MIN_SPLIT_CLIP_DURATION_MS;
```

在 `selectedClip` 派生状态后加入：

```ts
const canSplitSelectedClip = Boolean(
  selectedClip && canSplitAudioClipAtTimelineMs(selectedClip, playheadMs)
);
```

在 `handleTimelineKeyDown` 前加入：

```ts
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
  } catch (splitError) {
    setAudioError(toErrorMessage(splitError));
  } finally {
    setIsAudioBusy(false);
  }
}
```

把 `handleTimelineKeyDown` 改为：

```ts
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
```

在 `clip-trim-toolbar` 的时长 `<span>` 后加入：

```tsx
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
```

- [ ] **Step 6: 更新已实现能力和本地文件契约**

把 README 的音频 edit plan 能力改为：

```md
- 音频 edit plan：读取 `pln_rough_cut.json`，默认创建两条音轨；把音频素材加入非破坏性 clips，支持新增音轨、重命名音轨、静音音轨、删除空音轨、在播放头位置切割片段、基础 ripple delete、插入空白和 clip 源起止时间更新。
```

把 README 的剪辑视图能力改为：

```md
- 深色本地工作站 UI：以项目为一级入口；打开项目后进入沉浸式项目模式，一次只操作一个项目，左上角返回项目页；项目内包含素材库、文稿、剪辑三个模块，设置页独立；剪辑视图支持从项目素材库拖入音频到不同音轨，并提供添加音轨、重命名、静音、删除空音轨、时间线缩放、播放头试听、播放头切割和基础片段微调。
```

在 `docs/podcast-artist-local-file-contract.md` 第 16 节的波纹剪辑说明后加入：

```md
在播放头切割 clip 时，左段沿用原 ID，右段生成新的 `clp_` ID；两段继续引用同一个 `assetId`，只调整 `sourceStartMs`、`sourceEndMs` 和右段的 `timelineStartMs`。切割本身不移动其他 clip，只有随后执行波纹删除时，同轨后续片段才向前吸附。
```

- [ ] **Step 7: 运行接线测试、类型检查与完整自动化验证**

Run: `npm test -- src/renderer/src/App.test.ts && npm run typecheck && npm test && npm run build`

Expected: App source-contract tests pass；8 个 Vitest 文件、全部测试通过；TypeScript、main、preload 和 renderer production build 均退出 0。

- [ ] **Step 8: 运行浏览器 mock 纵向验收**

Run: `npx vite preview --outDir out/renderer --host 127.0.0.1 --port 4518 --strictPort`

使用名为 `podcast-split-verify` 的浏览器会话打开 `http://127.0.0.1:4518`，执行：

1. 创建项目并在素材库导入预览音频。
2. 进入剪辑，把同一素材连续加入“音轨 1”两次。
3. 选中第一个片段，把播放头放到片段中部，确认“在播放头切开”可用。
4. 点击切割，确认出现两个连续片段，右段处于选中状态，播放头没有跳回开头。
5. 按 Delete，确认右段消失，原先的第二个片段向前吸附到左段末尾。
6. 把播放头移到距离片段边界不足 250ms 的位置，确认切割按钮不可用。
7. 切换到素材库再返回剪辑，确认当前预览会话内的 edit plan 仍保留切割与删除结果，控制台没有未处理错误。真实文件重读持久化由 Task 2 自动化测试覆盖。

Expected: “切开 → 默认选中右段 → Delete 波纹删除”完整可见；切割前后原素材仍可试听，切割操作本身不移动既有后续片段。

- [ ] **Step 9: 检查范围并提交纵向交互**

Run: `git status --short && git diff --check`

Expected: 只包含本计划列出的源码、测试、README、本地文件契约和计划文件；预先存在的 `.claude/` 仍为未跟踪且未修改；`git diff --check` 退出 0。

```bash
git add src/shared/api.ts src/main/index.ts src/preload/index.ts src/renderer/src/apiClient.ts src/renderer/src/App.tsx src/renderer/src/App.test.ts README.md docs/podcast-artist-local-file-contract.md docs/superpowers/plans/2026-07-13-playhead-split-ripple-delete.md
git commit -m "接通播放头切割与波纹删除交互"
```

## Self-Review

- Spec coverage: Task 1 覆盖共享边界、时间换算、属性继承、无副作用和错误输入；Task 2 覆盖真实 ID、原子 plan 持久化、manifest 更新时间及素材不变；Task 3 覆盖 Electron、preload、浏览器 mock、按钮、快捷键、暂停、右段选择、现有波纹删除、文档和浏览器验收。
- Deliberate exclusions: 任意范围框选、undo/redo、Web Audio、缩放重构、乐观更新、音频编辑队列和跨进程锁均未进入本计划，也不在 README 中宣称已实现。
- Placeholder scan: 没有占位词、未展开的步骤引用或未指定的错误处理；每个测试、实现、命令和提交均有具体内容与预期结果。
- Type consistency: 公共方法始终使用 `SplitAudioClipInput` / `SplitAudioClipResult`；纯函数始终使用 `SplitAudioClipInPlanInput`；renderer、preload、main 和 browser mock 的方法名统一为 `splitAudioClip`，IPC 名统一为 `audio:splitClip`。
