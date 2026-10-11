# Runbook: Backup and restore

## What a backup holds

`pnpm backup` writes one owner-only archive to `~/32dashboards-backups/`
containing:

- `db/nodecg.sqlite3`: every event, total, setting, and dashboard login
- `db/source-secrets/`: source credentials and the push-token hash
- `assets/`: uploaded logos
- `cfg/`: NodeCG config, including the session secret

It's safe to run during an event; the database is copied consistently while
NodeCG keeps running. The newest 30 backups are kept
(`BACKUP_KEEP=10 pnpm backup` changes that; `0` keeps all).

Backups contain secrets. Copy them somewhere safe and private, e.g. an
encrypted USB drive (`/mnt/c/...` paths reach Windows drives from WSL).

## Back up

```sh
cd ~/32dashboards && pnpm backup
```

Do it after setup, before and after every event, and before updating.

## Restore

```sh
sudo systemctl stop 32dashboards-nodecg
cd ~/32dashboards && pnpm restore ~/32dashboards-backups/32dashboards-<timestamp>.tar.gz
sudo systemctl start 32dashboards-nodecg
```

What's there now is moved to `.pre-restore-<timestamp>/`, not deleted, so a
wrong restore can be undone the same way. Delete that folder once you've
checked the restore. Reload the kiosk afterwards (F5 on the TV).

## The whole distro

To move to a new laptop, or to keep a complete snapshot (code, toolchain,
service, and data), export the distro from PowerShell:

```powershell
wsl --shutdown
wsl --export Ubuntu D:\32dashboards-ubuntu.tar
```

Import it on the other machine with
`wsl --import Ubuntu C:\WSL\Ubuntu D:\32dashboards-ubuntu.tar`. An
imported distro logs in as root; add `[user]` `default=<you>` to its
`/etc/wsl.conf` and run `wsl --shutdown`. Then redo
[venue setup](venue-setup.md) steps 2 and 6 (`.wslconfig` and the
firewall live on Windows, not in the distro).
