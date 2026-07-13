# Podcast Artist 本地项目文件契约

日期：2026-06-02
状态：草案 v0.1

这份文档把 PRD 和技术选型里的“本地透明结构”落到可实现的文件契约上。它回答三个问题：

- 一个 workspace 和一个项目文件夹里到底有哪些文件。
- 每个模块拥有和写入哪些文件。
- 外部 agent 或脚本如何在不理解应用内部实现的情况下读取、辅助处理和提交结果。
- 应用级配置如何管理本机依赖和外部服务，但不污染项目文件夹。

## 1. 核心原则

- 文件是事实来源，SQLite 是索引和查询加速层。
- 项目内容默认明文可读，API key 和 token 不进入项目文件夹；应用也不使用系统钥匙串代管凭证。
- 每个模块拥有自己的文件边界，不把关键状态藏进另一个模块的缓存。
- 正式文件写入必须可恢复：写入前有快照，写入中有 journal，失败后有可读错误。
- 外部 agent 可以直接读取项目文件夹，但写入正式内容时应通过任务账本或写入队列。
- 所有结构化 JSON 文件都必须有 `schemaVersion`，为迁移和外部工具兼容留出口。

## 2. 推荐目录结构

应用级配置目录建议放在 Electron `app.getPath("userData")` 下。它是机器级配置，不随单个项目迁移：

```text
Podcast Artist userData/
  settings.json
  provider-profiles.json
  dependency-status.json
  logs/
```

workspace 和 project 目录保存创作数据：

```text
workspace/
  workspace.json

  library/
    projects/
      ep-024/
        assets.json
        assets/
          audio/
            ast_host_take_001.wav
            ast_guest_take_001.wav
          attachments/
            ast_reference_pdf_001.pdf
      ep-025/
        assets.json
        assets/
    shared/
      assets.json
      assets/

  projects/
    ep-024/
      project.json
      project.sqlite
      episode.md

      .podcast-artist/
        documents/
          episode/
            snapshot.json
            paragraph-map.json
            source-map.json
            link-map.json

        document-versions/
          episode/
            2026-06-02T21-12-08.123+08-00/
              episode.md
              meta.json

        tasks/
          tsk_research_001/
            task.json
            context.md
            result.md
            write-intent.json
            artifacts/

        write-journal/
          pending/
          applying/
          applied/
          failed/

        audio-cache/
          analysis/
          proxy/
          peaks/

        transcripts/
          trn_host_take_001.json

        edit-plans/
          pln_rough_cut.json
          pln_export_master.json

        renders/

      exports/
      logs/
```

`project.json` 放在项目根目录，方便用户和外部工具第一眼找到项目 manifest。`.podcast-artist/` 存应用运行所需的可解释账本、缓存、队列、转写和剪辑计划。

机器级工具路径、API provider profile、最近一次依赖检测结果不写入项目文件夹。项目只记录任务或导出实际使用过的 profile id、工具版本和参数。

## 3. 通用约定

### ID

推荐用带前缀的稳定 id：

| 对象 | 前缀示例 |
| --- | --- |
| workspace | `wks_` |
| project | `prj_` |
| asset | `ast_` |
| document | `doc_` |
| segment | `seg_` |
| source note | `src_` |
| task | `tsk_` |
| write intent | `wit_` |
| transcript | `trn_` |
| edit plan | `pln_` |
| export job | `exp_` |

项目文件夹名可以是用户可读 slug，例如 `ep-024`；内部引用仍以 `projectId` 为准。

### 时间和路径

- 时间戳使用 ISO 8601，并保留时区，例如 `2026-06-02T21:12:08.123+08:00`。
- 项目内部路径优先使用相对路径和 POSIX 分隔符，例如 `episode.md`、`.podcast-artist/edit-plans/pln_rough_cut.json`。
- `originalPath` 可以保留用户导入时的绝对路径，但只作为来源记录和重新定位线索，不作为运行时强依赖。
- 音频内部时间使用整数毫秒或 sample frame。MVP 可以先用 `startMs` / `endMs`，需要更高精度时再增加 `startFrame` / `endFrame`。

### 文件哈希

文件哈希用于冲突检测、版本快照和素材校验：

```json
{
  "algorithm": "sha256",
  "value": "..."
}
```

## 4. 应用级 settings.json

`settings.json` 保存本机设置。它可以明文保存路径和 profile id，但不保存 API key 明文，也不保存钥匙串引用。

```json
{
  "schemaVersion": "appSettings.v1",
  "workspacePath": "/Users/name/Podcast Artist Workspace",
  "defaultProviderProfileId": "prv_local_openai_compatible",
  "defaultTranscriptionProfileId": "prv_local_whisper_cpp",
  "tools": {
    "ffmpeg": {
      "path": "/opt/homebrew/bin/ffmpeg",
      "autoDetect": true
    },
    "ffprobe": {
      "path": "/opt/homebrew/bin/ffprobe",
      "autoDetect": true
    },
    "whisperCpp": {
      "path": "/Users/name/tools/whisper.cpp/build/bin/whisper-cli",
      "modelDirectory": "/Users/name/Models/whisper",
      "defaultModelPath": "/Users/name/Models/whisper/ggml-small.bin"
    }
  }
}
```

## 5. provider-profiles.json

`provider-profiles.json` 保存外部服务和本地 provider 的非密钥配置。

```json
{
  "schemaVersion": "providerProfiles.v1",
  "profiles": [
    {
      "id": "prv_local_openai_compatible",
      "kind": "chat",
      "displayName": "Local OpenAI-compatible",
      "baseUrl": "http://localhost:11434/v1",
      "model": "qwen3",
      "credentialSource": { "kind": "none" },
      "capabilities": ["chat", "rewrite", "research"]
    },
    {
      "id": "prv_local_whisper_cpp",
      "kind": "transcription",
      "displayName": "Local whisper.cpp",
      "baseUrl": null,
      "model": "ggml-small.bin",
      "credentialSource": { "kind": "none" },
      "capabilities": ["transcription"]
    },
    {
      "id": "prv_online_transcription",
      "kind": "transcription",
      "displayName": "User configured online transcription",
      "baseUrl": "https://api.example.com",
      "model": "transcribe-model",
      "credentialSource": {
        "kind": "environment",
        "envVar": "PODCAST_ARTIST_TRANSCRIPTION_API_KEY"
      },
      "capabilities": ["transcription"]
    }
  ]
}
```

`credentialSource` 只记录凭证来源，不记录凭证本体。支持的策略是：

- `none`：本地 provider 或不需要密钥的服务。
- `environment`：只记录环境变量名，由用户在系统或启动脚本中自行提供。
- `runtime_prompt`：需要调用时临时输入，不落盘。

应用不使用 OS keychain、Electron safeStorage 或类似安全存储。外部 agent 可以读到 profile 的存在、用途和凭证来源方式，但不应该从项目文件或应用配置中拿到密钥明文。

## 6. dependency-status.json

`dependency-status.json` 是最近一次依赖诊断结果缓存，可以删除后重建。

```json
{
  "schemaVersion": "dependencyStatus.v1",
  "checkedAt": "2026-06-02T21:12:08.123+08:00",
  "dependencies": [
    {
      "id": "ffmpeg",
      "status": "available",
      "resolvedPath": "/opt/homebrew/bin/ffmpeg",
      "version": "ffmpeg version ...",
      "capabilities": {
        "filters": ["loudnorm", "amix", "afade"],
        "canExportWav": true
      },
      "error": null
    },
    {
      "id": "ffprobe",
      "status": "available",
      "resolvedPath": "/opt/homebrew/bin/ffprobe",
      "version": "ffprobe version ...",
      "capabilities": {
        "canProbeAudio": true
      },
      "error": null
    },
    {
      "id": "whisper_cpp",
      "status": "partial",
      "resolvedPath": "/Users/name/tools/whisper.cpp/build/bin/whisper-cli",
      "version": null,
      "capabilities": {
        "binaryExecutable": true,
        "modelAvailable": false
      },
      "error": "Default model file not found."
    }
  ]
}
```

状态值：

- `available`：可用。
- `not_configured`：还没有配置。
- `unavailable`：配置了但不可用。
- `partial`：部分可用，例如 binary 可执行但模型缺失。

## 7. workspace.json

`workspace.json` 描述整个本地工作区。

```json
{
  "schemaVersion": "workspace.v1",
  "id": "wks_default",
  "name": "Podcast Artist Workspace",
  "createdAt": "2026-06-02T21:12:08.123+08:00",
  "updatedAt": "2026-06-02T21:12:08.123+08:00",
  "libraryPath": "library",
  "projectsPath": "projects",
  "settings": {
    "defaultProjectScope": "project",
    "allowCrossProjectAssetReference": true
  }
}
```

## 8. project.json

`project.json` 是单个节目项目的入口 manifest。

```json
{
  "schemaVersion": "project.v1",
  "id": "prj_ep_024",
  "slug": "ep-024",
  "title": "第 24 期：本地优先的创作工具",
  "status": "drafting",
  "createdAt": "2026-06-02T21:12:08.123+08:00",
  "updatedAt": "2026-06-02T21:12:08.123+08:00",
  "document": {
    "id": "doc_episode",
    "path": "episode.md"
  },
  "library": {
    "scope": "project",
    "assetsIndexPath": "../../library/projects/ep-024/assets.json"
  },
  "paths": {
    "appData": ".podcast-artist",
    "exports": "exports",
    "sqlite": "project.sqlite"
  },
  "defaultExportSettings": {
    "format": "wav",
    "sampleRate": 48000,
    "channels": 2,
    "loudnessTargetLufs": -16
  }
}
```

## 9. 素材库 assets.json

素材库负责保存导入副本。文稿、转写、剪辑和导出都引用 `assetId`。

```json
{
  "schemaVersion": "assets.v1",
  "scope": "project",
  "projectId": "prj_ep_024",
  "assets": [
    {
      "id": "ast_host_take_001",
      "kind": "audio",
      "libraryPath": "assets/audio/ast_host_take_001.wav",
      "originalPath": "/Users/name/Desktop/host_take.wav",
      "originalFileName": "host_take.wav",
      "hash": {
        "algorithm": "sha256",
        "value": "..."
      },
      "sizeBytes": 483920112,
      "mimeType": "audio/wav",
      "createdAt": "2026-06-02T21:12:08.123+08:00",
      "metadata": {
        "durationMs": 7210032,
        "sampleRate": 48000,
        "channels": 2
      }
    }
  ]
}
```

导入策略：

- 添加素材时复制文件，不移动用户原始文件。
- 素材副本默认只读，剪辑模块不能改写它。
- 跨项目引用时，当前项目记录引用关系；如果用户选择复制，则创建新的 `assetId`。

## 10. episode.md

`episode.md` 是正式文稿。它必须是普通 Markdown 文件，外部编辑器可以直接打开。

推荐保留两类应用可识别语法：

````markdown
## 这一段节目要讨论什么

这里是普通文稿内容。这里引用一个资料：[资料 A](pa://source/src_research_001)。

```pa-source
id: src_research_001
title: 资料 A
taskId: tsk_research_001
assetId:
status: accepted
```

资料正文可以放在这里，仍然保持 Markdown 可读。
````

文稿模块打开文件后，可以重建段落索引、资料索引和链接索引。段落 id 可以存入缓存，不强求用户在 Markdown 正文里看到大量机器标记。

## 11. 文档解析缓存

`.podcast-artist/documents/episode/` 是可重建缓存，删除后应用可以重新解析 `episode.md`。

`snapshot.json`：

```json
{
  "schemaVersion": "documentSnapshot.v1",
  "documentId": "doc_episode",
  "path": "episode.md",
  "hash": {
    "algorithm": "sha256",
    "value": "..."
  },
  "parsedAt": "2026-06-02T21:12:08.123+08:00"
}
```

`paragraph-map.json`：

```json
{
  "schemaVersion": "paragraphMap.v1",
  "documentId": "doc_episode",
  "segments": [
    {
      "id": "seg_intro_001",
      "order": 1,
      "anchor": "heading:这一段节目要讨论什么",
      "textHash": {
        "algorithm": "sha256",
        "value": "..."
      },
      "startOffset": 0,
      "endOffset": 42
    }
  ]
}
```

## 12. 文档版本快照

每次写入 `episode.md` 前，先生成快照。

`meta.json`：

```json
{
  "schemaVersion": "documentVersion.v1",
  "id": "ver_episode_20260602_211208",
  "documentId": "doc_episode",
  "documentPath": "episode.md",
  "snapshotPath": "episode.md",
  "previousHash": {
    "algorithm": "sha256",
    "value": "..."
  },
  "nextIntentId": "wit_insert_source_001",
  "reason": "apply_write_intent",
  "createdAt": "2026-06-02T21:12:08.123+08:00",
  "retentionUntil": "2026-07-02T21:12:08.123+08:00"
}
```

默认保留 30 天。清理任务只删除过期快照，不删除当前正式文稿。

## 13. 任务账本

每个 AI/agent 任务都落一个目录。

`task.json`：

```json
{
  "schemaVersion": "agentTask.v1",
  "id": "tsk_research_001",
  "projectId": "prj_ep_024",
  "documentId": "doc_episode",
  "segmentId": "seg_intro_001",
  "type": "research",
  "status": "completed",
  "provider": {
    "kind": "chat",
    "profileId": "local_or_user_configured"
  },
  "userPrompt": "检查这一段说法是否准确，并补一个来源。",
  "contextPath": "context.md",
  "resultPath": "result.md",
  "writeIntentPath": "write-intent.json",
  "createdAt": "2026-06-02T21:12:08.123+08:00",
  "completedAt": "2026-06-02T21:15:10.000+08:00"
}
```

`context.md` 保存任务启动时用户看到的上下文。`result.md` 保存 agent 结果。这样即使 provider 崩溃、应用关闭或后续文稿变化，任务当时依据什么仍然可追溯。

## 14. write-journal

写入正式文件前，先生成 `WriteIntent`。目录状态和 JSON 状态要保持一致。

```json
{
  "schemaVersion": "writeIntent.v1",
  "id": "wit_insert_source_001",
  "projectId": "prj_ep_024",
  "sourceTaskId": "tsk_research_001",
  "target": {
    "kind": "markdown_document",
    "path": "episode.md",
    "documentId": "doc_episode"
  },
  "baseHash": {
    "algorithm": "sha256",
    "value": "..."
  },
  "operation": {
    "type": "insert_markdown_after_segment",
    "segmentId": "seg_intro_001",
    "payloadPath": "../tasks/tsk_research_001/result.md"
  },
  "summary": "在开场段落后插入一个已核查资料块。",
  "status": "pending",
  "createdAt": "2026-06-02T21:15:11.000+08:00",
  "appliedAt": null,
  "error": null
}
```

写入流程：

1. 任务生成结果和 `WriteIntent`。
2. `WriteIntent` 进入 `write-journal/pending/`。
3. 写入服务检查 `baseHash`。
4. 写入前创建文档版本快照。
5. 使用临时文件写入，再原子 rename。
6. 写入成功后移动到 `applied/`，失败移动到 `failed/`。

如果 `baseHash` 不匹配，说明文稿已经变化。此时不要强写，应该把 intent 标记为 `failed` 或 `needs_review`，让用户处理。

## 15. 转写 transcript

转写模块不拥有音频文件，只记录来源。

```json
{
  "schemaVersion": "transcript.v1",
  "id": "trn_host_take_001",
  "projectId": "prj_ep_024",
  "source": {
    "type": "library_asset",
    "id": "ast_host_take_001"
  },
  "provider": {
    "kind": "whisper_cpp",
    "profileId": "local_whisper_small"
  },
  "language": "zh",
  "createdAt": "2026-06-02T21:12:08.123+08:00",
  "segments": [
    {
      "id": "trnseg_001",
      "startMs": 1200,
      "endMs": 5420,
      "text": "今天我们聊一个本地优先的播客创作工具。",
      "speaker": null,
      "confidence": null,
      "words": []
    }
  ]
}
```

`source.type` 可以是：

- `library_asset`：从原始素材副本转写。
- `edit_plan`：从当前剪辑计划转写。

第一阶段可以只有结构和空状态，不要求真的执行转写。

## 16. 音频 edit plan

剪辑模块只写 edit plan，不改素材库音频。

```json
{
  "schemaVersion": "audioEditPlan.v1",
  "id": "pln_rough_cut",
  "projectId": "prj_ep_024",
  "title": "Rough Cut",
  "timebase": {
    "unit": "ms",
    "sampleRate": 48000
  },
  "tracks": [
    {
      "id": "trk_host",
      "name": "Host",
      "kind": "voice",
      "muted": false,
      "solo": false,
      "gainDb": 0
    }
  ],
  "clips": [
    {
      "id": "clp_host_intro",
      "trackId": "trk_host",
      "assetId": "ast_host_take_001",
      "sourceStartMs": 0,
      "sourceEndMs": 120000,
      "timelineStartMs": 0,
      "gainDb": 0,
      "fadeInMs": 20,
      "fadeOutMs": 20
    }
  ],
  "processing": {
    "loudnessNormalization": {
      "enabled": true,
      "targetLufs": -16
    },
    "denoise": {
      "enabled": false,
      "providerProfileId": null
    }
  },
  "exportDefaults": {
    "format": "wav",
    "sampleRate": 48000,
    "channels": 2
  },
  "updatedAt": "2026-06-02T21:12:08.123+08:00"
}
```

波纹剪辑改变的是 clips 的排列和时间，不改变源文件。删除 clip、更新 clip 的 `sourceStartMs` / `sourceEndMs`、插入空白或移动片段，都应该先落到 edit plan。更新某个 clip 时，应用可以按同轨 ripple 规则调整后续 clip 的 `timelineStartMs`，确保剪辑计划保持连续。导出时由本地音频引擎读取 `assetId` 对应的素材副本和这份 plan 生成新音频。

在播放头切割 clip 时，左段沿用原 ID，右段生成新的 `clp_` ID，两段继续引用同一个 `assetId`。左段更新 `sourceEndMs`，保留原淡入和增益，并把内侧 `fadeOutMs` 设为 0；右段更新 `sourceStartMs` 和 `timelineStartMs`，保留原淡出和增益，并把内侧 `fadeInMs` 设为 0。切割本身不移动其他 clip，只有随后执行波纹删除时，同轨后续片段才向前吸附。

## 17. 导出和 render 记录

导出结果是派生文件。导出失败不能影响素材库和 edit plan。

```json
{
  "schemaVersion": "exportJob.v1",
  "id": "exp_master_001",
  "projectId": "prj_ep_024",
  "sourcePlanId": "pln_rough_cut",
  "status": "completed",
  "settings": {
    "format": "wav",
    "sampleRate": 48000,
    "channels": 2,
    "loudnessTargetLufs": -16
  },
  "outputPath": "exports/ep-024-master.wav",
  "createdAt": "2026-06-02T21:12:08.123+08:00",
  "completedAt": "2026-06-02T21:20:00.000+08:00",
  "error": null
}
```

## 18. SQLite 索引层

`project.sqlite` 不保存唯一事实来源。它可以保存：

- 项目元信息索引。
- 素材索引。
- asset reference 索引。
- 段落和资料索引。
- 任务状态索引。
- write intent 状态索引。
- transcript segment 索引。
- edit plan / clip 索引。
- export job 索引。

如果 `project.sqlite` 丢失或损坏，应用应能从项目文件夹和素材库重建。实现上可以提供 `rebuild index` 操作。

## 19. 外部 agent 读写建议

外部 agent 可以安全读取：

- 应用级 `provider-profiles.json` 中的非密钥配置。
- 应用级 `dependency-status.json` 中的依赖状态缓存。
- `project.json`
- `episode.md`
- `workspace/library/**/assets.json`
- `.podcast-artist/tasks/**`
- `.podcast-artist/transcripts/**`
- `.podcast-artist/edit-plans/**`
- `.podcast-artist/write-journal/**`

外部 agent 不建议直接改：

- 应用级 `settings.json`
- 应用级 `provider-profiles.json`
- 应用级 `dependency-status.json`
- `episode.md`
- `.podcast-artist/edit-plans/*.json`
- `workspace/library/**/assets.json`
- `project.sqlite`

推荐写入方式：

- 做资料研究：新建 `.podcast-artist/tasks/:taskId/`，写入 `task.json`、`context.md`、`result.md`。
- 请求写入文稿：生成 `write-intent.json` 并放入 `write-journal/pending/`，等待应用检查和应用。
- 辅助转写：生成 `.podcast-artist/transcripts/:transcriptId.json`，并在结果中声明 `source`。
- 辅助剪辑：生成新的 draft edit plan，例如 `.podcast-artist/edit-plans/pln_agent_suggestion.json`，不要覆盖用户当前 plan。

这让 agent 可以参与创作，但不绕开应用的冲突检测、版本快照和恢复机制。

## 20. MVP 实现顺序

1. 项目初始化：创建 workspace、project、library 基础目录和 manifest。
2. 应用级设置：创建 `settings.json`、`provider-profiles.json`、`dependency-status.json`。
3. 依赖诊断：检测 FFmpeg、ffprobe、whisper.cpp binary 和模型文件。
4. 素材导入：复制文件到 library，写入 `assets.json`，生成 `assetId`。
5. 文稿模块：创建和打开 `episode.md`，生成 paragraph/source/link cache。
6. 任务账本：支持并行创建任务目录，保存 context/result。
7. write-journal：支持 pending/applying/applied/failed 状态和文稿串行写入。
8. 文档版本：写入前生成 30 天保留快照。
9. 音频 cache：生成 proxy 和 peaks。
10. edit plan：保存 clips/tracks/processing/export defaults。
11. 导出：按 edit plan 生成整体 WAV。
12. SQLite rebuild：从文件系统重建索引。

## 21. 待定问题

- `episode.md` 是否需要显式段落 id 标记，还是完全依赖缓存和文本 hash。
- 外部 agent 放入 `write-journal/pending/` 的 intent 是否需要应用签名或用户确认。
- 多项目共享素材的引用关系是否集中写在 workspace 级索引里。
- 音频时间基准 MVP 使用毫秒是否足够，还是一开始就用 sample frame。
- edit plan 是否需要保存完整操作历史，还是只保存当前状态和导出所需参数。
- 应用级配置是否允许放在 workspace 内作为 portable 模式，还是默认只放在系统 userData。
