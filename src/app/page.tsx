'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  FileUp,
  FileText,
  PenLine,
  FileDown,
  RotateCcw,
  Loader2,
  Eye,
  PencilLine,
  Plus,
  ScrollText,
  ScanText,
  Save,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageData {
  page: number
  original: string
  text: string
}
interface DocData {
  fileName: string
  numPages: number
  pages: PageData[]
}

const MAX_SIZE = 30 * 1024 * 1024

function words(t: string): number {
  const s = t.trim()
  return s ? s.split(/\s+/).length : 0
}

export default function Home() {
  const [doc, setDoc] = useState<DocData | null>(null)
  const [busy, setBusy] = useState<null | 'extract' | 'render'>(null)
  const [dragOver, setDragOver] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const inputRef = useRef<HTMLInputElement>(null)
  const saveRef = useRef<() => void>(() => {})

  const revokePreview = useCallback(() => {
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
  }, [])

  useEffect(() => () => revokePreview(), [revokePreview])

  const handleFile = useCallback(
    async (file: File) => {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
      if (!isPdf) {
        toast.error('من فضلك اختر ملف PDF')
        return
      }
      if (file.size > MAX_SIZE) {
        toast.error('حجم الملف أكبر من 30 ميجابايت')
        return
      }
      setBusy('extract')
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/extract', { method: 'POST', body: fd })
        const data = await res.json().catch(() => null)
        if (!res.ok || !data || data.error) {
          toast.error(data?.error || 'تعذّر قراءة الملف')
          return
        }
        revokePreview()
        setDoc({
          fileName: data.fileName || file.name,
          numPages: data.numPages,
          pages: (data.pages as { page: number; text: string }[]).map((p) => ({
            page: p.page,
            original: p.text,
            text: p.text,
          })),
        })
        setPreviewUrl(URL.createObjectURL(file))
        setTab('edit')
        toast.success(`تم قراءة الملف: ${data.numPages} صفحة`)
      } catch {
        toast.error('حدث خطأ في الشبكة — حاول مرة أخرى')
      } finally {
        setBusy(null)
      }
    },
    [revokePreview]
  )

  const loadSample = useCallback(async () => {
    setBusy('extract')
    try {
      const res = await fetch('/sample.pdf')
      const blob = await res.blob()
      await handleFile(new File([blob], 'بحث خصائص لغة الإعلام.pdf', { type: 'application/pdf' }))
    } catch {
      toast.error('تعذّر تحميل الملف النموذجي')
      setBusy(null)
    }
  }, [handleFile])

  const savePdf = useCallback(async () => {
    if (!doc || busy) return
    setBusy('render')
    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: doc.fileName,
          pages: doc.pages.map((p) => ({ page: p.page, text: p.text })),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || 'تعذّر توليد ملف PDF')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${doc.fileName.replace(/\.pdf$/i, '')}-معدل.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      toast.success('تم تجهيز ملف PDF المعدّل وبدأ التحميل')
    } catch {
      toast.error('حدث خطأ أثناء الحفظ — حاول مرة أخرى')
    } finally {
      setBusy(null)
    }
  }, [doc, busy])

  saveRef.current = () => {
    void savePdf()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (doc && !busy) saveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc, busy])

  const updatePage = (i: number, text: string) =>
    setDoc((d) =>
      d ? { ...d, pages: d.pages.map((p, idx) => (idx === i ? { ...p, text } : p)) } : d
    )

  const resetPage = (i: number) =>
    setDoc((d) =>
      d
        ? {
            ...d,
            pages: d.pages.map((p, idx) => (idx === i ? { ...p, text: p.original } : p)),
          }
        : d
    )

  const resetAll = () =>
    setDoc((d) => (d ? { ...d, pages: d.pages.map((p) => ({ ...p, text: p.original })) } : d))

  const newFile = () => {
    revokePreview()
    setDoc(null)
    setTab('edit')
    if (inputRef.current) inputRef.current.value = ''
  }

  const dirtyCount = doc ? doc.pages.filter((p) => p.text !== p.original).length : 0

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      {/* ===== الهيدر ===== */}
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-bold">محرّر البحث</div>
              <div className="hidden text-[11px] text-zinc-500 sm:block">
                عدّل كلمات ملف PDF واحفظه بعد التعديل
              </div>
            </div>
          </div>
          {doc && (
            <div className="flex items-center gap-2">
              <span className="hidden max-w-[240px] truncate text-xs text-zinc-500 md:block">
                {doc.fileName}
              </span>
              <Button variant="outline" size="sm" onClick={newFile}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                ملف جديد
              </Button>
              <Button size="sm" onClick={() => void savePdf()} disabled={busy !== null}>
                {busy === 'render' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                )}
                {busy === 'render' ? 'جاري التجهيز…' : 'حفظ وتحميل PDF'}
              </Button>
            </div>
          )}
        </div>
      </header>

      {!doc ? (
        /* ===== شاشة الرفع ===== */
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
          <div className="mb-8 text-center">
            <h1 className="mb-3 text-2xl font-extrabold leading-snug text-zinc-900 sm:text-3xl">
              عدّل كلمات أي ملف PDF… واحفظه بعد التعديل
            </h1>
            <p className="mx-auto max-w-xl text-[15px] leading-7 text-zinc-600">
              ارفع ملف PDF، سيستخرج النص العربي تلقائيًا صفحة بصفحة، عدّل ما تريد بنفسك، ثم
              حمّل نسخة جديدة جاهزة من الملف.
            </p>
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
              dragOver
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-zinc-300 hover:border-emerald-400'
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
            {busy === 'extract' ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="h-10 w-10 animate-spin text-emerald-600" aria-hidden="true" />
                <p className="text-sm font-medium text-zinc-600">جاري قراءة الملف واستخراج النص…</p>
              </div>
            ) : (
              <>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
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
                    <ScrollText className="h-4 w-4" aria-hidden="true" />
                    تجربة بملف نموذجي
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: ScanText,
                title: 'استخراج عربي دقيق',
                desc: 'يقرأ نص كل صفحة ويحافظ على ترتيب الفقرات والكلمات',
              },
              {
                icon: PenLine,
                title: 'تحرير حر',
                desc: 'عدّل أي كلمة بخط أميري الواضح ومعك معاينة للأصل',
              },
              {
                icon: Save,
                title: 'حفظ PDF جديد',
                desc: 'صدّر نسخة A4 نظيفة جاهزة للطباعة أو الإرسال',
              },
            ].map((f) => (
              <Card key={f.title} className="border-zinc-200 bg-white">
                <CardContent className="flex flex-col items-center gap-2 p-5 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
                    <f.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="text-sm font-bold">{f.title}</div>
                  <p className="text-xs leading-5 text-zinc-500">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      ) : (
        /* ===== شاشة التحرير ===== */
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          {/* تبويبات الموبايل */}
          <div className="mb-4 flex gap-2 lg:hidden">
            <Button
              variant={tab === 'edit' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setTab('edit')}
            >
              <PencilLine className="h-4 w-4" aria-hidden="true" />
              التحرير
            </Button>
            <Button
              variant={tab === 'preview' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setTab('preview')}
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              معاينة الأصل
            </Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_460px] xl:grid-cols-[minmax(0,1fr)_540px]">
            <section className={cn('space-y-4', tab !== 'edit' && 'hidden lg:block')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-zinc-600">
                  <ScrollText className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {doc.numPages} صفحة — عدّل النص مباشرة (Ctrl+S للحفظ)
                  </span>
                  {dirtyCount > 0 && (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                      {dirtyCount} {dirtyCount === 1 ? 'صفحة معدلة' : 'صفحات معدلة'}
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetAll}
                  disabled={dirtyCount === 0}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  استعادة الأصل
                </Button>
              </div>

              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 border border-amber-200">
                ملحوظة: نسخة التصدير تخرج بنصّك المعدّل في تصميم A4 نظيف بخط أميري — شعار
                وغلاف الملف الأصلي غير مشمولين.
              </p>

              {doc.pages.map((p, i) => (
                <Card key={p.page} className="overflow-hidden border-zinc-200">
                  <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                      صفحة {p.page}
                      {p.text !== p.original && (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                        >
                          معدلة
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-zinc-500">
                      <span>{words(p.text)} كلمة</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="استعادة نص هذه الصفحة كما كان"
                        aria-label="استعادة نص الصفحة الأصلي"
                        onClick={() => resetPage(i)}
                        disabled={p.text === p.original}
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <CardContent className="p-0">
                    <Textarea
                      dir="rtl"
                      aria-label={`نص الصفحة ${p.page}`}
                      className="font-amiri min-h-[230px] rounded-none border-0 bg-white text-[18px] leading-[1.9] focus-visible:ring-0 focus-visible:ring-offset-0"
                      value={p.text}
                      onChange={(e) => updatePage(i, e.target.value)}
                    />
                  </CardContent>
                </Card>
              ))}
            </section>

            <aside className={cn(tab !== 'preview' && 'hidden lg:block')}>
              <div className="sticky top-20">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-semibold text-zinc-800">
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    الأصل قبل التعديل
                  </span>
                  <span className="max-w-[180px] truncate text-xs text-zinc-400">
                    {doc.fileName}
                  </span>
                </div>
                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                  {previewUrl && (
                    <iframe
                      title="معاينة الملف الأصلي"
                      src={previewUrl}
                      className="h-[calc(100vh-11rem)] w-full"
                    />
                  )}
                </div>
              </div>
            </aside>
          </div>
        </main>
      )}

      <footer className="mt-auto border-t border-zinc-200 bg-white py-4">
        <p className="px-4 text-center text-xs leading-5 text-zinc-500">
          تتم معالجة الملف مؤقتًا عند الرفع فقط ولا يُحفظ على الموقع — جميع الخطوات تعمل داخل
          هذا المتصفح والخادم المباشر.
        </p>
      </footer>
    </div>
  )
}
