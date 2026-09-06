---
name: presentation-polish
description: Audit and improve PowerPoint or Google Slides decks created with the Presentations skill, with special attention to template fidelity, typography systems, standard LaTeX notation, semantic grouping, geometry, visual hierarchy, and native editability.
---

# Presentation Polish

Use this skill as a deliberate second pass after `presentations:Presentations`, or when a user asks for a deck that must be polished, visually varied, mathematically legible, and easy to inspect. It covers an existing draft and a template-first reconstruction. It does not replace the source skill's Artifact Tool workflow.

## First principle

Polish the reading path before adding decoration. Every slide needs one main claim, one visual anchor, and a visible reading order. Treat typography, formulas, labels, connectors, and object grouping as part of the argument, not as finishing touches. A passing overflow test is not a visual pass: render first, log concrete layout defects, repair their causes, and render again.

## Architecture boundary

This is a second-pass quality layer after `presentations:Presentations`:

- `presentations:Presentations` remains the authoring layer and uses Artifact Tool through JavaScript.
- `presentation-polish` loads, audits, diagnoses, repairs, renders, and verifies the existing deck.
- Package-level OOXML inspection is read-only diagnostics only. It is not an authoring path.

Do not replace Artifact Tool with `python-pptx`, PptxGenJS, LibreOffice UNO, or hand-authored PPTX XML. Do not implement OMML by hand. If the active runtime does not expose a dependable native equation API, report `NATIVE_MATH_UNAVAILABLE` and use the documented vector fallback honestly. The remote LaTeX helper below is an equation-asset step only; it is not a second PPTX engine.

## Template-first mode

When the user provides a `.pptx` template, template-first mode is mandatory for the final deck:

- Inspect and render every source-template slide before authoring. Identify the cover, content, comparison, image, section, and closing roles, plus the master/layout chrome, logos, theme colors, and dimensions.
- Do not call `Presentation.create()`, `presentation.slides.add()`, or rebuild a visually equivalent deck from a blank canvas for the final deliverable. Import the template or a starter deck made by duplicating its source slides, then edit those imported slides.
- Use a Windows-safe Artifact Tool-only starter flow when an official helper assumes a Unix `unzip` executable. The starter may duplicate selected template slides, remove only slide-local sample shapes with `slide.shapes.deleteAll()`, and export a reusable intermediate such as `template-starter.pptx`.
- Keep the template's dimensions, master/layout relationships, repeated header/footer chrome, logos, and intentional negative space. New content belongs inside the template's content region; do not cover the template with a full-slide white rectangle or flatten its chrome into an image.
- Treat template fidelity as a QA gate: compare source template, starter, and final renders; confirm dimensions/theme/layout IDs; and record the source template and mapping in the build manifest or speaker notes.
- If the template has fewer slides than the requested deck, duplicate an appropriate template role rather than creating a blank slide. If a requested visual role has no exact source, choose the closest existing role and preserve its chrome.

The final authoring script should make the provenance obvious by importing `template-starter.pptx` (or the original template when no starter is needed) and exporting the final PPTX. A template is a layout constraint, not a background image.

## Equation contract

Every formula-like object must have an explicit editability level:

| Level | Type | Meaning |
| ---: | --- | --- |
| 3 | `native_math` | Structured Office Math object preserved through export/render |
| 2 | `editable_math_text` | Normal editable text object with a deliberate math font and complete notation |
| 1 | `vector_equation` | SVG/vector fallback; scalable and editable as graphic geometry, not as Office Math characters |
| 0 | `raster_equation` | Image fallback; not acceptable for a repair unless unavoidable and disclosed |

Use `equation_mode="auto"` for an existing deck unless the user selects a stricter profile. For academic/scientific decks, the profile default is `equationMode: "remote_latex"`: route every standalone/display or nontrivial equation with a known source through the remote standard-LaTeX SVG helper. Formula character-level editability is secondary in this profile; visual correctness, conventional notation, tight bounds, and consistent scale take priority. Keep simple inline symbols as text only when they are not a real display equation and remote rendering would harm the reading path. Never call Latin Modern Math text a LaTeX equation or a native Office equation; it is only `editable_math_text_approximation`. Never call a vector or raster equation an “editable equation” without naming its level. See `references/equation-strategy.md` for the source/provenance contract, provider rules, SVG checks, diagnostic codes, and claim boundary.

## Remote LaTeX → SVG asset pipeline

Use `scripts/remote_latex_renderer.mjs` when mathematical fidelity matters more than character-level editability and the source LaTeX is known. It exports `renderLatexRemoteToSvg()` and `renderLatexBatch()`; the caller then inserts `result.asset.blob` with the Presentations/Artifact Tool image API. Keep this separation explicit:

- No `pdflatex`, `xelatex`, `lualatex`, TeX distribution, Python math renderer, or local equation binary is required or allowed by this path.
- The provider is selected through `REMOTE_LATEX_PROVIDER` / `equationProvider`; `auto` uses the verified CodeCogs SVG provider when no custom endpoint is configured, but the provider abstraction and endpoint remain replaceable.
- Use `REMOTE_LATEX_ENDPOINT`, `REMOTE_LATEX_TIMEOUT_MS`, `REMOTE_LATEX_MAX_RETRIES`, `REMOTE_LATEX_CONCURRENCY`, and a cache directory as task-scoped configuration. The helper URL-encodes short GET requests, validates the HTTPS response, caches by SHA-256, deduplicates batch inputs, and caps concurrency at a small bounded pool.
- Remote upload is privacy-gated. Set `allowRemoteEquationRendering: true` only after the user/project allows sending equation source to the configured service. Send only the formula source; never upload a slide, deck, notes, or private assets. `REMOTE_LATEX_DISABLED=1` must prevent network calls.
- Accept SVG first. Inspect `viewBox`, `path/use`, text/font dependencies, external resources, white backgrounds, and raster `<image>` content. Reject dangerous TeX commands and unsafe SVG content. A PNG fallback is exceptional and must emit `EQUATION_RASTER_FALLBACK`; it is not the normal path.
- Preserve the canonical LaTeX source and provider/cache diagnostics in speaker notes, build metadata, or the caller's manifest. The PPTX contains the SVG as a Level 1 vector asset; it does not magically become an Office Math object.

Recommended academic/scientific configuration:

```js
{
  equationMode: "remote_latex",
  equationProvider: "auto",
  strictLatexFidelity: true,
  remoteLatexTimeoutMs: 8000,
  remoteLatexMaxRetries: 2,
  remoteLatexConcurrency: 3,
  remoteLatexCache: true,
  preferSvgPaths: true,
  rejectRasterSvg: true,
  allowRemoteEquationRendering: true, // only after the user/project authorizes source upload
  fallbackOnRemoteFailure: "keep_existing",
}
```

The helper's safe default is `allowRemoteEquationRendering: false`; a build must opt in deliberately. Polish of an existing deck defaults to `keep_existing` on provider failure, while a strict new-formula build may choose `error`. Read `references/equation-strategy.md` before enabling this path and run the remote-equation fixture before claiming that it works in the current environment.

## Review profiles

Use the existing visual language as the first constraint. For technical, academic, or scientific decks, the default profile is restrained paper/conference style: clear hierarchy, disciplined formulas, quiet surfaces, and high information density without decorative noise. Do not force a serif theme or replace a stable design system merely because the content is academic. Use `preferred_font`, `effective_font`, `fallback_font`, and `font_availability` explicitly; test Latin Modern Math in ordinary text shapes and fall back to Cambria Math when the runtime or render is unstable.

## When generating from zero

Before opening the slide canvas, write the audience assumption, two to five learning outcomes, the concept dependency chain, and the slide-role map. Check that each later concept depends only on terms already introduced. For a technical deck, keep a source-of-truth glossary for notation, definitions, units, and any illustrative data; a visual redesign must not silently change the technical meaning.

## Required workflow

1. Load the source `presentations:Presentations` skill and only the relevant implementation, style, native-evidence, and finalization references. For local slide authoring, load workspace dependencies and use the bundled Artifact Tool through JavaScript. Never author with `python-pptx` or PptxGenJS. If a template is supplied, also read `references/template-following.md` before touching the deck.
2. Establish a baseline before changing anything. If a deck exists, run `scripts/audit_presentation.py`, inspect the package/layout, render every slide, and view both a montage and individual slides at readable size. Record findings by slide, not just as general impressions. If a template exists, render the template as a separate baseline and map output slide roles to source-template slides before any content replacement. If no deck or template exists, create a slide-role map and a design-token sheet first.
3. Normalize content before styling. Rewrite long copy into labels, callouts, or diagrams. Remove decorative micro-text, duplicate subtitles, and floating symbols that do not have a clear owner. Keep no more than three major content zones unless the slide is intentionally a full-page map or chart.
4. Set explicit design tokens once and reuse them: resolved font families, type scale, color roles, safe margins, spacing grid, corner radius, stroke weights, shadows, icon size, and formula style. Resolve fonts with `resolvePresentationFont()`, pass an explicit `fontPolicy` to finalization when supported, and record the actual resolved family in the build notes.
5. Choose a layout by semantic role. Vary the visual grammar across the deck: cover, problem scene, interaction loop, system map, state graph, timeline, value split, equation-as-visual, iteration loop, model split, episode trace, update pipeline, matrix plus chart, two-lane comparison, and synthesis map are different roles. Do not alternate dark and light backgrounds mechanically, and do not repeat a title-plus-card-grid template on consecutive slides.
6. Build diagrams as native objects. Use independent shapes, connectors, arrows, tables, and charts. Keep a label next to the object it describes, route connectors behind nodes or around text, and group semantically related objects when the API supports grouping. Do not flatten a diagram or an entire slide into an image.
7. Treat formulas as designed objects. Classify source and display role before repair. In the academic/scientific profile, use the controlled remote LaTeX → sanitized SVG path for all standalone/display and nontrivial equations when the user has authorized equation-source upload; do not try to imitate a fraction, integral, expectation, superscript, subscript, or argmax with scattered text fragments. Use an Office equation object only when the active runtime actually supports and preserves it and the user explicitly prioritizes character editability. Otherwise insert one independent SVG with preserved aspect ratio, tight bounds, a canonical source string, and a clear visual owner. Never split one equation into scattered text boxes or allow a formula to wrap silently.
8. Use native data objects. Required tables and charts must remain editable. Put chart labels, units, legends, and conceptual-data disclosures in the chart or its immediate title area; do not duplicate every chart label in unrelated text boxes. Any illustrative score must be labeled `Conceptual illustration` and, when appropriate, explained in speaker notes.
9. Run the optical repair loop in `references/layout-review-loop.md`. Before editing, log each P0/P1/P2/P3 finding with a slide number, symptom, cause, repair, and verification. Close content ownership, reading-order, geometry, formula-fit, connector, and typography findings in that order; do not use smaller type or extra pills to hide a crowded composition.
10. Run the full QA gate. Check package integrity, slide count, aspect ratio, overflow, heading fit, font family approval, small-text exceptions, formula wrapping, connector clarity, native chart/table presence, editable object counts, remote SVG diagnostics, source/provenance retention, and absence of raster equation fallbacks. Render the final candidate again and inspect each slide. Revisions use a new output filename so the baseline remains recoverable.
11. Handoff honestly. Report the output path, slide count, major changes, native/editable elements, and any runtime limitation such as a formula fallback. Do not claim that PowerPoint itself was opened or edited unless that was actually verified.

## Non-negotiable quality rules

- Use at most two primary typefaces unless a third is a deliberate, documented display or math face. Set Latin, Chinese, and math policy explicitly; do not mix theme defaults with ad hoc Arial/Calibri/CJK choices.
- Use a readable hierarchy: cover title at least 42 pt, slide title at least 32 pt, normal body at least 18 pt, diagram labels normally at least 14 pt, and footnotes only when necessary at 11–12 pt. Prefer editing copy or layout over shrinking text.
- Main formulas should normally be 24–30 pt and compact formulas at least 18–22 pt. Keep one formula grammar across slides. Use arrows and symbols inside diagrams or equations, not as filler punctuation in prose.
- A card is allowed only when it groups a real concept. Avoid a page made from many similarly sized UI cards, badges, pills, or isolated stat fragments.
- A title, subtitle, kicker, footer, folio, and decorative numeral are optional. Keep only the elements that support the slide's claim.
- Align to a visible grid and maintain safe margins. Do not let a formula, heading, icon, or connector touch a frame edge. Test the longest title and the widest formula, not just the average case.
- Do not accept a slide solely because `slides_test.py` reports no overflow. The final optical review must close floating objects, competing reading paths, unpaired comparison zones, and weakly owned annotations.
- Use no more than three accent colors on one slide. Background changes should signal section or function, not page number.
- Use a small, consistent icon grammar. Icons must have a semantic owner, common stroke/weight, a common baseline, and a meaningful size relationship with nearby text.
- Preserve editability of the important evidence. Photos or complex scene illustrations may be images, but process diagrams, state graphs, tables, charts, labels, and equations must stay as independent editable objects whenever the runtime permits.
- A remote equation SVG is a Level 1 vector fallback, not a character-editable formula. Preserve the LaTeX source separately, reject or disclose raster content, and keep the SVG's aspect ratio intact with `fit: "contain"`.

## Reference routing

Read only what the task needs:

- `references/issue-audit-reinforcement-learning.md` for the observed failure modes in the supplied reinforcement-learning deck and the evidence behind the fixes.
- `references/authoring-and-layout-rules.md` when building or substantially restructuring a deck from zero.
- `references/typography-and-math.md` when the deck contains formulas, mixed Chinese/English text, technical notation, or crowded labels.
- `references/equation-strategy.md` when equations need editability classification, complexity decisions, font availability reporting, SVG fallback, or equation-specific diagnostics.
- `references/template-following.md` when a source `.pptx` template is provided, when a deck must inherit an existing master/layout, or when the official template helper is not Windows-safe.
- `references/qa-checklist.md` before export or when a rendered deck looks plausible but still feels misaligned.
- `references/layout-review-loop.md` whenever a rendered deck needs a visual defect list, targeted layout repair, or a second-pass acceptance decision.

The helper `scripts/audit_presentation.py` is read-only. It is a preflight aid, not an authoring path.
The helper `scripts/equation_diagnostics.py` is also read-only. Run it before and after formula repair; its JSON output is advisory and never replaces rendered inspection.
The helper `scripts/remote_latex_renderer.mjs` creates only sanitized equation assets. `scripts/test_remote_latex_renderer.mjs` is the deterministic policy/cache/SVG unit test, and `scripts/build_remote_latex_test_deck.mjs` is the real-provider Artifact Tool regression fixture.
The helper `scripts/inspect_template_reference.mjs` is a Windows-safe, read-only Artifact Tool inspector. Use it instead of an `unzip`-dependent template helper when needed. A Windows-safe starter helper should import the template, duplicate source roles, clear only slide-local sample shapes, and export an intermediate starter; the final content builder must then import that starter rather than creating a new presentation.
