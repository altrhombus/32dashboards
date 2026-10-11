# Runbook: Fallbacks when WSL isn't an option

The supported setup is NodeCG in WSL ([venue setup](venue-setup.md)). If WSL
can't be used on a laptop, NodeCG runs anywhere Node 24 does. Both
fallbacks below lose the clean separation from everyday use that WSL gives,
and neither is exercised regularly; rehearse before relying on one.

## Native Node on Windows

1. Install Node 24 for Windows (the ARM64 build on Snapdragon laptops) and
   Git, then `corepack enable` in a terminal.
2. Clone the repo somewhere outside OneDrive, then run, in PowerShell:
   ```powershell
   pnpm install
   pnpm nodecg:setup
   pnpm bundles:build
   pnpm nodecg:start
   ```
   If `pnpm install` fails building `better-sqlite3`, install the Visual
   Studio Build Tools ("Desktop development with C++").
3. NodeCG runs only while that terminal is open. There's no service; keep
   the window open for the whole event.
4. Allow the port for other devices in an elevated PowerShell:
   `New-NetFirewallRule -DisplayName "32dashboards NodeCG" -Direction Inbound -Protocol TCP -LocalPort 9090 -RemoteAddress LocalSubnet -Action Allow`.
   (The Hyper-V rule from `setup-firewall.ps1` isn't needed without WSL.)
5. `kiosk-url.sh`, `backup.sh`, and `restore.sh` are bash scripts. Use
   Git Bash, or:
   - get the kiosk URL from the dashboard's **Settings** (**Show Key**),
     and open `http://127.0.0.1:9090/bundles/layout-kiosk/graphics/kiosk.html?key=<key>`
     with `msedge --kiosk <url> --edge-kiosk-type=fullscreen`;
   - back up by stopping NodeCG and copying `db\`, `assets\`, and `cfg\`.

## Docker

There's no maintained image for the NodeCG stack (`infra/docker-compose.yml`
runs the legacy apps, which are being retired). A container needs Node 24,
the repo with `pnpm install` and `pnpm bundles:build` run inside it (the
native SQLite module must be built for the container's platform), port 9090
published, and `db/`, `assets/`, and `cfg/` mounted as volumes so data
survives the container. Write and test that before an event depends on it.
