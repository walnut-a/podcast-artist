# Podcast Artist

Podcast Artist 是一个本地优先的播客创作工具构想，面向录音前文稿准备、资料处理、AI/agent 辅助研究，以及录音后的轻量音频剪辑。

当前仓库处于早期开发阶段。仓库内已有 PRD、技术选型、本地文件契约、界面草图，以及 Electron + React + TypeScript 的可运行原型骨架。

## 分支现状

- 默认分支：`main`。
- 当前分支：`main`。
- 推荐代码阅读基准分支：`main`。
- 原因：`main` 是远端 HEAD、当前分支，也是当前唯一观察到的本地和远端分支。
- 开发基准分支：未确认。当前仓库尚无业务代码分支，不能仅凭分支名推断开发流程。

## 目录结构

- `README.md`：项目级入口，只保留仓库状态、文档入口和接手指南。
- `docs/README.md`：文档总入口。
- `docs/doc/`：稳定说明类文档入口，包含仓库分析。
- `docs/plan/`：计划类文档入口，初始化阶段不默认创建具体计划。
- `docs/spec/`：规范类文档入口，初始化阶段不默认制定具体规范。
- `docs/mockups/`：静态界面草图和视觉探索图片。
- `src/main/`：Electron main process、本地文件服务、依赖诊断和 IPC handler。
- `src/preload/`：受控 renderer bridge。
- `src/renderer/`：React renderer UI。
- `src/shared/`：main/preload/renderer 共用类型和 API contract。
- `package.json`：开发、构建和测试脚本。
- `docs/podcast-artist-concept.md`：创作工具构想。
- `docs/podcast-artist-prd-draft.md`：PRD 草案。
- `docs/podcast-artist-tech-selection.md`：技术选型与调研。
- `docs/podcast-artist-local-file-contract.md`：本地项目文件契约。
- `docs/podcast-artist-dark-ui-style-exploration.md`：深色界面风格探索。

## 当前能力

当前已实现的运行时能力：

- Electron app 启动，renderer 通过 preload 调用受控 IPC。
- 应用级配置写入 Electron `userData`：`settings.json`、`provider-profiles.json`、`dependency-status.json`。
- workspace 初始化：创建 `workspace.json`、`library/shared/assets.json` 和项目目录入口。
- 项目创建：生成 `project.json`、`episode.md`、项目素材索引、`write-journal` 目录和空 `edit plan`。
- 音频素材导入：通过 Electron 文件选择复制音频到项目素材库，并写入 `LibraryAsset` 到 `assets.json`。
- 文稿写入队列：创建 Markdown append intent，串行应用 pending intent，写入前生成文档版本快照，base hash 不匹配时进入 failed。
- 资料任务账本：创建研究任务目录，保存 `task.json`、`context.md`、`result.md`，并支持把任务结果通过 write journal 采纳进 `episode.md`。
- 真实资料任务调用：通过 OpenAI-compatible `/chat/completions` 发起非流式请求，凭证支持 `none` 或环境变量；任务先进入后台账本并记录 `running → completed|failed`，完成结果只进入候选审阅区，用户明确点击采纳后才通过 write intent 写入 `episode.md`。
- 项目素材库读取：按项目读取 `assets.json`，供文稿、转写和剪辑模块通过 `assetId` 引用。
- 音频 edit plan：读取 `pln_rough_cut.json`，默认创建两条音轨；把音频素材加入非破坏性 clips，支持新增音轨、重命名音轨、静音音轨、删除空音轨、基础 ripple delete、插入空白和 clip 源起止时间更新。
- 音频素材分析：调用 ffprobe 生成 `.podcast-artist/audio-cache/analysis/<assetId>.json`，并把时长、采样率、声道数等元信息回写到素材索引。
- 音频处理缓存：调用 FFmpeg 生成项目内 proxy WAV 和 peaks JSON，源文件和素材库副本始终不被修改。
- 基础 WaveSurfer 波形预览：renderer 通过受控 IPC 读取当前项目素材的 proxy URL 和 peaks，只有已有 peaks 时才渲染波形，避免长音频整段浏览器解码。
- 导出渲染：根据 `pln_rough_cut.json` 和素材库副本构造 FFmpeg 命令，按时间线起点混合未静音音轨，生成 WAV 导出文件，并写入 `.podcast-artist/renders/` render job。
- 设置页依赖诊断：检测 FFmpeg、ffprobe、whisper.cpp binary 和模型文件状态。
- Provider profiles 管理：明文保存 base URL、模型名和凭证来源类型；不保存 API key，不使用系统钥匙串。
- 深色本地工作站 UI：以项目为一级入口；打开项目后进入沉浸式项目模式，一次只操作一个项目，左上角返回项目页；项目内包含素材库、文稿、剪辑三个模块，设置页独立；剪辑视图支持从项目素材库拖入音频到不同音轨，并提供添加音轨、重命名、静音、删除空音轨、时间线缩放、播放头试听和基础片段微调。

仍处于规划或未实现状态的能力包括真实转写、文本/转写驱动的片段操作、分轨导出、AI 结果 streaming、`runtime_prompt` 凭证输入、provider 健康检查、稳定段落索引、资料任务 retry/cancel 和 SQLite 索引层。WaveSurfer 当前只作为波形和播放预览，不把自由拖拽选区作为主要剪辑输入。

## 对外入口

- 文档入口：`docs/README.md`。
- 仓库分析：`docs/doc/repository-analysis.md`。
- 静态界面草图：`docs/mockups/podcast-artist-dark-ui-sketches.html`。
- 应用入口：`src/main/index.ts`、`src/preload/index.ts`、`src/renderer/index.html`。

## 开发命令

- `npm run dev`：启动 Electron + renderer dev server。
- `npm run build`：类型检查并构建 main/preload/renderer。
- `npm run typecheck`：运行 TypeScript 类型检查。
- `npm test`：运行 Vitest 单元测试。

## 项目原则

- 本地优先，不默认依赖官方云服务。
- 数据结构透明可解释，方便用户手动管理和恢复。
- 文稿、素材库、转写、剪辑、任务账本和导出模块解耦。
- 外部服务和本地工具链由用户或开发者自行配置。

## 文档更新规则

- 小范围文档变化优先更新对应说明类文档。
- 项目定位、主要入口、核心能力、代码阅读基准分支发生变化时，同步更新根目录 `README.md`。
- 新增、删除或移动文档时，同步更新对应层级 README 的索引。
- 仓库内路径使用相对路径，不写本机绝对路径或临时路径。
- 本仓库保留 `docs/plan/` 作为计划类入口，但不默认由 Agent 创建具体计划文档。
- 本仓库保留 `docs/spec/` 作为规范类入口，但不默认由 Agent 制定项目规范。

## 后续 Agent 接手指南

1. 先读本文件，确认仓库状态和代码阅读基准分支。
2. 再读 `docs/README.md`，按需进入说明类、计划类或规范类文档。
3. 需要理解仓库结构时，读 `docs/doc/repository-analysis.md`。
4. 当前推荐代码阅读基准分支是 `main`。
5. 不确定的信息标注“未确认”，不要把设计规划写成已实现能力。
