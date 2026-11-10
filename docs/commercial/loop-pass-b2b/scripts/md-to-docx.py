#!/usr/bin/env python3
"""Convert loop-pass-b2b Markdown files to Word (.docx)."""

from __future__ import annotations

import re
from pathlib import Path

from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_LINE_SPACING

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "word"
OUT.mkdir(exist_ok=True)

SKIP = {"README.md", "scripts"}


def add_formatted_paragraph(doc: Document, line: str) -> None:
    """Add paragraph with simple **bold** handling."""
    text = line.strip()
    if not text:
        return
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    parts = re.split(r"(\*\*[^*]+\*\*)", text)
    for part in parts:
        if part.startswith("**") and part.endswith("**"):
            run = p.add_run(part[2:-2])
            run.bold = True
        else:
            p.add_run(part)


def md_to_docx(md_path: Path, docx_path: Path) -> None:
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    lines = md_path.read_text(encoding="utf-8").splitlines()
    in_code = False
    list_mode: str | None = None

    for raw in lines:
        line = raw.rstrip()

        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            p = doc.add_paragraph(line)
            p.style = "Intense Quote"
            continue

        if line.strip() == "---":
            doc.add_paragraph()
            continue

        if line.startswith("# "):
            doc.add_heading(line[2:].strip(), level=1)
            list_mode = None
            continue
        if line.startswith("## "):
            doc.add_heading(line[3:].strip(), level=2)
            list_mode = None
            continue
        if line.startswith("### "):
            doc.add_heading(line[4:].strip(), level=3)
            list_mode = None
            continue
        if line.startswith("#### "):
            doc.add_heading(line[5:].strip(), level=4)
            list_mode = None
            continue

        if re.match(r"^[-*] \[ \]", line):
            doc.add_paragraph(line[6:].strip(), style="List Bullet")
            continue
        if re.match(r"^[-*] ", line):
            doc.add_paragraph(line[2:].strip(), style="List Bullet")
            continue
        if re.match(r"^\d+\.\s", line):
            doc.add_paragraph(re.sub(r"^\d+\.\s", "", line).strip(), style="List Number")
            continue

        if line.startswith("|") and line.endswith("|"):
            # Table row as monospace-like line
            add_formatted_paragraph(doc, line)
            continue

        if not line.strip():
            list_mode = None
            continue

        add_formatted_paragraph(doc, line)

    doc.save(docx_path)


def main() -> None:
    files = sorted(ROOT.glob("*.md"))
    for md in files:
        if md.name == "README.md":
            continue
        out_name = md.stem + ".docx"
        md_to_docx(md, OUT / out_name)
        print(f"Wrote {OUT / out_name}")

    # Combined pack for single print/read
    combined = Document()
    combined.styles["Normal"].font.name = "Calibri"
    combined.styles["Normal"].font.size = Pt(11)
    for md in files:
        if md.name == "README.md":
            continue
        combined.add_page_break()
        combined.add_heading(md.stem.replace("-", " "), level=0)
        for line in md.read_text(encoding="utf-8").splitlines():
            if line.startswith("#"):
                combined.add_heading(line.lstrip("#").strip(), level=min(line.count("#"), 3))
            elif line.strip() and not line.startswith("```"):
                combined.add_paragraph(line)
    combined.save(OUT / "00-PACK-COMPLET-LOOP-PASS.docx")
    print(f"Wrote {OUT / '00-PACK-COMPLET-LOOP-PASS.docx'}")


if __name__ == "__main__":
    main()
