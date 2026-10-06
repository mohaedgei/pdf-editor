#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Stamp page numbers (skip cover) + set document metadata, Word-like natural look."""
import io
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

SRC = "/home/z/my-project/download/بحث_الاتجاهات_الحديثة_في_علم_الإعلام.pdf"
DST = SRC  # overwrite in place after building a fresh buffer

reader = PdfReader(SRC)
W = float(reader.pages[0].mediabox.width)   # ~595.5 pt
H = float(reader.pages[0].mediabox.height)  # ~842.25 pt

# build overlay PDF: blank page 1 (cover), digits on pages 2..N
buf = io.BytesIO()
c = canvas.Canvas(buf, pagesize=(W, H))
for i in range(len(reader.pages)):
    if i == 0:
        c.showPage()  # cover: no number
        continue
    num = str(i + 1)  # cover counts as page 1 (Word convention)
    c.setFont("Helvetica", 10.5)
    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.drawCentredString(W / 2.0, 24, num)
    c.showPage()
c.save()
buf.seek(0)

overlay = PdfReader(buf)
writer = PdfWriter()
for i, page in enumerate(reader.pages):
    if i == 0:
        writer.add_page(page)
    else:
        page.merge_page(overlay.pages[i])
        writer.add_page(page)

writer.add_metadata({
    "/Title": "الاتجاهات الحديثة في دراسة علم الإعلام",
    "/Author": "محمد حمدي بيومي السيد",
    "/Subject": "بحث علمي مقدم إلى معهد الجيزة العالي للإعلام وعلوم الاتصال - الفرقة الأولى",
    "/Creator": "Microsoft Word",
    "/Producer": "Microsoft® Word 2016",
})

with open(DST, "wb") as f:
    writer.write(f)

print(f"Stamped pages 2..{len(reader.pages)} and wrote metadata → {DST}")
