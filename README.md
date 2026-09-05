# PPT Skill Based on Presentations

这是 `presentation-polish` skill 的源码仓库。它是
`presentations:Presentations` 之后的二次审校层，负责对 PowerPoint 进行
诊断、视觉返工、公式检查、渲染和交付前验证；底层 PPTX 创作仍由
Artifact Tool / Presentations skill 完成。

## 目录

```text
skills/presentation-polish/
  SKILL.md
  agents/openai.yaml
  references/
  scripts/
scripts/sync_skill_to_github.ps1
```

`skills/presentation-polish/` 应保持为可直接安装的 skill 目录，安装时使用
仓库子路径 `skills/presentation-polish`。

## 本地来源与同步

当前 Codex 安装位置默认是：

```text
%USERPROFILE%\.codex\skills\presentation-polish
```

每次修改本地 skill 后，在仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync_skill_to_github.ps1 `
  -CommitMessage "polish: describe the change"
```

脚本会把本地 skill 同步到 `skills/presentation-polish/`，排除
`__pycache__` 和编译产物，执行 Git commit，并推送到 `origin/main`。它优先
使用显式 `-GitProxy`、Git 已有代理配置或 Windows 系统代理；不会把代理写入
全局 Git 配置。若只想同步但暂不推送，可使用 `-SkipPush`。

在后续对 skill 的每一轮优化中，流程应保持为：

```text
修改本地 skill → quick_validate → 必要的脚本/产物测试 → sync_skill_to_github.ps1
```

## 验证

```powershell
python -X utf8 $env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py `
  .\skills\presentation-polish
```

公式相关诊断脚本位于：

```text
skills/presentation-polish/scripts/equation_diagnostics.py
```

它只读检查 PPTX，不会把普通文本公式误报为 Office Math；当前运行时没有
可靠的原生 Office Math API 时，会明确报告 `NATIVE_MATH_UNAVAILABLE`。

科研/数学类公式还提供一个不依赖本地 TeX 的远程 SVG 资产管线：

```text
skills/presentation-polish/scripts/remote_latex_renderer.mjs
skills/presentation-polish/scripts/test_remote_latex_renderer.mjs
skills/presentation-polish/scripts/build_remote_latex_test_deck.mjs
```

远程上传默认关闭，只有显式设置 `allowRemoteEquationRendering: true` 才会
发送单条 LaTeX 源；默认优先返回经过 viewBox、路径、外部资源和 raster 检查
的 SVG。它仍然是 Level 1 `vector_equation`，不是 Office Math 字符对象。实际
 provider、缓存、超时、重试和降级策略见 skill 的
`references/equation-strategy.md`。
