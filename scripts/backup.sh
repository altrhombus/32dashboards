#!/usr/bin/env bash
# Backs up everything an install needs to come back exactly as it was:
#   db/nodecg.sqlite3     events, settings, Replicants, dashboard logins
#   db/source-secrets/    source credentials and push-token hashes
#   assets/               uploaded logos
#   cfg/                  NodeCG and bundle config (includes the session secret)
#
# Safe while NodeCG is running: the database is copied with sqlite3's online
# .backup, so the copy is consistent even mid-event.
#
#   pnpm backup               -> ~/32dashboards-backups/32dashboards-<timestamp>.tar.gz
#   pnpm backup /some/dir     -> /some/dir/32dashboards-<timestamp>.tar.gz
#   BACKUP_KEEP=10 pnpm backup   keep only the newest 10 (default 30; 0 keeps all)
#
# Backups contain secrets; they're written owner-only. Restore with
# scripts/restore.sh (see docs/runbooks/backup-and-restore.md).
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-$HOME/32dashboards-backups}"
KEEP="${BACKUP_KEEP:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$DEST/32dashboards-$STAMP.tar.gz"

command -v sqlite3 >/dev/null || { echo "sqlite3 is required (sudo apt install sqlite3)" >&2; exit 1; }
[ -f "$ROOT/db/nodecg.sqlite3" ] || { echo "No database at $ROOT/db/nodecg.sqlite3; nothing to back up." >&2; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/db" "$DEST"

sqlite3 "$ROOT/db/nodecg.sqlite3" ".backup '$STAGE/db/nodecg.sqlite3'"
[ "$(sqlite3 "$STAGE/db/nodecg.sqlite3" 'pragma integrity_check;')" = "ok" ] || { echo "Backup copy failed its integrity check." >&2; exit 1; }
[ -d "$ROOT/db/source-secrets" ] && cp -a "$ROOT/db/source-secrets" "$STAGE/db/"
[ -d "$ROOT/assets" ] && cp -a "$ROOT/assets" "$STAGE/"
[ -d "$ROOT/cfg" ] && cp -a "$ROOT/cfg" "$STAGE/"
printf 'created=%s\nhost=%s\ncommit=%s\n' "$STAMP" "$(hostname)" "$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)" > "$STAGE/BACKUP-INFO"

tar -czf "$ARCHIVE" -C "$STAGE" .
echo "Backed up to $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

if [ "$KEEP" -gt 0 ]; then
  mapfile -t old < <(ls -1t "$DEST"/32dashboards-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))")
  for f in "${old[@]}"; do rm -f "$f"; done
  [ "${#old[@]}" -gt 0 ] && echo "Removed ${#old[@]} older backup(s); keeping the newest $KEEP."
fi
exit 0
