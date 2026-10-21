# Runbook: Rotating secrets

| Secret                                   | Where it lives                                | When to rotate                                           |
| ---------------------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| Dashboard `admin` password               | `cfg/nodecg.json` (as a salted hash)          | When someone who knew it leaves, or it may have leaked   |
| Kiosk key                                | NodeCG's database, tied to the `admin` user   | When a kiosk URL may have been shared                    |
| 32auctions session cookie and auth token | `db/source-secrets/32auctions.json`           | When the source reports HTTP 401/403, or after the event |
| External push token                      | `db/source-secrets/external.json` (hash only) | When the pushing program changes hands                   |

Take a backup first (`pnpm backup`): it's how you undo a rotation that goes
wrong.

## Dashboard password

```sh
cd ~/32dashboards
pnpm nodecg:setup --force        # or NODECG_ADMIN_PASSWORD=... pnpm nodecg:setup --force
sudo systemctl restart 32dashboards-nodecg
```

This also replaces the session secret, so everyone is logged out. The kiosk
keeps working: its key doesn't depend on the password.

## Kiosk key

In the dashboard, open **Settings** and use **Reset Key**. Every keyed URL
stops working at once, including the TV. Reopen the kiosk with
`infra/windows/open-kiosk.ps1`, which picks up the new key.

## 32auctions cookie and token

Log in to 32auctions.com in a browser, copy the `_session_id` and
`auth_token` cookie values from the browser's developer tools, and paste
them into the **32auctions source** panel for the event. Tap **Save** for
each, then **Refresh now**. Values are stored on the server and never shown
again. **Clear** removes them.

## External push token

In the **External source** panel, tap **Replace token**. The new token is
shown once; the old one stops working immediately. **Revoke** turns pushes
off until you create a new token.
