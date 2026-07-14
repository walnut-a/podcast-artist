# 音频剪辑撤销与重做实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为剪辑时间线提供真正写回本地 edit plan 的撤销/重做，并支持按钮与 macOS/Windows 键盘快捷键。

**Architecture:** 主进程新增带 `expectedUpdatedAt` 乐观锁的完整 edit plan 替换接口，拒绝覆盖外部更新或跨项目 plan。renderer 用独立纯函数维护最多 50 步历史；每次已有编辑 API 成功后记录快照，撤销/重做时通过替换接口持久化目标快照，再用服务端返回的新时间戳同步当前历史节点。

**Tech Stack:** Electron 42、React 19、TypeScript 6、Vitest 4、本地原子 JSON 写入。

## Global Constraints

- 不修改 `audioEditPlan.v1` 文件 schema。
- 历史只存在于当前 renderer 会话，切换项目或重新载入时重置，不跨应用重启恢复。
- 所有恢复操作必须先通过主进程持久化成功，再更新可见时间线；失败时保留当前历史与界面。
- 最多保留 50 个过去快照，新编辑会清空 redo 栈。
- 不修改播放引擎、时间线缩放或现有资料任务流程。
- 不使用 worktree，不触碰预先存在的 `.claude/`。

---

### Task 1: 带版本校验的 edit plan 替换接口

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/api.ts`
- Modify: `src/main/services/workspace.ts`
- Modify: `src/main/services/workspace.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/apiClient.ts`

**Interfaces:**
- Produces: `ReplaceAudioEditPlanInput` and `replaceAudioEditPlan(input): Promise<AudioEditPlan>`.
- Validation: `projectId`、`schemaVersion`、plan id 必须匹配；`expectedUpdatedAt` 必须等于磁盘当前值；所有 clip 必须引用存在的 track。

- [x] **Step 1: Write failing workspace tests**

新增测试：合法快照可恢复并获得新的 `updatedAt`；过期 `expectedUpdatedAt` 抛出 `changed`；跨项目 plan 与悬空 track 引用被拒绝。

- [x] **Step 2: Run test to verify RED**

Run: `npm test -- src/main/services/workspace.test.ts -t "replaces an audio edit plan"`

Expected: FAIL because `replaceAudioEditPlan` does not exist.

- [x] **Step 3: Implement minimal replacement operation and bridge**

```ts
export interface ReplaceAudioEditPlanInput {
  projectId: string;
  expectedUpdatedAt: string;
  plan: AudioEditPlan;
}
```

主进程读取当前 plan，执行身份、版本、track 引用校验，生成严格晚于当前值的 `updatedAt`，再沿用 `writeAudioEditPlanForProject()` 与 `touchProjectManifest()` 原子写入。把接口接到 shared API、IPC、preload 和浏览器 mock；mock 同样执行版本校验。

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- src/main/services/workspace.test.ts -t "replaces an audio edit plan" && npm run typecheck`

Expected: focused tests and typecheck pass.

- [x] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/api.ts src/main/services/workspace.ts src/main/services/workspace.test.ts src/main/index.ts src/preload/index.ts src/renderer/src/apiClient.ts
git commit -m "增加剪辑计划安全恢复接口"
```

---

### Task 2: 可测试的 renderer 历史状态机

**Files:**
- Create: `src/renderer/src/audioEditHistory.ts`
- Create: `src/renderer/src/audioEditHistory.test.ts`

**Interfaces:**
- Produces: `createAudioEditHistory()`、`recordAudioEditPlanChange()`、`prepareAudioEditUndo()`、`prepareAudioEditRedo()`、`syncRestoredAudioEditPlan()`。

- [x] **Step 1: Write failing state-machine tests**

覆盖：记录编辑后可以 undo；undo 后可以 redo；新编辑清空 redo；超过 50 步丢弃最旧快照；同步服务端新 `updatedAt` 不破坏 redo。

- [x] **Step 2: Run test to verify RED**

Run: `npm test -- src/renderer/src/audioEditHistory.test.ts`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement minimal pure state machine**

```ts
export interface AudioEditHistory {
  projectId: string;
  past: AudioEditPlan[];
  present: AudioEditPlan;
  future: AudioEditPlan[];
}
```

所有函数返回新对象，不修改输入；`prepareAudioEditUndo/Redo` 在不可移动时返回 `null`；历史上限固定为 50。

- [x] **Step 4: Run history tests**

Run: `npm test -- src/renderer/src/audioEditHistory.test.ts`

Expected: all history tests pass.

- [x] **Step 5: Commit**

```bash
git add src/renderer/src/audioEditHistory.ts src/renderer/src/audioEditHistory.test.ts
git commit -m "建立音频剪辑历史状态机"
```

---

### Task 3: 时间线按钮、快捷键与完整验证

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`
- Modify: `docs/superpowers/plans/2026-07-14-audio-edit-undo-redo.md`

**Interfaces:**
- Consumes: Task 1 replacement API and Task 2 history functions.
- Produces: 撤销/重做按钮，`⌘/Ctrl+Z` 与 `⌘/Ctrl+Shift+Z`，所有现有时间线变更进入历史。

- [x] **Step 1: Integrate history recording**

项目载入时创建历史；新增/删除/重命名/静音轨道、添加/切分/修剪/删除 clip、插入空白成功后调用统一的 `applyAudioEditPlanChange(nextPlan)`；切换项目重置历史。

- [x] **Step 2: Add persistent undo and redo handlers**

恢复时停止播放，以当前 `present.updatedAt` 作为 `expectedUpdatedAt` 调用 `replaceAudioEditPlan()`；成功后同步服务端返回 plan，失败时保持原状态并显示错误。

- [x] **Step 3: Add controls and shortcuts**

工具栏加入 `撤销`、`重做` 图标按钮；在非 input/textarea/contenteditable 区域处理 `metaKey || ctrlKey` 的 `z`，`shiftKey` 表示 redo。无历史或 busy 时按钮禁用。

- [x] **Step 4: Run full verification**

Run: `npm test && npm run build && git diff --check`

Expected: all tests and production builds pass; no whitespace errors.

- [x] **Step 5: Run browser mock vertical slice**

创建项目、导入素材、把 clip 放入轨道、切分、撤销、重做、删除、撤销；确认按钮状态、clip 数量和控制台无 error/warning。

- [x] **Step 6: Mark plan complete and commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/styles.css docs/superpowers/plans/2026-07-14-audio-edit-undo-redo.md
git commit -m "接通时间线撤销与重做交互"
```

## Self-Review

- Spec coverage: 覆盖磁盘持久化、并发保护、50 步历史、全部现有变更入口、按钮、快捷键与浏览器验收。
- Deliberate exclusions: 不做跨重启历史、命令日志、多人协作合并或音频播放引擎改造。
- Placeholder scan: 无 TBD/TODO 或未定义接口。
- Type consistency: shared、主进程、preload、renderer mock 统一使用 `ReplaceAudioEditPlanInput`。
