// سحب الـ PDF المولد داخل المتصفح (blob) وحفظه محليًا للفحص — بطاقة خطوتين
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { execSync } from 'child_process'

const tmp = '/tmp/.grab-status'
if (existsSync(tmp)) unlinkSync(tmp)

// الخطوة 1: ابدأ الجلب واحفظ النتيجة في window.__b64 (مع علامة اكتمال)
execSync(
  `agent-browser eval "(async()=>{try{const r=await fetch(window.__dl.url); const b=await r.blob(); window.__b64=await new Promise(res=>{const fr=new FileReader(); fr.onload=()=>res(fr.result.split(',')[1]); fr.readAsDataURL(b)}); window.__b64done=true; return 'FETCHED'}catch(e){window.__b64done='ERR:'+e.message}})()"`,
  { encoding: 'utf8', shell: '/bin/bash' }
)

// الخطوة 2: انتظر حتى الاكتمال ثم اقرأ (على دفعات لتجنب قص المخرجات)
let b64 = ''
for (let i = 0; i < 60; i++) {
  const done = execSync(`agent-browser eval "String(window.__b64done)"`, { encoding: 'utf8' }).trim()
  if (done.includes('true')) break
  if (done.includes('ERR')) throw new Error(done)
  await new Promise((r) => setTimeout(r, 500))
}
// base64 عادة 1.5-2MB — agent-browser قد يقص. نقسم القراءة على نطاقات
const len = Number(
  execSync(`agent-browser eval "window.__b64.length"`, { encoding: 'utf8', maxBuffer: 1024 * 1024 }).replace(/"/g, '').trim()
)
console.log('b64 length:', len)
const CH = 400_000
for (let off = 0; off < len; off += CH) {
  const end = Math.min(off + CH, len)
  const part = execSync(
    `agent-browser eval "window.__b64.slice(${off},${end})"`,
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
  ).trim()
  b64 += part.replace(/^"/, '').replace(/"$/, '')
}
if (b64.length !== len) console.warn('WARNING: got', b64.length, 'expected', len)
const buf = Buffer.from(b64, 'base64')
writeFileSync('/home/z/my-project/scripts/pdf-editor/client-export.pdf', buf)
console.log('saved:', buf.length, 'bytes | header:', buf.subarray(0, 5).toString('latin1'))
