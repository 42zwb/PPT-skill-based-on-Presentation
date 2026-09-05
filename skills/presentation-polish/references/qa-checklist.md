# Presentation Polish QA Checklist

Run the checks in this order. A passing structural test is necessary but not sufficient.

## 1. Content and story

- [ ] Every slide has one sentence describing its claim.
- [ ] Slide roles vary with the story; no accidental run of repeated card grids.
- [ ] The audience can identify the reading order without presenter narration.
- [ ] Every small label has a semantic owner, and every connector has a clear source and target.
- [ ] Titles do not rely on decorative punctuation, unexplained abbreviations, or slogan filler.

## 2. Typography and formulas

- [ ] Latin, Chinese, and math font policy is explicit and resolved.
- [ ] Formula policy records `preferred_font`, `effective_font`, `fallback_font`, and `font_availability` (`verified`, `unavailable`, or honest `unknown`).
- [ ] No accidental Calibri/Arial/CJK mixture from theme defaults.
- [ ] No body text under 18 pt unless it is an intentional footnote or chart axis with a documented exception.
- [ ] Main formulas are at least 24 pt and stay on one line in their formula zone.
- [ ] Formula notation, variable names, subscripts, superscripts, and Greek letters are consistent.
- [ ] No equation is split into disconnected text fragments.
- [ ] Every formula is classified as Level 3 `native_math`, Level 2 `editable_math_text`, Level 1 `vector_equation`, or Level 0 `raster_equation`.
- [ ] `NATIVE_MATH_UNAVAILABLE` is disclosed when the runtime has no dependable Office Math path; vector is never described as character-editable math.
- [ ] Complex equations have either a complete readable text fallback or a source-backed, tight, sharp vector fallback; no screenshot equation is introduced.

## 3. Geometry and visual QA

- [ ] Safe margins are respected.
- [ ] Longest title and longest formula have been rendered and inspected.
- [ ] There are no overlaps, clipped glyphs, unexpected line breaks, or misaligned icons.
- [ ] Render QA explicitly checks `EQUATION_CLIPPED`, `EQUATION_BASELINE_MISALIGNED`, `EQUATION_LOW_RESOLUTION`, and `EQUATION_VECTOR_PADDING_EXCESSIVE`; package metadata alone cannot close these findings.
- [ ] Connectors do not cross unrelated text or terminate inside nodes.
- [ ] Contrast remains readable on both dark and light surfaces.
- [ ] A full-size inspection was performed for every slide, not only a montage.

## 4. Native editability

- [ ] Diagrams use independent PowerPoint shapes and connectors.
- [ ] Tables are native tables.
- [ ] Charts are native charts with editable data.
- [ ] Formulas remain independent text/equation objects.
- [ ] Groups represent semantic units; the whole slide is not flattened.
- [ ] Images are limited to photos or complex illustrations that cannot reasonably be built from native objects.

## 5. Suggested commands

Use the bundled runtime paths returned by `load_workspace_dependencies`:

```powershell
python -X utf8 scripts/audit_presentation.py .\deck.pptx
python -X utf8 scripts/equation_diagnostics.py .\deck.pptx --equation-mode auto
python -X utf8 <presentations-skill>\container_tools\slides_test.py .\deck.pptx
python -X utf8 <presentations-skill>\container_tools\inspect_presentation_layout_geometry.py .\deck.pptx --expected-aspect 16:9 --inspect-font-families --validate-heading-fit
python -X utf8 <presentations-skill>\container_tools\inspect_presentation_package_integrity.py .\deck.pptx
python -X utf8 <presentations-skill>\container_tools\render_slides.py .\deck.pptx --output_dir .\rendered
```

If the audit reports several fonts, formula objects without native math, many short text objects, or zero semantic groups on a diagram-heavy deck, treat that as a design defect to investigate, not as harmless metadata.

## 6. Handoff

The final response should name the `.pptx`, state the slide count and 16:9 status, summarize the major fixes, list native/editable objects, and disclose any formula or font fallback. Do not report a PowerPoint application round-trip unless one was actually performed.
