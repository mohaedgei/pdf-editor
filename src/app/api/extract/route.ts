import { NextRequest, NextResponse } from "next/server";
import { extractPdf } from "@/lib/pdf-extract";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_SIZE = 30 * 1024 * 1024; // 30MB

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "لم يتم إرسال أي ملف" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "حجم الملف أكبر من 30 ميجابايت" },
        { status: 413 }
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return NextResponse.json(
        { error: "الملف ليس بصيغة PDF سليمة" },
        { status: 400 }
      );
    }

    const result = await extractPdf(buf, file.name || "document.pdf");

    if (result.totalWords < 5) {
      return NextResponse.json(
        {
          error:
            "لم نجد نصًا قابلًا للتعديل داخل الملف — غالبًا هو ملف صور ممسوحة ضوئيًا. جرّب ملفًا نصيًا (مثل ملفات Word أو PDF المولّدة إلكترونيًا).",
        },
        { status: 422 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[extract] failed:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء قراءة الملف — تأكد أنه ملف PDF غير تالف" },
      { status: 500 }
    );
  }
}
