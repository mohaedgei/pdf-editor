'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  FileUp,
  FileText,
  FileDown,
  Loader2,
  Plus,
  MousePointer2,
  Type as TypeIcon,
  Undo2,
  RotateCcw,
  ZoomIn,
  Hand,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildLineBlocks, BASELINE_K, type GeoItem } from '@/lib/pdf-layout'

/* ================= الأنواع ================= */

interface TextBlock {
  id: string
  page: number
  x: number
  top: number
  w: number
  size: number
  baseline: number
  text: string
  color: string
  origin: 'pdf' | 'new'
  patchBox?: { x: number; y: number; w: number; h: number }
  dirty: boolean
  deleted: boolean
  rtl: boolean
}
interface PageData {
  num: number
  width: number
  height: number
  bg: string
  blocks: TextBlock[]
  initial: TextBlock[]
}
interface DocData {
  fileName: string
  pages: PageData[]
}

const AR_RE = /[\u0600-\u06FF]/
const AMIRI_STACK = "'AmiriLocal','Amiri','Traditional Arabic',serif"
const MAX_SIZE = 30 * 1024 * 1024

/* ================= أدوات ================= */

function cloneBlocks(bs: TextBlock[]): TextBlock[] {
  return bs.map((b) => ({ ...b, patchBox: b.patchBox ? { ...b.patchBox } : undefined }))
}

function sampleColor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pw: number,
  ph: number
): string {
  const sx = Math.max(0, Math.floor(x * 2))
  const sy = Math.max(0, Math.floor(y * 2))
  const sw = Math.min(Math.ceil(w * 2), Math.floor(pw * 2) - sx)
  const sh = Math.min(Math.ceil(h * 2), Math.floor(ph * 2) - sy)
  if (sw <= 2 || sh <= 2) return '#111111'
  let img: ImageData
  try {
    img = ctx.getImageData(sx, sy, sw, sh)
  } catch {
    return '#111111'
  }
  const counts = new Map<number, number>()
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3]
    if (a < 50) continue
    if (r > 205 && g > 205 && b > 205) continue
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  let bc = 0
  for (const [, c] of counts) bc = Math.max(bc, c)
  // من بين الألوان المتكررة بشكل معقول نختار الأغمق (لب الضرفة) لا الأكثر تكرارًا (حواف التنعيم)
  let best = -1
  let bestLum = Infinity
  for (const [k, c] of counts) {
    if (c < Math.max(4, bc * 0.12)) continue
    const r = ((k >> 8) & 15) * 16 + 8
    const g = ((k >> 4) & 15) * 16 + 8
    const b = (k & 15) * 16 + 8
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if (lum < bestLum) {
      bestLum = lum
      best = k
    }
  }
  if (best < 0 || bc < 8) return '#111111'
  const r = ((best >> 8) & 15) * 16 + 8
  const g = ((best >> 4) & 15) * 16 + 8
  const b = (best & 15) * 16 + 8
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

async function loadPdfIntoPages(
  file: File,
  onProgress: (s: string) => void
): Promise<DocData> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.mjs'
  const buf = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    standardFontDataUrl: 'pdfjs-std/',
    cMapUrl: 'pdfjs-cmaps/',
    cMapPacked: true,
    isEvalSupported: false,
  }).promise

  const pages: PageData[] = []
  for (let pn = 1; pn <= doc.numPages; pn++) {
    onProgress(`جاري تجهيز الصفحة ${pn} من ${doc.numPages}…`)
    const page = await doc.getPage(pn)
    const p1 = page.getViewport({ scale: 1 })
    const S = 794 / p1.width
    const vp = page.getViewport({ scale: S })
    // سقف لدقة الصورة: أطول ضلع 2600px — يمنع انفجار الذاكرة في الصفحات الضخمة
    const s2 = Math.min(S * 2, 2600 / Math.max(p1.width, p1.height))
    const c2 = page.getViewport({ scale: s2 })

    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(c2.width)
    canvas.height = Math.floor(c2.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport: c2, background: '#FFFFFF' }).promise
    // JPEG مضغوط بدل PNG: أصفار حجم الخلفية ~٦ أضعاف مع ثبات المظهر (الصفحات بيضاء)
    const bg = canvas.toDataURL('image/jpeg', 0.9)

    const tc = await page.getTextContent()
    const items: GeoItem[] = []
    for (const it of tc.items as unknown as Record<string, unknown>[]) {
      const str = it.str as string
      if (!str || !str.trim()) continue
      const tr = it.transform as number[]
      const tx = pdfjs.Util.transform(vp.transform, tr)
      const fh = Math.hypot(tx[2], tx[3])
      if (fh < 3) continue
      items.push({
        x: tx[4],
        y: tx[5],
        w: ((it.width as number) || 0) * S,
        h: fh,
        str,
      })
    }

    const width = Math.round(p1.width * S)
    const height = Math.round(p1.height * S)
    const lines = buildLineBlocks(items)
    const blocks: TextBlock[] = lines.map((l, i) => {
      const patchBox = {
        x: Math.max(0, l.x - 3),
        y: Math.max(0, l.baseline - l.size * 1.08),
        w: l.right - l.x + 6,
        h: l.size * 1.55,
      }
      if (patchBox.y + patchBox.h > height) patchBox.h = height - patchBox.y
      return {
        id: `p${pn}-${i}`,
        page: pn,
        x: l.x,
        top: l.baseline - l.size * BASELINE_K,
        w: l.right - l.x,
        size: l.size,
        baseline: l.baseline,
        text: l.text,
        color: sampleColor(ctx, l.x, l.baseline - l.size * 1.05, l.right - l.x, l.size * 1.5, width, height),
        origin: 'pdf' as const,
        patchBox,
        dirty: false,
        deleted: false,
        rtl: AR_RE.test(l.text),
      }
    })
    pages.push({ num: pn, width, height, bg, blocks, initial: cloneBlocks(blocks) })
    // تحرير ذاكرة الـ canvas بعد انتهاء عينات الألوان — بدل تراكمها حتى نهاية الملف
    canvas.width = 0
    canvas.height = 0
    // فسحة للواجهة تعرض رسالة التقدم — بدل تجميد الشاشة في الملفات الطويلة
    await new Promise((r) => setTimeout(r, 0))
  }

  return { fileName: file.name || 'document.pdf', pages }
}

/* ================= كتلة نص قابلة للسحب والتعديل ================= */

interface BlockViewProps {
  b: TextBlock
  z: number
  selected: boolean
  editing: boolean
  addMode: boolean
  onSelect: (id: string) => void
  onBeginEdit: (id: string) => void
  onEndEdit: (id: string, text: string) => void
  onMove: (id: string, x: number, top: number) => void
  onBeginMove: () => void
}

function BlockViewInner({
  b,
  z,
  selected,
  editing,
  addMode,
  onSelect,
  onBeginEdit,
  onEndEdit,
  onMove,
  onBeginMove,
}: BlockViewProps) {
  const elRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ cx: number; cy: number; ox: number; oy: number; moved: boolean } | null>(null)
  const raf = useRef<number>(0)
  const liveText = useRef(b.text)

  useEffect(() => {
    if (editing && elRef.current) {
      const el = elRef.current
      el.textContent = b.text
      liveText.current = b.text
      // فوكس بعد استقرار الأحداث — أي mousedown في نفس اللحظة ممكن يسرق الفوكس
      const t = setTimeout(() => {
        el.focus()
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }, 0)
      return () => clearTimeout(t)
    }
  }, [editing])

  const onPointerDown = (e: React.PointerEvent) => {
    if (editing || addMode) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { cx: e.clientX, cy: e.clientY, ox: b.x, oy: b.top, moved: false }
    onSelect(b.id)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || editing) return
    const dx = (e.clientX - d.cx) / z
    const dy = (e.clientY - d.cy) / z
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) {
      d.moved = true
      // لقطة التراجع قبل أول إزاحة فعلية — بدل ما كانت تُخزن بعد الحركة (فالتراجع مكانش بيغيّر حاجة)
      onBeginMove()
    }
    if (!d.moved) return
    // خنق بـ rAF: تحديث واحد لكل إطار رسم — بدل تحديث لكل حدث ماوس (كان بيتجمد)
    const ox = d.ox
    const oy = d.oy
    const id = b.id
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => onMove(id, ox + dx, oy + dy))
  }

  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    cancelAnimationFrame(raf.current)
  }

  return (
    <div
      ref={elRef}
      data-bid={b.id}
      className={cn('blk', selected && !editing && 'sel', editing && 'edit')}
      dir={b.rtl ? 'rtl' : 'ltr'}
      style={{
        left: b.x,
        top: b.top,
        width: b.w,
        fontSize: b.size,
        color: editing || b.dirty || b.origin === 'new' ? b.color : 'transparent',
        fontFamily: AMIRI_STACK,
        textAlign: b.rtl ? 'right' : 'left',
      }}
      contentEditable={editing}
      suppressContentEditableWarning
      spellCheck={false}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (!editing) onBeginEdit(b.id)
      }}
      onInput={(e) => {
        liveText.current = (e.currentTarget as HTMLElement).innerText
      }}
      onBlur={() => {
        if (editing) onEndEdit(b.id, liveText.current)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') (e.currentTarget as HTMLElement).blur()
        e.stopPropagation()
      }}
    >
      {!editing ? b.text : null}
    </div>
  )
}

/** memo: الكتلة لا تُعاد رسمها إلا إذا تغيّرت هي نفسها — السحب يتحرك بسلاسة مع مئات الكتل */
const BlockView = memo(BlockViewInner)

/* ================= صفحة بعرض تدريجي (lazy) ================= */

/** الصفحة لا تُحمّل صورتها وكتلها إلا لما تقرب من الشاشة — يمنع تجمد التاب في الملفات الطويلة */
function PageSurfaceInner({
  pg,
  zoom,
  selected,
  editingId,
  tool,
  onSelect,
  onBeginEdit,
  onEndEdit,
  onMove,
  onBeginMove,
  onReset,
  onAddAt,
  onTapEmpty,
}: {
  pg: PageData
  zoom: number
  selected: string | null
  editingId: string | null
  tool: 'select' | 'add'
  onSelect: (id: string) => void
  onBeginEdit: (id: string) => void
  onEndEdit: (id: string, text: string) => void
  onMove: (id: string, x: number, top: number) => void
  onBeginMove: () => void
  onReset: (pid: number) => void
  onAddAt: (pid: number, x: number, y: number) => void
  onTapEmpty: () => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || near) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: '1400px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [near])

  return (
    <div
      ref={wrapRef}
      style={{ width: pg.width * zoom, height: pg.height * zoom + 30 }}
      className="relative"
    >
      <div className="absolute -top-6 right-0 left-0 flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-zinc-500">صفحة {pg.num}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] text-zinc-500"
          onClick={() => onReset(pg.num)}
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          استعادة الصفحة
        </Button>
      </div>
      {near ? (
        <div
          className="page-surface absolute left-0 top-0 bg-white shadow-[0_2px_16px_rgba(0,0,0,.14)]"
          style={{ width: pg.width, height: pg.height, transform: `scale(${zoom})` }}
          onPointerDown={(e) => {
            if (tool === 'add') {
              // منع السلوك الافتراضي: mousedown التالي بيسرق فوكس الكتلة الجديدة ويقفل التحرير فورًا
              e.preventDefault()
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              onAddAt(pg.num, (e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom)
            } else {
              onTapEmpty()
            }
          }}
        >
          <img
            src={pg.bg}
            alt={`صفحة ${pg.num}`}
            draggable={false}
            decoding="async"
            className="pointer-events-none absolute inset-0 h-full w-full select-none"
          />
          {pg.blocks
            .filter((b) => b.origin === 'pdf' && (b.dirty || b.deleted) && b.patchBox)
            .map((b) => (
              <div
                key={`patch-${b.id}`}
                className="absolute bg-white"
                style={{
                  left: b.patchBox!.x,
                  top: b.patchBox!.y,
                  width: b.patchBox!.w,
                  height: b.patchBox!.h,
                }}
              />
            ))}
          {pg.blocks
            .filter((b) => !b.deleted)
            .map((b) => (
              <BlockView
                key={b.id}
                b={b}
                z={zoom}
                selected={selected === b.id}
                editing={editingId === b.id}
                addMode={tool === 'add'}
                onSelect={onSelect}
                onBeginEdit={onBeginEdit}
                onEndEdit={onEndEdit}
                onMove={onMove}
                onBeginMove={onBeginMove}
              />
            ))}
        </div>
      ) : (
        <div
          className="absolute left-0 top-0 animate-pulse rounded-sm border border-zinc-200 bg-zinc-50"
          style={{ width: pg.width * zoom, height: pg.height * zoom }}
        />
      )}
    </div>
  )
}

/** memo: الصفحة لا تُعاد رسمها إلا إذا تغيّرت بياناتها هي — السحب في صفحة لا يلمس الباقي */
const PageSurface = memo(PageSurfaceInner)

/* ================= الصفحة الرئيسية ================= */

export default function Home() {
  const [doc, setDoc] = useState<DocData | null>(null)
  const [busy, setBusy] = useState<null | 'prep' | 'render'>(null)
  const [prepMsg, setPrepMsg] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [tool, setTool] = useState<'select' | 'add'>('select')
  const [zoom, setZoom] = useState(1)
  const [selected, setSelected] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const zoomTouched = useRef(false)
  const undoRef = useRef<TextBlock[][][]>([])
  const docRef = useRef<DocData | null>(null)
  docRef.current = doc

  useEffect(() => {
    setZoom(Math.min(1, Math.max(0.4, (window.innerWidth - 48) / 794)))
    const onResize = () => {
      if (!zoomTouched.current) {
        setZoom(Math.min(1, Math.max(0.4, (window.innerWidth - 48) / 794)))
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /* ---- الحفظ: توليد PDF بالكامل داخل المتصفح ----
   * كل صفحة تُرسَم على canvas كما هي بالضبط (الصورة الأصلية + البقع البيضاء + النصوص المعدلة بخط أميري)
   * ثم تُضمّن كصفحة في PDF عبر pdf-lib — نفس محرك التشكيل اللي يعرض المحرر = WYSIWYG مضمون */
  const savePdf = useCallback(async () => {
    const d = docRef.current
    if (!d || busy) return
    setBusy('render')
    try {
      await document.fonts.ready
      const { PDFDocument } = await import('pdf-lib')
      const pdfDoc = await PDFDocument.create()
      pdfDoc.setTitle(d.fileName.replace(/\.pdf$/i, ''))
      const S2 = 2 // دقة الرسم: ضعف العرض (نفس دقة صور الصفحات)
      for (const pg of d.pages) {
        const c = document.createElement('canvas')
        c.width = pg.width * S2
        c.height = pg.height * S2
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, c.width, c.height)

        // 1) الصفحة الأصلية بصورها وشعاراتها — من غير أي تغيير
        const img = new Image()
        img.src = pg.bg
        await img.decode()
        ctx.drawImage(img, 0, 0, c.width, c.height)

        // 2) بقع بيضاء فوق مواضع الكلام المعدل/المحذوف/المسحوب
        ctx.fillStyle = '#ffffff'
        for (const b of pg.blocks) {
          if (b.origin === 'pdf' && (b.dirty || b.deleted) && b.patchBox) {
            ctx.fillRect(b.patchBox.x * S2, b.patchBox.y * S2, b.patchBox.w * S2, b.patchBox.h * S2)
          }
        }

        // 3) النصوص المعدلة والجديدة بخط أميري — نفس المحاذاة والبساط اللي في المحرر (line-height:1)
        ctx.textBaseline = 'alphabetic'
        for (const b of pg.blocks) {
          if (b.deleted) continue
          if (!(b.dirty || b.origin === 'new') || !b.text.trim()) continue
          ctx.font = `${b.size * S2}px ${AMIRI_STACK}`
          ctx.fillStyle = b.color
          ctx.direction = b.rtl ? 'rtl' : 'ltr'
          ctx.textAlign = b.rtl ? 'right' : 'left'
          let y = b.baseline * S2
          for (const ln of b.text.split('\n')) {
            ctx.fillText(ln, (b.rtl ? b.x + b.w : b.x) * S2, y)
            y += b.size * S2
          }
        }

        const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.92))
        c.width = 0
        c.height = 0
        if (!blob) throw new Error('page encode failed')
        const emb = await pdfDoc.embedJpg(new Uint8Array(await blob.arrayBuffer()))
        // 794px عند 96dpi = 595.5pt — نفس مقاس A4 اللي كان يطلعه السيرفر
        const page = pdfDoc.addPage([(pg.width * 72) / 96, (pg.height * 72) / 96])
        page.drawImage(emb, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() })
      }
      const out = await pdfDoc.save()
      const url = URL.createObjectURL(new Blob([out as BlobPart], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${d.fileName.replace(/\.pdf$/i, '') || 'document'}-معدل.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      toast.success('تم حفظ الـ PDF بنفس شكل الأصل ومعاه تعديلاتك')
    } catch (err) {
      console.error(err)
      toast.error('حدث خطأ أثناء الحفظ — حاول مرة أخرى')
    } finally {
      setBusy(null)
    }
  }, [busy])

  const pushUndo = useCallback(() => {
    const d = docRef.current
    if (!d) return
    undoRef.current.push(d.pages.map((p) => cloneBlocks(p.blocks)))
    if (undoRef.current.length > 30) undoRef.current.shift()
  }, [])

  const undo = useCallback(() => {
    const snap = undoRef.current.pop()
    if (!snap) {
      toast.info('مفيش حاجة للتراجع عنها')
      return
    }
    setDoc((d) =>
      d
        ? {
            ...d,
            pages: d.pages.map((p, i) => ({ ...p, blocks: cloneBlocks(snap[i] || []) })),
          }
        : d
    )
    setSelected(null)
    setEditingId(null)
  }, [])

  const handleFile = useCallback(async (file: File) => {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    if (!isPdf) {
      toast.error('من فضلك اختر ملف PDF')
      return
    }
    if (file.size > MAX_SIZE) {
      toast.error('حجم الملف أكبر من 30 ميجابايت')
      return
    }
    setBusy('prep')
    setPrepMsg('جاري فتح الملف…')
    undoRef.current = []
    setSelected(null)
    setEditingId(null)
    try {
      const loaded = await loadPdfIntoPages(file, setPrepMsg)
      setDoc(loaded)
      toast.success(`تم تجهيز ${loaded.pages.length} صفحة — دوس على أي كلام لتعديله`)
    } catch (err) {
      console.error(err)
      toast.error('تعذّر قراءة الملف — تأكد أنه PDF غير تالف وغير محمي بكلمة سر')
    } finally {
      setBusy(null)
    }
  }, [])

  const loadSample = useCallback(async () => {
    setBusy('prep')
    setPrepMsg('جاري تحميل الملف النموذجي…')
    try {
      const res = await fetch('sample.pdf')
      const blob = await res.blob()
      await handleFile(new File([blob], 'بحث خصائص لغة الإعلام.pdf', { type: 'application/pdf' }))
    } catch {
      toast.error('تعذّر تحميل الملف النموذجي')
      setBusy(null)
    }
  }, [handleFile])

  /* ---- تعديلات الكتل ---- */

  const mutateBlocks = useCallback(
    (pid: number, fn: (bs: TextBlock[]) => TextBlock[]) => {
      setDoc((d) =>
        d
          ? {
              ...d,
              pages: d.pages.map((p) => (p.num === pid ? { ...p, blocks: fn(p.blocks) } : p)),
            }
          : d
      )
    },
    []
  )

  const onMove = useCallback(
    (id: string, x: number, top: number) => {
      const d = docRef.current
      if (!d) return
      const pg = d.pages.find((p) => p.blocks.some((b) => b.id === id))
      if (!pg) return
      mutateBlocks(pg.num, (bs) =>
        bs.map((b) =>
          b.id === id
            ? { ...b, x: Math.round(x), top: Math.round(top), baseline: Math.round(top + b.size * BASELINE_K), dirty: true }
            : b
        )
      )
    },
    [mutateBlocks]
  )

  const onBeginMove = useCallback(() => pushUndo(), [pushUndo])

  const onBeginEdit = useCallback((id: string) => {
    setEditingId(id)
    setSelected(id)
  }, [])

  const onEndEdit = useCallback(
    (id: string, text: string) => {
      setEditingId(null)
      const d = docRef.current
      if (!d) return
      const pg = d.pages.find((p) => p.blocks.some((b) => b.id === id))
      if (!pg) return
      const cur = pg.blocks.find((b) => b.id === id)
      if (!cur) return
      const clean = text.replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n')
      if (clean === cur.text) return
      pushUndo()
      if (clean.trim() === '' && cur.origin === 'new') {
        mutateBlocks(pg.num, (bs) => bs.filter((b) => b.id !== id))
        setSelected(null)
        return
      }
      mutateBlocks(pg.num, (bs) =>
        bs.map((b) =>
          b.id === id
            ? {
                ...b,
                text: clean,
                dirty: true,
                deleted: clean.trim() === '',
                rtl: AR_RE.test(clean),
              }
            : b
        )
      )
    },
    [mutateBlocks, pushUndo]
  )

  const deleteSelected = useCallback(() => {
    const d = docRef.current
    if (!d || !selected || editingId) return
    const pg = d.pages.find((p) => p.blocks.some((b) => b.id === selected))
    if (!pg) return
    pushUndo()
    mutateBlocks(pg.num, (bs) => {
      const b = bs.find((x) => x.id === selected)
      if (!b) return bs
      if (b.origin === 'new') return bs.filter((x) => x.id !== selected)
      return bs.map((x) => (x.id === selected ? { ...x, deleted: true, dirty: true } : x))
    })
    setSelected(null)
  }, [selected, editingId, mutateBlocks, pushUndo])

  const applyColor = useCallback(
    (color: string) => {
      const d = docRef.current
      if (!d || !selected) return
      const pg = d.pages.find((p) => p.blocks.some((b) => b.id === selected))
      if (!pg) return
      mutateBlocks(pg.num, (bs) =>
        bs.map((b) => (b.id === selected ? { ...b, color, dirty: true } : b))
      )
    },
    [selected, mutateBlocks]
  )

  const resetPage = useCallback(
    (pid: number) => {
      const d = docRef.current
      if (!d) return
      const pg = d.pages.find((p) => p.num === pid)
      if (!pg) return
      pushUndo()
      mutateBlocks(pid, () => cloneBlocks(pg.initial))
      setSelected(null)
      setEditingId(null)
      toast.success('تمت استعادة الصفحة كما كانت')
    },
    [mutateBlocks, pushUndo]
  )

  /* ---- اختصارات ---- */
  const saveRef = useRef<() => void>(() => {})
  saveRef.current = () => {
    void savePdf()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const editingNow = !!editingId
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveRef.current()
        return
      }
      if (editingNow || (tag === 'INPUT' || tag === 'TEXTAREA')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected) {
          e.preventDefault()
          deleteSelected()
        }
      } else if (e.key === 'Escape') {
        setSelected(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingId, selected, undo, deleteSelected])

  /* ---- إضافة نص جديد ---- */
  const addTextAt = useCallback(
    (pid: number, px: number, py: number) => {
      const d = docRef.current
      if (!d) return
      const pg = d.pages.find((p) => p.num === pid)
      if (!pg) return
      const size = pg.blocks.length
        ? [...pg.blocks].sort((a, b) => a.size - b.size)[Math.floor(pg.blocks.length / 2)].size
        : 19
      const id = `p${pid}-new-${Date.now()}`
      pushUndo()
      const blk: TextBlock = {
        id,
        page: pid,
        x: Math.round(px),
        top: Math.round(py - size * BASELINE_K),
        w: Math.max(120, Math.round(size * 8)),
        size,
        baseline: Math.round(py),
        text: '',
        color: '#111111',
        origin: 'new',
        dirty: true,
        deleted: false,
        rtl: true,
      }
      mutateBlocks(pid, (bs) => [...bs, blk])
      setTool('select')
      setSelected(id)
      setEditingId(id)
    },
    [mutateBlocks, pushUndo]
  )

  const tapEmpty = useCallback(() => setSelected(null), [])

  const dirtyCount = doc
    ? doc.pages.reduce((n, p) => n + p.blocks.filter((b) => b.dirty || b.deleted || b.origin === 'new').length, 0)
    : 0

  /* ================= الواجهة ================= */

  return (
    <div className="flex min-h-screen flex-col bg-zinc-100">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-bold">محرّر البحث</div>
              <div className="hidden text-[11px] text-zinc-500 sm:block">
                تعديل PDF فوق الأصل نفسه — بالصور والشعارات
              </div>
            </div>
          </div>
          {doc && (
            <div className="flex items-center gap-2">
              <span className="hidden max-w-[220px] truncate text-xs text-zinc-500 md:block">
                {doc.fileName}
              </span>
              {dirtyCount > 0 && (
                <Badge variant="secondary" className="hidden bg-emerald-100 text-emerald-700 sm:inline-flex">
                  {dirtyCount} تعديل
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDoc(null)
                  setSelected(null)
                  setEditingId(null)
                  undoRef.current = []
                  if (inputRef.current) inputRef.current.value = ''
                }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                ملف جديد
              </Button>
              <Button size="sm" onClick={() => void savePdf()} disabled={busy !== null}>
                {busy === 'render' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                )}
                {busy === 'render' ? 'جاري الحفظ…' : 'حفظ PDF'}
              </Button>
            </div>
          )}
        </div>
      </header>

      {!doc ? (
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
          <div className="mb-8 text-center">
            <h1 className="mb-3 text-2xl font-extrabold leading-snug text-zinc-900 sm:text-3xl">
              عدّل أي ملف PDF فوق الأصل نفسه… واحفظه كما هو
            </h1>
            <p className="mx-auto max-w-xl text-[15px] leading-7 text-zinc-600">
              الموقع يعرض كل صفحة بصورها وشعاراتها وكل تفاصيلها، ودوس على أي كلمة تعدّلها،
              واسحب أي مربع كلام وحرّكه في أي مكان، ولما تحفظ كل حاجة تفضل في مكانها.
            </p>
            <div className="mt-5 flex justify-center">
              <a
                href="ai-detector/"
                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition-colors hover:border-emerald-400 hover:text-emerald-700"
              >
                <Sparkles className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                فاحص الذكاء الاصطناعي — اكتشف نسبة AI في أي بحث
              </a>
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            aria-label="رفع ملف PDF"
            onClick={() => busy === null && inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files?.[0]
              if (f && busy === null) void handleFile(f)
            }}
            className={cn(
              'cursor-pointer rounded-2xl border-2 border-dashed bg-white p-10 text-center transition-colors sm:p-14',
              dragOver ? 'border-emerald-500 bg-emerald-50' : 'border-zinc-300 hover:border-emerald-400'
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
              }}
            />
            {busy === 'prep' ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="h-10 w-10 animate-spin text-emerald-600" aria-hidden="true" />
                <p className="text-sm font-medium text-zinc-600">{prepMsg}</p>
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
                  ملفات نصية (غير ممسوحة ضوئيًا) — حتى 30 ميجابايت
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button type="button">اختيار ملف</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation()
                      void loadSample()
                    }}
                  >
                    <Hand className="h-4 w-4" aria-hidden="true" />
                    تجربة بملف نموذجي
                  </Button>
                </div>
              </>
            )}
          </div>
        </main>
      ) : (
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">
          {/* شريط الأدوات */}
          <div className="mb-4 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm">
            <Button
              variant={tool === 'select' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTool('select')}
            >
              <MousePointer2 className="h-4 w-4" aria-hidden="true" />
              تحرير وسحب
            </Button>
            <Button
              variant={tool === 'add' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTool(tool === 'add' ? 'select' : 'add')}
            >
              <TypeIcon className="h-4 w-4" aria-hidden="true" />
              إضافة نص
            </Button>
            <Button variant="outline" size="sm" onClick={undo}>
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              تراجع
            </Button>
            <label className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-600">
              اللون
              <input
                type="color"
                aria-label="لون النص المحدد"
                defaultValue="#111111"
                className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                onChange={(e) => applyColor(e.target.value)}
                disabled={!selected || !!editingId}
              />
            </label>
            <label className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-600">
              <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
              <select
                aria-label="التكبير"
                value={zoom}
                onChange={(e) => {
                  zoomTouched.current = true
                  setZoom(Number(e.target.value))
                }}
                className="bg-transparent text-xs outline-none"
              >
                <option value={0.45}>45%</option>
                <option value={0.65}>65%</option>
                <option value={0.8}>80%</option>
                <option value={1}>100%</option>
                <option value={1.3}>130%</option>
              </select>
            </label>
            <span className="hidden px-2 text-[11px] leading-4 text-zinc-400 lg:block">
              دوس دوبل كليك على الكلام لتعديله — واسحبه لتحريكه — Delete للحذف
            </span>
          </div>

          {/* الصفحات — تُحمّل تدريجيًا مع التمرير */}
          <div className="flex flex-col items-center gap-8">
            {doc.pages.map((pg) => (
              <PageSurface
                key={pg.num}
                pg={pg}
                zoom={zoom}
                selected={selected}
                editingId={editingId}
                tool={tool}
                onSelect={setSelected}
                onBeginEdit={onBeginEdit}
                onEndEdit={onEndEdit}
                onMove={onMove}
                onBeginMove={onBeginMove}
                onReset={resetPage}
                onAddAt={addTextAt}
                onTapEmpty={tapEmpty}
              />
            ))}
          </div>
        </main>
      )}

      <footer className="mt-auto border-t border-zinc-200 bg-white py-4">
        <p className="px-4 text-center text-xs leading-5 text-zinc-500">
          المعالجة تتم مباشرة في متصفحك — الملف لا يُخزَّن على الموقع — التصدير يحافظ على صور
          ورسومات كل صفحة كما هي مع تعديلاتك
        </p>
      </footer>
    </div>
  )
}
