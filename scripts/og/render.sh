#!/usr/bin/env bash
# Renders public/og-image.png (1200x630) from scripts/og/card.html, which frames the built app.
# Needs chromium and python3. Run from anywhere: scripts/og/render.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

npm run build >/dev/null
site=$(mktemp -d)
profile=$(mktemp -d)
# The card and the app share one origin, so the card can seed the app's localStorage
cp -r dist/. "$site"
cp scripts/og/card.html "$site/og-card.html"
mkdir "$site/og-fonts"
cp node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-{400,500,600}-normal.woff2 "$site/og-fonts/"

python3 -m http.server 8765 --bind 127.0.0.1 --directory "$site" >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null; rm -rf "$site" "$profile"' EXIT
until curl -sf http://127.0.0.1:8765/og-card.html >/dev/null; do sleep 0.3; done

# Tallinn as the local zone, so the rows are New York, Tallinn and Tokyo
TZ=Europe/Tallinn chromium-browser --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
	--user-data-dir="$profile" --window-size=1200,630 --force-device-scale-factor=1 \
	--virtual-time-budget=4000 --screenshot=public/og-image.png \
	http://127.0.0.1:8765/og-card.html 2>/dev/null
echo "wrote public/og-image.png"
