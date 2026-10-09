import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 180;

interface PageIn {
  page: number;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** بناء HTML نظيف A4 من نص الصفحات المعدّل */
function buildHtml(fileName: string, pages: PageIn[]): string {
  const sections = pages
    .map((p, idx) => {
      const blocks = p.text
        .split(/\n{2,}|\n/)
        .map((t) => t.trim())
        .filter(Boolean);
      const content = blocks
        .map((b) => {
          if (b.length <= 60 && (b.length < 25 || /[:：]$/.test(b))) {
            return `<h3>${escapeHtml(b)}</h3>`;
          }
          return `<p>${escapeHtml(b)}</p>`;
        })
        .join("\n      ");
      return `  <section class="pg${idx === 0 ? " first" : ""}">
    ${content || "<p>&nbsp;</p>"}
  </section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(fileName)}</title>
<style>
  @page { size: 794px 1123px; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Amiri', 'Traditional Arabic', serif;
    direction: rtl;
    color: #111;
    background: #fff;
  }
  .pg {
    width: 794px;
    padding: 62px 88px 52px;
    page-break-before: always;
  }
  .pg.first { page-break-before: auto; }
  p {
    font-size: 19px;
    line-height: 1.75;
    margin: 0 0 10px;
    text-align: justify;
  }
  h3 {
    font-size: 19.5px;
    font-weight: 700;
    margin: 12px 0 6px;
    text-align: right;
  }
</style>
</head>
<body>
${sections}
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  let tmpDir: string | null = null;
  try {
    const body = (await req.json()) as { fileName?: string; pages?: PageIn[] };
    if (!body.pages || !Array.isArray(body.pages) || body.pages.length === 0) {
      return NextResponse.json({ error: "لا توجد نصوص للتصدير" }, { status: 400 });
    }
    const fileName = (body.fileName || "document.pdf").replace(/\.pdf$/i, "");
    const outName = `${fileName}-معدل.pdf`;

    tmpDir = path.join(process.cwd(), ".tmp-render", randomUUID());
    await fs.mkdir(tmpDir, { recursive: true });
    const htmlPath = path.join(tmpDir, "input.html");
    const pdfPath = path.join(tmpDir, "output.pdf");

    await fs.writeFile(htmlPath, buildHtml(outName, body.pages), "utf-8");

    const renderer = path.join(process.cwd(), "skills", "pdf", "scripts", "html2pdf-next.js");
    await fs.access(renderer);

    await new Promise<void>((resolve, reject) => {
      execFile(
        "node",
        [renderer, htmlPath, "--nopaged", "--output", pdfPath, "--title", outName],
        { timeout: 150_000, maxBuffer: 20 * 1024 * 1024, cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(new Error(`renderer: ${err.message} ${stderr?.slice(-800) || ""}`));
          else resolve();
        }
      );
    });

    const pdf = await fs.readFile(pdfPath);
    if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new Error("renderer produced invalid PDF");
    }

    const safeName = encodeURIComponent(outName);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="edited.pdf"; filename*=UTF-8''${safeName}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[render] failed:", err);
    return NextResponse.json(
      { error: "تعذّر توليد ملف PDF — حاول مرة أخرى" },
      { status: 500 }
    );
  } finally {
    if (tmpDir) {
      fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
