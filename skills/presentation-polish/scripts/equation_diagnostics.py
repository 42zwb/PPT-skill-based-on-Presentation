#!/usr/bin/env python3
"""Read-only equation and math-font diagnostics for Presentation Polish.

This module deliberately does not author or rewrite PPTX files. It inspects
the package-level representation produced by the Presentations/Artifact Tool
workflow and classifies formula-like objects by editability and complexity.

The output is advisory: rendered-slide inspection is still required for
baseline alignment, clipping, font substitution, and optical spacing.
"""

from __future__ import annotations

import argparse
import json
import re
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath
import xml.etree.ElementTree as ET


NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main"
NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
NS_C = "http://schemas.openxmlformats.org/drawingml/2006/chart"
NS_M = "http://schemas.openxmlformats.org/officeDocument/2006/math"
NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_REL_PKG = "http://schemas.openxmlformats.org/package/2006/relationships"

P = lambda name: f"{{{NS_P}}}{name}"
A = lambda name: f"{{{NS_A}}}{name}"
M = lambda name: f"{{{NS_M}}}{name}"

FORMULA_PATTERNS = (
    re.compile(r"(?:^|[\s(])(?:V|Q|G|S|A|R|P|M|π|δ|γ)\s*(?:\^|\*|π|pi|_)?\s*\(", re.I),
    re.compile(
        r"(?:^|[\s(])(?:V|Q|G|S|A|R|P|M|π|δ|γ|𝓜|𝓢|𝓐)"
        r".{0,160}(?:=|←|→|argmax|max|min|TD target|TD error)",
        re.I,
    ),
    re.compile(r"\\(?:frac|sqrt|sum|int|lim|begin|end|left|right|mathbf|mathbb|mathcal)\b"),
    re.compile(r"\b(?:TD target|TD error|argmax|max|E_pi|Eπ)\b.{0,160}[=←]", re.I),
    re.compile(
        r"(?:\b[A-Za-z](?:[_^][A-Za-z0-9πδγ]*)?|[πδγ])\s*(?:=|←|→)\s*"
        r"(?:[A-Za-z0-9πδγ∑∫√…+\-−(\[])"
    ),
)

COMPLEX_LATEX = re.compile(
    r"\\(?:frac|dfrac|tfrac|sqrt|sum|prod|int|oint|lim|begin|end|cases|aligned|matrix|bmatrix|pmatrix|left|right|overline|underline|hat|bar|mathbb|mathcal|mathbf)\b"
)
MODERATE_LATEX = re.compile(r"\\(?:alpha|beta|gamma|theta|pi|lambda|nabla|partial|cdot|times|leq|geq)\b")

EDITABILITY_LEVELS = {
    "native_math": 3,
    "editable_math_text": 2,
    "vector_equation": 1,
    "raster_equation": 0,
}


def natural_key(value: str | Path) -> list[object]:
    name = Path(value).name
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", name)]


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def read_xml(zf: zipfile.ZipFile, name: str) -> ET.Element | None:
    try:
        return ET.fromstring(zf.read(name))
    except (KeyError, ET.ParseError):
        return None


def shape_text(shape: ET.Element) -> tuple[str, int]:
    parts: list[str] = []
    breaks = 0
    for node in shape.iter():
        if node.tag == A("t"):
            parts.append(node.text or "")
        elif node.tag == A("br"):
            breaks += 1
            parts.append("\n")
    return "".join(parts).strip(), breaks


def shape_fonts_and_sizes(shape: ET.Element) -> tuple[list[str], list[float]]:
    fonts: set[str] = set()
    sizes: list[float] = []
    for node in shape.iter():
        if local_name(node.tag) not in {"rPr", "defRPr", "endParaRPr", "latin", "ea", "cs", "sym"}:
            continue
        if local_name(node.tag) in {"rPr", "defRPr", "endParaRPr"} and node.get("sz"):
            try:
                sizes.append(round(float(node.get("sz")) / 100.0, 2))
            except (TypeError, ValueError):
                pass
        if local_name(node.tag) in {"latin", "ea", "cs", "sym"} and node.get("typeface"):
            fonts.add(node.get("typeface") or "")
    return sorted(fonts), sorted(sizes)


def shape_bounds(shape: ET.Element) -> tuple[int, int, int, int] | None:
    xfrm = shape.find(f".//{A('xfrm')}")
    if xfrm is None:
        return None
    off = xfrm.find(A("off"))
    ext = xfrm.find(A("ext"))
    if off is None or ext is None:
        return None
    try:
        return (
            int(off.get("x", "0")),
            int(off.get("y", "0")),
            int(ext.get("cx", "0")),
            int(ext.get("cy", "0")),
        )
    except (TypeError, ValueError):
        return None


def is_formula_like(text: str) -> bool:
    return bool(text) and any(pattern.search(text) for pattern in FORMULA_PATTERNS)


def classify_equation_complexity(source: str, breaks: int = 0) -> str:
    """Classify a formula without pretending to parse its mathematical AST."""
    if not source:
        return "trivial"
    normalized = source.replace("\\\\", "\\n").strip()
    length = len(normalized)
    complex_hits = len(COMPLEX_LATEX.findall(normalized))
    moderate_hits = len(MODERATE_LATEX.findall(normalized))
    script_count = len(re.findall(r"(?:\^|_|[₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹])", normalized))
    structural_chars = sum(normalized.count(ch) for ch in "∑∫√{}[]")

    if breaks > 0 or "\\n" in normalized or complex_hits > 0:
        return "complex"
    if script_count >= 3 or structural_chars >= 4 or length > 110:
        return "complex"
    if script_count == 1 and structural_chars == 0 and length <= 16:
        return "trivial"
    if moderate_hits > 0 or script_count >= 2 or structural_chars >= 1 or length > 48:
        return "moderate"
    if length <= 8 or re.fullmatch(r"[A-Za-zα-ωΑ-Ω0-9²³⁰¹²³]+", normalized):
        return "trivial"
    return "simple"


def choose_render_mode(complexity: str, mode: str, has_source_latex: bool) -> str:
    if mode == "editability-first":
        return "editable_math_text"
    if mode == "latex-fidelity-first":
        return "vector_equation" if has_source_latex else "editable_math_text_with_warning"
    if complexity in {"complex", "moderate"} and has_source_latex:
        return "vector_equation"
    if complexity == "complex":
        return "editable_math_text_with_warning"
    return "editable_math_text"


def formula_diagnostics(
    *,
    text: str,
    breaks: int,
    fonts: list[str],
    sizes: list[float],
    slide_number: int,
    shape_index: int,
    mode: str,
    preferred_font: str,
    fallback_font: str,
    bounds: tuple[int, int, int, int] | None,
    slide_size: tuple[int, int] | None,
) -> dict[str, object]:
    complexity = classify_equation_complexity(text, breaks)
    has_source_latex = "\\" in text
    effective_font = fonts[0] if fonts else fallback_font
    warnings: list[str] = []
    if len(fonts) > 1:
        warnings.append("EQUATION_FONT_INCONSISTENT")
    if sizes and max(sizes) < 18:
        warnings.append("EQUATION_TOO_SMALL")
    if sizes and min(sizes) > 48:
        warnings.append("EQUATION_TOO_LARGE")
    if breaks > 0:
        warnings.append("EQUATION_TEXT_LAYOUT_POOR")
    if bounds and slide_size:
        x, y, width, height = bounds
        slide_width, slide_height = slide_size
        if x < 0 or y < 0 or x + width > slide_width or y + height > slide_height:
            warnings.append("EQUATION_CLIPPED")
    if complexity == "complex" and not has_source_latex:
        warnings.append("EQUATION_COMPLEXITY_EXCEEDS_TEXT_MODE")
    if not fonts:
        warnings.append("MATH_FONT_UNDECLARED")

    return {
        "slide": slide_number,
        "shape_index": shape_index,
        "source": text,
        "complexity": complexity,
        "render_mode_recommendation": choose_render_mode(complexity, mode, has_source_latex),
        "editability_level": 2,
        "editability_type": "editable_math_text",
        "preferred_font": preferred_font,
        "fallback_font": fallback_font,
        "effective_font": effective_font,
        "font_availability": "unknown",
        "font_families": fonts,
        "font_sizes_pt": sizes,
        "line_break_count": breaks,
        "bounds_emu": bounds,
        "source_latex_available": has_source_latex,
        "warnings": warnings,
    }


def resolve_relationship_target(slide_name: str, target: str) -> str:
    # Artifact Tool commonly exports package-absolute relationship targets
    # such as /ppt/media/image.svg. Normalize them to ZipFile names.
    if target.startswith("/"):
        return target.lstrip("/")
    base = PurePosixPath(slide_name).parent
    resolved = PurePosixPath(base, target)
    parts: list[str] = []
    for part in resolved.parts:
        if part in {"", "."}:
            continue
        if part == "..":
            if parts:
                parts.pop()
        else:
            parts.append(part)
    return "/".join(parts)


def slide_relationships(zf: zipfile.ZipFile, slide_name: str) -> dict[str, str]:
    rel_name = str(PurePosixPath(slide_name).parent / "_rels" / (PurePosixPath(slide_name).name + ".rels"))
    root = read_xml(zf, rel_name)
    if root is None:
        return {}
    result: dict[str, str] = {}
    for rel in root:
        if rel.get("Id") and rel.get("Target"):
            result[rel.get("Id") or ""] = resolve_relationship_target(slide_name, rel.get("Target") or "")
    return result


def picture_candidates(zf: zipfile.ZipFile, slide_name: str, root: ET.Element) -> list[dict[str, object]]:
    rels = slide_relationships(zf, slide_name)
    candidates: list[dict[str, object]] = []
    for index, pic in enumerate(root.findall(f".//{P('pic')}"), start=1):
        c_nv_pr = pic.find(f".//{P('cNvPr')}")
        label = " ".join(
            value for value in [
                c_nv_pr.get("name") if c_nv_pr is not None else "",
                c_nv_pr.get("descr") if c_nv_pr is not None else "",
                c_nv_pr.get("title") if c_nv_pr is not None else "",
            ] if value
        )
        media_paths: list[str] = []
        for node in pic.iter():
            if local_name(node.tag) not in {"blip", "svgBlip"}:
                continue
            rid = node.get(f"{{{NS_R}}}embed")
            if rid and rels.get(rid):
                media_paths.append(rels[rid])
        media_paths = list(dict.fromkeys(media_paths))
        media_path = media_paths[0] if media_paths else ""
        lower_label = f"{label} {' '.join(media_paths)}".lower()
        # Artifact Tool versions may omit the supplied alt text from cNvPr. A
        # source-backed SVG containing math-like glyphs is still a useful
        # vector candidate; raster images require an explicit equation label.
        svg_math = False
        binary_math = False
        for candidate_path in media_paths:
            if Path(candidate_path).suffix.lower() != ".svg":
                try:
                    binary_text = zf.read(candidate_path).decode("latin1", errors="ignore")
                except KeyError:
                    binary_text = ""
                binary_math = binary_math or bool(re.search(r"(?:equation|formula|math|latex)", binary_text, re.I))
                continue
            try:
                svg_text = zf.read(candidate_path).decode("utf-8", errors="ignore")
            except KeyError:
                svg_text = ""
            svg_math = svg_math or bool(re.search(r"(?:equation|formula|math|latex|[∫∑√=]|\\frac|\\int|\\sum)", svg_text, re.I))
        explicitly_labeled = any(token in lower_label for token in ("equation", "formula", "math", "latex"))
        if not explicitly_labeled and not svg_math and not binary_math:
            continue
        suffixes = {Path(candidate_path).suffix.lower() for candidate_path in media_paths}
        suffix = ".svg" if ".svg" in suffixes else (next(iter(suffixes), ""))
        kind = "vector_equation" if suffix in {".svg", ".emf", ".wmf"} else "raster_equation"
        candidates.append(
            {
                "slide": int(re.search(r"(\d+)", Path(slide_name).name).group(1)),
                "picture_index": index,
                "label": label,
                "media_path": media_path,
                "media_paths": media_paths,
                "editability_level": EDITABILITY_LEVELS[kind],
                "editability_type": kind,
                "warnings": [] if kind == "vector_equation" else ["EQUATION_RASTERIZED"],
            }
        )
    return candidates


def audit(path: Path, mode: str, preferred_font: str, fallback_font: str) -> dict[str, object]:
    with zipfile.ZipFile(path) as zf:
        names = set(zf.namelist())
        slide_names = sorted(
            (name for name in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)),
            key=natural_key,
        )
        presentation_root = read_xml(zf, "ppt/presentation.xml")
        slide_size: tuple[int, int] | None = None
        if presentation_root is not None:
            size_node = presentation_root.find(f".//{P('sldSz')}")
            if size_node is not None and size_node.get("cx") and size_node.get("cy"):
                try:
                    slide_size = (int(size_node.get("cx", "0")), int(size_node.get("cy", "0")))
                except (TypeError, ValueError):
                    slide_size = None
        equations: list[dict[str, object]] = []
        vector_candidates: list[dict[str, object]] = []
        raster_candidates: list[dict[str, object]] = []
        deck_fonts: Counter[str] = Counter()
        native_math = False

        for slide_name in slide_names:
            root = read_xml(zf, slide_name)
            if root is None:
                continue
            slide_number = int(re.search(r"(\d+)", Path(slide_name).name).group(1))
            for shape_index, shape in enumerate(root.findall(f".//{P('sp')}"), start=1):
                text, breaks = shape_text(shape)
                fonts, sizes = shape_fonts_and_sizes(shape)
                if text and is_formula_like(text):
                    item = formula_diagnostics(
                        text=text,
                        breaks=breaks,
                        fonts=fonts,
                        sizes=sizes,
                        slide_number=slide_number,
                        shape_index=shape_index,
                        mode=mode,
                        preferred_font=preferred_font,
                        fallback_font=fallback_font,
                        bounds=shape_bounds(shape),
                        slide_size=slide_size,
                    )
                    equations.append(item)
                    for family in fonts:
                        deck_fonts[family] += 1
                if shape.find(f".//{M('oMath')}") is not None or shape.find(f".//{M('oMathPara')}") is not None:
                    native_math = True
            for candidate in picture_candidates(zf, slide_name, root):
                if candidate["editability_type"] == "vector_equation":
                    vector_candidates.append(candidate)
                else:
                    raster_candidates.append(candidate)

        diagnostics: list[dict[str, object]] = []
        all_formula_fonts = sorted(deck_fonts)
        if len(all_formula_fonts) > 1:
            diagnostics.append({"code": "EQUATION_STYLE_INCONSISTENT", "severity": "warning", "fonts": all_formula_fonts})
        if equations and not native_math:
            diagnostics.append({"code": "NATIVE_MATH_UNAVAILABLE", "severity": "info", "message": "No Office Math object was found; text formulas remain editable_math_text."})
        if equations:
            diagnostics.append({"code": "FONT_AVAILABILITY_UNKNOWN", "severity": "info", "message": "Package inspection cannot prove that a target computer has the declared font installed."})
        for item in equations:
            for warning in item["warnings"]:
                diagnostics.append({"code": warning, "severity": "warning", "slide": item["slide"], "shape_index": item["shape_index"], "source": item["source"]})
        diagnostics.extend({"code": warning, "severity": "warning", **candidate} for candidate in raster_candidates for warning in candidate["warnings"])

        counts = Counter(item["complexity"] for item in equations)
        levels = Counter(item["editability_type"] for item in equations)
        levels.update(item["editability_type"] for item in vector_candidates)
        levels.update(item["editability_type"] for item in raster_candidates)
        return {
            "schema_version": "presentation-polish.equation-diagnostics.v1",
            "file": str(path),
            "equation_mode": mode,
            "preferred_font": preferred_font,
            "fallback_font": fallback_font,
            "font_availability": "unknown",
            "slide_size_emu": slide_size,
            "native_math_found": native_math,
            "equation_font_families": all_formula_fonts,
            "equation_editability_levels": EDITABILITY_LEVELS,
            "summary": {
                "equation_count": len(equations),
                "complexity_counts": dict(sorted(counts.items())),
                "editability_counts": dict(sorted(levels.items())),
                "diagnostic_count": len(diagnostics),
            },
            "equations": equations,
            "vector_equation_candidates": vector_candidates,
            "raster_equation_candidates": raster_candidates,
            "diagnostics": diagnostics,
            "claim_boundary": "Read-only OOXML inspection; rendered-slide review is still required for optical alignment and actual font substitution.",
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only equation diagnostics for Presentation Polish")
    parser.add_argument("pptx", type=Path, help="path to a .pptx file")
    parser.add_argument("--equation-mode", choices=["auto", "editability-first", "latex-fidelity-first"], default="auto")
    parser.add_argument("--preferred-font", default="Latin Modern Math")
    parser.add_argument("--fallback-font", default="Cambria Math")
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--fail-on-warning", action="store_true")
    args = parser.parse_args()
    if not args.pptx.is_file():
        parser.error(f"file not found: {args.pptx}")
    if args.pptx.suffix.lower() != ".pptx":
        parser.error("the input must be a .pptx file")

    result = audit(args.pptx, args.equation_mode, args.preferred_font, args.fallback_font)
    print(json.dumps(result, ensure_ascii=False, indent=None if args.compact else 2))
    if args.fail_on_warning and any(item.get("severity") == "warning" for item in result["diagnostics"]):
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
