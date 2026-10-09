// Test: extract Arabic text from the sample PDF and inspect ordering quality
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

const DATA = fs.readFileSync('/home/z/my-project/public/sample.pdf');

function clean(s) {
  return s.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
}

function extractLines(items) {
  // Group text items into visual lines by baseline Y (tolerance)
  const lines = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4], y = it.transform[5];
    let line = null;
    for (const L of lines) {
      if (Math.abs(L.y - y) <= 3) { line = L; break; }
    }
    if (!line) { line = { y, items: [] }; lines.push(line); }
    line.items.push({ x, str: it.str, w: it.width });
  }
  lines.sort((a, b) => b.y - a.y); // top to bottom
  return lines.map(L => {
    const desc = [...L.items].sort((a, b) => b.x - a.x); // RTL: right to left
    const asc  = [...L.items].sort((a, b) => a.x - b.x); // LTR: left to right
    return {
      rtlJoin: desc.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim(),
      ltrJoin: asc.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim(),
    };
  });
}

const doc = await pdfjsLib.getDocument({ data: new Uint8Array(DATA), useSystemFonts: true }).promise;
console.log('numPages =', doc.numPages);
for (const pn of [3, 4]) {
  const page = await doc.getPage(pn);
  const tc = await page.getTextContent();
  const lines = extractLines(tc.items);
  console.log(`\n===== PAGE ${pn} (first 6 lines) =====`);
  lines.slice(0, 6).forEach((l, i) => {
    console.log(`[L${i}] RTL: ${clean(l.rtlJoin).slice(0, 90)}`);
    if (i < 2) console.log(`[L${i}] LTR: ${clean(l.ltrJoin).slice(0, 90)}`);
  });
}
