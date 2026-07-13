# Podcast Artist 语义视觉 Token 修正实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有绿色皮肤收回为冷中性石墨界面，使铂白承担静态强调、绿色只承担动态信号，并修正中文排版与时间线视觉层级。

**Architecture:** 以 `src/renderer/src/styles.css` 的语义 token 为唯一颜色入口，先统一基础表面、排版和静态控件，再单独修正时间线。renderer 只给播放按钮增加由现有 `isTimelinePlaying` 驱动的 `aria-pressed` 状态，让 CSS 能区分静止和播放；不改事件、数据流或组件结构。

**Tech Stack:** React 19、TypeScript 6、CSS custom properties、OKLCH `color-mix()`、Vitest 4、Electron Vite 5、现有浏览器 mock。

## Global Constraints

- 不创建 worktree；直接在当前仓库分支执行，保留预先存在且未跟踪的 `.claude/`，不暂存、不修改。
- 只修正视觉语义，不改变页面布局、侧边栏宽度、面板层级、轨道高度或信息密度。
- 不改业务事件、快捷键、持久化、任务状态流或音频编辑逻辑。
- 不引入主题切换、外部字体包、图标资产或新依赖。
- premium mockup 只作为色彩、层级和气质参照，不做像素级布局复刻。
- `--signal` 只用于运行、播放、进度、时间线选中波形和拖放可放置等动态状态；`--ok`、`--warn`、`--danger`、`--reference` 只用于各自明确语义。
- 文稿阅读区保持 `1rem` 字号和 `1.92` 行高；时间线 clip 保持 76px，轨道保持 124px。
- 不新增依赖 CSS 源码字符串的测试；样式通过静态审计、现有回归测试、生产构建和浏览器视觉验收共同验证。

## File Map

- Modify: `src/renderer/src/styles.css` — 基础 token、中文字体、静态控件、内容表面和时间线全部视觉规则。
- Modify: `src/renderer/src/App.tsx:1505-1513` — 给现有播放按钮暴露 `aria-pressed={isTimelinePlaying}`，不改变播放逻辑。
- Reference: `docs/superpowers/specs/2026-07-14-semantic-visual-tokens-design.md` — 已批准的颜色职责、排版和验收边界。
- Reference: `docs/mockups/podcast-artist-dark-ui-concept-premium.png` — 只用于视觉气质对照。

---

### Task 1: 中性基础 token、中文排版与静态控件

**Files:**
- Modify: `src/renderer/src/styles.css:1-1224`

**Interfaces:**
- Consumes: 现有 CSS custom properties、类名和状态类。
- Produces: 冷中性基础 token、中文优先字体栈、铂白静态强调，以及不带绿色倾向的项目/设置/文稿界面。

- [ ] **Step 1: 记录修改前基线并保存同尺寸截图**

Run:

```bash
npm test
npm run build
npx vite preview --outDir out/renderer --host 127.0.0.1 --port 4519 --strictPort
```

Expected: Vitest 显示 8 个测试文件、47 个测试通过；production build 退出 0；浏览器 mock 可从 `http://127.0.0.1:4519` 打开。

使用固定 1440×1000 视口保存修改前截图：

```text
/tmp/podcast-artist-style-before-projects.png
/tmp/podcast-artist-style-before-settings.png
/tmp/podcast-artist-style-before-documents.png
/tmp/podcast-artist-style-before-timeline.png
```

项目列表和设置页直接截图。创建并打开一个项目后，分别进入文稿/资料任务和剪辑页；剪辑页导入预览音频并放入轨道后截图。关闭 preview 服务后继续修改。

- [ ] **Step 2: 记录修改前绿色静态使用与黄绿色硬编码**

Run:

```bash
rg -n -- 'var\(--signal(?:-soft|-fill)?\)|oklch\([^)]*95\)|#(?:080a08|101410|151a15|1b211b|202820|0b0e0b|0d100d|f4f7ec|aab2a1|788173|303a30|465344)' src/renderer/src/styles.css
```

Expected: 命中品牌、导航、按钮、输入焦点、标题、素材选中、预览提示、内容表面和时间线；这是本任务需要消除的视觉债，不应把命中结果直接当成允许列表。

- [ ] **Step 3: 替换基础 token 与中文字体栈**

把 `:root` 的颜色与字体部分替换为：

```css
:root {
  color-scheme: dark;
  --bg: #0b0e14;
  --surface: #12161f;
  --surface-2: #171c27;
  --surface-3: #1c222e;
  --surface-elevated: #232a37;
  --ink: #0e1118;
  --line: rgb(73 82 100 / 0.52);
  --line-strong: rgb(100 112 133 / 0.6);
  --text: #e6eaf2;
  --muted: #a6adbb;
  --muted-2: #70798a;
  --border: #252b36;
  --border-strong: #384151;
  --accent: #d8dee9;
  --signal: oklch(0.78 0.085 142);
  --signal-soft: oklch(0.36 0.05 142 / 0.32);
  --signal-fill: oklch(0.24 0.028 142);
  --reference: oklch(0.76 0.026 300);
  --reference-soft: oklch(0.48 0.022 300 / 0.24);
  --warn: #e5c76b;
  --danger: #e07770;
  --ok: #84d597;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --font-caption: 0.75rem;
  --font-small: 0.8125rem;
  --font-body: 0.875rem;
  --font-subhead: 0.9375rem;
  --font-title: 1rem;
  --font-page: 1.5rem;
  font-family:
    "OPPO Sans", "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", ui-sans-serif, system-ui,
    -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

把 body 和 sidebar 的绿色黑底改成 token：

```css
body {
  margin: 0;
  min-width: 1120px;
  background:
    linear-gradient(180deg, var(--surface) 0%, var(--bg) 280px),
    var(--bg);
  color: var(--text);
  font-size: var(--font-body);
  line-height: 1.5;
  font-weight: 400;
  font-kerning: normal;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-5);
  background: var(--bg);
  border-right: 1px solid var(--border);
}
```

- [ ] **Step 4: 修正品牌、导航、小标题和中文字段排版**

用以下规则替换现有对应块：

```css
.loading-mark,
.brand-mark {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid color-mix(in oklch, var(--accent), transparent 58%);
  background: color-mix(in oklch, var(--accent), transparent 90%);
  color: var(--accent);
}

.nav button.active,
.nav button:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
  color: var(--accent);
}

.project-back-button:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
  color: var(--accent);
}

.eyebrow,
.panel-kicker {
  color: var(--muted);
  font-size: var(--font-caption);
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
}

dt {
  color: var(--muted);
  font-size: 0.6875rem;
  text-transform: none;
  letter-spacing: 0;
}
```

把 `.markdown-reader.manuscript-reader` 的字体和文字色改为：

```css
color: color-mix(in oklch, var(--text), var(--muted) 18%);
font-family:
  "OPPO Sans", "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC",
  "Hiragino Sans GB", "Microsoft YaHei", ui-sans-serif, system-ui,
  -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
font-size: 1rem;
line-height: 1.92;
```

- [ ] **Step 5: 把主次按钮、输入焦点和普通选中态改为静态强调**

保留现有尺寸、布局和 transition 声明，只把对应颜色规则改成：

```css
.field input,
.field select,
.field textarea,
.secondary-button {
  background: var(--bg);
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: color-mix(in oklch, var(--accent), transparent 36%);
}

.primary-button,
.secondary-button {
  border-radius: 8px;
  font-size: var(--font-small);
  font-weight: 550;
  outline: none;
}

.primary-button {
  border-color: color-mix(in oklch, var(--accent), transparent 32%);
  background: var(--accent);
  color: var(--ink);
}

.primary-button:hover:not(:disabled) {
  border-color: var(--text);
  background: color-mix(in oklch, var(--accent), white 10%);
  color: var(--ink);
}

.primary-button:focus-visible,
.secondary-button:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent), transparent 78%);
}

.secondary-button {
  border-color: var(--border);
  background: var(--bg);
  color: var(--muted);
}

.secondary-button:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: var(--surface-2);
  color: var(--text);
}

.modal-actions .secondary-button:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: var(--surface-2);
  color: var(--text);
}

.modal-actions .primary-button {
  border-color: color-mix(in oklch, var(--accent), transparent 32%);
  background: var(--accent);
  color: var(--ink);
}

.asset-row.selected {
  border-color: color-mix(in oklch, var(--accent), transparent 48%);
  background: var(--surface-2);
}

.notice.preview {
  border-color: color-mix(in oklch, var(--reference), transparent 65%);
  color: var(--reference);
}
```

不要删除 `.task-status.running` 的信号绿，也不要把成功、警告、失败或引用状态改成铂白。

- [ ] **Step 6: 把内容区域的黄绿色硬编码收回语义表面**

在 `styles.css` 中按以下精确映射替换；只替换背景/文字用途，不替换 `--signal`、`--reference` 等明确语义色：

```text
#0b0e0b                         -> var(--bg)
#0d100d                         -> var(--bg)
oklch(0.115 0.006 95)          -> var(--bg)
oklch(0.12 0.006 95)           -> var(--bg)
oklch(0.13 0.006 95)           -> var(--surface)
oklch(0.145 0.006 95)          -> var(--surface)
oklch(0.155 0.007 95)          -> var(--surface)
oklch(0.17 0.007 95)           -> var(--surface-2)
oklch(0.18 0.007 95)           -> var(--surface-2)
oklch(0.215 0.008 95)          -> var(--surface-3)
oklch(0.88 0.008 95)           -> color-mix(in oklch, var(--text), var(--muted) 18%)
oklch(0.94 0.008 95)           -> var(--text)
```

引用色混合中的旧表面也要改为对应 token，例如：

```css
.task-result-candidate {
  background: color-mix(in oklch, var(--reference-soft), var(--surface) 76%);
}

.task-panel .span-2 textarea {
  background: color-mix(in oklch, var(--reference-soft), var(--bg) 76%);
}
```

- [ ] **Step 7: 验证第一阶段并提交**

Run:

```bash
rg -n -- 'oklch\([^)]*95\)|#(?:080a08|101410|151a15|1b211b|202820|0b0e0b|0d100d|f4f7ec|aab2a1|788173|303a30|465344)' src/renderer/src/styles.css
npm test
npm run build
git diff --check
```

Expected: 第一个 `rg` 无输出；8 个 Vitest 文件、47 个测试通过；production build 退出 0；`git diff --check` 退出 0。

检查 `var(--signal...)` 命中：品牌、导航、按钮、输入焦点、小标题、素材静态选中和 `.notice.preview` 不得再出现；`.task-status.running` 与尚未进入 Task 2 的时间线动态规则可以保留。

```bash
git add src/renderer/src/styles.css
git commit -m "修正中性视觉 token 与中文排版"
```

---

### Task 2: 时间线中性 clip、动态播放信号与完整视觉验收

**Files:**
- Modify: `src/renderer/src/App.tsx:1505-1513`
- Modify: `src/renderer/src/styles.css:1215-1747`

**Interfaces:**
- Consumes: renderer 已有 `isTimelinePlaying: boolean`、现有 `.selected`、`.drop-ready` 和 `.active` 状态类。
- Produces: 播放按钮 `aria-pressed` 状态、中性时间线表面、银灰普通波形、绿色选中波形和无光晕播放头。

- [ ] **Step 1: 暴露播放按钮的现有状态，不改播放行为**

把播放按钮开头改为：

```tsx
<button
  aria-pressed={isTimelinePlaying}
  className="timeline-transport-button"
  type="button"
  onClick={handleToggleTimelinePlayback}
  disabled={!canPlayTimeline || isAudioBusy}
  title={isTimelinePlaying ? '暂停' : '播放'}
>
```

`handleToggleTimelinePlayback`、`isTimelinePlaying` 和按钮内容保持原样。这个属性既提供可访问状态，也给 CSS 提供 `[aria-pressed="true"]` 选择器。

- [ ] **Step 2: 中性化时间线工具栏和静态选中状态**

保留现有尺寸和布局，用以下颜色规则替换对应块：

```css
.timeline-transport-button {
  border: 1px solid var(--line-strong);
  background: var(--surface-2);
  color: var(--muted);
}

.timeline-transport-button:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: var(--surface-3);
  color: var(--text);
}

.timeline-transport-button[aria-pressed="true"] {
  border-color: color-mix(in oklch, var(--signal), transparent 30%);
  background: color-mix(in oklch, var(--signal-fill), var(--surface-2) 24%);
  color: var(--signal);
}

.clip-trim-toolbar button:hover:not(:disabled),
.timeline-zoom-button:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: var(--surface-3);
  color: var(--text);
}

.audio-asset-chip.selected {
  border-color: color-mix(in oklch, var(--accent), transparent 42%);
  background: var(--surface-3);
  color: var(--text);
}

.audio-asset-chip:focus-visible,
.timeline-track-name-input:focus-visible {
  border-color: color-mix(in oklch, var(--accent), transparent 34%);
  outline-color: color-mix(in oklch, var(--accent), transparent 34%);
}

.timeline-track-icon-button.active {
  border-color: color-mix(in oklch, var(--accent), transparent 42%);
  color: var(--accent);
}
```

保留 range 的 `accent-color: var(--signal)` 派生值，因为滑块当前值属于动态进度信号。保留 `.timeline-lane.drop-ready` 的信号绿反馈。

- [ ] **Step 3: 删除播放头光晕**

把两个伪元素替换为：

```css
.timeline-playhead::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 1px;
  background: var(--signal);
  content: "";
}

.timeline-playhead::after {
  position: absolute;
  top: -6px;
  left: -3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--signal);
  content: "";
}
```

两个块都不得包含 `box-shadow`。

- [ ] **Step 4: 中性化 clip 并让波形成为主视觉**

用以下完整颜色和内部布局规则替换对应 clip 块，保留 `.timeline-clip-group` 的 76px 高度：

```css
.timeline-clip {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  text-align: left;
}

.timeline-clip.selected {
  border-color: color-mix(in oklch, var(--signal), transparent 18%);
  background: var(--surface-3);
  box-shadow: 0 10px 22px color-mix(in oklch, black, transparent 70%);
}

.timeline-clip:focus-visible {
  outline: 2px solid color-mix(in oklch, var(--accent), transparent 18%);
  outline-offset: 2px;
}

.timeline-clip-label {
  position: relative;
  z-index: 1;
  display: inline-block;
  max-width: calc(100% - 36px);
  margin: 6px 32px 0 var(--space-2);
  padding: 2px 6px;
  overflow: hidden;
  border-radius: 4px;
  background: color-mix(in oklch, var(--surface-elevated), transparent 18%);
  color: var(--text);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-clip-waveform {
  position: absolute;
  inset: 28px 10px 8px;
  display: flex;
  align-items: center;
  gap: 1px;
  opacity: 0.94;
}

.timeline-clip-waveform span {
  flex: 1 1 0;
  min-width: 1px;
  padding: 0;
  border-radius: 999px;
  background: color-mix(in oklch, var(--muted), transparent 18%);
}

.timeline-clip.selected .timeline-clip-waveform span {
  background: var(--signal);
}
```

不要给 clip、波形或播放头增加绿色阴影。删除按钮继续使用 `--danger`。

- [ ] **Step 5: 静态审计允许的信号绿范围**

Run:

```bash
rg -n -C 2 -- 'var\(--signal(?:-soft|-fill)?\)' src/renderer/src/styles.css
rg -n -- 'box-shadow:.*var\(--signal' src/renderer/src/styles.css
```

Expected: 第一条只命中 `.task-status.running`、播放按钮按下态、range 当前值、播放头、`.timeline-lane.drop-ready`、选中 clip 边界和选中波形等明确动态状态；品牌、导航、普通按钮、普通 clip、未选中波形、普通焦点和静态素材选中不得命中。第二条无输出。

- [ ] **Step 6: 运行完整自动化验证**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: 8 个 Vitest 文件、47 个测试通过；TypeScript、main、preload 和 renderer production build 全部退出 0；`git diff --check` 退出 0。

- [ ] **Step 7: 运行浏览器 mock 视觉与交互验收**

Run:

```bash
npx vite preview --outDir out/renderer --host 127.0.0.1 --port 4519 --strictPort
```

使用与 Task 1 相同的 1440×1000 视口逐页验收，并保存：

```text
/tmp/podcast-artist-style-after-projects.png
/tmp/podcast-artist-style-after-settings.png
/tmp/podcast-artist-style-after-documents.png
/tmp/podcast-artist-style-after-timeline.png
```

检查以下行为：

1. 项目页和设置页基础背景、面板、导航、按钮与焦点都是冷中性或铂白，没有大面积绿色。
2. 文稿小标题、中文字段名没有强制大写或宽字距；正文保持 `1rem / 1.92`。
3. 启动资料任务时 `running` 为信号绿，完成为成功色，候选资料为银紫色。
4. 时间线普通 clip 为中性表面、普通波形为银灰；选中后只有细绿边和波形变绿。
5. 播放按钮静止时中性，播放时 `aria-pressed="true"` 且变绿；播放头没有光晕。
6. 键盘焦点、禁用态、删除危险态、拖放可放置反馈仍可辨认。
7. 执行“播放头切开 → 右段选中 → Delete 波纹删除”，确认交互与布局未回归。
8. 对照修改前截图，侧边栏、面板、轨道和 clip 外部尺寸没有变化。

Expected: 四类页面符合设计规格；控制台没有新增错误；`S` 切割、Delete 波纹删除和任务状态流保持正常。关闭 preview 服务。

- [ ] **Step 8: 检查范围并提交时间线修正**

Run:

```bash
git status --short
git diff --check
git diff -- src/renderer/src/App.tsx src/renderer/src/styles.css
```

Expected: 本任务只修改 `App.tsx` 的播放按钮 `aria-pressed` 和 `styles.css` 的时间线视觉规则；`.claude/` 仍为未跟踪且未修改；无布局、数据流或业务逻辑改动。

```bash
git add src/renderer/src/App.tsx src/renderer/src/styles.css
git commit -m "收敛时间线动态信号与波形层级"
```

## Self-Review

- Spec coverage: Task 1 覆盖冷中性 token、静态强调、中文字体、小标题字距、内容表面和语义状态；Task 2 覆盖播放状态、工具栏、clip、波形、播放头、焦点、拖放、截图和完整回归验证。
- Deliberate exclusions: 没有主题系统、外部字体、布局重构、新图标、业务状态或持久化改动；`App.tsx` 只新增现有播放状态的可访问属性。
- Placeholder scan: 没有占位词、未展开的“类似处理”或未指定的验证；每个代码步骤都给出目标代码或精确映射。
- Interface consistency: `isTimelinePlaying` 始终是现有 boolean；DOM 只新增 `aria-pressed`，CSS 始终使用 `.timeline-transport-button[aria-pressed="true"]`；signal/reference/ok/warn/danger 职责与设计规格一致。
- Verification consistency: Task 1 与 Task 2 都运行现有测试和 production build；最终浏览器验收同时覆盖视觉、可访问状态和上一轮切割/删除闭环。
