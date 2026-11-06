#!/usr/bin/env bash
# Prints the kiosk graphic URL, with the display-only TV token: it opens the TV
# picture and can't run the show. layout-kiosk creates the token when NodeCG
# first starts.
#   pnpm -s kiosk-url [screen-id]
# A screen id (set up on the dashboard's Screens tab) makes the kiosk show
# that screen's layouts, and lets the Live console tell the screens apart.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCREEN="${1:-}"
GRAPHIC="bundles/layout-kiosk/graphics/kiosk.html"
if [ -n "$SCREEN" ] && ! [[ "$SCREEN" =~ ^[a-z0-9][a-z0-9-]{0,39}$ ]]; then
  echo "Screen ids are lowercase letters, digits and -, up to 40 characters: $SCREEN" >&2
  exit 2
fi
PORT="$(jq -r '.port // 9090' "$ROOT/cfg/nodecg.json" 2>/dev/null || echo 9090)"

KEY="$(cat "$ROOT/db/display-token" 2>/dev/null || true)"
[ -n "$KEY" ] || { echo "No TV token yet: start NodeCG once, then re-run." >&2; exit 1; }
# 127.0.0.1, not localhost: NodeCG listens on IPv4 only, and under WSL mirrored
# networking a connection to ::1 hangs instead of being refused.
echo "http://127.0.0.1:$PORT/$GRAPHIC?key=$KEY${SCREEN:+&screen=$SCREEN}"
