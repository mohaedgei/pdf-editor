// Test render API: take extraction result, edit a word, render, verify PDF
import fs from 'fs';

const d = JSON.parse(fs.readFileSync('/tmp/extract.json', 'utf8'));
// تعديل تجريبي في الصفحة 3
d.pages[2].text = d.pages[2].text.replace('من غير اللغة', 'من دون اللغة');
const res = await fetch('http://localhost:3000/api/render', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fileName: 'بحث خصائص لغة الإعلام.pdf', pages: d.pages }),
});
console.log('HTTP', res.status, res.headers.get('content-type'));
if (!res.ok) {
  console.log(await res.text());
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
fs.writeFileSync('/home/z/my-project/scripts/pdf-editor/render-test.pdf', buf);
console.log('bytes:', buf.length, 'header:', buf.subarray(0, 5).toString());
