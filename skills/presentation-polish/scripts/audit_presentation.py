#!/usr/bin/env python3
"""Read-only PPTX preflight for Presentation Polish.

This is intentionally a package-level audit, not an authoring tool. It reports
signals that ordinary overflow checks do not catch: font drift, small text,
formula-like text without Office Math, fragmented text, and flat diagrams.
"""

from __future__ import annotations

import argparse
import json
import re
import zipfile
from collections import Counter
from pathlib import Path
import xml.etree.ElementTree as ET


NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main"
NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
NS_C = "http://schemas.openxmlformats.org/drawingml/2006/chart"
NS_M = "http://schemas.openxmlformats.org/officeDocument/2006/math"

P = lambda name: f"{{{NS_P}}}{name}"
A = lambda name: f"{{{NS_A}}}{name}"

FORMULA_PATTERNS = (
    re.compile(r"(?:^|[\s(])(?:V|Q|G|S|A|R|P|M|π)\s*(?:\^|\*|π|pi|_)?\s*\(", re.I),
    re.compile(
        r"(?:^|[\s(])(?:V|Q|G|S|A|R|P|M|π|δ|γ|𝓜|𝓢|𝓐)"
        r".{0,100}(?:=|←|argmax|max|TD target|TD error)",
        re.I,
    ),
    re.compile(r"\b(?:TD target|TD error|argmax|max|E_pi|Eπ)\b.{0,120}[=←]", re.I),
)


def natural_key(path: Path) -> list[object]:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", path.name)]


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def read_xml(zf: zipfile.ZipFile, name: str) -> ET.Element | None:
    try:
        return ET.fromstring(zf.read(name))
    except (KeyError, ET.ParseError):
        return None


def shape_text(shape: ET.Element) -> tuple[str, int]:
    parts = [(node.text or "") for node in shape.findall(f".//{A('t')}")]
    breaks = len(shape.findall(f".//{A('br')}"))
    return "".join(parts).strip(), breaks


def is_formula_like(text: str) -> bool:
    if not text:
        return False
    return any(pattern.search(text) for pattern in FORMULA_PATTERNS)


def parse_slide(root: ET.Element) -> dict[str, object]:
    text_items: list[dict[str, object]] = []
    fonts: Counter[str] = Counter()
    font_sizes: Counter[float] = Counter()

    for shape in root.findall(f".//{P('sp')}"):
        text, breaks = shape_text(shape)
        if text:
            text_items.append(
                {
                    "text": text,
                    "breaks": breaks,
                    "formula_like": is_formula_like(text),
                }
            )

        for node in shape.iter():
            if local_name(node.tag) in {"rPr", "defRPr", "endParaRPr"}:
                size = node.get("sz")
                if size:
                    try:
                        font_sizes[round(float(size) / 100.0, 2)] += 1
                    except ValueError:
                        pass
                for child in node:
                    if local_name(child.tag) in {"latin", "ea", "cs", "sym"}:
                        face = child.get("typeface")
                        if face:
                            fonts[face] += 1

    graphic_data = root.findall(f".//{A('graphicData')}")
    native_tables = 0
    native_charts = 0
    for node in graphic_data:
        uri = (node.get("uri") or "").lower()
        if "table" in uri or node.find(f".//{A('tbl')}") is not None:
            native_tables += 1
        if "chart" in uri or node.find(f".//{{{NS_C}}}chart") is not None:
            native_charts += 1

    formula_text_items = [item for item in text_items if item["formula_like"]]
    return {
        "auto_shapes": len(root.findall(f".//{P('sp')}")),
        "connectors": len(root.findall(f".//{P('cxnSp')}")),
        "groups": len(root.findall(f".//{P('grpSp')}")),
        "pictures": len(root.findall(f".//{P('pic')}")),
        "graphic_frames": len(root.findall(f".//{P('graphicFrame')}")),
        "native_tables": native_tables,
        "native_charts": native_charts,
        "text_objects": len(text_items),
        "short_text_objects_le_18_chars": sum(
            1 for item in text_items if 0 < len(str(item["text"])) <= 18
        ),
        "line_break_text_objects": sum(1 for item in text_items if int(item["breaks"]) > 0),
        "formula_like_text_objects": len(formula_text_items),
        "formula_like_examples": [str(item["text"]) for item in formula_text_items[:8]],
        "font_families": sorted(fonts),
        "font_size_samples_pt": dict(sorted(font_sizes.items())),
        "font_size_declarations_under_18pt": int(
            sum(count for size, count in font_sizes.items() if size < 18)
        ),
    }


def collect_theme_fonts(root: ET.Element | None) -> list[str]:
    if root is None:
        return []
    values: set[str] = set()
    for node in root.iter():
        if local_name(node.tag) in {"latin", "ea", "cs"} and node.get("typeface"):
            values.add(node.get("typeface") or "")
    return sorted(value for value in values if value)


def audit(path: Path) -> dict[str, object]:
    with zipfile.ZipFile(path) as zf:
        names = set(zf.namelist())
        presentation = read_xml(zf, "ppt/presentation.xml")
        theme = read_xml(zf, "ppt/theme/theme1.xml")
        slide_names = sorted(
            (Path(name) for name in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)),
            key=natural_key,
        )

        slide_reports: list[dict[str, object]] = []
        all_fonts: Counter[str] = Counter()
        totals: Counter[str] = Counter()
        formula_examples: list[str] = []
        native_math = False

        for slide_name in slide_names:
            root = read_xml(zf, slide_name.as_posix())
            if root is None:
                continue
            report = parse_slide(root)
            report["slide"] = int(re.search(r"(\d+)", slide_name.name).group(1))
            slide_reports.append(report)
            for family in report["font_families"]:
                all_fonts[family] += 1
            for key in (
                "auto_shapes",
                "connectors",
                "groups",
                "pictures",
                "graphic_frames",
                "native_tables",
                "native_charts",
                "text_objects",
                "short_text_objects_le_18_chars",
                "line_break_text_objects",
                "formula_like_text_objects",
                "font_size_declarations_under_18pt",
            ):
                totals[key] += int(report[key])
            formula_examples.extend(report["formula_like_examples"])
            raw_slide = zf.read(slide_name.as_posix())
            if b"oMath" in raw_slide or b"oMathPara" in raw_slide:
                native_math = True

        slide_width_emu = None
        slide_height_emu = None
        if presentation is not None:
            size = presentation.find(f".//{P('sldSz')}")
            if size is not None:
                slide_width_emu = int(size.get("cx")) if size.get("cx") else None
                slide_height_emu = int(size.get("cy")) if size.get("cy") else None

        aspect_ratio = None
        if slide_width_emu and slide_height_emu:
            aspect_ratio = round(slide_width_emu / slide_height_emu, 4)

        quality_flags: list[str] = []
        explicit_fonts = sorted(all_fonts)
        theme_fonts = collect_theme_fonts(theme)
        if len(set(explicit_fonts) | set(theme_fonts)) > 2:
            quality_flags.append("font-family-drift")
        if totals["font_size_declarations_under_18pt"] > 0:
            quality_flags.append("small-text-declarations")
        if totals["formula_like_text_objects"] > 0 and not native_math:
            quality_flags.append("formula-text-fallback-without-native-math")
        if totals["line_break_text_objects"] > 0:
            quality_flags.append("text-line-breaks-require-visual-review")
        if totals["groups"] == 0 and totals["auto_shapes"] >= 30:
            quality_flags.append("flat-shape-organization")
        if totals["short_text_objects_le_18_chars"] >= max(12, len(slide_reports) * 2):
            quality_flags.append("many-short-text-objects")

        return {
            "file": str(path),
            "file_size_bytes": path.stat().st_size,
            "slide_count": len(slide_reports),
            "slide_width_emu": slide_width_emu,
            "slide_height_emu": slide_height_emu,
            "aspect_ratio": aspect_ratio,
            "theme_font_families": theme_fonts,
            "explicit_font_families": explicit_fonts,
            "native_math_objects": native_math,
            "totals": dict(totals),
            "formula_like_examples": formula_examples[:16],
            "quality_flags": quality_flags,
            "slides": slide_reports,
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only PPTX audit for Presentation Polish")
    parser.add_argument("pptx", type=Path, help="path to a .pptx file")
    parser.add_argument("--compact", action="store_true", help="emit one-line JSON")
    args = parser.parse_args()

    if not args.pptx.is_file():
        parser.error(f"file not found: {args.pptx}")
    if args.pptx.suffix.lower() != ".pptx":
        parser.error("the input must be a .pptx file")

    result = audit(args.pptx)
    print(json.dumps(result, ensure_ascii=False, indent=None if args.compact else 2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
