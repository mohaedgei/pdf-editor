/**
 * pdf-layout.ts — بناء مربعات الكلام الهندسية من عناصر pdf.js
 * يعمل في المتصفح: يستقبل العناصر بعد تحويلها لإحداثيات العرض (عرض الصفحة = 794px)
 *
 * القواعد المجرّبة (نفس خوارزمية الاستخراج الخادمية المجرّبة):
 * - تجميع العناصر في أسطر بحسب خط الأساس Y
 * - إزالة NUL وعلامات الاتجاه والمسافات الزائفة داخل الـ runs
 * - وصل تنازلي X (يمين ← يسار) مع مسافة عند الفجوات
 * - علامات الضبط تُلحق بالكلمة الحامل لها (يمين العلامة)
 */

export interface GeoItem {
  x: number; // يسار العنصر px
  y: number; // خط الأساس px (من أعلى الصفحة)
  w: number; // العرض px
  h: number; // حجم الخط px
  str: string;
}

export interface LineBlock {
  x: number; // يسار السطر
  right: number; // يمين السطر
  baseline: number; // خط الأساس
  size: number; // حجم الخط px
  text: string;
}

/** ثابت موضع خط الأساس داخل صندوق النص line-height:1 بخط أميري (hhea 1123/593) */
export const BASELINE_K = 0.765;

const DIR_MARKS = /[\u0000\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const MARKS_RE = /^[\u064B-\u065F\u0670\u0640]+$/u;
const LETTER_RE = /[\p{L}\u0640]/u;

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function attachMarks(words: GeoItem[], marks: GeoItem[]): void {
  for (const m of marks) {
    const c = m.x + m.w / 2;
    // 1) العلامة داخل حدود كلمة
    let inside: GeoItem | null = null;
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
    // 2) في فجوة ← الكلمة على يمينها الأقرب
    const rightOfMark = words.filter((w) => LETTER_RE.test(w.str) && w.x + w.w > c + 0.01);
    if (rightOfMark.length) {
      rightOfMark.sort((a, b) => a.x - b.x);
      rightOfMark[0].str += m.str;
      continue;
    }
    // 3) احتياط: أقرب كلمة
    const letterWords = words.filter((w) => LETTER_RE.test(w.str));
    const pool = letterWords.length ? letterWords : words;
    let best: GeoItem | null = null;
    let bestD = Infinity;
    for (const w of pool) {
      const d = Math.min(Math.abs(c - w.x), Math.abs(c - (w.x + w.w)));
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    if (best) best.str += m.str;
  }
}

/** يبني مربعات الأسطر من عناصر pdf.js المحوّلة لإحداثيات العرض */
export function buildLineBlocks(items: GeoItem[]): LineBlock[] {
  const groups: GeoItem[][] = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    let g: GeoItem[] | undefined;
    for (const G of groups) {
      if (Math.abs(G[0].y - it.y) <= 4) {
        g = G;
        break;
      }
    }
    if (g) g.push(it);
    else groups.push([it]);
  }

  const lines: LineBlock[] = [];
  for (const g of groups) {
    const words: GeoItem[] = [];
    const marks: GeoItem[] = [];
    for (const it of g) {
      const s = it.str.replace(DIR_MARKS, "").replace(/[ \t\u00a0]+/g, "");
      if (!s) continue;
      if (MARKS_RE.test(s)) marks.push({ ...it, str: s });
      else words.push({ ...it, str: s });
    }
    if (!words.length) continue;
    attachMarks(words, marks);

    words.sort((a, b) => b.x - a.x);
    let text = "";
    let prevLeft: number | null = null;
    for (const w of words) {
      if (prevLeft !== null && prevLeft - (w.x + w.w) > 2.4) text += " ";
      text += w.str;
      prevLeft = w.x;
    }
    text = text.replace(/\s+/g, " ").trim();
    if (!text) continue;

    lines.push({
      x: Math.min(...words.map((w) => w.x)),
      right: Math.max(...words.map((w) => w.x + w.w)),
      baseline: median(words.map((w) => w.y)),
      size: median(words.map((w) => w.h)) || 19,
      text,
    });
  }

  lines.sort((a, b) => a.baseline - b.baseline || b.x - a.x);
  return lines;
}
