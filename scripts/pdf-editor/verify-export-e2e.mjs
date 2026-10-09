// يتحقق من مخرجات E2E: يفك الـ payload ويبعته لـ /api/render ويحفظ الناتج
import { readFileSync, writeFileSync } from 'fs'

const raw = readFileSync('/home/z/my-project/scripts/pdf-editor/payload-e2e.json', 'utf8').trim()
// المخرج من agent-browser: سلسلة JSON مقتبسة تحتوي JSON داخلي
const payload = JSON.parse(JSON.parse(raw))

console.log('fileName:', payload.fileName)
console.log('pages:', payload.pages.length)
for (const p of payload.pages) {
  const bgType = p.bg.slice(5, p.bg.indexOf(';'))
  console.log(`  page ${payload.pages.indexOf(p) + 1}: ${p.width}x${p.height} bg=${bgType} (${(p.bg.length / 1024).toFixed(0)}KB) patches=${p.patches.length} texts=${p.texts.map(t => t.text.slice(0, 22)).join(' | ')}`)
}

const res = await fetch('http://localhost:3000/api/render', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})
console.log('render status:', res.status)
if (!res.ok) {
  console.log(await res.text())
  process.exit(1)
}
const buf = Buffer.from(await res.arrayBuffer())
writeFileSync('/home/z/my-project/scripts/pdf-editor/e2e-exported.pdf', buf)
console.log('saved e2e-exported.pdf:', buf.length, 'bytes, header:', buf.subarray(0, 5).toString('latin1'))
