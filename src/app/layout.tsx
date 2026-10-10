import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

/* خط أميري بأوجهه الأربعة — inline عشان يعمل مع basePath في GitHub Pages */
const AMIRI_FACES = `
@font-face{font-family:'AmiriLocal';src:url('${BASE}/fonts/amiri-arabic-400-normal.ttf') format('truetype');font-weight:400;font-style:normal;font-display:swap;unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:'AmiriLocal';src:url('${BASE}/fonts/amiri-arabic-700-normal.ttf') format('truetype');font-weight:700;font-style:normal;font-display:swap;unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:'AmiriLocal';src:url('${BASE}/fonts/amiri-latin-400-normal.ttf') format('truetype');font-weight:400;font-style:normal;font-display:swap;unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:'AmiriLocal';src:url('${BASE}/fonts/amiri-latin-700-normal.ttf') format('truetype');font-weight:700;font-style:normal;font-display:swap;unicode-range:U+0000-00FF,U+2000-206F}
`;

export const metadata: Metadata = {
  title: "محرّر البحث — عدّل ملفات PDF واحفظها",
  description:
    "ارفع ملف PDF، عدّل كلماته بنفسك، ثم حمّل نسخة جديدة منه. مناسب للبحوث والملفات العربية.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <style dangerouslySetInnerHTML={{ __html: AMIRI_FACES }} />
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
