# Equation Strategy and Math QA

This reference defines how `presentation-polish` reviews mathematical notation
after the `presentations:Presentations` authoring layer has produced a deck. It
does not replace Artifact Tool, add a second PPTX engine, or promise that every
PowerPoint runtime can preserve Office Math.

## Architecture boundary

The layers have different responsibilities:

| Layer | Responsibility | Allowed implementation |
| --- | --- | --- |
| `presentations:Presentations` | Create or edit the deck | Artifact Tool through JavaScript |
| `presentation-polish` | Inspect, diagnose, repair, render, verify | Artifact Tool for edits; read-only OOXML/package inspection for diagnostics |
| PowerPoint / viewer | Final consumer of the exported package | Must be checked by rendered output when available |

Do not switch the second pass to `python-pptx`, PptxGenJS, LibreOffice UNO, or
hand-authored OOXML. Do not implement OMML by hand. If the active Artifact Tool
runtime has no reliable native math API, record `NATIVE_MATH_UNAVAILABLE` and
use the best honest fallback rather than pretending that a text box is an
Office equation.

## Equation editability levels

Every equation-like object should be classified before it is repaired:

| Level | Type | What the user can edit | When to use |
| ---: | --- | --- | --- |
| 3 | `native_math` | Structured Office Math content, not only a picture or a string | Only when the active runtime creates and preserves it through export/render |
| 2 | `editable_math_text` | Characters, font, size, position, and runs in a normal text box | Default for simple or moderate notation when native math is unavailable |
| 1 | `vector_equation` | Scale, position, color, and vector paths; the math is not directly editable as characters | Complex notation when a trusted SVG/vector source materially improves fidelity |
| 0 | `raster_equation` | Only the picture box; math content is not editable | Avoid. Flag `EQUATION_RASTERIZED` and request a rebuild when possible |

The handoff must state the level. “Editable” without the level is ambiguous and
must not be used to describe a vector or raster equation as if it were Office
Math.

## `equation_mode="auto"`

`auto` is the default review mode:

1. Preserve a stable Level 3 object if it is found and rendered correctly.
2. For simple notation that already reads well, preserve a single Level 2 math
   text object rather than replacing it for cosmetic reasons.
3. For simple notation with poor font, spacing, wrapping, or baseline, rebuild
   one Level 2 object with the approved math font and enough width.
4. For moderate/complex notation with a trustworthy LaTeX source and a tested
   SVG pipeline, use Level 1 only when math fidelity materially improves. Keep
   the source/provenance and label the result `vector_equation`.
5. For complex notation without a source or trusted renderer, keep one complete
   editable text object, simplify/recompose it, and disclose the limitation.
6. Never introduce a raster screenshot as a repair shortcut.

The alternate modes are `editability-first` (prefer Level 2) and
`latex-fidelity-first` (permit Level 1 for source-backed complex notation).
They change the repair preference, not the architecture boundary.

## Complexity heuristic

The diagnostic helper is intentionally a conservative heuristic, not a math
parser. It classifies source strings as:

- `trivial`: short symbols or compact expressions such as `x`, `E = mc²`;
- `simple`: a short equality, expectation label, or one-level Greek/script
  expression;
- `moderate`: one-level fractions, roots, integrals, summations, or several
  scripts that can still fit as a single text object;
- `complex`: matrices, cases, aligned/multiline expressions, nested scripts,
  limits, accents, long expressions, or explicit LaTeX structural commands.

The heuristic must be combined with rendered inspection. A formula can be
syntactically simple but visually poor because of a narrow text box, a missing
font, a clipped glyph, or a bad baseline.

## Font policy

Declare these fields in the build/review notes and in diagnostics:

```text
preferred_font = the requested math family, normally Latin Modern Math
effective_font = the family actually assigned to the object
fallback_font  = Cambria Math when the preferred family is unavailable or unstable
font_availability = verified | unavailable | unknown
```

Use `resolvePresentationFont()` from the Presentations runtime when selecting a
font. Latin Modern Math must be tested in ordinary text shapes, not assumed to
be available because its name is valid. If resolution or rendering is unstable,
use Cambria Math consistently. Do not bundle fonts or silently mix theme fonts,
Arial, and a math family inside one equation.

Font package inspection cannot prove that a viewer machine has a font installed;
the diagnostic tool therefore reports `font_availability: "unknown"` unless a
real runtime/render check establishes otherwise. Use `MATH_FONT_UNAVAILABLE`
only when an actual resolution or render test proves the family unavailable.

## Diagnostic vocabulary

The following codes are used for findings or are reserved for the render QA
stage:

| Code | Meaning |
| --- | --- |
| `EQUATION_FONT_INCONSISTENT` | Formula runs or formula objects use conflicting families |
| `EQUATION_TOO_SMALL` / `EQUATION_TOO_LARGE` | Formula size is outside the approved role range |
| `EQUATION_CLIPPED` | Rendered glyphs or the formula box are visibly clipped |
| `EQUATION_BASELINE_MISALIGNED` | Formula baseline does not align with adjacent text or labels |
| `EQUATION_LOW_RESOLUTION` | Vector/raster result loses sharpness at presentation size |
| `EQUATION_RASTERIZED` | A raster image is being used as an equation |
| `EQUATION_VECTOR_PADDING_EXCESSIVE` | Vector bounding box has distracting empty margins |
| `EQUATION_TEXT_LAYOUT_POOR` | Text formula wraps, fragments, or has visibly poor spacing |
| `EQUATION_STYLE_INCONSISTENT` | Formula styling differs from the deck's declared math system |
| `EQUATION_COMPLEXITY_EXCEEDS_TEXT_MODE` | Complex notation is being forced into a weak text fallback |
| `MATH_FONT_UNAVAILABLE` | A runtime test proves the requested font is unavailable |
| `NATIVE_MATH_UNAVAILABLE` | No dependable native Office Math path is exposed by the runtime |

Static package inspection can flag font declarations, text wrapping metadata,
formula-like fragments, and raster/vector candidates. `EQUATION_CLIPPED`,
`EQUATION_BASELINE_MISALIGNED`, optical padding, and actual font substitution
require rendered-slide inspection. Do not report these as resolved solely from
XML metadata.

## Repair rules

- Preserve the source deck and write a new revision filename.
- Repair the smallest semantic unit: one formula box, one label group, one
  connector route, or one chart—not an entire slide image.
- Keep one complete equation in one object. If a derivation has multiple rows,
  each row must be a complete expression with an explicit relation label.
- Give display formulas a dedicated zone, normally 24–30 pt; compact formulas
  should remain at least 18–22 pt. Widen the object before shrinking type.
- Keep formulas aligned to the surrounding grid. Use a common baseline and
  common math color across the deck.
- Preserve stable native math. Do not downgrade a good Level 3 object to text
  or SVG for styling convenience.

## SVG/vector policy

SVG/vector is a controlled fallback, not a claim of equation editability. Use
it only for complex, source-backed notation when it materially improves math
fidelity. The asset must have a transparent background, tight bounds, no
clipping, and sharp strokes at the intended size. Keep the source LaTeX and
provenance in build notes or speaker notes when possible. Never use a screenshot
or low-resolution PNG for an equation.

## Required QA loop

```text
load → baseline audit → render → visual inspect → structural checks
     → equation/font diagnostics → classify → repair only necessary objects
     → render changed slides → compare → repeat → truthful handoff
```

Run the read-only helper before and after a repair:

```powershell
python -X utf8 scripts/equation_diagnostics.py .\deck.pptx --equation-mode auto
```

The helper emits JSON with the schema
`presentation-polish.equation-diagnostics.v1`, including editability levels,
complexity counts, font policy, native-math presence, vector/raster candidates,
and a claim boundary explaining what still needs visual verification.

## Equation fixture

The skill includes `scripts/build_equation_test_deck.mjs`, a controlled four-
slide fixture for regression testing. It covers basic, fraction, summation,
integral, matrix/source-like, Greek/script, mixed Chinese/English, long display,
SVG/vector fallback, raster warning, and a deliberately narrow stress box.
Run it with the installed Presentations skill and bundled runtime paths:

```powershell
$env:TEST_PPTX = "C:\temp\equation_diagnostics_test.pptx"
$env:SKILL_DIR = "C:\Users\user\.codex\skills\presentation-polish"
$env:PRESENTATIONS_SKILL_DIR = "<installed Presentations skill>"
$env:RUNTIME_NODE_MODULES = "<bundled node_modules>"
node scripts/build_equation_test_deck.mjs
python -X utf8 scripts/equation_diagnostics.py $env:TEST_PPTX --equation-mode auto
```

The fixture is intentionally not a production deck: the raster and narrow-box
cases are expected findings. The acceptance gate is that the deck exports,
renders, passes package/overflow checks, and that the expected findings are
reported without falsely claiming native math.
