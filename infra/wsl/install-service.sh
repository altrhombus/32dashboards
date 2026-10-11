#!/usr/bin/env bash
# Installs a systemd unit that runs NodeCG from this repo whenever the WSL
# distro boots, restarting it if it crashes. Processes started from an
# interactive `wsl` session die when that session ends, so the service is the
# only supported way to keep NodeCG running unattended.
#
# Run inside WSL (uses sudo):  bash infra/wsl/install-service.sh
# Then:                        systemctl status 32dashboards-nodecg
#                              journalctl -u 32dashboards-nodecg -f
#
# Bundles are not built by the service; run `pnpm bundles:build` after changes
# and `sudo systemctl restart 32dashboards-nodecg`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_BIN="$HOME/.local/share/fnm/aliases/default/bin"
UNIT=/etc/systemd/system/32dashboards-nodecg.service

[ -x "$NODE_BIN/node" ] || { echo "No fnm default Node at $NODE_BIN (run: fnm default 24)"; exit 1; }
[ -f "$ROOT/cfg/nodecg.json" ] || { echo "Missing cfg/nodecg.json (run: pnpm nodecg:setup)"; exit 1; }

sudo tee "$UNIT" > /dev/null <<EOF
[Unit]
Description=32dashboards NodeCG
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$ROOT
Environment=PATH=$NODE_BIN:/usr/local/bin:/usr/bin:/bin
Environment=NODE_ENV=production
ExecStart=$NODE_BIN/node $ROOT/node_modules/nodecg/cli.mjs start
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now 32dashboards-nodecg.service
sleep 3
systemctl --no-pager --lines=5 status 32dashboards-nodecg.service || true
