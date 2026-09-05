import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// This is a controlled QA fixture, not a production teaching deck. It probes
// editable math text, source-like complex notation, SVG/vector fallback, and
// the kinds of layout defects the read-only diagnostics should surface.
const { TEST_PPTX, SKILL_DIR, PRESENTATIONS_SKILL_DIR, RUNTIME_NODE_MODULES } = process.env;
if (![TEST_PPTX, SKILL_DIR, PRESENTATIONS_SKILL_DIR, RUNTIME_NODE_MODULES].every((value) => path.isAbsolute(value ?? ""))) {
  throw new Error("TEST_PPTX, SKILL_DIR, PRESENTATIONS_SKILL_DIR and RUNTIME_NODE_MODULES must be absolute paths");
}

await fs.mkdir(path.dirname(TEST_PPTX), { recursive: true });

const { Presentation, PresentationFile } = await import(pathToFileURL(
  path.join(RUNTIME_NODE_MODULES, "@oai", "artifact-tool", "dist", "artifact_tool.mjs"),
).href);
const { resolvePresentationFont } = await import(pathToFileURL(
  path.join(PRESENTATIONS_SKILL_DIR, "container_tools", "artifact_tool_utils.mjs"),
).href);

const W = 1280;
const H = 720;
const PT = (points) => Math.round(points * 4 / 3);
const fontLatin = resolvePresentationFont({ fontFamily: "Arial" });
const fontCjk = resolvePresentationFont({ fontFamily: "Microsoft YaHei" });
const fontPreferredMath = resolvePresentationFont({ fontFamily: "Latin Modern Math" });
const fontFallbackMath = resolvePresentationFont({ fontFamily: "Cambria Math" });

const C = {
  ink: "#0B1020",
  muted: "#5B6475",
  soft: "#F7F9FC",
  white: "#FFFFFF",
  line: "#CBD5E1",
  cyan: "#11C5BE",
  blue: "#3B82F6",
  violet: "#8B5CF6",
  orange: "#F59E0B",
  rose: "#F43F5E",
  redSoft: "#FFF0F2",
  cyanSoft: "#E8FFFC",
  violetSoft: "#F2EEFF",
};
const NO_LINE = { style: "solid", fill: "none", width: 0 };
const line = (fill = C.line, width = 1) => ({ style: "solid", fill, width });

function style(options = {}) {
  return {
    typeface: options.typeface ?? fontCjk,
    fontSize: PT(options.pt ?? 18),
    bold: options.bold ?? false,
    italic: options.italic ?? false,
    color: options.color ?? C.ink,
    alignment: options.align ?? "left",
    verticalAlignment: options.valign ?? "middle",
    autoFit: "none",
    wrap: options.wrap ?? "square",
    insets: options.insets ?? { top: 0, right: 0, bottom: 0, left: 0 },
  };
}

function text(slide, value, position, options = {}) {
  const shape = slide.shapes.add({ geometry: "textbox", name: options.name, position, fill: "none", line: NO_LINE });
  shape.text = value;
  shape.text.style = style(options);
  return shape;
}

function box(slide, value, position, options = {}) {
  const shape = slide.shapes.add({
    geometry: options.geometry ?? "roundRect",
    name: options.name,
    position,
    fill: options.fill ?? C.white,
    line: options.line ?? line(C.line, 1),
    borderRadius: options.radius ?? 18,
    shadow: options.shadow,
  });
  if (value !== undefined) {
    shape.text = value;
    shape.text.style = style({
      typeface: options.typeface ?? fontCjk,
      pt: options.pt ?? 18,
      bold: options.bold ?? false,
      color: options.color ?? C.ink,
      align: options.align ?? "left",
      valign: options.valign ?? "middle",
      wrap: options.wrap,
      insets: options.insets ?? { top: 12, right: 14, bottom: 12, left: 14 },
    });
  }
  return shape;
}

function title(slide, number, kicker, heading, dark = false) {
  const titleColor = dark ? C.white : C.ink;
  const muted = dark ? "#B8C3E6" : C.muted;
  text(slide, kicker.toUpperCase(), { left: 72, top: 32, width: 400, height: 20 }, {
    typeface: fontLatin, pt: 12, bold: true, color: dark ? C.cyan : C.violet,
  });
  text(slide, heading, { left: 72, top: 62, width: 1000, height: 48 }, {
    typeface: fontCjk, pt: 30, bold: true, color: titleColor,
  });
  text(slide, String(number).padStart(2, "0"), { left: 1168, top: 34, width: 40, height: 20 }, {
    typeface: fontLatin, pt: 13, bold: true, color: muted, align: "right",
  });
}

function note(slide, value) {
  slide.speakerNotes.textFrame.setText(value);
}

function formula(slide, value, position, options = {}) {
  return text(slide, value, position, {
    ...options,
    typeface: options.typeface ?? fontFallbackMath,
    pt: options.pt ?? 24,
    color: options.color ?? C.ink,
    align: options.align ?? "left",
  });
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function addPngTextChunk(pngBytes, keyword, value) {
  const type = Buffer.from("tEXt", "ascii");
  const data = Buffer.from(`${keyword}\0${value}`, "latin1");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])), 0);
  const iendOffset = pngBytes.length - 12;
  return Buffer.concat([pngBytes.subarray(0, iendOffset), length, type, data, checksum, pngBytes.subarray(iendOffset)]);
}

const presentation = Presentation.create({ slideSize: { width: W, height: H } });

// Slide 1: font probe and simple editable math text.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.ink;
  title(slide, 1, "EDITABILITY PROBE", "Level 2 · editable math text", true);
  text(slide, "A formula stays a normal PowerPoint text object: characters, style, and position remain editable.", { left: 72, top: 126, width: 900, height: 32 }, {
    typeface: fontCjk, pt: 18, color: "#C8D2F0",
  });
  box(slide, undefined, { left: 72, top: 210, width: 320, height: 250 }, {
    fill: "#141D38", line: line("#33416E", 1),
  });
  text(slide, "Preferred font probe\nLatin Modern Math", { left: 100, top: 236, width: 264, height: 48 }, {
    typeface: fontCjk, pt: 15, color: "#B8C3E6",
  });
  formula(slide, "E = mc²", { left: 112, top: 320, width: 240, height: 58 }, {
    typeface: fontPreferredMath, pt: 32, color: C.white, align: "center",
  });
  text(slide, `resolved: ${fontPreferredMath}`, { left: 94, top: 414, width: 276, height: 20 }, {
    typeface: fontLatin, pt: 11, color: "#8EA2D8", align: "center",
  });
  box(slide, undefined, { left: 430, top: 210, width: 320, height: 250 }, {
    fill: "#141D38", line: line("#33416E", 1),
  });
  text(slide, "Fallback font probe\nCambria Math", { left: 458, top: 236, width: 264, height: 48 }, {
    typeface: fontCjk, pt: 15, color: "#B8C3E6",
  });
  formula(slide, "V^π(s) = Eπ[Gₜ]", { left: 456, top: 320, width: 268, height: 58 }, {
    typeface: fontFallbackMath, pt: 25, color: C.white, align: "center",
  });
  text(slide, `resolved: ${fontFallbackMath}`, { left: 452, top: 414, width: 276, height: 20 }, {
    typeface: fontLatin, pt: 11, color: "#8EA2D8", align: "center",
  });
  box(slide, "QA assertion\nNo native Office Math object is assumed.\nThe claim is Level 2, not Level 3.", { left: 818, top: 210, width: 350, height: 250 }, {
    fill: C.cyan, line: line(C.cyan, 1), color: C.ink, pt: 17, bold: true,
  });
  text(slide, "font_availability = unknown until a real runtime/render check proves otherwise", { left: 818, top: 520, width: 350, height: 36 }, {
    typeface: fontLatin, pt: 12, color: "#B8C3E6", align: "center",
  });
  note(slide, "Fixture: simple and moderate equations rendered as independent editable text objects. The preferred font is probed but not assumed to be installed.");
}

// Slide 2: complexity and layout modes.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.soft;
  title(slide, 2, "COMPLEXITY ROUTING", "One formula · one object · one deliberate mode");
  const cards = [
    ["TRIVIAL", "x = 3", "editable_math_text", C.cyanSoft, C.cyan],
    ["MODERATE", "\\frac{a+b}{c+d}", "source-backed candidate", C.violetSoft, C.violet],
    ["COMPLEX", "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}", "vector only if fidelity wins", "#FFF7E6", C.orange],
  ];
  cards.forEach(([label, value, hint, fill, accent], index) => {
    const x = 72 + index * 392;
    box(slide, undefined, { left: x, top: 160, width: 350, height: 242 }, { fill, line: line(accent, 1.5) });
    text(slide, label, { left: x + 22, top: 182, width: 300, height: 20 }, { typeface: fontLatin, pt: 12, bold: true, color: accent });
    formula(slide, value, { left: x + 22, top: 232, width: 306, height: 70 }, { pt: index === 2 ? 18 : 26, color: C.ink, align: "center" });
    text(slide, hint, { left: x + 22, top: 338, width: 306, height: 22 }, { typeface: fontLatin, pt: 12, color: C.muted, align: "center" });
  });
  box(slide, "Display formula zone", { left: 72, top: 464, width: 260, height: 46 }, { fill: C.ink, line: line(C.ink, 1), color: C.white, pt: 16, bold: true, align: "center" });
  formula(slide, "Gₜ = Rₜ₊₁ + γRₜ₊₂ + γ²Rₜ₊₃ + …", { left: 362, top: 462, width: 812, height: 50 }, { pt: 26, color: C.ink });
  text(slide, "Long display notation must stay on one line or become a clearly aligned multi-row derivation.", { left: 362, top: 528, width: 812, height: 28 }, { typeface: fontCjk, pt: 15, color: C.muted });
  note(slide, "Fixture: complexity heuristic examples. The backslash notation is source-like text for diagnostic routing, not a claim that a LaTeX renderer is available.");
}

// Slide 3: vector and raster candidates.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.white;
  title(slide, 3, "FALLBACK CONTRACT", "Vector is scalable; raster is a defect signal");
  text(slide, "A vector fallback can preserve fidelity, but it is still not an Office equation. A raster equation should be rebuilt.", { left: 72, top: 126, width: 970, height: 30 }, { typeface: fontCjk, pt: 18, color: C.muted });
  box(slide, undefined, { left: 72, top: 190, width: 516, height: 350 }, { fill: C.violetSoft, line: line(C.violet, 1.5) });
  text(slide, "LEVEL 1 · VECTOR_EQUATION", { left: 100, top: 218, width: 380, height: 20 }, { typeface: fontLatin, pt: 12, bold: true, color: C.violet });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="220" viewBox="0 0 900 220"><rect width="900" height="220" fill="none"/><text x="20" y="140" font-family="Cambria Math, serif" font-size="92" fill="#0B1020">∫₀^∞ e⁻ˣ² dx = √π / 2</text></svg>`;
  slide.images.add({ blob: new TextEncoder().encode(svg), contentType: "image/svg+xml", alt: "equation vector sample", fit: "contain", position: { left: 100, top: 288, width: 460, height: 92 } });
  text(slide, "sharp / scalable / not character-editable", { left: 100, top: 430, width: 460, height: 24 }, { typeface: fontLatin, pt: 14, color: C.violet, align: "center" });
  box(slide, undefined, { left: 636, top: 190, width: 516, height: 350 }, { fill: C.redSoft, line: line(C.rose, 1.5) });
  text(slide, "LEVEL 0 · RASTER_EQUATION", { left: 664, top: 218, width: 380, height: 20 }, { typeface: fontLatin, pt: 12, bold: true, color: C.rose });
  const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const rasterPng = addPngTextChunk(tinyPng, "Description", "raster equation sample");
  slide.images.add({ blob: rasterPng, contentType: "image/png", alt: "raster equation sample", fit: "contain", position: { left: 756, top: 286, width: 276, height: 96 } });
  text(slide, "not editable / low-resolution risk / flag EQUATION_RASTERIZED", { left: 676, top: 430, width: 436, height: 32 }, { typeface: fontLatin, pt: 14, color: C.rose, align: "center" });
  note(slide, "Fixture: a manually supplied SVG vector candidate and a deliberately tiny PNG candidate. The diagnostics should classify these from package relationships and labels.");
}

// Slide 4: mixed script, multiline, and intentional layout stress case.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.ink;
  title(slide, 4, "RENDER QA", "Typography is geometry", true);
  box(slide, "正常：单行公式 + 中文标签", { left: 72, top: 158, width: 400, height: 54 }, { fill: "#182342", line: line("#33416E", 1), color: "#C8D2F0", pt: 16 });
  formula(slide, "δₜ = [Rₜ₊₁ + γV(Sₜ₊₁)] − V(Sₜ)", { left: 72, top: 236, width: 560, height: 58 }, { pt: 25, color: C.white });
  box(slide, "Stress case: narrow box should trigger\nEQUATION_TEXT_LAYOUT_POOR", { left: 72, top: 360, width: 400, height: 72 }, { fill: "#331925", line: line(C.rose, 1.2), color: "#FFD9DF", pt: 15, bold: true });
  formula(slide, "Q(s,a) ← Q(s,a) + α[r + γ maxₐ′Q(s′,a′) − Q(s,a)]", { left: 72, top: 468, width: 400, height: 90 }, { pt: 22, color: C.white, wrap: "square" });
  text(slide, "Do not “fix” this by shrinking the font. Widen the object or redesign the zone.", { left: 560, top: 236, width: 550, height: 46 }, { typeface: fontCjk, pt: 21, color: "#D5DDF5" });
  text(slide, "Checklist", { left: 560, top: 350, width: 200, height: 28 }, { typeface: fontLatin, pt: 16, bold: true, color: C.cyan });
  ["baseline alignment", "font substitution", "clipping", "padding", "one-line fit"].forEach((item, index) => {
    const y = 398 + index * 38;
    slide.shapes.add({ geometry: "ellipse", position: { left: 560, top: y + 5, width: 12, height: 12 }, fill: C.cyan, line: NO_LINE });
    text(slide, item, { left: 588, top: y, width: 300, height: 24 }, { typeface: fontCjk, pt: 17, color: C.white });
  });
  note(slide, "Fixture: one intentionally narrow formula box exercises wrap/layout diagnostics. The stress case is expected to be flagged, not silently claimed as clean.");
}

await (await PresentationFile.exportPptx(presentation)).save(TEST_PPTX);
console.log(JSON.stringify({
  output: TEST_PPTX,
  slideCount: presentation.slides.items.length,
  fonts: { latin: fontLatin, cjk: fontCjk, preferredMath: fontPreferredMath, fallbackMath: fontFallbackMath },
}));
