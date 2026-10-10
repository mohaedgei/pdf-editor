#!/usr/bin/env bash
# بناء نسخة ثابتة من الموقع ونشرها على GitHub Pages
# الاستخدام: GH_TOKEN=... GH_USER=... bash scripts/deploy-gh.sh
set -euo pipefail
cd /home/z/my-project

: "${GH_TOKEN:?need GH_TOKEN}"
: "${GH_USER:?need GH_USER}"
REPO_NAME="${REPO_NAME:-pdf-editor}"

echo "== 1) إزالة مسارات API مؤقتًا (البناء الثابت لا يدعمها والموقع لا يحتاجها) =="
rm -rf .tmp-api-backup
mv src/app/api .tmp-api-backup
restore() { mv .tmp-api-backup src/app/api 2>/dev/null || true; }
trap restore EXIT

echo "== 2) بناء static export =="
rm -rf out
STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/$REPO_NAME bunx next build

echo "== 3) نسخ الناتج إلى docs/ =="
rm -rf docs
mkdir docs
cp -r out/. docs/
touch docs/.nojekyll

echo "== sizes =="
du -sh docs
ls docs | head

echo "== DONE =="
