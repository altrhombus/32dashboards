#!/usr/bin/env bash
# Restores a backup made by scripts/backup.sh. NodeCG must be stopped first,
# so it can't overwrite the restored database on its way down:
#
#   sudo systemctl stop 32dashboards-nodecg
#   pnpm restore ~/32dashboards-backups/32dashboards-<timestamp>.tar.gz
#   sudo systemctl start 32dashboards-nodecg
#
# Whatever is there now (db/, assets/, cfg/) is moved to
# .pre-restore-<timestamp>/ rather than deleted, so a wrong restore can be undone.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE="${1:-}"
PORT="$(jq -r '.port // 9090' "$ROOT/cfg/nodecg.json" 2>/dev/null || echo 9090)"

[ -n "$ARCHIVE" ] && [ -f "$ARCHIVE" ] || { echo "Usage: pnpm restore <backup.tar.gz>" >&2; exit 1; }
# Running = the systemd service serving this directory, or anything answering on its port.
service_root="$(systemctl show -p WorkingDirectory --value 32dashboards-nodecg 2>/dev/null || true)"
if { [ "$service_root" = "$ROOT" ] && systemctl is-active --quiet 32dashboards-nodecg; } || \
   curl -fsS -o /dev/null --max-time 3 "http://127.0.0.1:$PORT/login" 2>/dev/null; then
  echo "NodeCG is running. Stop it first: sudo systemctl stop 32dashboards-nodecg" >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
tar -xzf "$ARCHIVE" -C "$STAGE"
[ -f "$STAGE/db/nodecg.sqlite3" ] || { echo "$ARCHIVE doesn't look like a 32dashboards backup (no db/nodecg.sqlite3)." >&2; exit 1; }
[ "$(sqlite3 "$STAGE/db/nodecg.sqlite3" 'pragma integrity_check;')" = "ok" ] || { echo "The backed-up database failed its integrity check." >&2; exit 1; }
[ -f "$STAGE/BACKUP-INFO" ] && sed 's/^/  /' "$STAGE/BACKUP-INFO"

ASIDE="$ROOT/.pre-restore-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$ASIDE"
for item in db assets cfg; do
  if [ -e "$ROOT/$item" ]; then mv "$ROOT/$item" "$ASIDE/"; fi
  if [ -e "$STAGE/$item" ]; then cp -a "$STAGE/$item" "$ROOT/$item"; fi
done
echo "Restored from $ARCHIVE."
echo "The previous data is in $ASIDE (delete it once you've checked the restore)."
echo "Start NodeCG: sudo systemctl start 32dashboards-nodecg"
