#!/usr/bin/env bash
# Prints the keyed kiosk graphic URL for the admin user. NodeCG creates the key
# on the user's first successful dashboard login, so log in once first.
#   pnpm -s kiosk-url [graphic-path]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GRAPHIC="${1:-bundles/spike-kiosk/graphics/kiosk.html}"
PORT="$(jq -r '.port // 9090' "$ROOT/cfg/nodecg.json" 2>/dev/null || echo 9090)"

KEY="$(sqlite3 "$ROOT/db/nodecg.sqlite3" "select k.secret_key from api_key k join user u on u.id = k.userId where u.name = 'admin' limit 1;" 2>/dev/null || true)"
[ -n "$KEY" ] || { echo "No API key for admin yet: log in to the dashboard once, then re-run." >&2; exit 1; }
# 127.0.0.1, not localhost: NodeCG listens on IPv4 only, and under WSL mirrored
# networking a connection to ::1 hangs instead of being refused.
echo "http://127.0.0.1:$PORT/$GRAPHIC?key=$KEY"
