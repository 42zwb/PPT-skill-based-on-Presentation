# Typography and Mathematical Notation

## Font policy

Create a small font policy before building:

```text
fontLatin = resolved Latin UI/display family
fontCjk   = resolved Chinese sans family
fontMath  = resolved math-capable family, or fontLatin if verified
```

For the second-pass diagnostics, record the fuller policy as
`preferred_font`, `effective_font`, `fallback_font`, and
`font_availability`. `Latin Modern Math` is a preferred test candidate, not a
guarantee that the viewer has it installed. Test it in an ordinary text shape;
if resolution or rendering is unstable, use `Cambria Math` consistently. The
package alone cannot prove font availability on another computer, so report
`unknown` unless a runtime/render check proves `verified` or `unavailable`.

Formula objects also carry an editability classification: Level 3
`native_math`, Level 2 `editable_math_text`, Level 1 `vector_equation`, or
Level 0 `raster_equation`. A vector may be sharp and scalable but is not
character-editable math.

Use `resolvePresentationFont()` from the Presentations runtime to resolve requested families. If a requested family is unavailable, choose a deliberate fallback and use it consistently. Do not leave theme defaults active while explicitly setting another family on only some runs.

Recommended hierarchy for a 16:9 teaching deck:

| Role | Default range | Notes |
| --- | ---: | --- |
| Cover title | 44–60 pt | One or two intentional lines |
| Slide title | 32–40 pt | State the claim, not only the topic |
| Lead sentence | 20–24 pt | Optional, concise context |
| Body / card copy | 18–22 pt | Keep lines short |
| Diagram label | 14–18 pt | Put it next to its owner |
| Footnote / source | 11–12 pt | Only when necessary |
| Main formula | 24–30 pt | Give it a dedicated zone |
| Compact formula | 18–22 pt | Never put it in a tiny badge |

The exact family and size may vary, but the hierarchy must be explicit and repeatable. A mixed Chinese/English line should be checked after export because the two scripts can have different visual x-heights and baselines.

## Formula rules

1. Maintain a canonical notation glossary. For the reinforcement-learning example, use one convention for `S_t`, `A_t`, `R_{t+1}`, `V^π(s)`, `Q^π(s,a)`, `G_t`, `γ`, and `α` across every slide.
2. Prefer Office Math only when the active Artifact Tool runtime supports it and a round-trip import/render check confirms it survived. The current Presentations reference API documents structured text runs and paragraph styling, but does not expose a dependable Office Equation API; report `NATIVE_MATH_UNAVAILABLE` when that remains true.
3. When Office Math is unavailable, use one independent formula text object, a math-capable typeface, controlled line spacing, and structured runs if available. Use readable Unicode subscript/superscript only when the resolved font is verified; otherwise prefer an ASCII-safe fallback such as `V^pi(s)` over a visually broken glyph mix. Report this as Level 2 `editable_math_text`, not as native equation editability.
4. Never split a single equation across unrelated text boxes. If a formula needs a visual derivation, put each complete expression on its own aligned row and connect rows with explicit labels such as `immediate reward` and `discounted future value`.
5. Do not use a formula as a decorative micro-label. A formula must answer a question on the slide: what is being estimated, what is the target, or what is being optimized.
6. Before export, test the longest formula in the family. The formula box must be wide enough for one line at the chosen size; if it is not, rewrite or redesign the slide instead of silently shrinking or wrapping.
7. For matrices, cases, aligned/multiline expressions, nested scripts, limits, and long fraction/root/integral structures, classify the object as `moderate` or `complex`. Prefer a trusted source-backed vector fallback only when text fidelity materially fails and the SVG has tight transparent bounds. Never use a screenshot as an equation repair.

## RL notation reference

Use the following as semantic source strings. Choose either a verified math-object path or the text fallback consistently:

```text
M = (S, A, P, R, gamma)
pi(a|s)
G_t = R_{t+1} + gamma R_{t+2} + gamma^2 R_{t+3} + ...
V^pi(s) = E_pi[G_t | S_t = s]
Q^pi(s,a) = E_pi[G_t | S_t = s, A_t = a]
V^pi(s) = E_pi[R_{t+1} + gamma V^pi(S_{t+1}) | S_t = s]
V*(s) = max_a E[R_{t+1} + gamma V*(S_{t+1})]
pi*(s) = argmax_a Q*(s,a)
V(S_t) <- V(S_t) + alpha [G_t - V(S_t)]
V(S_t) <- V(S_t) + alpha [R_{t+1} + gamma V(S_{t+1}) - V(S_t)]
```

These source strings are not a license to place raw ASCII formulas everywhere. They are a normalization layer that prevents one slide from using `Vπ`, another from using `V^pi`, and a third from using a different symbol order. Render them with one chosen visual treatment and keep the formula object independent.

## Mixed-script checks

- Test Chinese and Latin on the same baseline and in the same size before composing a dense slide.
- Do not use a display font for long Chinese body copy.
- Avoid all-caps labels below 12 pt; they become visual noise after projection.
- If a formula contains Greek letters, verify that gamma, pi, delta, and alpha are visually distinct from nearby Latin glyphs.
