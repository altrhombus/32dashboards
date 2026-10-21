# Runbook: Setting up the presentation laptop

One-time setup for the laptop that drives the TV. Everything for production
lives in one WSL distro, separate from the laptop's everyday Windows use;
removing the distro removes the whole stack. The background is in
[ADR-0001](../adr/0001-rearchitect-on-nodecg.md).

## Steps

1. **Install WSL and Ubuntu.** In an elevated PowerShell:
   `wsl --install -d Ubuntu`, then reboot and create your Linux user.

2. **Turn on systemd and mirrored networking.**
   - In Ubuntu, add to `/etc/wsl.conf`:
     ```ini
     [boot]
     systemd=true
     ```
   - In Windows, add to `%UserProfile%\.wslconfig`:
     ```ini
     [wsl2]
     networkingMode=mirrored
     ```
   - Run `wsl --shutdown` in PowerShell, then reopen Ubuntu.

3. **Install the toolchain inside WSL** (never on Windows):

   ```sh
   sudo apt update && sudo apt install -y git sqlite3 jq build-essential
   curl -fsSL https://fnm.vercel.app/install | bash   # then reopen the terminal
   fnm install 24 && fnm default 24
   corepack enable
   ```

4. **Get the code and build it.** Keep it in the WSL filesystem, not
   under `/mnt/c`:

   ```sh
   git clone https://github.com/altrhombus/32dashboards ~/32dashboards
   cd ~/32dashboards
   pnpm install
   pnpm nodecg:setup        # prints the admin password once: store it safely
   pnpm bundles:build
   ```

   Put the `admin` password in a password manager now: it's shown only
   this once, and only a hash is kept. If it's lost, set a new one (see
   [rotating secrets](rotating-secrets.md#dashboard-password)).

5. **Run NodeCG as a service**, so it starts with WSL and restarts if it
   crashes:

   ```sh
   bash infra/wsl/install-service.sh
   ```

6. **Let other devices reach the dashboard.** In an elevated PowerShell:

   ```powershell
   & '\\wsl.localhost\Ubuntu\home\<you>\32dashboards\infra\windows\setup-firewall.ps1'
   ```

   This allows the NodeCG port through both the Windows Defender and the
   Hyper-V firewall. Then open `http://<laptop-ip>:9090` from a phone on
   the same network to confirm.

7. **Log in once and open the kiosk.** Log in to the dashboard on the
   laptop (`http://127.0.0.1:9090`). That creates the key the kiosk URL
   needs. Then run `infra/windows/open-kiosk.ps1` as in the
   [event-day runbook](event-day.md), step 3.

8. **Name the screens.** On the dashboard's **Screens** tab, add each TV (e.g. "Main room left", id `main-left`). For each
   scene you can keep the built-in layout or choose another one. To make
   your own, use the **Layouts** tab: start a new layout or copy a
   built-in one, arrange it, and publish it. Then open each TV's kiosk
   with `open-kiosk.ps1 -Screen <id>`. With one TV, you can skip this
   step.

9. **Check it.** `pnpm check-env` should pass. Then close every WSL
   window, wait five minutes, and reload the dashboard from another
   device. If it no longer answers, WSL stopped the distro when idle: add
   `vmIdleTimeout=-1` under `[wsl2]` in `.wslconfig`, run
   `wsl --shutdown`, and check again.

10. **Take a first backup:** `pnpm backup`. See
    [backup and restore](backup-and-restore.md).

## Optional hardening

WSL is a clean separation, not a security sandbox. To stop the distro from
seeing Windows drives or starting Windows programs, add to `/etc/wsl.conf`:

```ini
[automount]
enabled=false

[interop]
enabled=false
```

With interop off, `pnpm check-env` can't check the Windows firewall, and
`open-kiosk.ps1` can't ask WSL for the kiosk URL. Run
`bash scripts/kiosk-url.sh` in WSL and paste the URL instead.

## Updating

```sh
cd ~/32dashboards && pnpm backup && git pull && pnpm install && pnpm bundles:build
sudo systemctl restart 32dashboards-nodecg
```

Then reload the kiosk on the TV (F5).
