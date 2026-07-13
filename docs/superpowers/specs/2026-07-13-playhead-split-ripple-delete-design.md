# 播放头切割与波纹删除设计

## 目标

让用户可以在当前选中片段的播放头位置切开音频，再选中切开的任一片段执行现有波纹删除，从而完成“听到问题 → 切开 → 删除 → 后续内容自动吸附”的最低可用剪辑闭环。

本切片只补片段切割及其与现有删除交互的衔接，不引入任意时间范围拖拽框选、undo/redo、Web Audio 播放引擎或时间线缩放重构。

## 当前基础

现有剪辑界面已经具备：

- 播放头定位与时间尺点击跳转；
- 片段选中状态；
- Delete、Backspace 和删除按钮触发的整段波纹删除；
- 非破坏性 `AudioEditPlan` 持久化；
- Electron IPC 与浏览器 mock 两套 API 入口。

当前缺口是：无法把一个片段在播放头位置拆成两个连续、引用同一素材的片段。用户因此不能先划出错误片段，再复用现有波纹删除将其移除。

## 交互设计

1. 用户先选中一个时间线片段。
2. 用户通过播放或点击时间尺，把播放头移动到该片段内部。
3. 当播放头距离片段左右边界均不少于 250ms 时，“在播放头切开”按钮可用。
4. 用户点击按钮或在时间线获得焦点时按 `S`。
5. 应用先暂停当前播放，再以操作触发瞬间的整数毫秒播放头位置执行切割。
6. 切割成功后，界面保持原时间线位置，并默认选中新生成的右侧片段。
7. 用户可以直接按 Delete 或 Backspace，也可以点击片段删除按钮，执行现有波纹删除。

如果播放头不在选中片段内部、距离任一边界不足 250ms、片段不存在或操作正在进行，切割入口保持禁用。主进程仍会重复验证输入，避免绕过界面产生零长度或过短片段。

## 数据规则

切割输入包含：

- `projectId`；
- `clipId`；
- `timelineSplitMs`，即四舍五入后的播放头时间。

对于原片段：

```text
timelineOffsetMs = timelineSplitMs - clip.timelineStartMs
sourceSplitMs = clip.sourceStartMs + timelineOffsetMs
```

切割后：

- 左段沿用原片段 ID、轨道、素材、增益和淡入参数；
- 左段的 `sourceEndMs` 改为 `sourceSplitMs`，`fadeOutMs` 改为 `0`；
- 右段生成新的 `clp_` ID，沿用原片段的轨道、素材和增益；
- 右段的 `sourceStartMs` 为 `sourceSplitMs`，`sourceEndMs` 保持原值；
- 右段的 `timelineStartMs` 为 `timelineSplitMs`，`fadeInMs` 改为 `0`，`fadeOutMs` 保持原值；
- 其他片段的时间与属性不变；
- `AudioEditPlan.schemaVersion` 不变，只更新 `updatedAt`。

切口内部不增加淡入淡出，避免原本连续的声音在切开但尚未删除时出现音量凹陷。原片段最外侧的淡入和淡出语义保持不变。

## 架构与接口

新增共享纯函数 `splitAudioClipInPlan`，负责验证和 edit plan 变换。Electron 主进程和浏览器 mock 必须共用该函数，不能各自复制一份切割规则。

公共 API 固定为：

```ts
interface SplitAudioClipInput {
  projectId: string;
  clipId: string;
  timelineSplitMs: number;
}

interface SplitAudioClipResult {
  plan: AudioEditPlan;
  leftClipId: string;
  rightClipId: string;
}
```

共享模块同时导出 `MIN_SPLIT_CLIP_DURATION_MS = 250`，渲染层与纯函数使用同一边界常量。纯函数接口固定为：

```ts
interface SplitAudioClipInPlanInput {
  plan: AudioEditPlan;
  clipId: string;
  timelineSplitMs: number;
  rightClipId: string;
  updatedAt: string;
}

function splitAudioClipInPlan(input: SplitAudioClipInPlanInput): SplitAudioClipResult;
```

共享纯函数不访问文件系统，也不自行生成时间或 ID。调用方传入新片段 ID 和 `updatedAt`，从而让真实主进程使用项目 ID 生成器，让浏览器 mock 使用自己的确定性预览 ID。

主进程服务负责：

1. 定位项目并读取当前 edit plan；
2. 生成右侧片段 ID 和更新时间；
3. 调用共享纯函数；
4. 用现有原子 JSON 写入方式一次持久化完整 plan；
5. 更新项目 manifest；
6. 返回 `SplitAudioClipResult`。

IPC、preload 和 `PodcastArtistApi` 新增一个 `splitAudioClip` 方法。渲染层只提交用户意图并使用返回的 `rightClipId` 更新选中状态，不在前端自行拼装片段。

## 一致性与失败处理

以下情况必须拒绝操作，并保持原 edit plan 不变：

- 项目或片段不存在；
- `timelineSplitMs` 不是有限数字；
- 播放头不在目标片段内；
- 切割后任一片段短于 250ms。

切割只产生一次 plan 写入，不使用“先修剪左段、再新增右段”的两步组合，因此第二步失败时不会留下半份结果。界面在请求期间沿用现有 `isAudioBusy` 防重入，失败信息进入现有 `audioError` 区域。

本切片不新增音频编辑队列或跨进程锁。当前渲染层同一时间只允许一个音频写操作；将来若允许多个窗口或外部 API 并发编辑，再统一为所有 edit plan 操作补项目级串行化。

## 测试与验收

自动化测试覆盖：

- 正确把时间线切割位置换算为素材源时间；
- 左右片段的 ID、源区间、时间线位置、增益和淡入淡出符合规则；
- 同轨与其他轨道的后续片段均不因切割移动；
- 缺失片段、非有限时间、片段外位置和不足 250ms 的边界被拒绝；
- 主进程持久化后重新读取可得到相同结果；
- Electron API 和浏览器 mock 都调用共享切割逻辑；
- 渲染层使用返回的右侧片段 ID 更新选择，并保留现有 Delete 波纹删除行为。

手动浏览器验收流程：

1. 创建或打开含音频片段的项目；
2. 选中片段并把播放头放到片段中部；
3. 点击“在播放头切开”，确认视觉上出现两个连续片段且右段被选中；
4. 按 Delete，确认右段消失、同轨后续片段向前吸附；
5. 把播放头放到距离片段边界不足 250ms 的位置，确认切割入口不可用；
6. 刷新页面或重新读取项目，确认切割和删除结果仍然存在。

完成标准是：用户不需要编辑毫秒字段，就能通过播放头、一次切割和一次删除去掉一段音频；原始素材文件不发生变化，导出继续只读取更新后的 edit plan。
