# Optical layout review and repair loop

Use this reference after a candidate deck has been rendered. Structural checks
such as overflow detection and package integrity are necessary, but they do
not prove that the slide has a coherent reading path. The rendered slide is
the evidence for optical QA.

## Issue-log contract

Record findings in this form before making a repair:

```text
slide: 07
severity: P1
category: ownership / hierarchy / geometry / typography / formula / chart / connector / template
symptom: what is visibly wrong in the render
cause: the layout decision that produced it
repair: the smallest content or geometry change that resolves the cause
verification: the render or diagnostic that will prove the repair
```

Do not write a generic “looks good” note. A slide is ready only when every
P0/P1 finding is closed and the remaining P2/P3 findings are either repaired
or explicitly accepted as intentional template chrome.

## Defect taxonomy

### Ownership and reading order

- Every small label, formula, badge, icon, and connector must have one visible
  owner: a node, card, axis, path, or section. If a viewer cannot tell what an
  object describes without presenter narration, move it into the owner or
  remove it.
- Prefer one dominant visual anchor and at most two supporting zones. A second
  copy of the same chain, equation, or legend is a competing reading path
  unless it has a distinct job.
- A standalone glyph such as `↘`, `+`, `=`, or an arrow-shaped text box is not a
  connector. Use it only when its source and target are obvious; otherwise use
  a native connector or place the symbol inside a bounded formula/diagram.

### Notation ownership

Mathematical notation needs a stronger ownership rule than ordinary copy. A
state/action/reward/value token such as `S_t`, `A_t`, `R_{t+1}`, `G_t`, `S_1`, or
`\pi^*` is one semantic unit. Keep it in one independent LaTeX/SVG object or in
a deliberately wide, single-line inline zone. Do not split the base symbol and
its subscript into unrelated text boxes, and do not substitute Unicode
subscripts merely because the text box is convenient. When a node has both
prose and notation, use a bounded inline or stacked composite so the title,
token, and node border read as one unit.

Repeated notation must be normalized as a family: same rendering route,
baseline, approximate visual size, and internal padding. If a repeated token
wraps or drifts once, treat it as a component-level defect and repair every
instance.

### Spatial hierarchy and grid

- Establish the content frame after accounting for template chrome. Align
  related objects to a common baseline or edge and keep repeated columns at
  equal widths.
- A large empty area is acceptable only when it is intentional negative space
  or belongs to the template role. Do not fill it with micro-labels. First
  enlarge or clarify the main visual anchor.
- A claim and its evidence should be adjacent. Do not put a page-level claim
  in one region and the only supporting loop, chart, or formula in a distant
  region without a strong visual bridge.
- When a row contains prose, a formula, and a second prose label, give each a
  dedicated zone. Do not force different semantic roles into one horizontal
  strip merely because they fit numerically.
- A two-line text box is not a valid substitute for a cramped one-line label.
  Shorten the copy, increase the box height and leading, or split the content
  into intentional zones. Never let a word, formula, or label break merely
  because the box was sized before the final font was chosen.
- Give long labels and feedback rows a measured label column. Allocate width
  to the longest token before export; do not allow `REWARD`, `STATE`, `S_{t+1}`,
  or similar labels to wrap unexpectedly.

### Typography and formulas

- Treat small-text diagnostics as leads, not automatic failures: template
  kickers, chart axes, and necessary footnotes may be exceptions, but every
  other sub-18 pt object needs a reason or a layout repair.
- Use a stable type scale. Increase contrast between title, lead, diagram
  label, and footnote through size/weight/placement before adding more font
  families. A deliberate font system should feel varied in role but coherent
  in family and baseline.
- Give each display equation a dedicated, wide zone. Check its rendered
  width, vertical centering, transparent bounds, and distance from nearby
  prose. One formula is one object; never repair wrapping by scattering
  operators or subscripts into separate boxes.
- A remote LaTeX SVG is a sharp Level 1 vector equation, not Office Math. Keep
  its source and provenance, and judge it by notation, fit, baseline, and
  visual ownership rather than by character editability.

### Connectors, charts, and semantic units

- Route connectors behind nodes and away from labels. Every line must have a
  source, target, and limited semantic meaning; remove decorative lines that
  do not explain a relationship.
- Connector labels in a diagram should normally be at least 12–14 pt and
  should not be reduced below that range just to preserve a crowded
  composition. If the label cannot fit, route or resize the diagram first.
- Action labels must be explicit when a graph has multiple branches: prefer
  `a = left`, `a = right`, `A_t`, or an equivalent unambiguous form over a
  floating word whose arrow ownership is unclear.
- Do not route arrows through nodes, formula objects, or labels. Keep primary
  arrows straight where possible; use a curved route only when it communicates
  a deliberate return loop.
- For comparisons, make the two sides structurally parallel: same title
  position, same path row, same formula zone, and paired conclusion area.
- For charts, keep the title, units, legend, data disclosure, and explanatory
  note in one chart zone. Do not put a small legend or conceptual-data warning
  in an unrelated footer or competing title band.
- Use semantic grouping when the active API supports it. If it does not,
  preserve independent editable objects but use stable names, a manifest of
  owner relationships, and an audit note instead of pretending that a flat
  export is grouped.

## Repair order

1. Remove duplicate prose, floating symbols, and labels without an owner.
2. Re-establish the visual anchor and the reading order.
3. Move formulas and explanations into bounded zones owned by the evidence.
4. Align columns, baselines, margins, and repeated card geometry.
5. Repair typography and formula scale; edit copy before shrinking type.
6. Route connectors and refine colors, shadows, and decorative details last.

## Acceptance gates

Before delivery, compare the pre-repair and post-repair render sets and check:

- each slide has one sentence-level claim and one obvious visual anchor;
- no unexplained floating micro-text or standalone formula fragment remains;
- no title, formula, icon, or connector is clipped, wrapped unexpectedly, or
  pushed into template chrome;
- paired layouts are optically parallel, not only numerically symmetric;
- every important table/chart/diagram/equation remains a distinct editable
  object at the documented level;
- the full-size render of every slide was inspected after the last change.
