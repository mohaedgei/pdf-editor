#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extract per-page text from the generated PDF to verify content + section start pages."""
import sys
import pypdfium2 as pdfium

PDF = "/home/z/my-project/download/بحث_الاتجاهات_الحديثة_في_علم_الإعلام.pdf"

markers = [
    "المقدمة",
    "المبحث الأول",
    "المبحث الثاني",
    "المبحث الثالث",
    "الخاتمة",
    "قائمة المراجع",
    "الفهرس",
    "محمد حمدي بيومي السيد",
    "سيد عثمان",
]

doc = pdfium.PdfDocument(PDF)
print(f"Total pages: {len(doc)}")
found_pages = {}
for i, page in enumerate(doc):
    tp = page.get_textpage()
    text = tp.get_text_bounded()
    clean = text.replace("\u200f", "").replace("\n", " ")
    print(f"\n=== Page {i+1} ({len(clean)} chars) ===")
    print(clean[:220])
    for m in markers:
        if m in clean and m not in found_pages:
            found_pages[m] = i + 1

print("\n\n=== Section start pages ===")
for m in markers:
    print(f"  {m}: page {found_pages.get(m, 'NOT FOUND')}")

# check for corrupted glyphs
bad = 0
for i, page in enumerate(doc):
    text = page.get_textpage().get_text_bounded()
    bad += text.count("\ufffd")
print(f"\nU+FFFD corrupted glyph count: {bad}")
