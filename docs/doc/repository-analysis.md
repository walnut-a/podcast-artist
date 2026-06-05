# 仓库分析

## 一句话结论

当前仓库是 Podcast Artist 的早期开发仓库，已有产品/技术设计文档和 Electron + React + TypeScript 的可运行原型骨架。

## 分支与远端

- 当前分支：`main`。
- 默认分支：`main`，依据是 `git ls-remote --symref origin HEAD` 返回 `refs/heads/main`。
- 推荐代码阅读基准分支：`main`。
- 推荐原因：`main` 是远端 HEAD、当前分支，也是当前唯一观察到的本地和远端分支。
- 开发基准分支：未确认。仓库目前只有首个文档提交，尚无业务代码分支可供判断。

远端信息：

- 远端名称：`origin`。
- fetch/push 地址：`https://github.com/walnut-a/podcast-artist.git`。
- 已观察远端分支：`origin/main`。

## 工作区状态

本次开发开始前已有上一轮文档初始化改动：`README.md`、`docs/README.md`、`docs/doc/`、`docs/plan/`、`docs/spec/`。这些改动未被回滚，后续开发在其基础上继续。

最近提交：

- `8dfcb4d Initial product design docs`：首次提交，包含 README、PRD、技术选型、本地文件契约、深色 UI 探索和 mockup。

## 技术栈、构建和测试

当前仓库实际内容：

- Markdown 文档。
- 静态 HTML/CSS mockup。
- PNG 图片资产。
- Electron main/preload/renderer 代码。
- React + TypeScript renderer UI。
- 本地文件服务和依赖诊断服务。
- Vitest 单元测试。

已采用的技术栈：

- Electron。
- React + TypeScript + Vite + electron-vite。
- Vitest。

设计文档中规划或推荐、但尚未完整实现的技术方向：

- Markdown + Tiptap/ProseMirror。
- SQLite 索引层。
- FFmpeg / ffprobe。
- whisper.cpp 或在线转写 provider。
- 本地任务队列与 provider 抽象。

构建方式：

- `npm run dev`
- `npm run build`
- `npm run typecheck`

测试方式：

- `npm test`

## 当前代码结构

仓库主要文件和目录：

- `README.md`：项目级入口。
- `.gitignore`：基础忽略规则。
- `package.json`：开发、构建和测试脚本。
- `package-lock.json`：npm 依赖锁定。
- `electron.vite.config.ts`：Electron Vite 构建配置。
- `tsconfig.json`：TypeScript 配置。
- `vitest.config.ts`：Vitest 配置。
- `src/main/`：Electron main process、本地文件服务、依赖诊断和 IPC handler。
- `src/preload/`：renderer bridge。
- `src/renderer/`：React UI。
- `src/shared/`：共享类型和 API contract。
- `docs/README.md`：文档总入口。
- `docs/doc/`：稳定说明类文档。
- `docs/plan/`：计划类文档入口。
- `docs/spec/`：规范类文档入口。
- `docs/mockups/`：静态界面草图和视觉图片。
- `docs/podcast-artist-concept.md`：创作工具构想。
- `docs/podcast-artist-prd-draft.md`：PRD 草案。
- `docs/podcast-artist-tech-selection.md`：技术选型与调研。
- `docs/podcast-artist-local-file-contract.md`：本地项目文件契约。
- `docs/podcast-artist-dark-ui-style-exploration.md`：深色界面风格探索。

## 核心模块说明

已实现的模块：

- 应用配置模块：在 Electron `userData` 下维护 `settings.json`、`provider-profiles.json`、`dependency-status.json`。
- workspace 模块：创建 `workspace.json`、library/shared 素材索引和 projects 目录。
- 项目创建模块：生成项目 manifest、Markdown 文稿、素材索引、write-journal 目录和空 edit plan。
- 素材导入模块：通过 main process 选择音频文件、复制到项目素材库，并更新 `LibraryAsset` 索引。
- 音频素材分析模块：调用 ffprobe 读取时长、采样率、声道数、编码和码率，写入 `.podcast-artist/audio-cache/analysis/`，并回写素材索引 metadata。
- 音频处理缓存模块：调用 FFmpeg 生成 project-local proxy WAV 和 peaks JSON，源文件与素材库副本不被修改。
- 音频播放数据模块：为 renderer 提供当前项目素材库副本、proxy URL、peaks 和时长，避免 renderer 直接猜测本地文件路径。
- 文稿写入队列：生成 Markdown append intent，串行应用 pending intent，写入前保存完整旧版快照，hash 不匹配时进入 failed。
- 任务账本模块：生成研究任务目录，保存 `task.json`、`context.md`、`result.md`，支持把任务结果采纳到正式 Markdown。
- 项目素材库读取模块：读取当前项目 `assets.json`，供文稿、转写和剪辑模块引用 `assetId`。
- 音频 edit plan 模块：读取和更新 `pln_rough_cut.json`，支持把音频素材加入 clips、基础 ripple delete 和 clip 源起止时间更新。
- 导出模块：根据素材库副本和 edit plan 构造 FFmpeg 参数，输出 WAV，并写入 `.podcast-artist/renders/` render job。
- 依赖诊断模块：检测 FFmpeg、ffprobe、whisper.cpp binary 和模型文件状态。
- Provider 配置模块：编辑并保存 `provider-profiles.json` 中的 base URL、模型名和凭证来源类型，不保存密钥明文，也不使用系统钥匙串。
- Renderer app shell：以项目为一级入口；打开项目后进入沉浸式项目模式，一次只操作一个项目，左上角返回项目页；项目内包含素材库、文稿、剪辑三个模块，设置页独立。

仍来自设计文档、尚未完整实现的模块：

- 文稿模块：段落锚点、资料引用语法解析和完整 Markdown 编辑器。
- 素材库模块：本地素材副本、`LibraryAsset`、跨项目引用预留。
- 任务模块：真实 AI/agent provider 调用、并行任务运行器和任务重试。
- 写入队列：崩溃恢复扫描、外部 agent intent 审核和冲突合并 UI。
- 转写模块：provider 抽象、transcript 数据结构、文本与音频时间映射。
- 音频剪辑模块：基础 WaveSurfer 波形预览和 clip 时间码编辑已实现；完整可视化时间线、文本/转写驱动的片段操作和更完整的多轨编辑尚未实现。
- 导出模块：多轨混音细节、进度展示、取消导出和导出参数 UI。
- 设置与依赖诊断：provider profile 编辑已实现基础版，真实 provider 健康检查尚未实现。

## 已实现能力和对外入口

已观察到的仓库能力：

- 产品和技术设计文档。
- 本地文件契约文档。
- 静态深色界面 mockup。
- 可运行 Electron app 原型。
- 本地配置、workspace 和项目文件结构创建。
- 音频文件导入到项目素材库，保留原始路径、文件名、hash、mime type 和大小。
- 音频文件分析，写入 analysis cache 和素材 metadata。
- 音频 proxy WAV 与 peaks JSON 生成。
- 基础 WaveSurfer 波形预览，已有 peaks 时渲染波形并提供播放控制。
- 基础多轨剪辑：edit plan 默认两条音轨，支持新增音轨、素材拖入指定音轨、轨道重命名、轨道静音和删除空音轨。
- Markdown write intent 应用、文档版本快照和 hash 冲突失败保护。
- 研究任务账本与任务结果采纳。
- 项目素材库读取和基础非破坏性音频 edit plan。
- 基础 ripple delete 和 clip timing 数据更新。
- 基础 WAV 导出渲染和 render job 记录，导出时跳过静音音轨。
- FFmpeg、ffprobe、whisper.cpp 依赖状态检测。
- Provider profiles 明文配置编辑，凭证来源只记录无凭证、环境变量或运行时输入。
- 单元测试覆盖 slug、原子 JSON 写入、项目文件契约、LibraryAsset 导入、write journal、任务账本、edit plan 多轨默认值、轨道更新、空轨删除、静音轨导出过滤、ripple delete、clip timing 更新、FFmpeg 导出命令/render job、ffprobe 分析、proxy 生成、peaks 生成和播放数据读取。

对外入口：

- `README.md`：项目入口。
- `docs/README.md`：文档入口。
- `docs/doc/repository-analysis.md`：仓库分析入口。
- `docs/mockups/podcast-artist-dark-ui-sketches.html`：静态 UI mockup。
- `src/main/index.ts`：Electron main process 入口。
- `src/preload/index.ts`：preload bridge 入口。
- `src/renderer/index.html`：renderer 入口。

未观察到的入口：

- CLI 入口：未确认。
- API 入口：未确认。
- 路由入口：未确认。

## 分支状态分析

当前只观察到：

- `main`
- `origin/main`

没有观察到多个疑似业务代码分支。由于当前仓库只有文档提交，不能判断是否存在尚未推送或尚未创建的开发基准分支。

## 维护风险或注意事项

- 当前只是早期原型，README 和仓库分析需要持续区分“已实现能力”和“设计规划”。
- SQLite 索引层尚未实现，当前本地数据管理主要是明文文件和目录结构。
- 真实转写、精确时间码编辑、文本/转写驱动的片段操作和复杂多轨混音还未实现。
- 设计文档中包含较多未来技术方向，后续实现时需要把“已实现”和“规划中”分开维护。
- 计划类和规范类目录只是入口，不代表已经确认路线图、规范或协作流程。

## 测试现状

已有 Vitest 单元测试：

- `src/main/services/ids.test.ts`
- `src/main/services/jsonFile.test.ts`
- `src/main/services/workspace.test.ts`

已验证命令：

- `npm run typecheck`
- `npm test`
- `npm run build`

## 未确认事项

- 开发基准分支是否长期使用 `main`。
- 是否会采用 portable 配置模式，把应用级配置放入 workspace。
- 静态 mockup 后续是否继续保留在 `docs/mockups/`。
- SQLite 索引层何时接入。
- 文稿编辑器是否采用 Tiptap/ProseMirror 的具体实现方式。
- 音频引擎和 FFmpeg 打包策略。
