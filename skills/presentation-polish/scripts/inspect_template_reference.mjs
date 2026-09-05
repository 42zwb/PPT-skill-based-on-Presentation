import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Windows-safe template inspection helper.
 *
 * Unlike the Presentations reference helper, this script does not shell out to
 * `unzip`; it uses Artifact Tool import/inspect/export only. It is read-only
 * with respect to the source deck and writes previews/layout JSON to a
 * dedicated output directory.
 */

const [sourceArg, outputArg] = process.argv.slice(2);
if (!path.isAbsolute(sourceArg ?? "") || !path.isAbsolute(outputArg ?? "")) {
  throw new Error("Usage: inspect_template_reference.mjs <absolute source.pptx> <absolute output directory>");
}

const RUNTIME_NODE_MODULES = process.env.RUNTIME_NODE_MODULES;
if (!path.isAbsolute(RUNTIME_NODE_MODULES ?? "")) {
  throw new Error("RUNTIME_NODE_MODULES must be an absolute path");
}

async function saveBlob(blob, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  if (blob && typeof blob.arrayBuffer === "function") {
    await fs.writeFile(outputPath, Buffer.from(await blob.arrayBuffer()));
    return;
  }
  if (blob instanceof Uint8Array || Buffer.isBuffer(blob)) {
    await fs.writeFile(outputPath, Buffer.from(blob));
    return;
  }
  throw new Error(`Unsupported export blob for ${outputPath}`);
}

function getSlides(presentation) {
  if (Array.isArray(presentation.slides?.items)) return presentation.slides.items;
  if (Number.isInteger(presentation.slides?.count) && typeof presentation.slides.getItem === "function") {
    return Array.from({ length: presentation.slides.count }, (_, index) => presentation.slides.getItem(index));
  }
  throw new Error("Unable to enumerate imported slides.");
}

const artifactToolPath = path.join(RUNTIME_NODE_MODULES, "@oai", "artifact-tool", "dist", "artifact_tool.mjs");
const { FileBlob, PresentationFile } = await import(pathToFileURL(artifactToolPath).href);
const source = path.resolve(sourceArg);
const output = path.resolve(outputArg);
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

const presentation = await PresentationFile.importPptx(await FileBlob.load(source));
const slides = getSlides(presentation);
const inspect = await presentation.inspect({
  kind: "deck,slide,textbox,shape,image,table,chart,notes,layout",
  maxChars: 300_000,
});
await fs.writeFile(path.join(output, "template-inspect.ndjson"), inspect.ndjson || "", "utf8");

const slideRecords = [];
for (let index = 0; index < slides.length; index += 1) {
  const slide = slides[index];
  const number = String(index + 1).padStart(2, "0");
  const pngPath = path.join(output, "slides", `slide-${number}.png`);
  const layoutPath = path.join(output, "layouts", `slide-${number}.layout.json`);
  await saveBlob(await presentation.export({ slide, format: "png", scale: 1 }), pngPath);
  await saveBlob(await presentation.export({ slide, format: "layout" }), layoutPath);
  slideRecords.push({ slide: index + 1, png: pngPath, layout: layoutPath });
}

const montage = await presentation.export({ format: "webp", montage: true, scale: 1 });
await saveBlob(montage, path.join(output, "template-montage.webp"));

const manifest = {
  schemaVersion: "presentation-polish.template-inspection.v1",
  source,
  output,
  slideCount: slides.length,
  slideSize: presentation.slideSize ?? null,
  inspectMetadata: inspect.metadata ?? null,
  slides: slideRecords,
};
await fs.writeFile(path.join(output, "template-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
