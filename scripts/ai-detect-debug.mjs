/* فحص فروق التحليل بين بيئة bun وبين المتصفح على نفس النص */
import { readFileSync } from 'node:fs';
import { analyzeAiText } from '../src/lib/ai-engine.js';

const raw = readFileSync('/tmp/standalone-text.txt', 'utf8');
// الملف اتكتب من eval بصيغة JSON string مع علامة \u200b===PAGE===
let txt = raw.replace(/^"|"$/g, '');
// فك تسلسلات الهروب الشائعة
txt = txt.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\u200b/g, '\u200b').replace(/\\\\/g, '\\');
const pages = txt.split('\u200b===PAGE===\n').map((p) => p.replace(/\n$/, ''));
console.log('عدد الصفحات:', pages.length);

const joined = pages.join('\n');
const r1 = analyzeAiText(joined);
console.log('بدون pageTexts:', r1.ok ? r1.percent + '%' : r1.reason);
const r2 = analyzeAiText(joined, { pageTexts: pages });
console.log('مع pageTexts:  ', r2.ok ? r2.percent + '%' : r2.reason);
console.log('كلمات:', r1.stats.words, 'جمل:', r1.stats.sentences);
if (r1.ok) {
  console.log(r1.signals.map((s) => `${s.id}:${s.score}`).join(' '));
}
