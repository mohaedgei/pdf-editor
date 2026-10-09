// Test 3: investigate missing خ + inventory of items containing internal spaces
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

const DATA = fs.readFileSync('/home/z/my-project/public/sample.pdf');
const doc = await pdfjsLib.getDocument({ data: new Uint8Array(DATA), useSystemFonts: true }).promise;

const p3 = await doc.getPage(3);
const t3 = await p3.getTextContent();

// 1) dump the "لغة الكتب والدراسة" line (y ~ 600)
console.log('--- line y≈596-604 raw items ---');
const lineItems = t3.items.filter(it => it.str && Math.abs(it.transform[5] - 600) <= 4);
const sorted = [...lineItems].sort((a, b) => b.transform[4] - a.transform[4]);
sorted.forEach(it => {
  console.log(`x=${it.transform[4].toFixed(1)} w=${(it.width||0).toFixed(1)} h=${(it.height||0).toFixed(1)} str=${JSON.stringify(it.str)}`);
});

// 2) inventory: items with h>0 containing internal spaces across pages 3-5
console.log('\n--- items with internal spaces (pages 3-5) ---');
for (const pn of [3, 4, 5]) {
  const pg = await doc.getPage(pn);
  const tc = await pg.getTextContent();
  let count = 0;
  for (const it of tc.items) {
    if (it.str && it.str.trim() && it.str.includes(' ') && (it.height || 0) > 1) {
      if (count < 12) console.log(`p${pn} x=${it.transform[4].toFixed(0)} ${JSON.stringify(it.str)}`);
      count++;
    }
  }
  console.log(`p${pn}: ${count} items with internal spaces`);
}
