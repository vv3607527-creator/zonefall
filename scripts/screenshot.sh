#!/usr/bin/env bash
# ZONEFALL headless verification screenshot.
#   bash scripts/screenshot.sh [url] [outfile]
set -e
URL="${1:-http://127.0.0.1:8787}"
OUT="${2:-shots/dev.png}"
mkdir -p shots
echo "screenshot: $URL -> $OUT"
chromium-browser --headless=new --no-sandbox --disable-software-rasterizer=false \
  --use-gl=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist \
  --window-size=1280,720 --virtual-time-budget=6000 --screenshot="$OUT" "$URL" 2>/dev/null \
  || chromium-browser --headless --disable-gpu --no-sandbox --window-size=1280,720 \
     --virtual-time-budget=6000 --screenshot="$OUT" "$URL" 2>/dev/null
ls -la "$OUT"