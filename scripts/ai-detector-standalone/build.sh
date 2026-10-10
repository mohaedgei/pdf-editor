#!/bin/bash
# تجميع نسخة "فاحص الذكاء الاصطناعي" المستقلة لرفعها على repo الـ AI
# الاستخدام: bash scripts/ai-detector-standalone/build.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

DIST="scripts/ai-detector-standalone/dist"
rm -rf "$DIST"
mkdir -p "$DIST"

# 1) الواجهة والملاحظات
cp scripts/ai-detector-standalone/site/index.html "$DIST/"
cp scripts/ai-detector-standalone/site/README.md "$DIST/"

# 2) المحرك — نسخة طبق الأصل من المستخدمة في الموقع (مصدر واحد للحقيقة)
cp src/lib/ai-engine.js "$DIST/engine.js"

# 3) مكتبة pdf.js من node_modules (تحليل PDF محليًا — لا CDN)
cp node_modules/pdfjs-dist/build/pdf.min.mjs "$DIST/pdf.min.mjs"
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs "$DIST/pdf.worker.min.mjs"

# 4) خرائط المحارف والخطوط القياسية — نفس الموجود في الموقع لسلوك مطابق
cp -r public/pdfjs-cmaps "$DIST/pdfjs-cmaps"
cp -r public/pdfjs-std "$DIST/pdfjs-std"

# 5) ملف نموذجي
cp public/sample.pdf "$DIST/sample.pdf"

# 6) ملف فارغ لتعطيل Jekyll على GitHub Pages
touch "$DIST/.nojekyll"

echo "== محتويات $DIST =="
ls -la "$DIST"
echo "== الحجم الكلي =="
du -sh "$DIST"
