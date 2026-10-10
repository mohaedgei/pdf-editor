import type { NextConfig } from "next";

/* وضع STATIC_EXPORT=1: بناء ثابت لاستضافة GitHub Pages
   (الموقع كله يعمل في المتصفح — لا يحتاج سيرفر أو API) */
const isStatic = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isStatic
    ? {
        output: "export" as const,
        basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
        images: { unoptimized: true },
      }
    : { output: "standalone" as const }),
  serverExternalPackages: ["pdfjs-dist"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
