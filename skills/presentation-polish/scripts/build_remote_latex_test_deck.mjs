import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { renderLatexBatch } from "./remote_latex_renderer.mjs";

const { TEST_PPTX, PRESENTATIONS_SKILL_DIR, RUNTIME_NODE_MODULES, SKILL_DIR } = process.env;
if (![TEST_PPTX, PRESENTATIONS_SKILL_DIR, RUNTIME_NODE_MODULES, SKILL_DIR].every((value) => path.isAbsolute(value ?? ""))) {
  throw new Error("TEST_PPTX, PRESENTATIONS_SKILL_DIR, RUNTIME_NODE_MODULES and SKILL_DIR must be absolute paths");
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
const fontAptos = resolvePresentationFont({ fontFamily: "Aptos" });
const fontCambriaMath = resolvePresentationFont({ fontFamily: "Cambria Math" });
const fontLatinModernMath = resolvePresentationFont({ fontFamily: "Latin Modern Math" });

const C = {
  ink: "#0B1020",
  ink2: "#141D38",
  white: "#FFFFFF",
  muted: "#667085",
  pale: "#F7F9FC",
  line: "#CBD5E1",
  cyan: "#11C5BE",
  blue: "#3B82F6",
  violet: "#8B5CF6",
  orange: "#F59E0B",
  rose: "#F43F5E",
  cyanPale: "#E8FFFC",
  violetPale: "#F2EEFF",
  orangePale: "#FFF7E6",
  rosePale: "#FFF0F2",
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
  text(slide, kicker.toUpperCase(), { left: 72, top: 30, width: 500, height: 20 }, {
    typeface: fontLatin, pt: 12, bold: true, color: dark ? C.cyan : C.violet,
  });
  text(slide, heading, { left: 72, top: 58, width: 1030, height: 48 }, {
    typeface: fontCjk, pt: 30, bold: true, color: titleColor,
  });
  text(slide, String(number).padStart(2, "0"), { left: 1168, top: 32, width: 40, height: 20 }, {
    typeface: fontLatin, pt: 13, bold: true, color: dark ? "#B8C3E6" : C.muted, align: "right",
  });
}

function note(slide, value) {
  slide.speakerNotes.textFrame.setText(value);
}

function fitFormula(result, left, top, maxWidth, maxHeight) {
  const aspectRatio = result.aspectRatio || 4;
  let width = Math.min(maxWidth, maxHeight * aspectRatio);
  let height = width / aspectRatio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }
  return { left, top: top + (maxHeight - height) / 2, width, height };
}

function addFormula(slide, result, position, altPrefix = "LaTeX equation") {
  assert.ok(result.asset?.blob, `No SVG asset for ${result.sourceLatex}`);
  assert.equal(result.asset.contentType, "image/svg+xml");
  slide.images.add({
    blob: result.asset.blob,
    contentType: result.asset.contentType,
    alt: `${altPrefix}: ${result.sourceLatex}`,
    fit: "contain",
    position: fitFormula(result, position.left, position.top, position.width, position.height),
  });
}

const testDir = path.dirname(TEST_PPTX);
const cacheDir = process.env.REMOTE_LATEX_CACHE_DIR || path.join(testDir, "cache");
const formulas = [
  "E = mc^2",
  "\\frac{a+b}{c+d}",
  "\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}",
  "\\sum_{t=0}^{T} \\gamma^t R_{t+1}",
  "\\mathcal{M} = (\\mathcal{S},\\mathcal{A},P,R,\\gamma)",
  "V^\\pi(s) = \\mathbb{E}_\\pi[G_t \\mid S_t=s]",
  "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}",
  "\\delta_t = R_{t+1} + \\gamma V(S_{t+1}) - V(S_t)",
];

const batch = await renderLatexBatch({
  equations: formulas.map((latex, index) => ({ latex, displayMode: index !== 0, fontSize: index === 6 ? 24 : 28 })),
  equationProvider: process.env.REMOTE_LATEX_PROVIDER || "codecogs",
  endpoint: process.env.REMOTE_LATEX_ENDPOINT || "",
  allowRemoteEquationRendering: true,
  cache: true,
  cacheDir,
  timeoutMs: Number(process.env.REMOTE_LATEX_TIMEOUT_MS || 8000),
  maxRetries: Number(process.env.REMOTE_LATEX_MAX_RETRIES || 2),
  concurrency: Number(process.env.REMOTE_LATEX_CONCURRENCY || 3),
  strictLatexFidelity: true,
  fallbackOnRemoteFailure: "error",
  rejectRasterSvg: true,
  rejectExternalResources: true,
});
assert.equal(batch.results.length, formulas.length);
assert.ok(batch.results.every((result) => ["REMOTE_LATEX_RENDERED", "REMOTE_LATEX_CACHE_HIT"].includes(result.status)));

const presentation = Presentation.create({ slideSize: { width: W, height: H } });

// Slide 1: A/B font and remote vector comparison.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.ink;
  title(slide, 1, "REMOTE LATEX QA", "Source-backed equations without local TeX", true);
  text(slide, "The remote renderer sends only the equation source and returns a sanitized SVG asset.", { left: 72, top: 126, width: 900, height: 30 }, { typeface: fontCjk, pt: 18, color: "#C8D2F0" });
  box(slide, undefined, { left: 72, top: 202, width: 520, height: 300 }, { fill: C.ink2, line: line("#33416E", 1) });
  text(slide, "A / EDITABLE TEXT PROBE", { left: 100, top: 226, width: 360, height: 20 }, { typeface: fontLatin, pt: 12, bold: true, color: C.cyan });
  text(slide, "Aptos", { left: 108, top: 278, width: 120, height: 20 }, { typeface: fontLatin, pt: 13, color: "#B8C3E6" });
  text(slide, "E = mc²", { left: 226, top: 266, width: 260, height: 42 }, { typeface: fontAptos, pt: 28, color: C.white, align: "center" });
  text(slide, "Cambria Math", { left: 108, top: 344, width: 120, height: 20 }, { typeface: fontLatin, pt: 13, color: "#B8C3E6" });
  text(slide, "V^π(s) = Eπ[Gₜ]", { left: 226, top: 332, width: 260, height: 42 }, { typeface: fontCambriaMath, pt: 23, color: C.white, align: "center" });
  text(slide, "Latin Modern Math", { left: 108, top: 410, width: 120, height: 20 }, { typeface: fontLatin, pt: 13, color: "#B8C3E6" });
  text(slide, "∫₀∞ e⁻ˣ² dx", { left: 226, top: 398, width: 260, height: 42 }, { typeface: fontLatinModernMath, pt: 24, color: C.white, align: "center" });
  box(slide, undefined, { left: 640, top: 202, width: 528, height: 300 }, { fill: C.violetPale, line: line(C.violet, 1.5) });
  text(slide, "B / REMOTE SVG · LEVEL 1", { left: 668, top: 226, width: 390, height: 20 }, { typeface: fontLatin, pt: 12, bold: true, color: C.violet });
  addFormula(slide, batch.results[2], { left: 680, top: 270, width: 446, height: 92 });
  text(slide, "vector paths · transparent bounds · not Office Math characters", { left: 676, top: 410, width: 450, height: 34 }, { typeface: fontLatin, pt: 14, color: C.violet, align: "center" });
  note(slide, `Remote LaTeX QA slide. Source: ${formulas[2]}\nProvider: ${batch.results[2].provider}\nStatus: ${batch.results[2].status}\nSVG inspection: ${JSON.stringify(batch.results[2].inspection)}`);
}

// Slide 2: formula gallery with independent SVG assets.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.pale;
  title(slide, 2, "SVG GALLERY", "One source formula becomes one independent vector asset");
  const labels = ["fraction", "integral", "discounted return", "MDP tuple", "value function", "matrix"];
  const positions = [
    [72, 160], [442, 160], [812, 160],
    [72, 356], [442, 356], [812, 356],
  ];
  [1, 2, 3, 4, 5, 6].forEach((formulaIndex, index) => {
    const [left, top] = positions[index];
    const accent = [C.violet, C.blue, C.cyan, C.orange, C.rose, C.violet][index];
    box(slide, undefined, { left, top, width: 316, height: 148 }, { fill: C.white, line: line(accent, 1.2) });
    text(slide, labels[index].toUpperCase(), { left: left + 20, top: top + 18, width: 260, height: 18 }, { typeface: fontLatin, pt: 11, bold: true, color: accent });
    addFormula(slide, batch.results[formulaIndex], { left: left + 18, top: top + 48, width: 280, height: 68 });
  });
  text(slide, "Every equation remains a separate picture object with its own aspect ratio and alt text; the source LaTeX is retained in notes/build metadata.", { left: 72, top: 620, width: 1080, height: 28 }, { typeface: fontCjk, pt: 15, color: C.muted });
  note(slide, formulas.map((latex, index) => `${index + 1}. ${latex}`).join("\n"));
}

// Slide 3: pipeline, policy, cache, and diagnostics.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.white;
  title(slide, 3, "PIPELINE CONTRACT", "Remote rendering is an asset step, not a second PPTX engine");
  const stages = [
    ["01", "LaTeX source", "canonical\nsource kept", C.violetPale, C.violet],
    ["02", "HTTPS provider", "GET encoded\nfragment", C.cyanPale, C.cyan],
    ["03", "SVG inspection", "path/use\nviewBox", C.orangePale, C.orange],
    ["04", "Artifact Tool", "image asset\nfit: contain", C.rosePale, C.rose],
  ];
  stages.forEach(([number, heading, body, fill, accent], index) => {
    const left = 72 + index * 286;
    box(slide, undefined, { left, top: 190, width: 238, height: 150 }, { fill, line: line(accent, 1.2) });
    text(slide, number, { left: left + 18, top: 210, width: 36, height: 24 }, { typeface: fontLatin, pt: 14, bold: true, color: accent });
    text(slide, heading, { left: left + 18, top: 246, width: 202, height: 24 }, { typeface: fontCjk, pt: 18, bold: true, color: C.ink });
    text(slide, body, { left: left + 18, top: 280, width: 202, height: 42 }, { typeface: fontLatin, pt: 14, color: C.muted });
    if (index < stages.length - 1) text(slide, "→", { left: left + 246, top: 248, width: 34, height: 30 }, { typeface: fontLatin, pt: 24, bold: true, color: C.muted, align: "center" });
  });
  box(slide, undefined, { left: 72, top: 408, width: 520, height: 132 }, { fill: C.ink, line: line(C.ink, 1) });
  text(slide, "POLICY", { left: 98, top: 430, width: 120, height: 18 }, { typeface: fontLatin, pt: 12, bold: true, color: C.cyan });
  text(slide, "allowRemoteEquationRendering = true", { left: 98, top: 464, width: 442, height: 24 }, { typeface: fontLatin, pt: 18, bold: true, color: C.white });
  text(slide, "only equation source leaves the process", { left: 98, top: 500, width: 442, height: 20 }, { typeface: fontCjk, pt: 14, color: "#C8D2F0" });
  box(slide, undefined, { left: 632, top: 408, width: 536, height: 132 }, { fill: C.pale, line: line(C.line, 1) });
  text(slide, "OBSERVED RESULT", { left: 660, top: 430, width: 180, height: 18 }, { typeface: fontLatin, pt: 12, bold: true, color: C.violet });
  text(slide, `provider: ${batch.results[0].provider}\ncache: ${batch.stats.cacheHits ? "hit available" : "miss → write"}\nSVG: ${batch.results[0].inspection.hasPath ? "path/use" : "no paths"} · raster: ${batch.results[0].inspection.hasRasterImage ? "yes" : "no"}`, { left: 660, top: 462, width: 470, height: 58 }, { typeface: fontLatin, pt: 16, color: C.ink });
  note(slide, `Batch stats: ${JSON.stringify(batch.stats)}\nDiagnostics:\n${batch.results.flatMap((result) => result.diagnostics.map((item) => `${result.sourceLatex}: ${item.code}`)).join("\n")}`);
}

// Slide 4: controlled limitations and fallback wording.
{
  const slide = presentation.slides.add();
  slide.background.fill = C.ink;
  title(slide, 4, "CLAIM BOUNDARY", "Sharp, inspectable ≠ Office Math", true);
  text(slide, "The SVG is a Level 1 vector_equation: movable, scalable, and editable as graphic geometry.", { left: 72, top: 126, width: 960, height: 30 }, { typeface: fontCjk, pt: 18, color: "#C8D2F0" });
  const columns = [
    ["WHAT IT SOLVES", ["fraction / integral / matrix fidelity", "no local TeX installation", "no equation wrap caused by a text box", "independent SVG asset in the deck"], C.cyan],
    ["WHAT IT DOES NOT SOLVE", ["not character-editable math", "not a native Office Math object", "remote service availability can vary", "source must be preserved by the caller"], C.orange],
  ];
  columns.forEach(([heading, items, accent], index) => {
    const left = index === 0 ? 72 : 666;
    box(slide, undefined, { left, top: 206, width: 542, height: 276 }, { fill: C.ink2, line: line(accent, 1.2) });
    text(slide, heading, { left: left + 28, top: 232, width: 460, height: 20 }, { typeface: fontLatin, pt: 12, bold: true, color: accent });
    items.forEach((item, itemIndex) => {
      const top = 278 + itemIndex * 42;
      slide.shapes.add({ geometry: "ellipse", position: { left: left + 30, top: top + 8, width: 10, height: 10 }, fill: accent, line: NO_LINE });
      text(slide, item, { left: left + 54, top, width: 440, height: 26 }, { typeface: fontCjk, pt: 16, color: C.white });
    });
  });
  text(slide, "Strict mode: remote failure → error. Polish mode: remote failure → keep_existing, with a diagnostic.", { left: 72, top: 568, width: 1080, height: 26 }, { typeface: fontLatin, pt: 16, color: "#B8C3E6", align: "center" });
  note(slide, "This final fixture slide documents the honest editability claim and failure policies. It is not a production deck.");
}

await (await PresentationFile.exportPptx(presentation)).save(TEST_PPTX);
console.log(JSON.stringify({
  output: TEST_PPTX,
  slideCount: presentation.slides.items.length,
  provider: batch.results[0].provider,
  statuses: batch.results.map((result) => result.status),
  stats: batch.stats,
  fonts: { latin: fontLatin, cjk: fontCjk, aptos: fontAptos, cambriaMath: fontCambriaMath, latinModernMath: fontLatinModernMath },
}));
