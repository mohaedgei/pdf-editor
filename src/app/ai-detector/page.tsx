'use client';

/**
 * فاحص الذكاء الاصطناعي — صفحة مستقلة داخل موقع المحرر
 * كل التحليل يحدث داخل متصفح المستخدم: لا يوجد أي API خارجي أو إرسال بيانات.
 */

import { useCallback, useRef, useState } from 'react';
import {
  Loader2,
  FileUp,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  RotateCcw,
  ClipboardPaste,
  FileText,
} from 'lucide-react';
import { buildLineBlocks, type GeoItem } from '@/lib/pdf-layout';
import { analyzeAiText } from '@/lib/ai-engine.js';

/** بادئة الأصول — تُضبط وقت البناء لاستضافة GitHub Pages (مثلاً /pdf-editor) */
const ASSET_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

type Report = ReturnType<typeof analyzeAiText>;

const TONE_STROKE: Record<string, string> = {
  good: '#059669',
  ok: '#0d9488',
  warn: '#d97706',
  bad: '#e11d48',
};

function barColor(score: number): string {
  if (score < 30) return 'bg-emerald-500';
  if (score < 60) return 'bg-amber-500';
  return 'bg-rose-500';
}

/** استخراج نص كل صفحة بنفس قواعد المحرر المجرّبة (أسطر Y + وصل تنازلي X) */
async function extractPdfPages(
  file: File,
  onProgress: (s: string) => void
): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `${ASSET_BASE}/pdf.worker.min.mjs`;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    standardFontDataUrl: `${ASSET_BASE}/pdfjs-std/`,
    cMapUrl: `${ASSET_BASE}/pdfjs-cmaps/`,
    cMapPacked: true,
    isEvalSupported: false,
  }).promise;

  const texts: string[] = [];
  for (let pn = 1; pn <= doc.numPages; pn++) {
    onProgress(`جاري قراءة الصفحة ${pn} من ${doc.numPages}…`);
    const page = await doc.getPage(pn);
    const p1 = page.getViewport({ scale: 1 });
    const S = 794 / p1.width;
    const vp = page.getViewport({ scale: S });
    const tc = await page.getTextContent();
    const items: GeoItem[] = [];
    for (const it of tc.items as unknown as Record<string, unknown>[]) {
      const str = it.str as string;
      if (!str || !str.trim()) continue;
      const tr = it.transform as number[];
      const tx = pdfjs.Util.transform(vp.transform, tr);
      const fh = Math.hypot(tx[2], tx[3]);
      if (fh < 3) continue;
      items.push({
        x: tx[4],
        y: tx[5],
        w: ((it.width as number) || 0) * S,
        h: fh,
        str,
      });
    }
    const lines = buildLineBlocks(items);
    texts.push(lines.map((l) => l.text).join('\n'));
  }
  return texts;
}

export default function AiDetector() {
  const [mode, setMode] = useState<'pdf' | 'text'>('pdf');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [pageTexts, setPageTexts] = useState<string[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [textInput, setTextInput] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setReport(null);
    setPageTexts(null);
    setFileName('');
    setError('');
    setProgress('');
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const runReport = useCallback(
    (text: string, pages: string[] | null, name: string) => {
      const r = analyzeAiText(text, pages ? { pageTexts: pages } : {});
      if (!r.ok) {
        if (r.reason === 'not-arabic') {
          setError('الفاحص ده مضبوط للنص العربي — الملف ده مفيهوش نص عربي كافي.');
        } else {
          setError('مفيش نص كفاية للفحص — الملف ده غالبًا صورة ممسوحة ضوئيًا مش نص.');
        }
        return;
      }
      setReport(r);
      // @ts-expect-error debug hook
      window.__dbgPages = pages;
      setPageTexts(pages);
      setFileName(name);
    },
    []
  );

  const handleFile = useCallback(
    async (f: File) => {
      setError('');
      setReport(null);
      setPageTexts(null);
      setBusy(true);
      try {
        const pages = await extractPdfPages(f, setProgress);
        const joined = pages.join('\n');
        setProgress('');
        runReport(joined, pages, f.name);
      } catch {
        setError('مش قادر أقرأ الملف ده — تأكد إنه PDF سليم وغير محمي بكلمة سر.');
      } finally {
        setBusy(false);
      }
    },
    [runReport]
  );

  const loadSample = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      setProgress('جاري تحميل الملف النموذجي…');
      const res = await fetch(`${ASSET_BASE}/sample.pdf`);
      const blob = await res.blob();
      const f = new File([blob], 'بحث نموذجي.pdf', { type: 'application/pdf' });
      const pages = await extractPdfPages(f, setProgress);
      setProgress('');
      runReport(pages.join('\n'), pages, f.name);
    } catch {
      setError('مش قادر أحمّل النموذج — جرب ملف عندك.');
    } finally {
      setBusy(false);
    }
  }, [runReport]);

  const handleText = useCallback(() => {
    setError('');
    const t = textInput.trim();
    if (t.split(/\s+/).length < 15) {
      setError('اكتب نص أطول شوية (١٥ كلمة على الأقل) عشان الفحص يبقى ليه معنى.');
      return;
    }
    runReport(t, null, 'نص ملصوق');
  }, [textInput, runReport]);

  /* ============================ العرض ============================ */

  const pct = report?.ok ? report.percent : 0;
  const C = 2 * Math.PI * 64;

  return (
    <div dir="rtl" className="flex min-h-screen flex-col bg-zinc-50">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <div className="text-[15px] font-extrabold leading-tight text-zinc-900">
                فاحص الذكاء الاصطناعي
              </div>
              <div className="text-xs text-zinc-500">للنصوص العربية — يعمل داخل متصفحك</div>
            </div>
          </div>
          <a
            href="../"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-600 transition-colors hover:border-emerald-400 hover:text-emerald-700"
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            المحرر
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-10">
        {/* ==================== الإدخال ==================== */}
        {!report && (
          <>
            <div className="mb-6 text-center">
              <h1 className="mb-2 text-2xl font-extrabold leading-snug text-zinc-900 sm:text-3xl">
                ارفع أي PDF أو الصق أي نص… واعرف نسبته من الذكاء الاصطناعي
              </h1>
              <p className="mx-auto max-w-2xl text-[15px] leading-7 text-zinc-600">
                الفاحص يقرأ أسلوب الكلام نفسه: العبارات الجاهزة، انتظام أطوال الجمل،
                تكرار البادئات، وصيغ الكتابة المكتبية — ويعطيك نسبة مئوية تقديرية.
              </p>
              <div className="mx-auto mt-4 flex max-w-xl items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800">
                <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
                التحليل كله بيحصل جوه متصفحك — ملفك مش بيترفع على أي سيرفر، ومفيش أي API خارجي
              </div>
            </div>

            <div className="mb-4 flex justify-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
              {(
                [
                  ['pdf', 'ملف PDF', FileUp],
                  ['text', 'لصق نص', ClipboardPaste],
                ] as const
              ).map(([m, label, Icon]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors sm:flex-none sm:px-6 ${
                    mode === m
                      ? 'bg-emerald-600 text-white'
                      : 'text-zinc-600 hover:bg-zinc-100'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            {mode === 'pdf' ? (
              <div
                role="button"
                tabIndex={0}
                aria-label="رفع ملف PDF للفحص"
                onClick={() => !busy && inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f && !busy) void handleFile(f);
                }}
                className={`cursor-pointer rounded-2xl border-2 border-dashed bg-white p-10 text-center transition-colors sm:p-14 ${
                  dragOver ? 'border-emerald-500 bg-emerald-50' : 'border-zinc-300 hover:border-emerald-400'
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                />
                {busy ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <Loader2 className="h-10 w-10 animate-spin text-emerald-600" aria-hidden="true" />
                    <p className="text-sm font-medium text-zinc-600">{progress}</p>
                  </div>
                ) : (
                  <>
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <FileUp className="h-7 w-7" aria-hidden="true" />
                    </div>
                    <div className="mb-1 text-lg font-bold text-zinc-900">
                      اسحب ملف PDF هنا أو اضغط للاختيار
                    </div>
                    <div className="mb-5 text-sm text-zinc-500">
                      لازم يكون نص حقيقي (مش صور ممسوحة ضوئيًا)
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void loadSample();
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-700 transition-colors hover:border-emerald-400 hover:text-emerald-700"
                    >
                      <FileText className="h-4 w-4" aria-hidden="true" />
                      جرّب ببحث نموذجي
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
                <textarea
                  dir="rtl"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder={'الصق النص العربي هنا…\n\nنصيحة: كل ما النص يكون أطول، الفحص يبقى أدق — الأفضل من ١٥٠ كلمة.'}
                  rows={9}
                  className="w-full resize-y rounded-xl border border-zinc-300 bg-zinc-50 p-4 text-[15px] leading-7 text-zinc-800 outline-none transition-colors focus:border-emerald-500 focus:bg-white"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500">
                    {textInput.trim() ? `${textInput.trim().split(/\s+/).length} كلمة` : '—'}
                  </span>
                  <button
                    type="button"
                    onClick={handleText}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    افحص النص
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="mx-auto mt-4 max-w-xl rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-semibold text-rose-700">
                {error}
              </div>
            )}
          </>
        )}

        {/* ==================== النتيجة ==================== */}
        {report && report.ok && (
          <div className="space-y-5">
            <div className="flex flex-col items-center rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-1 text-sm font-semibold text-zinc-500">
                {fileName}
              </div>
              <div className="relative my-3">
                <svg width="200" height="200" viewBox="0 0 200 200" className="-rotate-90">
                  <circle cx="100" cy="100" r="64" fill="none" stroke="#f4f4f5" strokeWidth="18" />
                  <circle
                    cx="100"
                    cy="100"
                    r="64"
                    fill="none"
                    stroke={TONE_STROKE[report.tone] || '#e11d48'}
                    strokeWidth="18"
                    strokeLinecap="round"
                    strokeDasharray={C}
                    strokeDashoffset={C * (1 - pct / 100)}
                    style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.6s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-5xl font-extrabold text-zinc-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {pct}%
                  </div>
                  <div className="mt-1 text-xs font-bold text-zinc-500">نسبة الذكاء الاصطناعي</div>
                </div>
              </div>
              <div
                className={`rounded-full border px-4 py-1.5 text-sm font-extrabold ${
                  report.tone === 'good'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : report.tone === 'ok'
                      ? 'border-teal-200 bg-teal-50 text-teal-700'
                      : report.tone === 'warn'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                {report.verdict}
              </div>
              <div className="mt-3 text-xs text-zinc-500">
                ثقة الفحص: <b className="text-zinc-700">{report.confidence}</b>
                {' · '}
                {report.stats.words} كلمة · {report.stats.sentences} جملة
                {report.stats.avgSentence ? ` · متوسط الجملة ${report.stats.avgSentence} كلمة` : ''}
              </div>
              <button
                type="button"
                onClick={reset}
                className="mt-5 inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-700 transition-colors hover:border-emerald-400 hover:text-emerald-700"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                فحص ملف أو نص تاني
              </button>
            </div>

            {report.pages && (
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="mb-4 text-base font-extrabold text-zinc-900">
                  تفصيل الصفحات
                </h2>
                <div className="space-y-2.5">
                  {report.pages.map((p) => (
                    <div key={p.page} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-xs font-bold text-zinc-500">
                        صفحة {p.page}
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                        {p.percent != null && (
                          <div
                            className={`h-full rounded-full ${barColor(p.percent)} transition-all duration-700`}
                            style={{ width: `${p.percent}%` }}
                          />
                        )}
                      </div>
                      <span className="w-12 shrink-0 text-left text-xs font-extrabold tabular-nums text-zinc-700">
                        {p.percent == null ? '—' : `${p.percent}%`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="mb-1 text-base font-extrabold text-zinc-900">
                المؤشرات اللي اتلقطت
              </h2>
              <p className="mb-4 text-xs text-zinc-500">
                كل مؤشر بيتحسب من أسلوب النص نفسه — النسب تشير لقوة اللمحة مش لحكم نهائي
              </p>
              <div className="space-y-3">
                {[...report.signals]
                  .sort((a, b) => b.score - a.score)
                  .map((s) => (
                    <div key={s.id}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-zinc-800">
                          {s.label}
                          {'hits' in s && (s as { hits?: number }).hits ? (
                            <span className="mr-1.5 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-bold text-zinc-500">
                              {(s as { hits?: number }).hits} إصابة
                            </span>
                          ) : null}
                          {'count' in s && (s as { count?: number }).count && !('hits' in s) ? (
                            <span className="mr-1.5 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-bold text-zinc-500">
                              {(s as { count?: number }).count}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-xs font-extrabold tabular-nums text-zinc-500">
                          {s.score}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className={`h-full rounded-full ${barColor(s.score)} transition-all duration-700`}
                          style={{ width: `${s.score}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-400">{s.desc}</div>
                    </div>
                  ))}
              </div>
            </div>

            {report.phrases.length > 0 && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-5 sm:p-6">
                <h2 className="mb-1 text-base font-extrabold text-rose-900">
                  عبارات مصنّفة «آلية» اتلقطت في النص
                </h2>
                <p className="mb-3 text-xs text-rose-500">
                  دي عبارات بتتكرر جدًا في النصوص المولّدة آليًا وقليلة في كتابة البشر
                </p>
                <div className="flex flex-wrap gap-2">
                  {report.phrases.map((p) => (
                    <span
                      key={p.phrase}
                      className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[13px] font-bold text-rose-800"
                    >
                      {p.phrase}
                      {p.count > 1 && <span className="mr-1 text-rose-400">×{p.count}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {report.humanMarks.length > 0 && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5 sm:p-6">
                <h2 className="mb-1 text-base font-extrabold text-emerald-900">
                  علامات كتابة بشرية اتلقطت
                </h2>
                <p className="mb-3 text-xs text-emerald-600">
                  العامية والضمير المتكلم والتعجب — كلها تقلل احتمال الآلي
                </p>
                <div className="flex flex-wrap gap-2">
                  {report.humanMarks.map((p) => (
                    <span
                      key={p.phrase}
                      className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-[13px] font-bold text-emerald-800"
                    >
                      {p.phrase}
                      {p.count > 1 && <span className="mr-1 text-emerald-400">×{p.count}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-zinc-200 bg-zinc-100/60 p-5 text-center sm:p-6">
              <p className="mx-auto max-w-2xl text-[13px] leading-6 text-zinc-600">
                <b>مهم:</b> النسبة دي <b>تقديرية</b> ومبنية على بصمة أسلوبية إحصائية،
                مش دليل قاطع — ولا أداة في العالم بتقدر تجزم ١٠٠٪. النصوص الأكاديمية
                الرسمية بتميل طبعًا لأسلوب منسق، والنص القصير (أقل من ١٥٠ كلمة) دقته أقل.
                استخدم النتيجة كمؤشر مساعد بس.
              </p>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-200 bg-white py-4 text-center text-xs text-zinc-400">
        فاحص الذكاء الاصطناعي · جزء من موقع محرر البحث · كل الحسابات محلية داخل المتصفح
      </footer>
    </div>
  );
}
