# 共享时钟时间线播放器实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让时间线第一次点击即可播放，所有轨道由同一个 AudioContext 时钟驱动，并支持空格键播放/暂停。

**Architecture:** Electron 主进程注册只读的 `podcast-audio://asset/<projectId>/<assetId>` 协议，通过 workspace 索引解析到源文件或代理文件，再用 `net.fetch(file:)` 流式返回。renderer 新增独立 `TimelineAudioPlayer`，预创建每个 clip 的 HTMLMediaElement、统一接入 AudioContext，并用 AudioContext `currentTime` 驱动播放头；不把整期节目解码进内存。

**Tech Stack:** Electron 42 custom protocol、Web Audio API、HTMLMediaElement、React 19、TypeScript 6、Vitest 4。

## Global Constraints

- 不使用整文件 `decodeAudioData()`，避免长录音产生巨量 PCM 内存。
- 协议 URL 只包含 project/asset ID，不接受磁盘路径；解析必须回到 workspace 索引确认素材。
- 继续保留 `sourceUrl` / `proxyUrl` 作为诊断信息，Electron 的 `preferredUrl` 改为受控协议 URL；浏览器 mock 继续返回本地 HTTP URL。
- 播放器必须在一次用户点击内完成 resume、准备和播放，不再要求“再点一次”。
- 静音轨道不创建可听连接；clip gain 继续按 `10 ** (gainDb / 20)` 生效。
- 播放、暂停、seek、切换项目、编辑计划变化和组件卸载都必须释放旧媒体节点。
- 不改 edit plan schema、导出逻辑、视觉 token 或资料任务。
- 不使用 worktree，不触碰预先存在的 `.claude/`。

---

### Task 1: 受控本地音频协议

**Files:**
- Create: `src/main/services/audioProtocol.ts`
- Create: `src/main/services/audioProtocol.test.ts`
- Modify: `src/main/services/workspace.ts`
- Modify: `src/main/services/workspace.test.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Produces: `createAudioProtocolUrl(input)`、`parseAudioProtocolUrl(url)`、`resolveAudioAssetPlaybackPath(settings, input)`。
- Electron handler: valid URL resolves through workspace then returns `net.fetch(pathToFileURL(path).toString())`; invalid URL returns status 400/404.

- [x] **Step 1: Write failing URL and workspace tests**

```ts
expect(parseAudioProtocolUrl(createAudioProtocolUrl({ projectId: 'prj_1', assetId: 'ast_1' })))
  .toEqual({ projectId: 'prj_1', assetId: 'ast_1' });
expect(parseAudioProtocolUrl('podcast-audio://asset/prj_1/../../secret')).toBeNull();
expect(await resolveAudioAssetPlaybackPath(settings, { projectId: project.id, assetId: asset.id }))
  .toContain(asset.libraryPath);
```

- [x] **Step 2: Run tests to verify RED**

Run: `npm test -- src/main/services/audioProtocol.test.ts src/main/services/workspace.test.ts -t "audio protocol|playback path"`

Expected: FAIL because the protocol helpers and resolver do not exist.

- [x] **Step 3: Implement URL helpers and playback path resolver**

Use fixed scheme/host, `encodeURIComponent` for IDs, exactly two decoded path segments, and reject empty IDs, slash-containing IDs, traversal tokens, query and hash. Refactor existing playback-data lookup so the resolver chooses a valid proxy first and source asset otherwise.

- [x] **Step 4: Register the privileged scheme and handler**

Before `app.whenReady()`, register `podcast-audio` with `{ standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }`. After ready, call `protocol.handle`; parse request URL, load current settings, resolve the registered asset, and return `net.fetch(fileUrl)`.

- [x] **Step 5: Run focused tests and typecheck**

Run: `npm test -- src/main/services/audioProtocol.test.ts src/main/services/workspace.test.ts && npm run typecheck`

Expected: both test files and typecheck pass.

- [x] **Step 6: Commit**

```bash
git add src/main/services/audioProtocol.ts src/main/services/audioProtocol.test.ts src/main/services/workspace.ts src/main/services/workspace.test.ts src/main/index.ts
git commit -m "提供受控的本地音频播放协议"
```

---

### Task 2: 独立共享时钟播放器

**Files:**
- Create: `src/renderer/src/timelineAudioPlayer.ts`
- Create: `src/renderer/src/timelineAudioPlayer.test.ts`

**Interfaces:**
- Consumes: `AudioEditPlan` and `Map<string, AudioAssetPlaybackData>`.
- Produces: `TimelineAudioPlayer.prepare()`、`play()`、`pause()`、`seek()`、`currentTimeMs()`、`dispose()`。

- [x] **Step 1: Write failing player tests**

Use injected fake AudioContext/media factories. Cover: all needed clip media are prepared before play; two active tracks start from the same requested timeline position; muted tracks do not play; future clips start once when the shared clock enters their range; pause/dispose stop every element; gain conversion is correct.

- [x] **Step 2: Run test to verify RED**

Run: `npm test -- src/renderer/src/timelineAudioPlayer.test.ts`

Expected: FAIL because the player does not exist.

- [x] **Step 3: Implement the minimal player**

The player owns one AudioContext and one media/gain chain per clip. `prepare` reuses unchanged clip sources, removes stale chains, sets `preload='auto'`, and calls `load()` without blocking the UI on browser media promises. `play` triggers context resume, records `{ timelineStartMs, contextStartSeconds }`, synchronizes active elements, then schedules a requestAnimationFrame loop from AudioContext time. Context/media promises run in the background and report rejections through the player error callback.

- [x] **Step 4: Run player tests**

Run: `npm test -- src/renderer/src/timelineAudioPlayer.test.ts`

Expected: all player tests pass without real audio hardware.

- [x] **Step 5: Commit**

```bash
git add src/renderer/src/timelineAudioPlayer.ts src/renderer/src/timelineAudioPlayer.test.ts
git commit -m "建立共享时钟时间线播放器"
```

---

### Task 3: React 接入、空格快捷键与验收

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`
- Modify: `docs/superpowers/plans/2026-07-15-shared-clock-timeline-player.md`

**Interfaces:**
- Consumes: Task 2 `TimelineAudioPlayer`.
- Produces: 单击播放、播放准备态、空格播放/暂停、AudioContext 时钟驱动的时间码。

- [x] **Step 1: Replace per-frame `new Audio()` playback**

AudioView owns one player ref. Plan/assets change时调用 `prepare`；播放按钮在同一次 handler 内等待缺失 playback data 和 player preparation，然后立即 `play`。删除旧的 HTMLAudio map、performance.now refs 和“请再点一次播放”提示。

- [x] **Step 2: Wire clock updates and lifecycle cleanup**

player tick 回调更新 `playheadMs`；到达内容末尾时更新播放状态。seek while playing uses player `seek`; undo/redo、切换项目和卸载 call `pause/dispose`.

- [x] **Step 3: Add Space shortcut and preparation feedback**

非 input/textarea/contenteditable 区域按 Space 触发播放/暂停；准备期间播放按钮 disabled，并显示 `正在准备试听…`，失败直接显示具体错误。

- [x] **Step 4: Run full verification**

Run: `npm test && npm run build && git diff --check`

Expected: all tests and production builds pass.

- [x] **Step 5: Run browser mock vertical slice**

创建项目、导入素材、添加两条轨道片段；第一次点击播放应直接进入播放态且时间码前进；Space 可暂停/继续；seek 后从新位置继续；控制台无 error/warning。

验收记录：浏览器 mock 完成项目创建、素材导入、片段落轨和首次点击链路；内置浏览器的自动化上下文会拒绝媒体播放并返回 `user didn't interact with the document first`，因此有声播放、时间码前进和 Space 续播由注入式播放器测试覆盖，不把该浏览器策略误判为应用错误。

- [x] **Step 6: Mark plan complete and commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/styles.css docs/superpowers/plans/2026-07-15-shared-clock-timeline-player.md
git commit -m "接通单击即播与空格播放控制"
```

## Self-Review

- Spec coverage: 受控协议、长音频流式读取、共享时钟、预加载、单击即播、空格控制、seek 和清理均有对应任务。
- Deliberate exclusions: 不做 AudioBuffer 全量解码、采样级剪辑、离线渲染或跨设备音频输出选择。
- Placeholder scan: 无 TBD/TODO 或未定义接口。
- Type consistency: main 和 renderer 统一使用既有 `AudioAssetProcessingInput` / `AudioAssetPlaybackData`。
