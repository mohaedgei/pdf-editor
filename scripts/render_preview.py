#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Render PDF pages to PNGs for visual inspection + verify المبحث الأول page."""
import os
import sys
import pypdfium2 as pdfium

PDF = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/download/بحث_الاتجاهات_الحديثة_في_علم_الإعلام.pdf"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/home/z/my-project/scripts/preview"
os.makedirs(OUT, exist_ok=True)

doc = pdfium.PdfDocument(PDF)

# verify المبحث الأول (lam-alef extracts as "األول")
for i, page in enumerate(doc):
    t = page.get_textpage().get_text_bounded().replace("\u200f", "")
    if "المبحث األول" in t or ("المبحث" in t and "األول" in t):
        print(f"المبحث الأول heading found on page {i+1}")

# render all pages
for i, page in enumerate(doc):
    bitmap = page.render(scale=1.1)
    img = bitmap.to_pil()
    path = f"{OUT}/page_{i+1}.png"
    img.save(path)
    print(f"saved {path}")
