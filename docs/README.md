# Podcast Artist 文档入口

本目录保存 Podcast Artist 的产品、技术、文件契约、界面探索和仓库说明文档。文档采用渐进式披露：根目录 `README.md` 只放项目级关键信息；本文件作为文档总入口；各子目录 README 负责对应类别的用途说明和索引；具体细节放到具体文档中。

## 目录职责

- `doc/`：稳定说明类文档，例如仓库分析、架构说明、运行说明、交接说明。
- `plan/`：计划类文档入口。初始化阶段只建立入口，不默认创建具体计划文档。
- `spec/`：规范类文档入口。初始化阶段只建立入口，不默认制定具体规范。
- `mockups/`：静态界面草图、视觉探索图片和可打开的 HTML mockup。
- `*.md`：当前已有的产品设计、技术选型和视觉探索文档。后续可按需要整理到更细目录，但本次初始化不迁移既有内容。

## 说明类文档

- `doc/README.md`：说明类文档入口。
- `doc/repository-analysis.md`：当前仓库结构、分支、技术栈和维护边界分析。

## 产品与技术文档

- `podcast-artist-concept.md`：创作工具构想。
- `podcast-artist-prd-draft.md`：PRD 草案。
- `podcast-artist-tech-selection.md`：技术选型与调研。
- `podcast-artist-local-file-contract.md`：本地项目文件契约。
- `podcast-artist-dark-ui-style-exploration.md`：深色界面风格探索。

## Mockup

- `mockups/podcast-artist-dark-ui-sketches.html`：静态深色界面草图。
- `mockups/podcast-artist-dark-ui-concept.png`：早期视觉概念图。
- `mockups/podcast-artist-dark-ui-concept-premium.png`：早期高级感视觉概念图。

## 计划与规范入口

- `plan/README.md`：计划类文档入口，当前不包含具体计划文档。
- `spec/README.md`：规范类文档入口，当前不包含具体规范文档。

## 更新规则

- 每层 README 同时承担“用途说明 + 索引”的作用。
- 新增、删除或移动文档后，同步更新对应 README 索引。
- 仓库内路径使用相对路径，不写本机绝对路径、临时路径或 Agent 运行路径。
- 本次初始化只建立计划类入口，不默认创建下一步计划、路线图、重构计划或测试计划。
- 本次初始化只建立规范类入口，不默认制定代码规范、接口规范、测试规范、分支规范或 Agent 协作规范。
