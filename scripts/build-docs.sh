#!/bin/bash
# بناء النسخة الثابتة لموقع المحرر (GitHub Pages تحت /pdf-editor/)
# مجلد api يُخفى مؤقتًا أثناء البناء: النسخة الثابتة لا تحتاجه إطلاقًا
# (الحفظ يتم بالكامل داخل المتصفح) — وبناء Turbopack يفشل مع مسارات
# execFile الديناميكية في api/render.
set -euo pipefail
cd "$(dirname "$0")/.."

API_DIR="src/app/api"
HIDDEN=".tmp-api-hidden"
restore() {
  if [ -d "$HIDDEN" ] && [ ! -d "$API_DIR" ]; then
    mv "$HIDDEN" "$API_DIR"
    echo "== تمت إعادة مجلد api مكانه =="
  fi
}
trap restore EXIT

if [ -d "$API_DIR" ]; then
  mv "$API_DIR" "$HIDDEN"
  echo "== تم إخفاء مجلد api مؤقتًا =="
fi

STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/pdf-editor bunx next build

# النسخة تُكتب في out/ — نقلها إلى docs/ المرفوعة في المستودع
rm -rf docs
cp -r out docs
rm -rf out

# تحويل الصفحات الفرعية من ai-detector.html إلى ai-detector/index.html
# عشان الروابط والدلائل تشتغل على GitHub Pages
if [ -f docs/ai-detector.html ]; then
  mkdir -p docs/ai-detector
  mv docs/ai-detector.html docs/ai-detector/index.html
fi

touch docs/.nojekyll

echo "== docs/ جاهزة =="
du -sh docs
ls docs
