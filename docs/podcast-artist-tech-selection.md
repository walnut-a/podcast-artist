# Podcast Artist 技术选型与调研

日期：2026-06-02
状态：草案

## 1. 结论摘要

推荐第一版采用：

- 桌面框架：Electron。
- 前端：React + TypeScript + Vite + electron-vite。
- 文稿编辑：Markdown 作为正式文稿格式；Tiptap/ProseMirror 作为增强编辑层和结构化编辑器内核。
- 本地存储：workspace 素材库 + 项目文件夹 + 透明本地文件 + SQLite 索引。优先验证 Electron 当前 Node 运行时里的 `node:sqlite`，不满足再退到 `better-sqlite3`。
- 数据访问：Drizzle ORM 或轻量 SQL repository 层，先避免重 ORM。
- AI 任务：自研本地任务队列 + Provider 抽象，支持 OpenAI-compatible endpoint、自定义 base URL、用户自带 API key；不提供官方托管服务。
- Agent/工具协议：MVP 不直接押注 ACP；先做内部任务协议，后续提供 ACP/MCP adapter。
- 音频 UI：自研轻量时间线数据模型 + Canvas 波形渲染。wavesurfer.js、Peaks.js、Waveform Playlist 可作为原型参考，但不建议把核心剪辑状态绑死在第三方 UI 库里。
- 波形数据：导入时预生成 peaks，不在浏览器里完整 decode 长音频。
- 长音频策略：素材库资产、代理音频、peaks、局部预览缓存、edit plan 分层处理。
- 音频处理与导出：桌面端调用原生 FFmpeg binary，负责混音、裁切、淡入淡出、标准化和导出；降噪先保留 provider/配置入口。
- 转写：第一阶段只做 Transcription Provider 架子、配置入口和数据结构；后续可选本地 `whisper.cpp` 或在线服务。
- 打包：electron-builder 或 Electron Forge。早期用 electron-builder 更直接，发布期再补签名、公证、更新策略。

核心原则：这是纯本地桌面应用，不是在线音频编辑器，也不是绑定官网服务的 SaaS 客户端。UI 可以用 Web 技术快速搭，但长音频解码、预处理、预览渲染和最终导出都应该交给本地音频引擎；文稿、任务、转写、剪辑时间线都要落在本地项目数据里。导入文件先复制到本地素材库，文稿、转写和剪辑通过 `assetId` 引用素材库资产。正式文稿、任务账本、写入意图、文档版本和音频编辑计划都应该能在项目文件夹中被用户手动翻找、解释和恢复，SQLite 主要承担索引和查询加速。模块之间尽量通过明文文件、稳定 id 和清晰目录解耦，方便本地高效执行，也方便用户自己接入外部 agent 或脚本。

## 2. 调研约束

这个产品有几个和普通 Electron 工具不一样的约束：

- 音频可能很长，播客单期 30 分钟到 3 小时都常见。
- 删除文本要映射到音频时间线，时间码不能飘。
- 用户会并行发起多个 AI/agent 任务，任务状态需要持久化。
- 产品要求本地优先，不能默认依赖云端服务。
- 项目会开源，外部服务能力通过开发者或用户配置接入，不提供官方服务兜底。
- 数据结构要面向用户手动管理、备份、迁移和排查问题，不以隐藏或加密项目内容为主要目标。
- 模块间格式要尽量明文、稳定、可被外部 agent 或脚本读取，避免复杂私有数据格式造成耦合。
- 后续可能要支持用户自带模型、API key、工具协议和本地二进制。
- 音频能力定位是播客草剪，不是完整 DAW。

## 3. 桌面框架

### 推荐：Electron

理由：

- 用户已经倾向 Electron，和产品的前端式复杂 UI 很匹配。
- Electron 内置 Chromium + Node，适合同时做富交互 UI、本地文件、SQLite、子进程、FFmpeg、whisper.cpp。
- 官方支持 native Node modules，但需要注意 ABI 和 rebuild 问题。
- 当前 Electron release 页面显示，2026-05 下旬的 v40/v41/v42 稳定版本都使用 Node.js 24.15.0；Node 24 官方文档已有 `node:sqlite` 模块。这让我们可以优先测试无第三方原生 SQLite 依赖的方案。

风险：

- 包体大。
- 安全边界要认真做：禁用 renderer 的 Node integration，通过 preload 暴露受控 IPC。
- 如果用了 native Node module，Electron 升级时可能要 rebuild。
- 打包 FFmpeg、whisper.cpp、模型文件会让应用体积和签名流程变复杂。

### 备选：Tauri

Tauri 的安全默认值和包体会更漂亮，官方也强调默认安全模型。但这个项目会大量调 FFmpeg/whisper、本地文件、SQLite、长任务队列和复杂前端交互。如果用 Tauri，会把很多能力放到 Rust side，工程门槛更高。

判断：第一版不选 Tauri。除非后面明确要极致包体、Rust 音频核心或更强原生集成。

## 4. 前端与构建

### 推荐：React + TypeScript + Vite + electron-vite

理由：

- React 生态适合复杂桌面工具 UI：多面板、时间线、任务列表、编辑器状态。
- TypeScript 对本地数据模型、IPC contract、时间线操作很重要。
- Vite 官方支持 React TypeScript 模板，开发体验好。
- electron-vite 能把 main、preload、renderer 的 TypeScript 构建分开处理。

建议结构：

```text
src/
  main/        Electron main process, IPC, job workers, local files
  preload/     typed bridge APIs
  renderer/    React UI
  shared/      types, timeline ops, provider contracts
```

## 5. 文稿编辑器

### 推荐：Markdown 正式文稿 + Tiptap 增强编辑

文稿的正式存储格式应该是 Markdown。它是用户真正拥有的稿件文件，可以被外部编辑器打开、备份、迁移和恢复。Tiptap/ProseMirror 仍然有价值，但定位是应用内增强编辑层，而不是唯一真相来源。

对 Podcast Artist 来说，这点很关键：

- 每个段落需要稳定 id，用来关联资料、AI 任务和录音提示。
- 用户选中一段文字时，要能拿到 selection、上下文和段落 anchor。
- 任务结果要能插入文稿或挂在段落旁边。
- 应用需要解析 Markdown，生成段落、资料、链接和自定义语法索引。

不推荐做一个纯 textarea Markdown 编辑器。它虽然简单，但不适合做稳定段落锚点、局部任务、资料引用和富交互批注。更合适的方案是：

- 文稿主存储格式：Markdown。
- 应用打开文稿时，将 Markdown 解析为 editor state / ProseMirror doc。
- 编辑器内可以给 block 节点挂载临时 `segmentId`，但最终要能从 Markdown 和缓存中恢复。
- 自定义资料引用使用 Markdown 可容忍的语法，例如 `pa://source/S-04` 链接和 `pa-source` 代码块。
- 任务结果先进入本地任务账本和资料候选区；采纳后生成 `WriteIntent`，由串行写入队列修改 Markdown。
- 写入 Markdown 前生成旧版本快照，默认保留 30 天。
- Tiptap JSON 可以作为可重建缓存或编辑器会话缓存，不作为正式稿件唯一来源。

## 6. 本地存储

### 推荐：workspace 素材库 + 项目文件夹 + 透明文件 + SQLite 索引

建议项目结构：

```text
workspace/
  workspace.json

  library/
    projects/
      ep-024/
        assets/
          audio/
            asset_a1_host_take.wav
            asset_a2_guest_take.wav
          attachments/
        assets.json
      ep-025/
        assets/
        assets.json
    shared/
      assets/
      assets.json

  projects/
    ep-024/
      episode.md
      project.json
      project.sqlite
      .podcast-artist/
        documents/
        document-versions/
        tasks/
        write-journal/
        audio-cache/
          analysis/
          proxy/
          peaks/
        transcripts/
        edit-plans/
        renders/
      exports/
      logs/
```

SQLite 存索引和查询加速：

- project metadata
- library asset indexes
- asset reference indexes
- document file indexes
- document segments cache
- source note indexes
- agent task status indexes
- write intent indexes
- audio asset indexes
- transcript segment indexes
- timeline/edit-plan indexes
- export job indexes

文件系统存正式内容、可解释账本和可重建缓存：

- `workspace/library/projects/:projectId/assets/`：当前项目导入素材副本。
- `workspace/library/shared/assets/`：可选共享素材。
- `episode.md`：正式文稿。
- `.podcast-artist/document-versions/`：写入前旧版本快照，默认保留 30 天。
- `.podcast-artist/tasks/`：任务账本、context、result、artifacts。
- `.podcast-artist/write-journal/`：pending/applying/applied/failed 写入意图。
- `.podcast-artist/audio-cache/proxy/`：转码后的 proxy 音频。
- `.podcast-artist/audio-cache/peaks/`：peaks 数据。
- `.podcast-artist/edit-plans/`：音频非破坏性编辑计划。
- `exports/` 或 `.podcast-artist/renders/`：导出结果。
- 可选的模型文件。

导入素材时必须复制到 library，不移动用户原始文件。后续模块只引用 `assetId`；原始路径只作为来源信息和重新定位线索。

这种结构的取舍是：SQLite 不再是唯一事实来源，而是项目文件夹和素材库的索引层。重要状态优先能在本地文件中解释和恢复。

项目内容默认不做加密或混淆。这个设计目标不是把数据藏起来，而是让用户能手动翻找、备份、迁移和排查问题。API key、访问 token 等凭证例外，应该用系统 keychain、Electron safeStorage 或等价机制保存，不进入项目文件夹的明文内容。

项目文件夹同时也是外部 agent 的可读协议层。Markdown、任务账本、write intent、transcript、asset index 和 edit plan 应尽量用明文格式保存；SQLite 可以保存索引和状态加速，但不应该成为外部工具唯一能读懂的入口。这样每个模块可以独立处理自己的任务，减少跨模块同步成本，也让用户可以用脚本或 agent 单独处理某一层数据。

### 模块边界与文件契约

最新版 PRD 里，“模块解耦”不是抽象口号，而是本地执行效率、可恢复性和外部 agent 接入的基础。技术上建议把每个模块的读写边界固定下来：

| 模块 | 拥有的主要数据 | 可以读取 | 写入原则 |
| --- | --- | --- | --- |
| 素材库 | `workspace/library/**/assets.json`、素材副本 | 项目 manifest、引用索引 | 导入时复制文件并生成 `assetId`；素材副本只读，不被剪辑模块改写 |
| 文稿模块 | `episode.md`、`.podcast-artist/documents/` | 任务结果、素材索引、转写索引 | 正式 Markdown 只能通过文稿写入队列更新；写入前生成版本快照 |
| 任务模块 | `.podcast-artist/tasks/:taskId/` | 当前屏幕上下文、段落、素材、转写 | 任务可以并行执行；结果先落本地账本，不直接改正式文稿 |
| 写入队列 | `.podcast-artist/write-journal/**` | 任务结果、当前文稿版本 | 同一份 Markdown 串行写入；状态变化可恢复 |
| 转写模块 | `.podcast-artist/transcripts/:transcriptId.json` | `LibraryAsset` 或 `AudioEditPlan` | 转写结果记录来源，不拥有音频文件 |
| 音频剪辑模块 | `.podcast-artist/edit-plans/:planId.json` | `LibraryAsset`、proxy、peaks、transcript | 只写 edit plan，不改素材库文件 |
| 导出模块 | `.podcast-artist/renders/`、`exports/` | 素材库资产、edit plan、导出配置 | 导出是派生结果；失败不影响素材和 edit plan |
| SQLite 索引层 | `project.sqlite` | 所有明文项目文件 | 只做索引、查询和事务加速；必要时可从文件系统重建 |

这个表可以作为后续实现的模块契约。一个模块要新增能力时，优先新增自己的明文文件或索引字段，不应该偷偷把关键状态塞进另一个模块的内部缓存。

建议的文件格式原则：

- 长文本和创作内容用 Markdown。
- 结构化状态用带 `schemaVersion` 的 JSON。
- 任务过程、写入意图、导出记录可以用目录 + JSON + Markdown 组合，而不是一个巨大数据库表。
- append-only 历史可以考虑 JSONL，但正式状态仍要有可直接读取的当前快照。
- SQLite 表字段要能对应到文件层数据，不制造只有数据库才能解释的隐藏状态。

### 写入、索引和恢复策略

本地透明结构会带来一个工程要求：写入要清楚，恢复要清楚。建议采用“文件是事实来源，SQLite 是索引层，队列负责串行写入”的原则。

写入策略：

- 同一个正式文件只允许一个写入队列处理。例如 `episode.md` 由 document write queue 处理，`edit-plans/:planId.json` 由 timeline plan queue 处理。
- 不同模块可以并行跑任务。例如资料核查、素材分析、peaks 生成、转写准备可以同时进行，只要它们不直接争抢同一个正式文件。
- 文件写入使用临时文件 + 原子 rename，写入前后更新 journal 状态。
- 写入失败时保留 `failed` 状态、错误原因、输入数据和目标文件版本，不丢掉任务结果。
- 应用重启时先扫描 journal 和 task ledger，再决定继续、回滚提示或等待用户处理。

索引策略：

- 每次正式文件写入成功后，触发对应索引刷新。
- SQLite 索引缺失或损坏时，可以从 `project.json`、`assets.json`、`episode.md`、task ledger、transcripts、edit plans 重新构建。
- project manifest 和各 JSON 文件都要带 `schemaVersion`，为后续迁移留入口。
- 迁移优先迁明文文件，再重建 SQLite 索引；不要把迁移逻辑只写在数据库 schema 里。

更具体的 JSON 字段、目录约定和外部 agent 读写方式，见 [本地项目文件契约](podcast-artist-local-file-contract.md)。

### SQLite Driver 选择

优先调研路径：

1. `node:sqlite`
2. `better-sqlite3`

原因：

- Node 官方已经提供 `node:sqlite`，并支持文件或内存数据库。
- Drizzle 官方文档显示支持 SQLite 的 `node:sqlite` 和 `better-sqlite3` driver。
- Electron 官方文档提醒 native Node module 在 Electron 里有 ABI rebuild 问题。因此如果 `node:sqlite` 在目标 Electron 版本中可用，可以减少一个原生依赖风险。

实现时需要确认：

- Electron main process 能否稳定使用 `node:sqlite`。
- Drizzle + `node:sqlite` 在 Electron 打包后是否正常。
- migration、事务、FTS5、JSON 字段是否满足需求。
- 大量 transcript segment 查询性能如何。

如果不满足，再退到 `better-sqlite3`，但要把 `@electron/rebuild` 和打包测试纳入工程流程。

## 7. AI 与 agent 任务

### 推荐：内部任务队列 + Provider 抽象

MVP 不建议一开始就把任务系统绑定到某个 agent 协议。应该先把产品内部任务模型做清楚：

```text
AgentTask
  id
  projectId
  segmentId
  prompt
  contextSnapshot
  status
  provider
  model
  result
  createdAt
  completedAt
```

任务状态：

- queued
- running
- waiting_user
- completed
- failed
- canceled

Provider 抽象：

- `ChatProvider`：改写、整理、总结、生成。
- `ResearchProvider`：资料查询、事实核查。
- `TranscriptionProvider`：音频转写。
- `ToolProvider`：本地工具或外部工具调用。

### LLM 接入

第一版推荐：

- 支持 OpenAI-compatible endpoint。
- 支持自定义 base URL。
- 支持用户自带 API key。
- 支持开发者或用户配置 provider profile。
- 支持 OpenAI Responses API profile，但不强依赖。

OpenAI Responses API 适合工具调用、内置 web search、文件搜索等能力；但用户明确希望可以避开官方服务，所以它应该只是一个可配置 provider profile，不是产品唯一通道，也不是官方默认服务。

### ACP/MCP 判断

这里要先区分：

- Agent Client Protocol：主要标准化 editor/client 与 coding agent 的通信。
- Model Context Protocol：主要让模型/agent 用标准方式访问工具、资源、prompt。
- 另有一些同名 ACP，如 Agent Control Protocol，方向是 agent 操作已有应用 UI。

对 Podcast Artist 来说：

- MCP 更适合作为“资料查询工具、文件工具、本地工具”的接入层。
- ACP 可以作为未来“外部 agent 操作 Podcast Artist 项目”的 adapter。
- MVP 先做内部任务队列和 provider interface，避免一开始被协议细节牵着走。

## 8. 设置页与本地依赖诊断

设置页需要承担“本地创作环境管理”的角色。这个产品不提供官方托管服务，也不应该假装所有依赖都已经内置好；用户需要清楚知道当前机器能做什么、缺什么、下一步怎么修。

推荐设置页分区：

- 本地工具链：FFmpeg、ffprobe、whisper.cpp、模型文件、后续降噪工具。
- Provider profiles：AI、资料检索、转写、降噪的 base URL、模型名、能力标签。
- 凭证：API key / token 的配置状态和更新入口，不长期显示明文。
- 存储：workspace、library、项目默认位置、模型文件目录。
- 诊断：一键检查、最近一次检查结果、错误原因、版本信息。

依赖配置属于应用级或机器级配置，建议放在 Electron `app.getPath("userData")` 下，而不是写进项目文件夹。项目文件夹可以记录某次任务或导出使用过的 `providerProfileId`、工具版本和参数，但不保存机器上的 binary 绝对路径，也不保存 API key。

### 依赖检测模型

建议抽象一个 `DependencyRegistry`：

```text
DependencyDefinition
  id
  kind
  displayName
  requiredFor[]
  autoDetectStrategies[]
  manualPath
  checkCommand
  capabilityChecks[]

DependencyCheckResult
  dependencyId
  status
  resolvedPath
  version
  capabilities
  checkedAt
  error
```

`status` 建议使用：

- `available`：路径存在，能执行，版本和能力检查通过。
- `not_configured`：用户还没有配置路径、模型文件或 provider。
- `unavailable`：配置了但不可执行、版本读取失败或文件不存在。
- `partial`：主工具可用，但关键附属能力缺失。

### FFmpeg / ffprobe

FFmpeg 是 P0 必须检查的依赖，因为 proxy、peaks 前处理、标准化和导出都依赖它。

检测项：

- 自动查找 `$PATH`、常见 Homebrew 路径和用户手动配置路径。
- 执行 `ffmpeg -version`，读取版本和 build configuration。
- 执行 `ffprobe -version`，确认格式探测能力。
- 执行 `ffmpeg -filters`，确认 `loudnorm`、`amix`、`afade` 等基础滤镜存在。
- 后续支持 MP3/AAC/M4A 时，再检测对应 encoder 和许可证风险。

设置页展示：

- 当前 FFmpeg 路径。
- 当前 ffprobe 路径。
- 版本号和最近检查时间。
- 基础导入、proxy、导出、loudness normalization 是否可用。
- 手动选择路径、重新检测、查看错误日志。

### whisper.cpp 和模型文件

转写第一阶段可以不执行，但设置页需要有架子。用户应该能看到“转写不可用”到底是因为没有配置 binary、没有模型文件，还是 provider 本身未启用。

检测项：

- whisper.cpp binary 路径，允许用户手动选择。
- 支持不同构建产物名称，例如 `whisper-cli` 或用户自定义 binary。
- 执行 `--help` 或等价轻量命令，确认 binary 可执行。
- 检查模型目录和选中的模型文件是否存在。
- 记录模型名称、量化类型、文件大小。
- 可选检查 Metal/Core ML 等加速能力，但不作为 MVP 阻塞项。

设置页展示：

- 本地 whisper.cpp 是否可用。
- 当前模型文件是否存在。
- 预计能力状态：未配置、可转写、缺模型、binary 不可执行。
- 在线转写 provider 是否已配置。

### Provider 健康检查

在线 provider 和用户自带 API key 需要谨慎检查，避免设置页打开时自动产生费用或上传数据。

建议：

- 默认只检查配置完整性：base URL、模型名、key ref 是否存在。
- 提供手动“测试连接”按钮。
- 测试连接只发最小请求，不上传项目文稿或音频。
- API key 存在状态可显示，key 本身不回显。
- 每个 provider profile 标注用途：chat、research、transcription、denoise。

### 配置文件

应用级配置可以拆成：

- `settings.json`：workspace 路径、工具路径、模型目录、默认 profile id。
- `provider-profiles.json`：provider 类型、base URL、模型名、能力标签、secret ref。
- `dependency-status.json`：最近一次依赖检查结果缓存，可以删除后重建。

凭证保存到 OS keychain 或 Electron safeStorage，不进入这些明文配置文件。

## 9. 音频时间线与波形

### 本地应用的性能边界

放开在线存储和云端渲染限制后，性能目标可以定得更高。Electron 只是界面壳，不代表所有音频处理都要在 renderer 里完成。

推荐分工：

```text
React/Electron renderer
  -> 文稿、资料、任务、转写、时间线 UI
  -> 读取 peaks 和当前视口数据
  -> 不完整 decode 长音频

Electron main / 本地音频服务
  -> 文件访问、任务调度、FFmpeg、whisper.cpp
  -> 代理音频、peaks、转写前处理、局部预览、最终导出

SQLite / 文件系统
  -> library assets、项目索引、timeline edit plan、transcript、proxy、peaks、cache
```

正确理解是“前端技术做界面，本地引擎做音频”。只要这个边界清楚，纯本地应用可以做到长播客快速打开、时间线顺滑拖动、剪辑操作即时响应、导出稳定可复现。

### 不建议把核心剪辑状态交给 UI 库

调研到的库：

- wavesurfer.js：官方插件有 Regions、Timeline、Envelope、Record 等，适合单条或少量音频的波形交互。
- Peaks.js：支持 zoom、scroll、point/segment marker，也强调长音频应该用预生成 waveform data。
- Waveform Playlist：提供多轨、trim、split、fade、WAV export 等能力，适合作为原型参考。

这些库能加快验证，但 Podcast Artist 的核心剪辑模型有自己的要求：

- 默认波纹剪辑。
- 文本选择删除要映射时间线 edit。
- 多轨音频要支持整体导出和后续分轨导出。
- 时间线状态必须可持久化、可重放、可测试。
- 最终导出要由 FFmpeg 按同一份 timeline 数据生成。

因此推荐：

- 自研 timeline 数据模型。
- 自研 Canvas 波形 renderer，先只画 peaks，不做复杂 DAW UI。
- 可借鉴 wavesurfer/Peaks/Waveform Playlist 的交互，但不要把项目文件格式绑到它们。

### 时间线数据原则

- 所有时间内部用 sample index 或整数毫秒，不用裸 float 秒数作为主键。
- 导入时生成统一 project sample rate 的 proxy。
- 剪辑模块引用素材库 `assetId`，不直接引用用户原始路径。
- 素材库文件不修改。
- 每次删除、插空、移动都记录为 timeline edit plan。
- ripple delete 是时间线操作，不是直接改音频文件。

### 长音频波形

wavesurfer.js 官方说明，大文件在浏览器中完整 decode 可能因为内存限制失败，并建议使用 pre-decoded peaks。

纯本地应用里也不应该把两小时音频一次性丢进 renderer 解码。长音频应该拆成四层：

1. `library asset`：用户导入后复制到素材库的文件，只读保留。
2. `proxy`：导入时生成的统一规格代理音频，用于稳定播放、转写和时间线预览。
3. `peaks`：多分辨率波形峰值数据，用于快速绘制时间线。
4. `preview cache`：播放头附近或当前编辑范围的局部混音预览，剪辑变化后局部失效。

推荐导入流程：

1. 将用户选择的音频复制到当前项目素材库，生成 `LibraryAsset` 和 `assetId`。
2. FFmpeg 读取素材库资产，生成统一格式 proxy。
3. 生成多分辨率 peaks 数据，保存到 `.podcast-artist/audio-cache/peaks/`。
4. 写入素材元信息、proxy 路径、peaks 路径和时间基准。
5. UI 只加载当前视口附近的 peaks，不完整 decode 整期节目。
6. zoom 时读取不同分辨率 peaks，或在内存中做降采样。

可选工具：

- `audiowaveform`：BBC 项目，专门生成 waveform data 或图片。
- 自研 peaks 生成器：用 FFmpeg 解码 PCM 后在 Node worker 里算 min/max。

第一版可以先用自研 peaks 生成器，减少再打包一个 C++ binary；如果性能不够，再引入 audiowaveform。

### 播放和预览策略

MVP 可以先把播放和最终导出分开：

- 播放：前端播放 proxy，时间线只负责同步播放头和片段状态。
- 预览：当用户从某个位置开始播放时，本地音频服务可以预渲染后续 30-120 秒的 preview mix。
- 失效：用户删除、移动、插空或调整淡入淡出后，只让受影响范围的 preview cache 失效。
- 导出：最终导出不使用 preview cache，而是使用 timeline edit plan 重新渲染。

更复杂的实时方案是把播放头附近的 PCM chunk 放进 Web Audio ring buffer，并持续预取下一段。这可以作为后续优化，不建议 MVP 一开始就承担。

## 10. 音频处理与导出

### 推荐：原生 FFmpeg binary

不推荐 `ffmpeg.wasm` 作为主导出方案。播客音频长，WASM 包体、内存和速度都不划算。Electron 既然能调子进程，直接使用原生 FFmpeg 更稳。

FFmpeg 负责：

- 格式探测。
- proxy 转码。
- 按 timeline 裁切片段。
- 多轨混音。
- 插入空白。
- 淡入淡出。
- loudness normalization。
- 最终导出。

MVP 可用的 FFmpeg 能力：

- `amix`：多输入混成单输出。
- `afade` / `acrossfade`：淡入淡出或交叉淡化。
- `loudnorm`：EBU R128 loudness normalization，支持 single pass / double pass。

降噪能力先不作为第一阶段要求。后续如果要接入，可以用 FFmpeg 的 `afftdn` 等滤镜作为一个可配置处理项。

### 许可证注意

FFmpeg 官方说明：FFmpeg 默认是 LGPL 2.1+，但包含可选 GPL 组件；如果启用 GPL 部分，整个 FFmpeg binary 会受 GPL 影响。

建议：

- MVP 先允许用户配置系统 FFmpeg 路径。
- 如果要内置 FFmpeg，使用清楚的 LGPL build。
- 导出格式先保守支持 WAV；MP3/AAC/M4A 要单独确认编码器和打包许可证。
- 在设置里显示 FFmpeg 来源和版本。

## 11. 转写

### 推荐：Transcription Provider 抽象

第一阶段可以不做实际转写，只先把接口、配置入口和数据结构留好。不要把转写绑死到某一家服务。内部统一输出：

```text
Transcript
  id
  audioAssetId
  provider
  language
  segments[]

TranscriptSegment
  id
  startMs
  endMs
  text
  words?
  confidence?
  speaker?
```

### 后续方向：whisper.cpp

如果进入实际转写实现，本地 whisper.cpp 是优先方向：

- 本地离线。
- C/C++ 实现，适合桌面 app 通过 binary 调用。
- Apple Silicon 有 Metal/Core ML 优化方向。
- 模型可量化，能让用户在速度、质量、磁盘占用之间取舍。

注意：

- whisper.cpp 的 CLI 示例需要 16-bit WAV，导入流程最好先用 FFmpeg 转好 proxy。
- 大模型占用明显，large 模型磁盘和内存都很重。
- 首次 Core ML 运行可能较慢，因为设备会编译模型。

### 可选 Provider：OpenAI Speech-to-Text

OpenAI 官方 Speech-to-Text 支持 `transcriptions` 和 `translations`，当前文档列出 `whisper-1`、`gpt-4o-mini-transcribe`、`gpt-4o-transcribe`、`gpt-4o-transcribe-diarize`。但官方上传文件限制是 25 MB，这对长播客意味着必须切片上传，并处理片段上下文。

判断：

- OpenAI 转写可以作为高质量/说话人区分 provider profile，但不是第一阶段必须能力，也不是产品提供的官方服务。
- 本地 whisper.cpp 更符合产品“本地优先、低成本”的主线。
- 当前真正需要验证的是 whisper.cpp 输出的时间戳是否足够细，能否支撑文本级剪辑。

## 12. 安全与隐私

Electron 安全建议必须从第一天执行：

- renderer 禁用 Node integration。
- 开启 context isolation。
- preload 暴露最小 IPC API。
- 不加载不可信远程页面。
- 外部链接用系统浏览器打开。
- 所有本地文件访问都走 main process。
- API key 不进入 renderer 明文长期状态。

API key 存储：

- MVP 可先用 Electron safeStorage 或 OS keychain 方向。
- 项目数据库不存明文 key。
- 导出项目时不包含本机密钥。

## 13. 测试策略

### 纯逻辑测试

重点测：

- 段落 anchor 生成和更新。
- AI 任务状态机。
- dependency detection 状态机。
- timeline ripple delete。
- 文本区间到音频时间区间映射。
- 多轨片段排序和空白插入。

### 音频 golden test

用生成音频做可复现测试：

- 1kHz sine wave。
- 双轨不同频率。
- 固定静音段。
- 固定 fade。

通过 FFmpeg/ffprobe 验证：

- 导出时长。
- 静音段是否被删除。
- 多轨混音是否存在。
- loudnorm 是否执行。

### UI 测试

用 Playwright 或 Electron testing 跑关键流程：

- 打开设置页并完成 FFmpeg/ffprobe 检测。
- FFmpeg 缺失时，导出入口显示不可用原因。
- 创建项目。
- 写文稿。
- 发起两个并行任务。
- 导入音频。
- 转写完成后删除一段文本。
- 导出。
- 关闭重开后状态存在。

## 14. 推荐 MVP 技术栈表

| 模块 | 推荐选型 | 备选 | 选择原因 |
| --- | --- | --- | --- |
| 桌面框架 | Electron | Tauri | 前端复杂 UI + Node 子进程 + 本地工具链更顺 |
| 构建 | electron-vite + Vite | Electron Forge template | main/preload/renderer 分离清晰 |
| UI | React + TypeScript | Svelte/Vue | 复杂工具界面生态成熟 |
| 文稿编辑 | Markdown + Tiptap/ProseMirror | 纯 Markdown editor / Lexical | Markdown 是正式文稿，Tiptap 提供增强编辑和段落交互 |
| 素材库 | Project-scoped LibraryAsset | 直接引用外部文件路径 | 导入创建副本，文档/转写/剪辑统一引用 assetId |
| DB | SQLite 索引 | 纯 JSON files | 任务、段落、转写、时间线需要查询和事务，但 SQLite 不做唯一事实来源 |
| SQLite driver | node:sqlite | better-sqlite3 | 减少 native module rebuild 风险 |
| DB schema | Drizzle / SQL repository | Prisma | SQLite 桌面端更轻，迁移可控 |
| AI | Provider abstraction | 单一 OpenAI SDK | 支持自带 key 和多供应商 |
| 工具协议 | 内部 task protocol，后续 MCP/ACP adapter | 直接 ACP | MVP 避免协议绑死 |
| 设置页 | 本地依赖诊断 + Provider profiles | 只做表单配置 | 需要真实管理 FFmpeg、ffprobe、whisper.cpp、模型文件和 key 状态 |
| 波形 | 预生成 peaks + Canvas | wavesurfer.js | 长音频稳定、可控 |
| 时间线 | 自研 timeline model | Waveform Playlist | 需要 ripple/text-sync/export 一致 |
| 播放 | Web Audio / HTMLMediaElement | Tone.js | MVP 先简单可靠 |
| 导出 | 原生 FFmpeg | ffmpeg.wasm | 长音频性能和稳定性更好 |
| 转写 | Provider skeleton | whisper.cpp / OpenAI transcription | 第一阶段先留接口，实际能力后置 |
| 打包 | electron-builder | Electron Forge | 分发配置直接，后续签名/更新方便 |

## 15. 后续验证点

大部分技术链路已经属于明确可做的工程实现，不需要在正式开工前单独做一批验证。

当前唯一值得保留的低优先级验证点是：whisper.cpp 的时间戳精度是否足够支撑文本级剪辑。

验证方式可以很简单：

- 准备一段 5-10 分钟中文播客音频。
- 使用 whisper.cpp 输出 segment 或 word-level timestamp。
- 检查时间戳粒度、漂移情况和中文口语切分质量。
- 判断能否支持“选中文本后删除对应音频片段”。

这个验证不阻塞第一阶段开发，因为第一阶段只需要保留转写接口和数据结构。

## 16. 主要风险

### 长音频性能

风险：浏览器 decode 长音频导致内存爆掉。

应对：导入时生成 proxy 和 peaks；UI 只读 peaks。

### 时间码漂移

风险：VBR MP3、转写分片、浮点秒数会导致文本和音频错位。

应对：导入后转统一 proxy；内部时间使用整数 sample 或毫秒；保留 source time mapping。

### FFmpeg 许可证和打包

风险：内置 FFmpeg binary 的许可证和平台签名复杂。

应对：MVP 支持用户配置 FFmpeg；内置版只使用明确 LGPL build。

### 转写质量与成本

风险：本地模型速度/质量不稳定，云端成本和上传限制明显。

应对：Provider 抽象；本地为默认方向，云端作为增强。

### 本地依赖配置混乱

风险：用户机器上的 FFmpeg、ffprobe、whisper.cpp、模型文件和在线 provider 状态不清楚，导致功能入口看似存在但无法执行。

应对：设置页做依赖诊断中心；每个能力显示可用状态、路径、版本、最近检查时间和错误原因。项目只记录使用过的 profile 和工具版本，不把机器路径写成项目事实来源。

### Agent 协议变化

风险：ACP/MCP 等协议仍在快速变化，直接绑定会拖慢 MVP。

应对：内部任务模型稳定后再做 adapter。

## 17. 资料来源

- Electron security: https://www.electronjs.org/docs/latest/tutorial/security
- Electron native modules: https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules
- Electron release timeline and support: https://www.electronjs.org/docs/latest/tutorial/electron-timelines
- Electron releases: https://releases.electronjs.org/release/
- Tauri security: https://v2.tauri.app/security/
- Vite getting started: https://vite.dev/guide/
- electron-vite TypeScript: https://electron-vite.org/guide/typescript
- Node SQLite: https://nodejs.org/api/sqlite.html
- Drizzle SQLite: https://orm.drizzle.team/docs/get-started-sqlite
- ProseMirror guide: https://prosemirror.net/docs/guide/
- Tiptap concepts: https://tiptap.dev/docs/editor/core-concepts/introduction
- wavesurfer.js docs: https://wavesurfer.xyz/docs/
- Peaks.js: https://github.com/bbc/peaks.js
- audiowaveform: https://github.com/bbc/audiowaveform
- Waveform Playlist: https://naomiaro.github.io/waveform-playlist/
- FFmpeg filters: https://www.ffmpeg.org/ffmpeg-filters.html
- FFmpeg license: https://svn.ffmpeg.org/legal.html
- whisper.cpp: https://github.com/ggml-org/whisper.cpp
- OpenAI Speech-to-Text: https://developers.openai.com/api/docs/guides/speech-to-text
- OpenAI Responses API: https://platform.openai.com/docs/api-reference/responses/create?api-mode=responses
- Agent Client Protocol: https://github.com/agentclientprotocol/agent-client-protocol
- Model Context Protocol TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
