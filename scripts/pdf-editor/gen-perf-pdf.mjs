// توليد PDF عربي تجريبي من 20 صفحة لاختبار الأداء (نفس خط إنتاج البحوث)
import { writeFileSync, mkdirSync } from 'fs'
import { execFile } from 'child_process'
import { pathToFileURL } from 'url'

const PAGES = 20
const para =
  'يعد لغة الإعلام من المواضيع المهمة التي تشغل الباحثين في مجال الاتصال، حيث تحرص وسائل الإعلام المختلفة على تقديم المادة الصحفية بلغة قريبة من فهم الجمهور. ' +
  'ولقد اهتم كثير من الدارسين بخصائص هذه اللغة، فمنها البساطة والوضوح والتشويق والتأثير في المتلقي. '

let html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>
@page { size: 794px 1123px; margin: 0; }
body { margin: 0; font-family: 'Noto Sans SC', 'Amiri', serif; background: #fff; }
section { width: 794px; height: 1123px; padding: 70px 60px; box-sizing: border-box; position: relative; page-break-before: always; }
h2 { color: #1d4ed8; text-align: center; font-size: 26px; }
p { font-size: 19px; line-height: 1.9; text-align: justify; }
.np { position: absolute; bottom: 30px; left: 0; right: 0; text-align: center; font-size: 14px; }
</style></head><body>`
for (let i = 1; i <= PAGES; i++) {
  html += `<section><h2>اختبار الأداء — الصفحة ${i}</h2>`
  for (let j = 0; j < 4; j++) html += `<p>${para}${para}</p>`
  html += `<div class="np">${i}</div></section>`
}
html += '</body></html>'

mkdirSync('/home/z/my-project/.tmp-perf', { recursive: true })
const htmlPath = '/home/z/my-project/.tmp-perf/perf20.html'
const pdfPath = '/home/z/my-project/.tmp-perf/perf20.pdf'
writeFileSync(htmlPath, html, 'utf8')

await new Promise((resolve, reject) => {
  execFile('node', ['/home/z/my-project/skills/pdf/scripts/html2pdf-next.js', htmlPath, '--nopaged', '--output', pdfPath], { timeout: 120000 }, (e) => (e ? reject(e) : resolve()))
})
console.log('perf20.pdf generated')
