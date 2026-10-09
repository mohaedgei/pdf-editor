/**
 * pdf-extract.ts — استخراج النص العربي من ملفات PDF المولّدة بـ Chromium/Skia
 *
 * الخوارزمية:
 * 1) تجميع عناصر النص في أسطر بحسب الإحداثي Y (بسماحية 3pt)
 * 2) تنظيف كل عنصر: إزالة NUL وعلامات الاتجاه والمسافات الزائفة الداخلية
 *    (المسافات الحقيقية في PDFs كروم تظهر كعناصر مستقلة أو فجوات مواقع)
 * 3) وصل عناصر السطر بترتيب من اليمين لليسار (تنازلي X) مع إدراج مسافة
 *    عند الفجوات المكانية الكبيرة
 * 4) علامات الضبط المنفصلة (تنوين/شدّة) تُلحق بالكلمة التي تجاورها
 * 5) كشف الفقرات والعناوين من إيقاع الأسطر وارتفاع الخط
 */

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export interface ExtractedPage {
  page: number;
  text: string;
}
export interface ExtractResult {
  fileName: string;
  numPages: number;
  pages: ExtractedPage[];
  totalWords: number;
}

const MARKS_RE = /^[\u064B-\u065F\u0670\u0640]+$/u;
const DIR_MARKS = /[\u0000\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const LETTER_RE = /[\p{L}\u0640]/u;

interface RawItem {
  x: number;
  w: number;
  h: number;
  str: string;
}

function clean(s: string): string {
  return s.replace(DIR_MARKS, "").replace(/[ \t\u00a0]+/g, "");
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** يفصل عناصر علامات الضبط ويلحقها بالكلمة الصحيحة:
 *  1) العلامة داخل حدود كلمة ← كلمتها
 *  2) العلامة في فجوة بين كلمتين ← الكلمة على يمينها (السابقة في القراءة)
 *     لأن علامات نهاية الكلمة العربية تتبع آخر حرف فيها
 *  3) احتياطًا: أقرب كلمة إطلاقًا
 */
function attachMarks(items: RawItem[]): RawItem[] {
  const words: RawItem[] = [];
  const marks: RawItem[] = [];
  for (const it of items) {
    if (MARKS_RE.test(it.str)) marks.push(it);
    else words.push(it);
  }
  for (const m of marks) {
    const c = m.x + m.w / 2;
    let inside: RawItem | null = null;
    for (const w of words) {
      if (LETTER_RE.test(w.str) && c > w.x + 0.01 && c < w.x + w.w - 0.01) {
        inside = w;
        break;
      }
    }
    if (inside) {
      inside.str += m.str;
      continue;
    }
    const rightOfMark = words.filter((w) => LETTER_RE.test(w.str) && w.x + w.w > c + 0.01);
    if (rightOfMark.length) {
      rightOfMark.sort((a, b) => a.x - b.x);
      rightOfMark[0].str += m.str;
      continue;
    }
    const letterWords = words.filter((w) => LETTER_RE.test(w.str));
    const pool = letterWords.length ? letterWords : words;
    let best: RawItem | null = null;
    let bestD = Infinity;
    for (const w of pool) {
      const d = Math.min(Math.abs(c - w.x), Math.abs(c - (w.x + w.w)));
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    if (best) best.str += m.str;
    else words.push(m);
  }
  return words;
}

/** وصل عناصر السطر: تنازلي X (يمين ← يسار) + مسافة عند الفجوات الكبيرة */
function joinLine(items: RawItem[]): string {
  const words = attachMarks(items);
  words.sort((a, b) => b.x - a.x);
  let out = "";
  let prevLeft: number | null = null;
  for (const w of words) {
    if (prevLeft !== null) {
      const gap = prevLeft - (w.x + Math.max(w.w, 0));
      if (gap > 1.8) out += " ";
    }
    out += w.str;
    prevLeft = w.x;
  }
  return out.replace(/\s+/g, " ").trim();
}

interface LineObj {
  y: number;
  h: number;
  text: string;
}

function extractPageLines(items: Record<string, unknown>[]): {
  lines: LineObj[];
  footerY: number;
} {
  const groups: { y: number; items: RawItem[] }[] = [];
  let footerY = 80;
  const view = (items as unknown as { _view?: number[] })._view;
  if (view && view[3]) footerY = Math.min(80, view[3] * 0.1);

  for (const it of items) {
    const str = it.str as string;
    if (!str || !str.trim()) continue;
    const t = it.transform as number[];
    const x = t[4];
    const y = t[5];
    const cleaned = clean(str);
    if (!cleaned) continue;
    let g = groups.find((G) => Math.abs(G.y - y) <= 3);
    if (!g) {
      g = { y, items: [] };
      groups.push(g);
    }
    g.items.push({ x, y, w: (it.width as number) || 0, h: (it.height as number) || 0, str: cleaned });
  }

  const lines: LineObj[] = groups
    .sort((a, b) => b.y - a.y)
    .map((g) => {
      const text = joinLine(g.items);
      const h = median(g.items.map((i) => i.h).filter((v) => v > 0));
      return { y: g.y, h, text };
    })
    .filter((l) => l.text.length > 0);

  return { lines, footerY };
}

function assemblePageText(lines: LineObj[], footerY: number): string {
  // حذف أرقام الصفحات المختومة أسفل الصفحة
  const body = lines.filter((l) => !(l.y < footerY && /^\d{1,3}$/.test(l.text)));
  const pitches: number[] = [];
  for (let i = 1; i < body.length; i++) {
    const d = body[i - 1].y - body[i].y;
    if (d > 1 && d < 60) pitches.push(d);
  }
  const pitch = median(pitches) || 25;
  const medH = median(body.map((l) => l.h).filter((v) => v > 0)) || 14;

  const parts: string[] = [];
  let buf = "";
  let firstLine = true;
  for (let i = 0; i < body.length; i++) {
    const l = body[i];
    const gapAbove = i === 0 ? Infinity : body[i - 1].y - l.y;
    const newPara = !firstLine && gapAbove > pitch * 1.15;
    if (newPara && buf) {
      parts.push(buf);
      buf = "";
    }
    buf = buf ? `${buf} ${l.text}` : l.text;
    firstLine = false;
  }
  if (buf) parts.push(buf);

  return parts
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

export async function extractPdf(data: Buffer, fileName: string): Promise<ExtractResult> {
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const pages: ExtractedPage[] = [];
  let totalWords = 0;

  for (let pn = 1; pn <= doc.numPages; pn++) {
    const page = await doc.getPage(pn);
    const tc = await page.getTextContent();
    const items = tc.items as unknown as Record<string, unknown>[];
    (items as unknown as { _view?: number[] })._view = page.view;
    const { lines, footerY } = extractPageLines(items);
    const text = assemblePageText(lines, footerY);
    pages.push({ page: pn, text });
    totalWords += text.split(/\s+/).filter(Boolean).length;
  }

  return { fileName, numPages: doc.numPages, pages, totalWords };
}
