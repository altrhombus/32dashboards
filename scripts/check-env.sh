#!/usr/bin/env bash
# Verifies the presentation laptop's WSL environment against ADR-0001.
# Run from inside WSL: `pnpm check-env` (or `bash scripts/check-env.sh`).
# Exits non-zero if any required check fails; warnings don't fail the run.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${NODECG_PORT:-9090}"
failures=0

pass() { printf '  \033[32mok\033[0m    %s\n' "$1"; }
warn() { printf '  \033[33mwarn\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; failures=$((failures + 1)); }

echo "Platform"
arch="$(uname -m)"
[ "$arch" = "aarch64" ] && pass "arch: $arch" || warn "arch: $arch (target hardware is aarch64)"
if grep -qi microsoft /proc/version 2>/dev/null; then pass "running under WSL"; else warn "not running under WSL"; fi
pid1="$(ps -p 1 -o comm= 2>/dev/null)"
[ "$pid1" = "systemd" ] && pass "systemd is PID 1" || fail "systemd is not PID 1 (set [boot] systemd=true in /etc/wsl.conf, then wsl --shutdown)"
if command -v wslinfo >/dev/null 2>&1; then
  mode="$(wslinfo --networking-mode 2>/dev/null)"
  [ "$mode" = "mirrored" ] && pass "networking mode: mirrored" || fail "networking mode: ${mode:-unknown} (set networkingMode=mirrored in %UserProfile%\\.wslconfig)"
else
  warn "wslinfo not found; can't verify networking mode"
fi
case "$ROOT" in
  /mnt/*) fail "repo is on a Windows drive ($ROOT); move it to the WSL filesystem" ;;
  *) pass "repo on WSL filesystem: $ROOT" ;;
esac

echo "Toolchain"
want_node="$(tr -d '[:space:]' < "$ROOT/.nvmrc" 2>/dev/null)"
if command -v node >/dev/null 2>&1; then
  have_node="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$have_node" = "$want_node" ] && pass "node $(node -v) ($(node -p process.arch))" || fail "node $(node -v), .nvmrc wants $want_node"
else
  fail "node not found (install with fnm: fnm install $want_node)"
fi
command -v pnpm >/dev/null 2>&1 && pass "pnpm $(pnpm --version)" || fail "pnpm not found (corepack enable)"
for tool in sqlite3 jq; do
  command -v "$tool" >/dev/null 2>&1 && pass "$tool" || fail "$tool missing (sudo apt install $tool; used by kiosk-url, backup, and restore)"
done
for tool in gcc g++ make python3; do
  command -v "$tool" >/dev/null 2>&1 && pass "$tool" || warn "$tool missing (needed only if a native module must compile)"
done

echo "NodeCG"
if [ -f "$ROOT/node_modules/better-sqlite3/build/Release/better_sqlite3.node" ] || \
   find "$ROOT/node_modules/.pnpm" -path '*better-sqlite3/build/Release/better_sqlite3.node' -print -quit 2>/dev/null | grep -q .; then
  pass "better-sqlite3 native module present"
else
  warn "better-sqlite3 native module not found (run pnpm install)"
fi
[ -f "$ROOT/cfg/nodecg.json" ] && pass "cfg/nodecg.json present" || warn "cfg/nodecg.json missing (run pnpm nodecg:setup)"

# --max-time matters: under mirrored networking a closed loopback port can hang
# rather than refuse the connection.
if curl -fsS -o /dev/null --max-time 3 "http://127.0.0.1:$PORT/login" 2>/dev/null; then
  pass "NodeCG answering on localhost:$PORT"
  # The source address of the default route is the laptop's LAN address under
  # mirrored networking (10.255.255.254 is WSL's internal loopback alias).
  lan_ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')"
  if [ -n "$lan_ip" ]; then
    if curl -fsS -o /dev/null --max-time 3 "http://$lan_ip:$PORT/login" 2>/dev/null; then
      pass "reachable at http://$lan_ip:$PORT (verify from a second device too)"
    else
      warn "not reachable at http://$lan_ip:$PORT from inside WSL"
    fi
  fi
else
  warn "NodeCG not running on localhost:$PORT (start it to check reachability)"
fi

echo "Backups"
latest="$(ls -1t "$HOME"/32dashboards-backups/32dashboards-*.tar.gz 2>/dev/null | head -1)"
if [ -z "$latest" ]; then
  warn "no backups in ~/32dashboards-backups yet (pnpm backup)"
elif [ -n "$(find "$latest" -mmin +1440 2>/dev/null)" ]; then
  warn "newest backup is over a day old: $(basename "$latest") (pnpm backup)"
else
  pass "recent backup: $(basename "$latest")"
fi

echo "Windows firewall (best effort, via WSL interop)"
if command -v powershell.exe >/dev/null 2>&1; then
  fw="$(powershell.exe -NoProfile -Command "Get-NetFirewallRule -DisplayName '32dashboards*' -ErrorAction SilentlyContinue | Where-Object Enabled -eq True | Measure-Object | Select-Object -ExpandProperty Count" 2>/dev/null | tr -d '\r')"
  [ "${fw:-0}" -gt 0 ] 2>/dev/null && pass "Windows Defender Firewall rule(s): $fw" || warn "no enabled '32dashboards*' Windows Defender Firewall rule (needed for LAN admin)"
  hv="$(powershell.exe -NoProfile -Command "Get-NetFirewallHyperVRule -ErrorAction SilentlyContinue | Where-Object { \$_.Name -like '32dashboards*' } | Measure-Object | Select-Object -ExpandProperty Count" 2>/dev/null | tr -d '\r')"
  [ "${hv:-0}" -gt 0 ] 2>/dev/null && pass "Hyper-V firewall rule(s): $hv" || warn "no '32dashboards*' Hyper-V firewall rule (needed for LAN admin with mirrored networking)"
else
  warn "WSL interop disabled; check firewall rules from Windows"
fi

echo
if [ "$failures" -eq 0 ]; then echo "All required checks passed."; else echo "$failures required check(s) failed."; fi
exit $(( failures > 0 ))
