import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Remote LaTeX -> SVG asset helper for presentation-polish.
 *
 * This module deliberately stops at equation-asset generation. It does not
 * author PPTX files and does not know about slide coordinates. The caller
 * inserts the returned SVG bytes through the Presentations/Artifact Tool
 * image API and records the source/provenance in notes or build metadata.
 */

export const REMOTE_LATEX_SCHEMA_VERSION = "presentation-polish.remote-latex.v1";

export const DEFAULT_REMOTE_LATEX_CONFIG = Object.freeze({
  equationMode: "remote_latex",
  equationProvider: "auto",
  allowRemoteEquationRendering: false,
  endpoint: "",
  timeoutMs: 8000,
  maxRetries: 2,
  concurrency: 3,
  cache: true,
  cacheDir: path.join(os.tmpdir(), "presentation-polish-remote-latex-cache"),
  preferSvgPaths: true,
  rejectRasterSvg: true,
  rejectExternalResources: true,
  sanitizeSvg: true,
  maxResponseBytes: 2_000_000,
  fallbackOnRemoteFailure: "keep_existing",
  strictLatexFidelity: true,
  displayMode: true,
  fontSize: 28,
});

const DANGEROUS_LATEX_PATTERNS = [
  /\\(?:input|include|openin|openout|write18|write|read|usepackage|documentclass)\b/i,
  /\\(?:begin|end)\s*\{\s*document\s*\}/i,
  /\\(?:catcode|special|immediate)\b/i,
  /(?:^|[^\\])(?:javascript:|data:text\/html|file:\/\/)/i,
];

const MAX_LATEX_LENGTH = 20_000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class RemoteLatexError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RemoteLatexError";
    this.code = code;
    this.details = details;
  }
}

function numericEnv(name, fallback, minimum, maximum) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

export function getRemoteLatexConfig(overrides = {}) {
  const envConfig = {
    equationProvider: process.env.REMOTE_LATEX_PROVIDER || undefined,
    endpoint: process.env.REMOTE_LATEX_ENDPOINT || undefined,
    timeoutMs: numericEnv("REMOTE_LATEX_TIMEOUT_MS", undefined, 250, 120_000),
    maxRetries: numericEnv("REMOTE_LATEX_MAX_RETRIES", undefined, 0, 5),
    concurrency: numericEnv("REMOTE_LATEX_CONCURRENCY", undefined, 1, 8),
    proxy: process.env.REMOTE_LATEX_PROXY || undefined,
  };
  return {
    ...DEFAULT_REMOTE_LATEX_CONFIG,
    ...Object.fromEntries(Object.entries(envConfig).filter(([, value]) => value !== undefined)),
    ...overrides,
  };
}

function stripOuterMathDelimiters(value) {
  let result = value.trim();
  const pairs = [
    ["$$", "$$"],
    ["\\[", "\\]"],
    ["\\(", "\\)"],
    ["$", "$"],
  ];
  for (const [open, close] of pairs) {
    if (result.startsWith(open) && result.endsWith(close) && result.length > open.length + close.length) {
      result = result.slice(open.length, -close.length).trim();
      break;
    }
  }
  return result;
}

export function normalizeLatexSource(latex) {
  if (latex === null || latex === undefined) {
    throw new RemoteLatexError("REMOTE_LATEX_INVALID_SOURCE", "LaTeX source is required.");
  }
  const normalized = stripOuterMathDelimiters(String(latex).normalize("NFC").replace(/\r\n?/g, "\n"));
  if (!normalized || normalized.length > MAX_LATEX_LENGTH || normalized.includes("\0")) {
    throw new RemoteLatexError("REMOTE_LATEX_INVALID_SOURCE", "LaTeX source is empty, contains NUL, or is too long.", {
      length: normalized.length,
      maxLength: MAX_LATEX_LENGTH,
    });
  }
  const validation = validateLatexFragment(normalized);
  if (!validation.ok) {
    throw new RemoteLatexError("REMOTE_LATEX_UNSAFE_SOURCE", "LaTeX source contains a blocked command or external reference.", {
      violations: validation.violations,
    });
  }
  return normalized;
}

export function validateLatexFragment(latex) {
  const source = String(latex ?? "");
  const violations = [];
  for (const pattern of DANGEROUS_LATEX_PATTERNS) {
    if (pattern.test(source)) violations.push(pattern.source);
  }
  return { ok: violations.length === 0, violations };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function cacheKeyFor({ providerName, endpoint, latex, displayMode, fontSize }) {
  return sha256(JSON.stringify({
    schema: REMOTE_LATEX_SCHEMA_VERSION,
    providerName,
    endpoint,
    latex,
    displayMode: Boolean(displayMode),
    fontSize: Number(fontSize),
  }));
}

function ensureTrailingQuerySeparator(endpoint) {
  if (endpoint.endsWith("?") || endpoint.endsWith("&")) return endpoint;
  return endpoint.includes("?") ? `${endpoint}&` : `${endpoint}?`;
}

function encodeQueryFragment(value) {
  return encodeURIComponent(value).replace(/%20/g, "%20");
}

function buildCodeCogsRequest({ latex, displayMode, fontSize, endpoint }) {
  const dpi = Math.min(300, Math.max(72, Math.round(Number(fontSize || 28) * 4)));
  const commands = [`\\dpi{${dpi}}`];
  if (displayMode) commands.push("\\displaystyle");
  const payload = `${commands.join(" ")} ${latex}`;
  const target = endpoint || "https://latex.codecogs.com/svg.image?";
  let url;
  if (target.includes("{latex}")) {
    url = target.replaceAll("{latex}", encodeQueryFragment(payload));
  } else if (/[?&](?:latex|tex)=/i.test(target)) {
    const parsed = new URL(target);
    const key = parsed.searchParams.has("tex") ? "tex" : "latex";
    parsed.searchParams.set(key, payload);
    url = parsed.toString();
  } else {
    url = `${ensureTrailingQuerySeparator(target)}${encodeQueryFragment(payload)}`;
  }
  return {
    url,
    method: "GET",
    headers: { accept: "image/svg+xml, application/xml;q=0.9, text/plain;q=0.5" },
  };
}

function buildGenericRequest({ latex, displayMode, fontSize, endpoint }) {
  if (!endpoint) {
    throw new RemoteLatexError("REMOTE_LATEX_PROVIDER_CONFIG", "A generic remote LaTeX provider requires an endpoint.");
  }
  const payload = displayMode ? `\\displaystyle ${latex}` : latex;
  if (endpoint.includes("{latex}")) {
    return {
      url: endpoint.replaceAll("{latex}", encodeQueryFragment(payload)),
      method: "GET",
      headers: { accept: "image/svg+xml, application/xml;q=0.9, text/plain;q=0.5" },
    };
  }
  const parsed = new URL(endpoint);
  parsed.searchParams.set(process.env.REMOTE_LATEX_QUERY_PARAM || "latex", payload);
  parsed.searchParams.set(process.env.REMOTE_LATEX_FONT_SIZE_PARAM || "fontSize", String(fontSize));
  return {
    url: parsed.toString(),
    method: "GET",
    headers: { accept: "image/svg+xml, application/xml;q=0.9, text/plain;q=0.5" },
  };
}

export const REMOTE_LATEX_PROVIDERS = Object.freeze({
  codecogs: {
    name: "codecogs",
    defaultEndpoint: "https://latex.codecogs.com/svg.image?",
    buildRequest: buildCodeCogsRequest,
  },
  generic: {
    name: "generic",
    defaultEndpoint: "",
    buildRequest: buildGenericRequest,
  },
});

function resolveProvider(service, config) {
  if (service && typeof service === "object" && typeof service.buildRequest === "function") {
    return { ...service, name: service.name || "custom" };
  }
  const requested = typeof service === "string" && service !== "auto"
    ? service
    : (config.equationProvider && config.equationProvider !== "auto" ? config.equationProvider : "auto");
  if (requested === "auto") {
    return config.endpoint ? { ...REMOTE_LATEX_PROVIDERS.generic } : { ...REMOTE_LATEX_PROVIDERS.codecogs };
  }
  const provider = REMOTE_LATEX_PROVIDERS[requested];
  if (!provider) {
    throw new RemoteLatexError("REMOTE_LATEX_PROVIDER_CONFIG", `Unknown remote LaTeX provider: ${requested}`, {
      available: Object.keys(REMOTE_LATEX_PROVIDERS),
    });
  }
  return { ...provider };
}

function cachePaths(cacheDir, cacheKey) {
  return {
    svg: path.join(cacheDir, `${cacheKey}.svg`),
    meta: path.join(cacheDir, `${cacheKey}.json`),
  };
}

async function readCache(cacheDir, cacheKey, options = {}) {
  if (!cacheDir) return null;
  const files = cachePaths(cacheDir, cacheKey);
  try {
    const svg = await fs.readFile(files.svg, "utf8");
    const inspected = inspectEquationSvg(svg, options);
    return { svg, inspected, files };
  } catch {
    return null;
  }
}

async function writeCache(cacheDir, cacheKey, svg, metadata) {
  if (!cacheDir) return;
  await fs.mkdir(cacheDir, { recursive: true });
  const files = cachePaths(cacheDir, cacheKey);
  const tempSuffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tempSvg = `${files.svg}.${tempSuffix}.tmp`;
  const tempMeta = `${files.meta}.${tempSuffix}.tmp`;
  await fs.writeFile(tempSvg, svg, "utf8");
  await fs.writeFile(tempMeta, JSON.stringify(metadata, null, 2), "utf8");
  await fs.rename(tempSvg, files.svg);
  await fs.rename(tempMeta, files.meta);
}

function parseSvgNumber(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)/i);
  return match ? Number(match[1]) : null;
}

function parseViewBox(value) {
  if (!value) return null;
  const values = String(value).trim().split(/[ ,]+/).map(Number);
  if (values.length !== 4 || values.some((item) => !Number.isFinite(item)) || values[2] <= 0 || values[3] <= 0) {
    return null;
  }
  return values;
}

function addPreserveAspectRatio(svg) {
  const match = svg.match(/<svg\b[^>]*>/i);
  if (!match || /\bpreserveAspectRatio\s*=/.test(match[0])) return svg;
  return svg.replace(match[0], match[0].replace(/>$/, ' preserveAspectRatio="xMidYMid meet">'));
}

function sanitizeSvgDocument(svg) {
  let sanitized = String(svg).replace(/^\uFEFF/, "").trim();
  const removed = [];
  if (/<!DOCTYPE|<!ENTITY/i.test(sanitized)) {
    throw new RemoteLatexError("REMOTE_LATEX_INVALID_SVG", "SVG contains a doctype or entity declaration.");
  }
  if (/<script\b/i.test(sanitized)) {
    sanitized = sanitized.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
    removed.push("script");
  }
  if (/<foreignObject\b/i.test(sanitized)) {
    sanitized = sanitized.replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi, "");
    removed.push("foreignObject");
  }
  sanitized = sanitized.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, () => {
    removed.push("event-handler");
    return "";
  });
  if (/(?:javascript:|vbscript:|file:\/\/)/i.test(sanitized)) {
    throw new RemoteLatexError("REMOTE_LATEX_INVALID_SVG", "SVG contains a script or local-file reference.");
  }
  return { svg: addPreserveAspectRatio(sanitized), removed };
}

export function inspectEquationSvg(svg, options = {}) {
  const config = { ...DEFAULT_REMOTE_LATEX_CONFIG, ...options };
  const text = String(svg ?? "").replace(/^\uFEFF/, "").trim();
  const diagnostics = [];
  if (!text || !/<svg\b[^>]*>/i.test(text) || !/<\/svg\s*>\s*$/i.test(text)) {
    throw new RemoteLatexError("REMOTE_LATEX_INVALID_SVG", "Response does not contain a complete SVG root element.");
  }

  let sanitized = text;
  let removed = [];
  if (config.sanitizeSvg) {
    const result = sanitizeSvgDocument(text);
    sanitized = result.svg;
    removed = result.removed;
    if (removed.length) diagnostics.push({ code: "REMOTE_LATEX_SVG_SANITIZED", severity: "info", removed });
  }

  const root = sanitized.match(/<svg\b([^>]*)>/i)?.[1] || "";
  const viewBoxMatch = root.match(/\bviewBox\s*=\s*(["'])(.*?)\1/i);
  const viewBox = parseViewBox(viewBoxMatch?.[2]);
  if (!viewBox) {
    throw new RemoteLatexError("REMOTE_LATEX_INVALID_SVG", "SVG is missing a valid positive viewBox.");
  }
  const width = parseSvgNumber(root.match(/\bwidth\s*=\s*(["'])(.*?)\1/i)?.[2]);
  const height = parseSvgNumber(root.match(/\bheight\s*=\s*(["'])(.*?)\1/i)?.[2]);
  const hasPath = /<path\b/i.test(sanitized);
  const hasUse = /<use\b/i.test(sanitized);
  const hasText = /<text\b/i.test(sanitized);
  const hasRasterImage = /<image\b/i.test(sanitized) || /data:image\/(?:png|jpe?g|gif|webp)/i.test(sanitized);
  const hasExternalResource = /(?:href|xlink:href|src)\s*=\s*["'](?:https?:|\/\/|file:)/i.test(sanitized)
    || /url\(\s*(?:https?:|\/\/|file:)/i.test(sanitized);
  const hasFontDependency = hasText || /font-family\s*=/i.test(sanitized) || /@font-face/i.test(sanitized);
  const hasWhiteBackground = /<(?:rect|path)\b[^>]*\bfill\s*=\s*["'](?:white|#fff(?:fff)?|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))["']/i.test(sanitized);
  const aspectRatio = viewBox[2] / viewBox[3];

  if (!hasPath && !hasUse) diagnostics.push({ code: "REMOTE_LATEX_SVG_NO_VECTOR_PATH", severity: "warning" });
  if (hasFontDependency) diagnostics.push({ code: "REMOTE_LATEX_SVG_FONT_DEPENDENCY", severity: "warning" });
  if (hasRasterImage) diagnostics.push({ code: "REMOTE_LATEX_SVG_RASTER_CONTENT", severity: config.rejectRasterSvg ? "error" : "warning" });
  if (hasExternalResource) diagnostics.push({ code: "REMOTE_LATEX_SVG_EXTERNAL_RESOURCE", severity: config.rejectExternalResources ? "error" : "warning" });
  if (hasWhiteBackground) diagnostics.push({ code: "REMOTE_LATEX_SVG_WHITE_BACKGROUND", severity: "warning" });

  if (config.rejectRasterSvg && hasRasterImage) {
    throw new RemoteLatexError("REMOTE_LATEX_SVG_RASTER_CONTENT", "SVG contains raster image content.", { diagnostics });
  }
  if (config.rejectExternalResources && hasExternalResource) {
    throw new RemoteLatexError("REMOTE_LATEX_SVG_EXTERNAL_RESOURCE", "SVG references external resources.", { diagnostics });
  }

  return {
    svg: sanitized,
    viewBox,
    width,
    height,
    aspectRatio,
    hasPath,
    hasUse,
    hasText,
    hasRasterImage,
    hasExternalResource,
    hasFontDependency,
    hasWhiteBackground,
    diagnostics,
  };
}

function createAbortError() {
  const error = new Error("Remote LaTeX request timed out.");
  error.name = "AbortError";
  return error;
}

async function fetchWithTimeout(fetchImpl, request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(createAbortError()), timeoutMs);
  try {
    return await fetchImpl(request.url, { ...request, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError" || controller.signal.aborted) {
      throw new RemoteLatexError("REMOTE_LATEX_TIMEOUT", `Remote LaTeX request exceeded ${timeoutMs} ms.`, { timeoutMs });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseBody(response, maxResponseBytes) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maxResponseBytes) {
    throw new RemoteLatexError("REMOTE_LATEX_RESPONSE_TOO_LARGE", "Remote SVG response exceeds the configured size limit.", {
      declaredBytes: declared,
      maxResponseBytes,
    });
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxResponseBytes) {
    throw new RemoteLatexError("REMOTE_LATEX_RESPONSE_TOO_LARGE", "Remote SVG response exceeds the configured size limit.", {
      actualBytes: bytes.byteLength,
      maxResponseBytes,
    });
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function errorCodeFor(error) {
  if (error instanceof RemoteLatexError) return error.code;
  return "REMOTE_LATEX_HTTP_ERROR";
}

function shouldRetry(error, response, attempt, maxRetries) {
  if (attempt >= maxRetries) return false;
  if (error?.code === "REMOTE_LATEX_TIMEOUT") return true;
  if (error && !(error instanceof RemoteLatexError)) return true;
  return Boolean(response && RETRYABLE_STATUS.has(response.status));
}

function waitMsFor(attempt) {
  return Math.min(2000, 150 * (2 ** attempt));
}

function assertSecureEndpoint(url, fetchImpl) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new RemoteLatexError("REMOTE_LATEX_PROVIDER_CONFIG", "Remote LaTeX endpoint is not a valid URL.", { url });
  }
  // Real network calls must use HTTPS. Unit tests may inject a fetch double;
  // this keeps deterministic tests self-contained without weakening runtime
  // privacy defaults.
  if (parsed.protocol !== "https:" && fetchImpl === globalThis.fetch) {
    throw new RemoteLatexError("REMOTE_LATEX_INSECURE_ENDPOINT", "Remote LaTeX endpoint must use HTTPS.", { url });
  }
}

function fallbackResult({ sourceLatex, normalizedLatex, providerName, endpoint, diagnostics, error, config, existingAsset }) {
  const code = errorCodeFor(error);
  const allDiagnostics = [
    ...diagnostics,
    { code, severity: "warning", message: error?.message || String(error) },
  ];
  if (config.fallbackOnRemoteFailure === "keep_existing" && existingAsset) {
    allDiagnostics.push({ code: "REMOTE_LATEX_FALLBACK", severity: "warning", fallback: "keep_existing" });
    return {
      schemaVersion: REMOTE_LATEX_SCHEMA_VERSION,
      status: "REMOTE_LATEX_FALLBACK",
      sourceLatex,
      normalizedLatex,
      provider: providerName,
      endpoint,
      asset: existingAsset,
      diagnostics: allDiagnostics,
      errorCode: code,
      fallback: "keep_existing",
    };
  }
  if (config.fallbackOnRemoteFailure === "editable_text") {
    allDiagnostics.push({ code: "REMOTE_LATEX_FALLBACK", severity: "warning", fallback: "editable_text" });
    return {
      schemaVersion: REMOTE_LATEX_SCHEMA_VERSION,
      status: "REMOTE_LATEX_FALLBACK",
      sourceLatex,
      normalizedLatex,
      provider: providerName,
      endpoint,
      asset: null,
      diagnostics: allDiagnostics,
      errorCode: code,
      fallback: "editable_text",
    };
  }
  throw error;
}

/**
 * Render one source-backed equation to a sanitized SVG asset.
 *
 * `allowRemoteEquationRendering` is intentionally opt-in: the helper sends
 * only the equation source, never a slide, deck, or private presentation.
 */
export async function renderLatexRemoteToSvg({
  latex,
  displayMode = true,
  fontSize = 28,
  service = "auto",
  cache = true,
  cacheDir,
  timeout,
  existingAsset,
  fetchImpl = globalThis.fetch,
  ...overrides
} = {}) {
  const config = getRemoteLatexConfig({
    displayMode,
    fontSize,
    cache,
    ...(cacheDir ? { cacheDir } : {}),
    ...(timeout ? { timeoutMs: timeout } : {}),
    ...overrides,
  });
  const sourceLatex = String(latex ?? "");
  const normalizedLatex = normalizeLatexSource(sourceLatex);
  const diagnostics = [];
  if (!config.allowRemoteEquationRendering || process.env.REMOTE_LATEX_DISABLED === "1") {
    diagnostics.push({ code: "REMOTE_LATEX_DISABLED", severity: "info", message: "Remote equation rendering is disabled by policy." });
    if (config.strictLatexFidelity && config.fallbackOnRemoteFailure === "error") {
      throw new RemoteLatexError("REMOTE_LATEX_DISABLED", "Remote equation rendering is disabled by policy.");
    }
    return {
      schemaVersion: REMOTE_LATEX_SCHEMA_VERSION,
      status: "REMOTE_LATEX_DISABLED",
      sourceLatex,
      normalizedLatex,
      provider: null,
      endpoint: null,
      asset: existingAsset || null,
      diagnostics,
      fallback: existingAsset ? "keep_existing" : config.fallbackOnRemoteFailure,
    };
  }
  if (typeof fetchImpl !== "function") {
    throw new RemoteLatexError("REMOTE_LATEX_FETCH_UNAVAILABLE", "No fetch implementation is available in the current runtime.");
  }

  const provider = resolveProvider(service, config);
  const endpoint = config.endpoint || provider.defaultEndpoint || "";
  const requestMeta = { latex: normalizedLatex, displayMode, fontSize, endpoint };
  const cacheKey = cacheKeyFor({ providerName: provider.name, ...requestMeta });
  if (config.cache) {
    const cached = await readCache(config.cacheDir, cacheKey, config);
    if (cached) {
      diagnostics.push({ code: "REMOTE_LATEX_CACHE_HIT", severity: "info", cacheKey });
      return {
        schemaVersion: REMOTE_LATEX_SCHEMA_VERSION,
        status: "REMOTE_LATEX_CACHE_HIT",
        sourceLatex,
        normalizedLatex,
        provider: provider.name,
        endpoint,
        cacheKey,
        asset: { blob: new TextEncoder().encode(cached.inspected.svg), contentType: "image/svg+xml", alt: sourceLatex },
        aspectRatio: cached.inspected.aspectRatio,
        svg: cached.inspected.svg,
        diagnostics: [...diagnostics, ...cached.inspected.diagnostics],
        inspection: cached.inspected,
      };
    }
  }

  const request = provider.buildRequest({ ...requestMeta, endpoint });
  assertSecureEndpoint(request.url, fetchImpl);
  let lastError = null;
  const maxRetries = Number.isFinite(config.maxRetries) ? config.maxRetries : 2;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response = null;
    try {
      response = await fetchWithTimeout(fetchImpl, request, config.timeoutMs);
      if (!response.ok) {
        const error = new RemoteLatexError("REMOTE_LATEX_HTTP_ERROR", `Remote LaTeX provider returned HTTP ${response.status}.`, {
          status: response.status,
          statusText: response.statusText,
        });
        if (shouldRetry(error, response, attempt, maxRetries)) {
          diagnostics.push({ code: "REMOTE_LATEX_RETRY", severity: "info", attempt: attempt + 1, status: response.status });
          await new Promise((resolve) => setTimeout(resolve, waitMsFor(attempt)));
          continue;
        }
        throw error;
      }
      const contentType = response.headers?.get?.("content-type") || "";
      const svgText = await readResponseBody(response, config.maxResponseBytes);
      if (!/<svg\b/i.test(svgText)) {
        throw new RemoteLatexError("REMOTE_LATEX_INVALID_RESPONSE", "Remote provider response is not SVG/XML content.", {
          contentType,
          preview: svgText.slice(0, 180),
        });
      }
      const inspected = inspectEquationSvg(svgText, config);
      diagnostics.push({ code: "REMOTE_LATEX_RENDERED", severity: "info", provider: provider.name, attempt: attempt + 1 });
      const allDiagnostics = [...diagnostics, ...inspected.diagnostics];
      const result = {
        schemaVersion: REMOTE_LATEX_SCHEMA_VERSION,
        status: "REMOTE_LATEX_RENDERED",
        sourceLatex,
        normalizedLatex,
        provider: provider.name,
        endpoint,
        cacheKey,
        contentType: "image/svg+xml",
        svg: inspected.svg,
        asset: { blob: new TextEncoder().encode(inspected.svg), contentType: "image/svg+xml", alt: sourceLatex },
        aspectRatio: inspected.aspectRatio,
        inspection: inspected,
        diagnostics: allDiagnostics,
      };
      if (config.cache) {
        await writeCache(config.cacheDir, cacheKey, inspected.svg, {
          schemaVersion: REMOTE_LATEX_SCHEMA_VERSION,
          sourceLatex,
          normalizedLatex,
          provider: provider.name,
          endpoint,
          aspectRatio: inspected.aspectRatio,
          diagnostics: allDiagnostics,
          createdAt: new Date().toISOString(),
        });
      }
      return result;
    } catch (error) {
      lastError = error;
      if (shouldRetry(error, response, attempt, maxRetries)) {
        diagnostics.push({ code: "REMOTE_LATEX_RETRY", severity: "info", attempt: attempt + 1, error: errorCodeFor(error) });
        await new Promise((resolve) => setTimeout(resolve, waitMsFor(attempt)));
        continue;
      }
      break;
    }
  }

  if (config.fallbackOnRemoteFailure === "error" || (config.strictLatexFidelity && !existingAsset && config.fallbackOnRemoteFailure !== "editable_text")) {
    throw lastError;
  }
  return fallbackResult({
    sourceLatex,
    normalizedLatex,
    providerName: provider.name,
    endpoint,
    diagnostics,
    error: lastError,
    config,
    existingAsset,
  });
}

export async function renderLatexBatch({ equations, concurrency, ...options } = {}) {
  const items = Array.isArray(equations) ? equations : [];
  const config = getRemoteLatexConfig({ ...options, ...(concurrency ? { concurrency } : {}) });
  const results = new Array(items.length);
  const unique = new Map();
  items.forEach((item, index) => {
    const latex = typeof item === "string" ? item : item?.latex;
    const displayMode = typeof item === "object" && item?.displayMode !== undefined ? item.displayMode : config.displayMode;
    const fontSize = typeof item === "object" && item?.fontSize !== undefined ? item.fontSize : config.fontSize;
    const normalized = normalizeLatexSource(latex);
    const key = sha256(JSON.stringify({ normalized, displayMode, fontSize, provider: config.equationProvider, endpoint: config.endpoint }));
    if (!unique.has(key)) unique.set(key, { indexes: [], latex, displayMode, fontSize });
    unique.get(key).indexes.push(index);
  });
  const jobs = [...unique.values()];
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= jobs.length) return;
      const job = jobs[index];
      const result = await renderLatexRemoteToSvg({ ...options, ...config, ...job });
      for (const targetIndex of job.indexes) results[targetIndex] = result;
    }
  }
  await Promise.all(Array.from({ length: Math.min(config.concurrency, Math.max(1, jobs.length)) }, worker));
  const cacheHits = results.filter((item) => item?.status === "REMOTE_LATEX_CACHE_HIT").length;
  const rendered = results.filter((item) => item?.status === "REMOTE_LATEX_RENDERED").length;
  const failures = results.filter((item) => item?.status === "REMOTE_LATEX_FALLBACK" || item?.status === "REMOTE_LATEX_DISABLED").length;
  return { results, stats: { requested: items.length, unique: jobs.length, rendered, cacheHits, failures, concurrency: config.concurrency } };
}
