#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
cp dist/index.html ./index.html
rm -rf ./assets
cp -r dist/assets ./assets
cp dist/manus-routes.json ./manus-routes.json
cp dist/favicon.svg ./favicon.svg
git add index.html assets manus-routes.json favicon.svg
git -c user.name='Manus' -c user.email='dev-agent@manus.ai' commit -m $'fix: servir build compilado no pages legado\n\nCo-authored-by: Manus <dev-agent@manus.ai>' || true
git push origin main
