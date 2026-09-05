#!/usr/bin/env node

/*
 * Windows-safe template starter builder.
 *
 * This is an Artifact Tool utility, not a PPTX authoring engine. It imports an
 * existing template, duplicates source-role slides, clears only slide-local
 * sample shapes, and exports an editable starter with the same master/layout
 * relationships.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const args = parseArgs({
  args: process.argv.slice(2),
  options: {
    source: { type: "string" },
    map: { type: "string" },
    out: { type: "string" },
    manifest: { type: "string" },
  },
  allowPositionals: false,
  strict: true,
}).values;

function required(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Missing required --" + name);
  }
  return path.resolve(value);
}

function getSlides(presentation) {
  if (Array.isArray(presentation.slides && presentation.slides.items)) {
    return presentation.slides.items;
  }
  if (
    Number.isInteger(presentation.slides && presentation.slides.count) &&
    typeof presentation.slides.getItem === "function"
  ) {
    return Array.from({ length: presentation.slides.count }, function (_, index) {
      return presentation.slides.getItem(index);
    });
  }
  throw new Error("Unable to enumerate imported template slides.");
}

function validateMap(map, sourceSlideCount) {
  if (!Array.isArray(map.outputSlides) || map.outputSlides.length === 0) {
    throw new Error("Map must contain a non-empty outputSlides array.");
  }
  const entries = map.outputSlides.slice().sort(function (a, b) {
    return a.outputSlide - b.outputSlide;
  });
  entries.forEach(function (entry, index) {
    if (entry.outputSlide !== index + 1) {
      throw new Error("outputSlides must be sequential from 1.");
    }
    if (
      !Number.isInteger(entry.sourceSlide) ||
      entry.sourceSlide < 1 ||
      entry.sourceSlide > sourceSlideCount
    ) {
      throw new Error(
        "outputSlide " + entry.outputSlide + " references invalid sourceSlide " + entry.sourceSlide,
      );
    }
    if (typeof entry.narrativeRole !== "string" || entry.narrativeRole.trim().length === 0) {
      throw new Error("Every output slide needs a narrativeRole.");
    }
  });
  return entries;
}

const sourcePath = required(args.source, "source");
const mapPath = required(args.map, "map");
const outPath = required(args.out, "out");
const manifestPath = args.manifest
  ? path.resolve(args.manifest)
  : outPath.replace(/\.pptx$/i, ".manifest.json");

const runtimeModules = process.env.RUNTIME_NODE_MODULES;
if (!path.isAbsolute(runtimeModules || "")) {
  throw new Error("RUNTIME_NODE_MODULES must be an absolute path.");
}

const artifactToolPath = path.join(
  runtimeModules,
  "@oai",
  "artifact-tool",
  "dist",
  "artifact_tool.mjs",
);
const { FileBlob, PresentationFile } = await import(pathToFileURL(artifactToolPath).href);
const map = JSON.parse(await fs.readFile(mapPath, "utf8"));
const presentation = await PresentationFile.importPptx(await FileBlob.load(sourcePath));
const originals = getSlides(presentation);
const entries = validateMap(map, originals.length);

const duplicates = entries.map(function (entry) {
  const duplicate = originals[entry.sourceSlide - 1].duplicate();
  if (duplicate.shapes && typeof duplicate.shapes.deleteAll === "function") {
    duplicate.shapes.deleteAll();
  } else {
    throw new Error("Artifact Tool runtime does not expose slide.shapes.deleteAll().");
  }
  if (duplicate.images && Array.isArray(duplicate.images.items)) {
    duplicate.images.items.slice().forEach(function (image) {
      if (typeof image.delete === "function") image.delete();
    });
  }
  return { entry, slide: duplicate };
});

originals.forEach(function (slide) {
  slide.delete();
});
duplicates.forEach(function (item, index) {
  item.slide.moveTo(index);
});

await fs.mkdir(path.dirname(outPath), { recursive: true });
const exported = await PresentationFile.exportPptx(presentation);
if (!exported || typeof exported.save !== "function") {
  throw new Error("Artifact Tool PPTX export did not return a saveable file object.");
}
await exported.save(outPath);
const stat = await fs.stat(outPath);

const manifest = {
  schemaVersion: "presentation-polish.template-starter.v1",
  sourcePptx: sourcePath,
  mapPath,
  output: outPath,
  outputBytes: stat.size,
  sourceSlideCount: originals.length,
  outputSlideCount: duplicates.length,
  slideSize: presentation.slideSize || null,
  slides: duplicates.map(function (item, index) {
    return {
      outputSlide: index + 1,
      sourceSlide: item.entry.sourceSlide,
      narrativeRole: item.entry.narrativeRole,
      clearedSlideLocalShapes: true,
    };
  }),
};
await fs.mkdir(path.dirname(manifestPath), { recursive: true });
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(JSON.stringify(manifest, null, 2));
