# presentation-polish

`presentation-polish` 是 `presentations:Presentations` 之后的 PowerPoint 二次审校层，面向技术、学术和科研类演示文稿。它负责对已有草稿进行结构诊断、视觉返工、公式检查、模板继承、渲染复核和交付前 QA；PPTX 的创建仍由 Presentations skill 通过 Artifact Tool 完成。

它解决的是“内容已经做出来，但还不够清楚、稳定、可检查”的问题：每页是否只有一个主张、阅读顺序是否明确、字体和数学符号是否统一、公式是否被裁切或错误降级、图表和流程图是否保持可编辑，以及最终导出的文件是否经得起渲染检查。

```text
Presentations skill / Artifact Tool → draft.pptx
                                      ↓
          audit → render → diagnose → repair → render / QA
                                      ↓
                                  final.pptx
```

## 能力范围

| 领域 | 提供的能力 |
| --- | --- |
| 结构审计 | 读取 PPTX 包、统计页数、尺寸、字体、文本对象、分组、连接符、表格、图表和图片，并输出可追踪的 JSON 报告 |
| 视觉与布局 | 检查安全边距、标题和正文层级、文本溢出、公式换行、连接器路径、对比度和阅读顺序；必须结合渲染结果做最终判断 |
| 公式与字体 | 识别公式样文本、复杂度、字体策略、原生 Office Math、SVG/栅格候选，并给出明确的可编辑性等级和诊断码 |
| 模板优先 | 先检查并渲染模板，再导入或复制模板页进行编辑，保留尺寸、母版、布局关系、页眉页脚、Logo、主题色和留白 |
| 原生编辑性 | 流程图使用形状和连接器，表格使用原生表格，图表保留可编辑数据；不把整页或关键证据压成一张图片 |
| 远程公式资产 | 在明确允许上传公式源码时，把标准 LaTeX 渲染为经过安全检查的 SVG；支持缓存、去重、有限并发、重试和可说明的降级 |

## 设计边界

本 skill 是审校和修复层，不是第二个 PPTX 创作引擎。最终编辑应通过 Presentations skill 的 Artifact Tool 完成；不要用 `python-pptx`、PptxGenJS、LibreOffice UNO 或手写 OOXML 替代该工作流，也不要手写 OMML。包级 OOXML 检查只用于只读诊断，不能单独证明视觉结果或目标计算机上的字体替换情况。

审校时先保证阅读路径，再添加装饰。推荐的页面约束是：每页一个主张、一个视觉锚点和明确的阅读顺序；正文通常不小于 18 pt，页标题不小于 32 pt，封面标题不小于 42 pt，图示标签通常不小于 14 pt，主公式通常为 24–30 pt、紧凑公式至少 18–22 pt。控制主字体数量，按语义角色选择布局，不连续堆叠相同的卡片网格。

## 安装

### 在 Codex 中安装

使用标准 skill 安装器安装仓库中的 `skills/presentation-polish` 子目录：

```powershell
python -X utf8 "$env:USERPROFILE\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py" `
  --url "https://github.com/42zwb/PPT-skill-based-on-Presentation/tree/main/skills/presentation-polish"
```

安装目标默认为：`%USERPROFILE%\.codex\skills\presentation-polish`。安装后，在新的 Codex 对话中使用 `$presentation-polish`，例如：

```text
使用 $presentation-polish 审校 deck.pptx，先做基线审计，再修复公式、字体和布局，并报告仍需人工渲染确认的项目。
```

### 从源码仓库安装

如果已经克隆本仓库，也可以按子路径安装：

```powershell
python -X utf8 "$env:USERPROFILE\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py" `
  --repo 42zwb/PPT-skill-based-on-Presentation `
  --path skills/presentation-polish
```

安装器会校验 `SKILL.md`，并在目标目录已存在时停止，以免静默覆盖已有 skill。

## 快速开始

对已有 PPTX，先做只读基线检查，再进入渲染和修复：

```powershell
$deck = ".\deck.pptx"

# 结构、字体、对象和尺寸审计
python -X utf8 .\skills\presentation-polish\scripts\audit_presentation.py $deck

# 公式复杂度、字体策略、原生数学对象和 SVG/栅格候选
python -X utf8 .\skills\presentation-polish\scripts\equation_diagnostics.py `
  $deck --equation-mode auto

# 远程 LaTeX helper 的策略、缓存、重试和 SVG 安全检查（使用测试替身，不上传真实公式）
node .\skills\presentation-polish\scripts\test_remote_latex_renderer.mjs
```

完整 QA 应按以下顺序执行：

1. 读取 `presentations:Presentations` skill 和当前任务所需的参考文件；如果有模板，先检查并渲染全部模板页。
2. 对源文件建立基线：运行 `audit_presentation.py`，检查 PPTX 包和布局，并渲染每一页；同时查看拼图和单页大图。
3. 先整理内容和语义分组，再统一字体、字号、颜色、间距、边距、线宽、圆角、阴影和公式样式。
4. 按语义角色选择布局，使用原生形状、连接器、表格和图表；不要把流程图或整页扁平化成图片。
5. 对每个公式分类、修复并记录来源和可编辑性等级；远程渲染失败时遵循明确的保留、文本降级或报错策略。
6. 重新渲染修改后的页面，执行结构检查、公式诊断、字体检查、包完整性检查和逐页视觉 QA，再交付新的输出文件名。

`audit_presentation.py` 和 `equation_diagnostics.py` 都是只读工具。它们不能替代渲染检查；裁切、基线错位、光学留白、实际字体替换和连接器是否穿过文本，必须通过渲染后的页面确认。

## 公式可编辑性契约

每个公式样对象都必须带有明确等级；“可编辑公式”这一说法本身不够精确。

| 等级 | 类型 | 能编辑什么 | 使用条件 |
| ---: | --- | --- | --- |
| 3 | `native_math` | 结构化 Office Math 内容 | 只有当前 Artifact Tool 运行时能创建并在导出、渲染后保留时才使用 |
| 2 | `editable_math_text` | 文本字符、字体、字号、位置和文本运行 | 简单或中等复杂度公式；原生数学对象不可用时的默认方案 |
| 1 | `vector_equation` | SVG/矢量的缩放、位置、颜色和路径 | 有可靠源码且复杂公式使用矢量能显著改善视觉保真度时使用；不是字符可编辑的 Office Math |
| 0 | `raster_equation` | 只能编辑图片框 | 应避免；若无法避免，必须标记 `EQUATION_RASTER_FALLBACK` 或 `EQUATION_RASTERIZED` 并披露限制 |

已有 deck 默认使用 `equation_mode="auto"`：保留稳定的 Level 3；对读得好的简单公式保留单个 Level 2 文本对象；复杂且有可信 LaTeX 源码时才考虑 Level 1。学术或科研新 deck 推荐使用 `equationMode: "remote_latex"`，但远程上传的安全默认值是 `allowRemoteEquationRendering: false`，必须由调用方显式开启。

## 远程 LaTeX → SVG

远程管线只生成公式资产，不负责创建或编辑 PPTX。启用后只发送规范化后的公式源码、显示模式和字号提示，不发送整页、整份 deck、演讲者备注、图片或用户标识。默认 provider 为 `auto`：未配置自定义 endpoint 时使用已验证的 CodeCogs SVG provider；自定义 endpoint 必须使用 HTTPS。

```js
const result = await renderLatexRemoteToSvg({
  latex: "\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}",
  displayMode: true,
  fontSize: 28,
  equationProvider: "auto",
  allowRemoteEquationRendering: true,
  fallbackOnRemoteFailure: "keep_existing",
});
```

helper 会拒绝危险 TeX 命令和不安全 SVG，检查 `viewBox`、`path/use`、字体依赖、外部资源、白色背景和栅格 `<image>` 内容，并保留 provider、源码、缓存键和诊断信息。它支持以下任务级环境变量：`REMOTE_LATEX_PROVIDER`、`REMOTE_LATEX_ENDPOINT`、`REMOTE_LATEX_TIMEOUT_MS`、`REMOTE_LATEX_MAX_RETRIES`、`REMOTE_LATEX_CONCURRENCY`；设置 `REMOTE_LATEX_DISABLED=1` 可强制阻断网络请求。SVG 资产始终是 Level 1 `vector_equation`，不能描述成字符可编辑或原生 Office Math。

常见状态包括 `REMOTE_LATEX_RENDERED`、`REMOTE_LATEX_CACHE_HIT`、`REMOTE_LATEX_TIMEOUT`、`REMOTE_LATEX_HTTP_ERROR`、`REMOTE_LATEX_INVALID_SVG`、`REMOTE_LATEX_FALLBACK`、`REMOTE_LATEX_DISABLED` 和 `EQUATION_RASTER_FALLBACK`。完整诊断词汇和 provider 约束见 [`equation-strategy.md`](skills/presentation-polish/references/equation-strategy.md)。

## 模板优先模式

提供 `.pptx` 模板时，最终 deck 必须从模板或模板 starter 导入而来：先渲染和识别封面、正文、对比、图片、章节和结尾等角色，再复制合适的源页并编辑其内容。保留模板尺寸、母版和布局关系、重复的页眉页脚、Logo、主题色和有意保留的留白；新内容只能放入模板的内容区域，不能用整页白色矩形盖住 chrome，也不能把模板截图当作背景。

在 Windows 上，如果官方模板 helper 依赖 Unix `unzip`，使用仓库提供的 `inspect_template_reference.mjs` 和 `prepare_template_starter_windows.mjs`。最终构建脚本应明确导入 `template-starter.pptx`（或原模板），并在 manifest 或演讲者备注中记录来源模板及页角色映射。

## 脚本索引

| 路径 | 作用 | 网络 / 写入边界 |
| --- | --- | --- |
| `skills/presentation-polish/scripts/audit_presentation.py` | PPTX 结构与质量旗标审计 | 只读；不修改 PPTX |
| `skills/presentation-polish/scripts/equation_diagnostics.py` | 公式复杂度、字体、原生数学、矢量和栅格候选诊断 | 只读；输出 JSON |
| `skills/presentation-polish/scripts/remote_latex_renderer.mjs` | `renderLatexRemoteToSvg()` 与 `renderLatexBatch()` 公式资产 helper | 仅在显式允许时访问配置的 HTTPS provider；写入任务缓存 |
| `skills/presentation-polish/scripts/test_remote_latex_renderer.mjs` | 测试缓存去重、重试、超时、禁用策略和 SVG 安全校验 | 使用 mock fetch；不访问真实 provider |
| `skills/presentation-polish/scripts/build_equation_test_deck.mjs` | 构建四页公式诊断回归 fixture | 需要 Artifact Tool；输出由调用方指定 |
| `skills/presentation-polish/scripts/build_remote_latex_test_deck.mjs` | 真实 provider 的远程公式回归 fixture | 需要 Artifact Tool，并须显式允许远程公式源码上传 |
| `skills/presentation-polish/scripts/inspect_template_reference.mjs` | Windows 安全的模板只读检查 | 只读；需要 Artifact Tool |
| `skills/presentation-polish/scripts/prepare_template_starter_windows.mjs` | 从模板页生成 Windows 安全 starter | 通过 Artifact Tool 输出 starter 和 manifest |
| `scripts/sync_skill_to_github.ps1` | 将本机安装的 skill 同步回仓库并提交、推送 | 会改写仓库中的 skill 文件；默认推送到 `origin/main` |

## 本地开发与同步

仓库中的 `skills/presentation-polish/` 应保持为可直接安装的 skill 目录。修改本机安装版本后，先验证，再同步：

```powershell
# 1. 检查 skill 元数据和目录结构
python -X utf8 "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" `
  .\skills\presentation-polish

# 2. 运行无网络的远程公式 helper 回归测试
node .\skills\presentation-polish\scripts\test_remote_latex_renderer.mjs

# 3. 将本机安装目录同步到仓库，并提交、推送到 origin/main
powershell -ExecutionPolicy Bypass -File .\scripts\sync_skill_to_github.ps1 `
  -CommitMessage "polish: describe the change"
```

只想检查复制结果而不提交，可加 `-DryRun`；只提交本地而暂不推送，可加 `-SkipPush`。脚本默认从 `%USERPROFILE%\.codex\skills\presentation-polish` 读取源目录，也可以传入 `-SourceSkillPath`、`-Branch` 或显式的 `-GitProxy`。它会排除 `__pycache__`、`.pyc` 和 `.pyo`，并清理仓库 skill 目录中已不存在的文件。

## 目录结构

```text
.
├─ skills/
│  └─ presentation-polish/
│     ├─ SKILL.md
│     ├─ agents/openai.yaml
│     ├─ references/
│     └─ scripts/
└─ scripts/
   └─ sync_skill_to_github.ps1
```

参考文件按任务取用：`authoring-and-layout-rules.md` 负责从零构建或大幅重构，`typography-and-math.md` 负责混排和公式，`equation-strategy.md` 负责公式等级与 SVG 管线，`template-following.md` 负责模板继承，`qa-checklist.md` 负责导出前检查，`issue-audit-reinforcement-learning.md` 收录强化学习 deck 的具体问题和修复依据。

## 已知限制

- 结构审计和 XML 诊断不能证明目标机器实际安装了某字体，也不能证明页面在视觉上没有裁切、错位或溢出；必须渲染并逐页查看。
- 当前运行时若没有可靠的原生 Office Math API，应报告 `NATIVE_MATH_UNAVAILABLE`，并把文本或 SVG fallback 的等级写清楚。
- 远程公式服务属于外部依赖；超时、HTTP 错误、无效 SVG、隐私策略禁用和 provider 变更都可能触发降级。对已有 deck 默认保留现状，对严格的新公式构建可选择报错。
- 仓库不把 PPTX、PDF、图片和渲染产物作为源码提交；这些文件被 `.gitignore` 排除，交付时请单独保存并记录验证结果。
