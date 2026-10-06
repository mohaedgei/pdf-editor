#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Find body section start pages (searching AFTER the TOC page)."""
import sys
import pypdfium2 as pdfium

PDF = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/download/بحث_الاتجاهات_الحديثة_في_علم_الإعلام.pdf"

# search from page 3 onward (skip cover=1 and TOC=2)
sections = {
    "المقدمة": None,
    "المبحث الأول": None,
    "المبحث الثاني": None,
    "المبحث الثالث": None,
    "الخاتمة": None,
    "قائمة المراجع": None,
}

doc = pdfium.PdfDocument(PDF)
pages_text = []
for page in doc:
    t = page.get_textpage().get_text_bounded().replace("\u200f", "")
    pages_text.append(t)

for i in range(2, len(pages_text)):  # page 3 onwards (0-indexed 2)
    text = pages_text[i]
    for sec in sections:
        if sections[sec] is None and sec in text:
            # verify it's the heading, not a TOC-like mention: heading lines are short
            sections[sec] = i + 1

print("Body section start pages:")
for sec, pg in sections.items():
    print(f"  {sec}: page {pg}")

# last-page fill estimate: chars on last page vs avg of previous content pages
last = len(pages_text[-1])
prev_avg = sum(len(p) for p in pages_text[2:-1]) / (len(pages_text) - 3)
print(f"\nLast page chars: {last}, avg body page chars: {prev_avg:.0f} → fill ≈ {last/prev_avg*100:.0f}%")
