# Template-following workflow

Use this reference whenever a user gives a PowerPoint template and asks for a
new or reconstructed deck. The goal is to inherit the template's visual system
without flattening it into a background image.

## Required decisions before authoring

Record these facts in a small manifest:

- source template path and file hash;
- slide dimensions and aspect ratio;
- source slide number to output slide number mapping;
- role of each source slide: cover, content, comparison, image, section, or
  closing;
- master/layout IDs, repeated logos, header/footer bars, theme colors, and
  intentional blank regions;
- which objects will stay from the template and which slide-local sample
  objects will be removed.

Render all source slides before editing. A screenshot or montage is evidence
for layout geometry only; it is not a replacement for the editable template.

## Windows-safe Artifact Tool flow

Some official template helpers shell out to the unzip command, which is not
guaranteed on Windows. Use Artifact Tool import/export instead:

1. Load the template with FileBlob.load.
2. Import it with PresentationFile.importPptx.
3. Read presentation.slides.items (or the runtime equivalent).
4. Duplicate the selected source slides in the requested order.
5. On each duplicate, call slide.shapes.deleteAll() only to remove the
   sample content owned by that slide; this preserves the slide's
   master/layout relationships and repeated chrome.
6. Delete the original source slides, move duplicates to the requested order,
   and export template-starter.pptx.
7. Import the starter again for final content authoring. The final build must
   not call Presentation.create() or slides.add().

The starter is a provenance and layout artifact, not the finished deck. Keep
the map JSON and starter manifest beside it so later reviewers can see why a
role was chosen.

## Content placement rules

- Treat the template header, logo, page number, side panel, and background
  geometry as owned by the template. Add content below or inside its content
  frame instead of drawing over it.
- Use independent native shapes, connectors, tables, and charts for new
  content. Group only semantically related objects when the API supports
  grouping.
- Use a dedicated, wide zone for every display equation. In the
  scientific/technical profile, render the canonical LaTeX source remotely to
  a sanitized SVG and insert the SVG as a Level 1 vector asset. Preserve the
  source and provider in notes or the build manifest; character editability is
  intentionally not the acceptance criterion for these formulas.
- Do not add full-slide white rectangles, screenshot diagrams, or duplicated
  template logos. Do not use a template screenshot as the final slide.

## Fidelity and final QA

Compare three render sets:

1. the original template;
2. the cleared starter;
3. the final deck.

The starter should look like the template with its sample content removed.
The final should retain the same dimensions, master/layout chrome, logos,
header/footer treatment, and safe margins. Then run the normal content QA:
package integrity, native table/chart evidence, shape and connector counts,
formula SVG validation, overflow checks, and a readable montage plus
individual-slide inspection.

If a slide looks crowded, first remove or consolidate micro-labels and widen
the content zone. Do not shrink the whole slide to compensate for a bad
template mapping. If an equation wraps, replace the fragmented text with one
remote SVG or widen its zone; never repair it by scattering more symbols.
