import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  inspectEquationSvg,
  renderLatexBatch,
  renderLatexRemoteToSvg,
  validateLatexFragment,
} from "./remote_latex_renderer.mjs";

const safeSvg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20" width="100pt" height="20pt"><defs><path id="g" d="M0 0h10v10H0z"/></defs><use href="#g"/></svg>`;

assert.equal(validateLatexFragment("\\frac{a}{b}").ok, true);
assert.equal(validateLatexFragment("\\input{secret.tex}").ok, false);
assert.equal(inspectEquationSvg(safeSvg).hasUse, true);
const fontDependent = inspectEquationSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><text font-family="Cambria Math">x</text></svg>');
assert.equal(fontDependent.hasFontDependency, true);
assert.ok(fontDependent.diagnostics.some((item) => item.code === "REMOTE_LATEX_SVG_FONT_DEPENDENCY"));
assert.throws(
  () => inspectEquationSvg('<svg viewBox="0 0 10 10"><image href="data:image/png;base64,AA=="/></svg>'),
  (error) => error.code === "REMOTE_LATEX_SVG_RASTER_CONTENT",
);

const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "presentation-polish-remote-latex-test-"));
let calls = 0;
const mockFetch = async () => {
  calls += 1;
  return new Response(safeSvg, { status: 200, headers: { "content-type": "image/svg+xml" } });
};

const rendered = await renderLatexRemoteToSvg({
  latex: "\\frac{a}{b}",
  allowRemoteEquationRendering: true,
  equationProvider: "generic",
  endpoint: "https://example.invalid/render",
  cacheDir,
  fetchImpl: mockFetch,
  strictLatexFidelity: true,
});
assert.equal(rendered.status, "REMOTE_LATEX_RENDERED");
assert.equal(rendered.asset.contentType, "image/svg+xml");
assert.ok(rendered.inspection.hasUse);

const cached = await renderLatexRemoteToSvg({
  latex: "\\frac{a}{b}",
  allowRemoteEquationRendering: true,
  equationProvider: "generic",
  endpoint: "https://example.invalid/render",
  cacheDir,
  fetchImpl: async () => { throw new Error("cache should avoid network"); },
  strictLatexFidelity: true,
});
assert.equal(cached.status, "REMOTE_LATEX_CACHE_HIT");
assert.equal(calls, 1);

let batchCalls = 0;
const batch = await renderLatexBatch({
  equations: ["x + y", "x + y", "\\sum_{t=0}^{T} r_t"],
  allowRemoteEquationRendering: true,
  equationProvider: "generic",
  endpoint: "https://example.invalid/render",
  cache: false,
  strictLatexFidelity: true,
  concurrency: 2,
  fetchImpl: async () => {
    batchCalls += 1;
    return new Response(safeSvg, { status: 200, headers: { "content-type": "image/svg+xml" } });
  },
});
assert.equal(batch.stats.requested, 3);
assert.equal(batch.stats.unique, 2);
assert.equal(batchCalls, 2);
assert.ok(batch.results.every((item) => item.status === "REMOTE_LATEX_RENDERED"));

let retryCalls = 0;
const retried = await renderLatexRemoteToSvg({
  latex: "x^2 + y^2",
  allowRemoteEquationRendering: true,
  equationProvider: "generic",
  endpoint: "https://example.invalid/render",
  cache: false,
  maxRetries: 2,
  strictLatexFidelity: true,
  fallbackOnRemoteFailure: "error",
  fetchImpl: async () => {
    retryCalls += 1;
    if (retryCalls === 1) return new Response("busy", { status: 503 });
    return new Response(safeSvg, { status: 200, headers: { "content-type": "image/svg+xml" } });
  },
});
assert.equal(retried.status, "REMOTE_LATEX_RENDERED");
assert.equal(retryCalls, 2);
assert.ok(retried.diagnostics.some((item) => item.code === "REMOTE_LATEX_RETRY"));

const timedOut = await renderLatexRemoteToSvg({
  latex: "x^3",
  allowRemoteEquationRendering: true,
  equationProvider: "generic",
  endpoint: "https://example.invalid/render",
  cache: false,
  timeoutMs: 25,
  maxRetries: 0,
  strictLatexFidelity: true,
  fallbackOnRemoteFailure: "editable_text",
  fetchImpl: async (_url, request) => await new Promise((resolve, reject) => {
    request.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  }),
});
assert.equal(timedOut.status, "REMOTE_LATEX_FALLBACK");
assert.equal(timedOut.errorCode, "REMOTE_LATEX_TIMEOUT");

await assert.rejects(
  () => renderLatexRemoteToSvg({
    latex: "x",
    allowRemoteEquationRendering: true,
    equationProvider: "generic",
    endpoint: "http://example.invalid/render",
    cache: false,
    fallbackOnRemoteFailure: "error",
  }),
  (error) => error.code === "REMOTE_LATEX_INSECURE_ENDPOINT",
);

const disabled = await renderLatexRemoteToSvg({
  latex: "x^2",
  allowRemoteEquationRendering: false,
  fetchImpl: async () => { throw new Error("disabled request should not run"); },
});
assert.equal(disabled.status, "REMOTE_LATEX_DISABLED");

await fs.rm(cacheDir, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, networkCalls: calls, batchNetworkCalls: batchCalls, retryCalls }));
