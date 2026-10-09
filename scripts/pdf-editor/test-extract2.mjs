// Test 2: dump raw items of one line + try gap-based smart join
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

const DATA = fs.readFileSync('/home/z/my-project/public/sample.pdf');

const doc = await pdfjsLib.getDocument({ data: new Uint8Array(DATA), useSystemFonts: true }).promise;

// find the line containing فال..بر on page 4
const page = await doc.getPage(4);
const tc = await page.getTextContent();
console.log('--- raw items (first 25) ---');
tc.items.slice(0, 25).forEach((it, i) => {
  if (!it.str) return;
  console.log(`#${i} x=${it.transform[4].toFixed(1)} y=${it.transform[5].toFixed(1)} w=${(it.width||0).toFixed(1)} h=${(it.height||0).toFixed(1)} str=${JSON.stringify(it.str)}`);
});

// Gap-based join test on page 3
function joinLine(items) {
  // items: {x, w, str} — sort descending x (RTL)
  const sorted = [...items].sort((a, b) => b.x - a.x);
  let out = '';
  let prevLeft = null;
  for (const it of sorted) {
    if (prevLeft !== null) {
      const gap = prevLeft - (it.x + it.w); // from this item's right edge to prev item's left edge
      if (gap > 1.2) out += ' ';            // word gap threshold
    }
    out += it.str;
    prevLeft = it.x;
  }
  return out;
}

const p3 = await doc.getPage(3);
const t3 = await p3.getTextContent();
const lines = new Map();
for (const it of t3.items) {
  if (!it.str || !it.str.trim()) continue;
  const y = Math.round(it.transform[5]);
  let key = null;
  for (const k of lines.keys()) if (Math.abs(k - y) <= 3) { key = k; break; }
  if (key === null) key = y;
  if (!lines.has(key)) lines.set(key, []);
  lines.get(key).push({ x: it.transform[4], w: it.width || 0, str: it.str, h: it.height || 0 });
}
console.log('\n--- gap-joined lines page 3 ---');
[...lines.entries()].sort((a, b) => b[0] - a[0]).slice(0, 8).forEach(([y, items]) => {
  const txt = joinLine(items).replace(/[\u200e\u200f]/g, '');
  console.log(`y=${y} h=${items[0].h.toFixed(0)} | ${txt.slice(0, 95)}`);
});
