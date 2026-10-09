import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 180;

interface TextIn {
  x: number;
  top: number;
  w: number;
  size: number;
  color: string;
  text: string;
  rtl: boolean;
}
interface PatchIn {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface PageIn {
  width: number;
  height: number;
  bg: string;
  patches: PatchIn[];
  texts: TextIn[];
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML المُصدَّر: صورة الصفحة الأصلية + بقع بيضاء فوق الكلام المعدّل + النصوص الجديدة في مواضعها */
function buildHtml(fileName: string, pages: PageIn[]): string {
  const W = Math.round(pages[0].width);
  const H = Math.round(pages[0].height);

  const sections = pages
    .map((p, idx) => {
      const patches = p.patches
        .map(
          (t) =>
            `<div class="pt" style="left:${t.x.toFixed(1)}px;top:${t.y.toFixed(1)}px;width:${t.w.toFixed(1)}px;height:${t.h.toFixed(1)}px"></div>`
        )
        .join("\n      ");
      const texts = p.texts
        .map((t) => {
          const dir = t.rtl ? "rtl" : "ltr";
          const align = t.rtl ? "right" : "left";
          return `<div class="tx" style="left:${t.x.toFixed(1)}px;top:${t.top.toFixed(1)}px;width:${t.w.toFixed(1)}px;font-size:${t.size.toFixed(2)}px;color:${esc(t.color)};direction:${dir};text-align:${align}">${esc(t.text)}</div>`;
        })
        .join("\n      ");
      return `  <section class="pg${idx === 0 ? " first" : ""}" style="width:${W}px;height:${H}px">
      <img class="bg" src="${p.bg}">
      ${patches}
      ${texts}
  </section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${esc(fileName)}</title>
<style>
  @page { size: ${W}px ${H}px; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { background: #fff; }
  .pg {
    position: relative;
    overflow: hidden;
    page-break-before: always;
  }
  .pg.first { page-break-before: auto; }
  .bg {
    position: absolute;
    left: 0; top: 0;
    width: ${W}px; height: ${H}px;
  }
  .pt { position: absolute; background: #fff; }
  .tx {
    position: absolute;
    font-family: 'Amiri', 'Traditional Arabic', serif;
    line-height: 1;
    white-space: pre;
    margin: 0;
    padding: 0;
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
    if (
      !body.pages ||
      !Array.isArray(body.pages) ||
      body.pages.length === 0 ||
      !body.pages.every((p) => typeof p.bg === "string" && p.bg.startsWith("data:image/"))
    ) {
      return NextResponse.json({ error: "بيانات الصفحات غير مكتملة" }, { status: 400 });
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
    return NextResponse.json({ error: "تعذّر توليد ملف PDF — حاول مرة أخرى" }, { status: 500 });
  } finally {
    if (tmpDir) {
      fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
