/**
 * ai-engine.js — فاحص الذكاء الاصطناعي للنصوص العربية
 * ------------------------------------------------------------
 * يعمل بالكامل داخل المتصفح: لا يرسل أي بيانات لأي سيرفر ولا يستخدم
 * أي API خارجي — كل شيء إحصاء أسلوبي على النص نفسه.
 *
 * الفكرة: النص المولّد بالذكاء الاصطناعي له «بصمة أسلوبية» تظهر في:
 *  1) كثافة الروابط الخطابية الجاهزة (علاوة على ذلك، من الجدير بالذكر…)
 *  2) العبارات القالبية المتكررة (تلعب دورًا هامًا، تحول رقمي، العديد من…)
 *  3) انتظام أطوال الجمل (انخفاض التقلب — Burstiness)
 *  4) الصيغ الرسمية (يتم، يقوم ب…)
 *  5) تكرار بادئات الجمل (و، كما، حيث، تعد…)
 *  6) انتظام علامات الترقيم وتكرار التعدادات
 *  7) ثبات إيقاع أطوال الأسطر عند تقسيم الصفحة لنوافذ
 * وفي المقابل: العامية والضمير الشخصي والتعجب يرفعون «دليل البشرية»
 * ويخصمون من النسبة النهائية.
 */

/* ------------------------------------------------------------------ */
/* أدوات عامة                                                          */
/* ------------------------------------------------------------------ */

const DIACRITICS = /[\u064B-\u065F\u0670\u0640\u06D6-\u06ED]/g;

/** تطبيع للعربية: إزالة التشكيل وتوحيد الهمزات/الألف المقصورة — لل مطابقة العبارات فقط */
export function normalizeAr(text) {
  return String(text || '')
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim();
}

const AR_CLASS = '\\u0621-\\u064A';

/** يبني regex لعبارت (مسافات مرنة + حدود كلمات + سماحية واو العطف) */
function phraseRegex(phrase) {
  const esc = phrase
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return new RegExp(
    `(?:^|[^${AR_CLASS}])(?:و)?${esc}(?=$|[^${AR_CLASS}])`,
    'g'
  );
}

function countPhrase(norm, phrase) {
  const re = phraseRegex(phrase);
  let n = 0;
  let m;
  while ((m = re.exec(norm))) {
    n++;
    re.lastIndex = m.index + 1;
  }
  return n;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function mean(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function std(nums) {
  if (nums.length < 2) return 0;
  const mu = mean(nums);
  return Math.sqrt(mean(nums.map((x) => (x - mu) * (x - mu))));
}

/** تقسيم لجمل: على النهايات والأسطر الجديدة — لا نقسم على الفاصلة */
export function splitSentences(normText) {
  return normText
    .split(/(?:[.!؟?…؛]+|\n)+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordsOf(normText) {
  return normText.match(new RegExp(`[${AR_CLASS}]+`, 'g')) || [];
}

/* ------------------------------------------------------------------ */
/* القواميس — مكتوبة بصيغة مطابقة بعد التطبيع                          */
/* ------------------------------------------------------------------ */

/* روابط خطابية جاهزة [العبارة، وحدة الإصابة] */
const CONNECTIVES = [
  ['علاوة على ذلك', 2], ['اضافة الى ذلك', 2], ['بالاضافة الى ذلك', 2],
  ['من الجدير بالذكر', 3], ['تجدر الاشاره', 3], ['من الجدير ذكره', 2.5],
  ['في هذا السياق', 2], ['في هذا الاطار', 2], ['في هذا الصدد', 2],
  ['في هذا المحور', 2], ['في هذا البعد', 2],
  ['من ناحية اخرى', 2], ['من جهة اخرى', 2], ['من جانب اخر', 2],
  ['في المقابل', 1], ['على الجانب الاخر', 1.5],
  ['خلاصة القول', 2], ['في الختام', 2], ['وفي الختام', 2],
  ['في نهاية المطاف', 2], ['خلاصة الكلام', 1.5],
  ['بشكل عام', 2], ['بصفة عامة', 2], ['في المجمل', 1],
  ['على وجه الخصوص', 2], ['على وجه العموم', 2],
  ['من خلال', 1], ['في ظل', 1], ['في ضوء', 1], ['في اطار', 1],
  ['على الصعيد', 2], ['على مستوى', 0.5],
  ['نظرا لان', 1], ['بالنظر الي', 1], ['استنادا الي', 1],
  ['وفقا لذلك', 1], ['وفقا لما', 1], ['بناء على ذلك', 1.5],
  ['كما ان', 1], ['حيث ان', 1], ['اذ ان', 1],
  ['لا سيما', 1], ['خاصة وان', 1],
  ['على الرغم من', 1], ['رغم ان', 0.5],
  ['في الوقت نفسه', 1], ['في الوقت ذاته', 1.5],
  ['ولعل من', 1], ['ومن ثم', 0.5],
];

/* عبارات قالبية [العبارة، وحدة الإصابة] */
const STOCK = [
  ['تلعب دور', 3], ['يلعب دور', 3], ['لعبت دور', 3], ['لعب دور', 3],
  ['يلعبان دور', 3], ['تسهم بدور', 3], ['يسهم بدور', 3],
  ['دورا هاما', 2], ['دورا مهما', 2], ['دورا حيويا', 2], ['دورا فعالا', 2],
  ['دورا رئيسيا', 2], ['دورا بارزا', 2], ['دورا كبيرا', 2], ['دورا اساسيا', 2],
  ['اهمية بالغة', 2], ['اهمية كبيرة', 2], ['باهمية بالغة', 2.5],
  ['تحول رقمي', 2], ['الثورة الرقمية', 2], ['عصر رقمي', 2],
  ['العصر الرقمي', 2], ['عالم رقمي', 2], ['العالم الرقمي', 2],
  ['عصرنا الحالي', 2], ['عالمنا المعاصر', 2.5], ['العصر الحالي', 1],
  ['العصر الحديث', 0.5], ['العالم الحديث', 1],
  ['تطور متسارع', 2], ['تطورات متسارعة', 2], ['وتيرة متسارعة', 2],
  ['وتيرة متزايدة', 2], ['تغيرات جذرية', 2], ['تغييرات جذرية', 2],
  ['تحولات جذرية', 2], ['نقلة نوعية', 2], ['قفزة نوعية', 2],
  ['العديد من', 1], ['الكثير من', 0.5], ['مختلف الجوانب', 1.5],
  ['من جوانبها المختلفة', 2], ['جوانب مختلفة', 1],
  ['بشكل كبير', 1.5], ['بدرجة كبيرة', 1.5], ['بشكل ملحوظ', 1.5],
  ['بشكل فعال', 1.5], ['بشكل ايجابي', 1.5], ['بشكل سلبي', 1],
  ['بشكل اساسي', 1.5], ['بشكل جوهري', 1.5], ['بشكل مباشر', 1],
  ['في السنوات الاخيرة', 2], ['في الاونة الاخيرة', 2], ['في الوقت الحالي', 1],
  ['فرص واسعة', 2], ['تحديات عديدة', 2], ['فرص عديدة', 2],
  ['تحديات كبيرة', 1.5], ['تحديات هائلة', 2], ['امكانات هائلة', 2],
  ['فرص هائلة', 2], ['تحديات متزايدة', 2], ['فرص متزايدة', 1.5],
  ['شامل ومتكامل', 2], ['فعال ومستدام', 2], ['متكامل وشامل', 2],
  ['لا شك ان', 2], ['لا ريب ان', 2], ['بلا شك', 1.5],
  ['مما لا شك فيه', 2.5], ['لا يخفي علي احد', 2.5],
  ['يسهم في', 1.5], ['يساهم في', 1.5], ['تسهم في', 1.5], ['تساهم في', 1.5],
  ['اسهم في', 1], ['ساهم في', 1], ['ساهمت في', 1], ['ساهمت في تشكيل', 2.5],
  ['يشير الي', 1], ['تشير الي', 1], ['اشار الي', 1], ['اشارت الي', 1],
  ['الامر الذي', 1.5], ['مما يسهم', 2], ['مما يساعد', 1.5],
  ['مما يتيح', 1.5], ['مما يوفر', 1.5], ['مما يجعل', 1], ['مما يعكس', 2],
  ['بدوره', 0.5], ['بدورها', 0.5],
  ['يعد من', 1], ['تعد من', 1], ['يعد واحدا', 1.5], ['تعد واحدا', 1.5],
  ['يعتبر من', 0.5], ['تعتبر من', 0.5],
  ['من اهم', 1], ['من ابرز', 1],
  ['يتيح فرصة', 1.5], ['يفتح الباب', 1], ['يفتح ابواب', 1.5],
  ['يوفر فرصة', 1], ['توفر فرصا', 1.5],
  ['سلاح ذو حدين', 2], ['خطوة ايجابية', 1.5], ['خطوة الي الامام', 1.5],
  ['في عالم اليوم', 1.5], ['اليوم الافتراضي', 0.5],
];

/* علامات بشرية: عامية مصرية + ضمير متكلم */
const HUMAN_COLLOQUIAL = [
  'عشان', 'علشان', 'بس', 'كده', 'ده', 'دي', 'مش', 'ازاي', 'ايه', 'اوي',
  'كتير', 'برضه', 'ماشي', 'يلا', 'طب', 'عايز', 'عاوز', 'مفيش', 'خلاص',
  'علي فكره', 'اهو', 'معلش', 'بص يا', 'زي ما',
];

const HUMAN_FIRST = [
  'انا', 'نحن', 'رايي', 'اعتقد', 'برايي', 'استخدمت', 'جمعت', 'حللت',
  'لاحظت انا', 'بنفسي', 'بص رايي',
];

/* بادئات جمل تُعد ملمح AI */
const OPENER_WORDS = [
  'كما', 'حيث', 'اذ', 'لقد', 'تعد', 'يعد', 'يعتبر', 'تعتبر',
  'علاوة', 'اضافة', 'بالاضافة', 'وفي', 'ومن', 'ولذلك', 'وبالتالي',
];

/* تعدادات */
const LIST_WORDS = ['اولا', 'ثانيا', 'ثالثا', 'رابعا', 'خامسا', 'اخيرا'];

/* ------------------------------------------------------------------ */
/* الإشارات الفردية                                                    */
/* ------------------------------------------------------------------ */

function densityScore(norm, dict, per100Words, words) {
  let hits = 0;
  const found = [];
  for (const [ph, wgt] of dict) {
    const c = countPhrase(norm, ph);
    if (c > 0) {
      hits += c * wgt;
      found.push({ phrase: ph, count: c, weight: wgt });
    }
  }
  const density = (hits / Math.max(words, 1)) * 100;
  const score = clamp01(density / Math.max(per100Words, 0.01));
  return { score: clamp01(score), found, hits };
}

/** انخفاض تقلب أطوال الجمل = ملمح آلي */
function burstinessScore(sentences) {
  const lens = sentences
    .map((s) => wordsOf(s).length)
    .filter((n) => n >= 3 && n <= 80);
  if (lens.length < 6) return { score: 0.3, cv: null, avg: mean(lens), enough: false };
  const mu = mean(lens);
  const cv = mu > 0 ? std(lens) / mu : 0;
  // البشر غالبًا CV ≥ 0.55 — الآلي غالبًا ≤ 0.4
  const score = clamp01((0.62 - cv) / 0.42);
  return { score, cv, avg: mu, enough: true };
}

/** يتم / يقوم ب — صيغ رسمية مكتبية */
function formalScore(norm, words) {
  let n = 0;
  for (const ph of ['يتم', 'تتم', 'يقوم ب', 'تقوم ب']) n += countPhrase(norm, ph);
  const per100 = (n / Math.max(words, 1)) * 100;
  return { score: clamp01(per100 / 2.2), count: n };
}

/** بادئات الجمل المتكررة */
function openerScore(sentences) {
  let wa = 0;
  let listed = 0;
  let total = 0;
  for (const s of sentences) {
    const w = wordsOf(s);
    if (w.length < 3) continue;
    total++;
    const first = w[0];
    if (first.startsWith('و') && first.length > 1) wa++;
    if (OPENER_WORDS.includes(first)) listed++;
  }
  if (total < 6) return { score: 0.3, waRatio: null, enough: false };
  const waRatio = wa / total;
  const listRatio = listed / total;
  const sWa = clamp01((waRatio - 0.38) / 0.32);
  const sList = clamp01((listRatio - 0.2) / 0.35);
  return { score: 0.6 * sWa + 0.4 * sList, waRatio, listRatio, enough: true };
}

/** انتظام علامات الترقيم: معدل الفواصل وتقلبها */
function punctScore(norm, sentences) {
  const counts = sentences.map((s) => (s.match(/،/g) || []).length);
  if (counts.length < 6) return { score: 0.3, mean: null, enough: false };
  const mu = mean(counts);
  const cv = mu > 0 ? std(counts) / mu : 1;
  const sMu = clamp01((mu - 0.35) / 1.15);
  const sCv = clamp01((0.85 - cv) / 0.45);
  return { score: sMu * sCv, mean: mu, enough: true };
}

/** التعدادات */
function listyScore(norm) {
  let n = 0;
  for (const w of LIST_WORDS) n += countPhrase(norm, w);
  n += (norm.match(new RegExp(`(?:^|[^${AR_CLASS}])\\d\\s*[-–]`, 'g')) || []).length;
  return { score: clamp01(n / 4), count: n };
}

/** ثبات إيقاع أطوال «النوافذ» (محاكاة إيقاع الكتابة المتصل) */
function rhythmScore(norm) {
  const words = wordsOf(norm);
  if (words.length < 160) return { score: 0.3, enough: false };
  const W = 22;
  const lensNorm = [];
  for (let i = 0; i + W <= words.length; i += W) {
    let cnt = 0;
    for (let j = i; j < i + W; j++) if (words[j].length <= 4) cnt++;
    lensNorm.push(cnt / W);
  }
  if (lensNorm.length < 6) return { score: 0.3, enough: false };
  const mu = mean(lensNorm);
  const spread = mu > 0 ? std(lensNorm) / mu : 0;
  const score = clamp01((0.5 - spread) / 0.38);
  return { score, spread, enough: true };
}

/* ------------------------------------------------------------------ */
/* التحليل الكامل                                                      */
/* ------------------------------------------------------------------ */

/**
 * analyzeAiText(text, {pageTexts}) → تقرير كامل
 * pageTexts: مصفوفة نصوص الصفحات (اختياري) لتحليل كل صفحة منفصلة
 */
export function analyzeAiText(text, opts = {}) {
  const raw = String(text || '');
  const norm = normalizeAr(raw);
  const words = wordsOf(norm);
  const wordCount = words.length;

  if (wordCount < 15) {
    return { ok: false, reason: 'short', wordCount };
  }

  const arChars = (norm.match(new RegExp(`[${AR_CLASS}]`, 'g')) || []).length;
  const latinChars = (norm.match(/[A-Za-z]/g) || []).length;
  if (latinChars > arChars) {
    return { ok: false, reason: 'not-arabic', wordCount };
  }

  const sentences = splitSentences(norm);

  /* --- الإشارات --- */
  const conn = densityScore(norm, CONNECTIVES, 3.2, wordCount);
  const stock = densityScore(norm, STOCK, 3.4, wordCount);
  const burst = burstinessScore(sentences);
  const formal = formalScore(norm, wordCount);
  const opener = openerScore(sentences);
  const punct = punctScore(norm, sentences);
  const listy = listyScore(norm);
  const rhythm = rhythmScore(norm);

  /* التنوين المتكرر (دورًا/هامًا) — ملمح ضعيف */
  const tanwinHits = (raw.match(/[\u064B\u064C\u064D]/g) || []).length;
  const tanwinScore = clamp01((tanwinHits / Math.max(wordCount, 1) * 100 - 0.35) / 1.5);

  /* --- مزج الإشارات --- */
  const signals = [
    { id: 'stock', label: 'عبارات قالبية جاهزة', desc: 'تلعب دورًا هامًا، تحول رقمي، العديد من…', score: stock.score, weight: 0.3, hits: stock.hits },
    { id: 'connectives', label: 'روابط خطابية مكتبية', desc: 'علاوة على ذلك، من الجدير بالذكر، في هذا السياق…', score: conn.score, weight: 0.18, hits: conn.hits },
    { id: 'burst', label: 'انتظام أطوال الجمل', desc: 'الآلي يكتب جملًا متساوية الطول تقريبًا', score: burst.score, weight: 0.14 },
    { id: 'formal', label: 'صيغ رسمية (يتم/يقوم ب)', desc: 'الأسلوب الإداري الجاف', score: formal.score, weight: 0.08, count: formal.count },
    { id: 'openers', label: 'تكرار بادئات الجمل', desc: 'و، كما، حيث، تعد… في أول كل جملة', score: opener.score, weight: 0.1 },
    { id: 'listy', label: 'تعدادات مرتبة', desc: 'أولًا/ثانيًا/ثالثًا وقوائم مرقمة', score: listy.score, weight: 0.06, count: listy.count },
    { id: 'punct', label: 'انتظام الترقيم', desc: 'فواصل بمعدل ثابت في كل جملة', score: punct.score, weight: 0.06 },
    { id: 'rhythm', label: 'ثبات إيقاع النص', desc: 'توزيع متساوٍ لأطوال المقاطع', score: rhythm.score, weight: 0.04 },
    { id: 'tanwin', label: 'كثافة التنوين الصحيح', desc: 'دورًا/هامًا مكتوبة كاملة في كل موضع', score: tanwinScore, weight: 0.04, count: tanwinHits },
  ];

  let aiRaw = 0;
  for (const s of signals) aiRaw += s.weight * s.score;

  /* مكافأة التوافق: ٣ إشارات قوية أو أكثر تتأكد معًا = بصمة آلية مؤكدة */
  const strong = signals.filter((s) => s.score >= 0.7).length;
  let bonus = strong >= 4 ? 0.12 : strong >= 3 ? 0.08 : 0;
  /* إيقاع آلي: جمل متساوية + بادئات متكررة معًا (حتى لو اتشالت القواميس) */
  if (burst.score >= 0.9 && opener.score >= 0.6) bonus = Math.max(bonus, 0.12);
  else if (burst.score >= 0.7 && opener.score >= 0.5) bonus = Math.max(bonus, 0.08);
  if (sentences.length >= 6) aiRaw += bonus;

  /* --- خصم العلامات البشرية --- */
  let colHits = 0;
  const humanMarks = [];
  for (const ph of HUMAN_COLLOQUIAL) {
    const c = countPhrase(norm, ph);
    if (c > 0) {
      colHits += Math.min(c, 4);
      humanMarks.push({ phrase: ph, count: c, kind: 'colloquial' });
    }
  }
  let fpHits = 0;
  for (const ph of HUMAN_FIRST) {
    const c = countPhrase(norm, ph);
    if (c > 0) {
      fpHits += Math.min(c, 4);
      humanMarks.push({ phrase: ph, count: c, kind: 'first-person' });
    }
  }
  const exclam = (raw.match(/!!|؟؟|\u2026\u2026/g) || []).length;

  const humanOffset = Math.min(
    0.42,
    colHits * 0.045 + fpHits * 0.035 + Math.min(exclam, 4) * 0.02
  );

  const finalPercent = Math.min(97, Math.max(3, Math.round(clamp01(aiRaw - humanOffset) * 100)));

  /* --- الحكم --- */
  let verdict;
  let tone;
  if (finalPercent < 25) { verdict = 'غالبًا كتابة بشرية'; tone = 'good'; }
  else if (finalPercent < 50) { verdict = 'ملامح بشرية مع خليط'; tone = 'ok'; }
  else if (finalPercent < 70) { verdict = 'خليط — الغالب عليه آلي'; tone = 'warn'; }
  else if (finalPercent < 85) { verdict = 'أغلبها مكتوب بالذكاء الاصطناعي'; tone = 'bad'; }
  else { verdict = 'شبه مؤكد أنه مكتوب بالذكاء الاصطناعي'; tone = 'bad'; }

  const confidence =
    wordCount < 80 ? 'منخفضة — النص قصير' : wordCount < 250 ? 'متوسطة' : 'جيدة';

  /* --- عبارات تم رصدها (الأعلى وزنًا) --- */
  const phrases = [...stock.found, ...conn.found]
    .sort((a, b) => b.count * b.weight - a.count * a.weight)
    .slice(0, 14);

  /* --- تحليل الصفحات --- */
  let pages = null;
  if (Array.isArray(opts.pageTexts) && opts.pageTexts.length > 1) {
    pages = opts.pageTexts.map((t, i) => {
      const r = pagePercent(t);
      return { page: i + 1, percent: r.percent, words: r.words };
    });
  }

  return {
    ok: true,
    percent: finalPercent,
    verdict,
    tone,
    confidence,
    stats: {
      words: wordCount,
      sentences: sentences.length,
      avgSentence: burst.avg ? Math.round(burst.avg * 10) / 10 : null,
      cv: burst.cv != null ? Math.round(burst.cv * 100) / 100 : null,
    },
    signals: signals.map((s) => ({
      ...s,
      score: Math.round(s.score * 100),
    })),
    phrases,
    humanMarks: humanMarks.sort((a, b) => b.count - a.count).slice(0, 10),
    pages,
    humanOffset: Math.round(humanOffset * 100),
  };
}

/** تحليل سريع لنسبة مئوية فقط (للصفحات) */
export function pagePercent(text) {
  const norm = normalizeAr(text);
  const words = wordsOf(norm);
  if (words.length < 15) return { percent: null, words: words.length };
  const r = analyzeAiText(text);
  if (!r.ok) return { percent: null, words: words.length };
  return { percent: r.percent, words: words.length };
}
