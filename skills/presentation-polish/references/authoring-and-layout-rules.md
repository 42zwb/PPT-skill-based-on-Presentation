# Authoring and Layout Rules

本参考文件用于从零生成或重构一套演示文稿。它补充 `presentations:Presentations` 的 Artifact Tool 规则，重点解决“对象都在，但成品不稳”的问题。

## Build order

1. Write a slide-role map. For every slide, state one claim, one audience question, one visual anchor, and one intended reading path.
2. Define tokens before adding content: canvas, safe margin, grid unit, typefaces, type scale, colors, border/stroke, radius, shadow, icon size, and formula zone.
3. Place the title and the main visual anchor first. If the slide only works after several small labels are added, the composition is not ready.
4. Add supporting labels directly next to their owner. Prefer a single explanatory sentence or callout over several tiny fragments.
5. Create native diagrams and data objects. Group semantic units where possible, but keep nodes, labels, connectors, tables, charts, and formulas independently selectable.
6. Export an early draft and render it. Fix geometry and hierarchy at source level, then export a new candidate and repeat.

## Layout roles

Use a role sequence that matches the story rather than a fixed page template.

| Role | Useful composition | Avoid |
| --- | --- | --- |
| Cover | Large title plus one hero system or scene | Many badges, folios, or decorative numbers |
| Problem framing | One large scenario with a short question | Two equal card panels plus a paragraph |
| Interaction loop | Central cycle with four to five nodes | A prose list of the same steps |
| System map | One hub with labeled relations and restrained depth | Floating labels without connectors |
| State graph | Native nodes, edge labels, and probability/reward annotations | A screenshot of a graph |
| Timeline | One horizontal time axis with progressive visual emphasis | Several unrelated pills above and below |
| Equation visual | One large equation, one visual interpretation, one callout | Formula hidden inside a small card |
| Comparison | Shared coordinate system or two-lane path | Two panels with unrelated internal layouts |
| Matrix plus chart | Matrix explains the dimensions; native chart reinforces one insight | Chart with no unit, scale, or data disclosure |
| Synthesis map | One main route with three controlled branches | A dense taxonomy of tiny tags |

## Geometry tokens

- Use 16:9 and keep a safe margin of roughly 0.55–0.7 in on all edges unless a full-bleed visual is intentional.
- Use a base spacing unit such as 8 px or 0.08 in; align titles, diagrams, and callouts to it.
- Define one title baseline and one body baseline per slide family. Do not center-align blocks that should be read as a sequence.
- Keep a formula box wider than the longest expected equation. A single long equation should have a dedicated zone, not share a narrow card with a paragraph.
- Keep connectors outside text boxes. Start and end them on node edges, use a small fixed gap, and avoid routing through labels.
- Use `autoFit: "shrinkText"` only as a last guard. It must not be the mechanism that makes an under-sized text box appear to fit.
- Prefer one large visual anchor and a few supporting objects over many equal-weight shapes.

## Object organization

Use a naming convention in source code even if the export format does not preserve every name:

```text
slide03_rl_compare_title
slide03_rl_compare_left_lane
slide03_rl_compare_right_lane
slide03_rl_compare_feedback_connector
slide03_rl_compare_table
```

For a diagram, group the node, its internal label, and its semantic ornament. Keep cross-group connectors independent so they can be rerouted. Do not group a whole slide merely to hide a layout problem.

## Color and depth

Choose semantic roles such as background, surface, text, muted text, primary action, reward/positive, caution, and model/structure. Keep accent colors stable across the story: for example, cyan for interaction, violet for value, orange for reward, and green for improvement. Do not change the meaning of a color between slides.

Use shadows and gradients sparingly. A shadow should establish a layer or focus; a gradient should establish a surface or section transition. Decorative blur behind text must not lower contrast or compete with the reading path.

## Charts, tables, and notes

Use native chart and table objects for editable evidence. Keep chart titles, legends, units, and axis labels inside the chart configuration whenever supported. If the data is illustrative, say so on the slide and add a short note describing the intended interpretation. Do not imply empirical benchmarking from conceptual scores.

For dense explanations, use speaker notes rather than shrinking visible text. Notes are supplementary; the slide must still communicate its central claim without them.
