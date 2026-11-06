# Runbook: Rotating secrets

| Secret                                   | Where it lives                                | When to rotate                                           |
| ---------------------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| Dashboard `admin` password               | `cfg/nodecg.json` (as a salted hash)          | When someone who knew it leaves, or it may have leaked   |
| Dashboard key (in the phone QR code)     | NodeCG's database, tied to the `admin` user   | After every event, or if the QR code may have leaked     |
| TV link token                            | `db/display-token`                            | When a TV link has gone somewhere it shouldn't           |
| 32auctions organizer email and password  | `db/source-secrets/32auctions.json` (sealed)  | When the account's password changes                      |
| 32auctions session cookie and auth token | `db/source-secrets/32auctions.json` (sealed)  | When the source reports HTTP 401/403, or after the event |
| External push token                      | `db/source-secrets/external.json` (hash only) | When the pushing program changes hands                   |

Files in `db/source-secrets/` are sealed with a key kept outside the repo, in
`~/.config/32dashboards/secrets.key`. `pnpm backup` leaves that key out on
purpose, so a copied backup holds no readable passwords. It doesn't protect
against someone logged in to the laptop as you.

Take a backup first (`pnpm backup`): it's how you undo a rotation that goes
wrong.

## Dashboard password

Also the way back in when the password is lost: it can't be recovered, only
replaced. Run this in your own terminal (not through a tool that records
output), and put the printed password in a password manager.

```sh
cd ~/32dashboards
pnpm nodecg:setup --force        # or NODECG_ADMIN_PASSWORD=... pnpm nodecg:setup --force
sudo systemctl restart 32dashboards-nodecg
```

This also replaces the session secret, so everyone is logged out. The TVs
keep working: their links don't depend on the password.

## Dashboard key

This is what the **Open on your phone** QR code carries: anyone who has it can
run the show. In the dashboard, open **Settings** and use **Reset Key**. Phones
signed in with the old code stop working at once; TVs carry on, because TV
links use their own token. Sign in again on the laptop.

## TV link token

TV links can show the TV picture and nothing else: they can't open the
dashboard, change the show, or upload anything. If one goes somewhere it
shouldn't, tap **Replace the TV links** on the **Screens** tab, then on each
TV's computer click **Open on this computer** (or run
`infra/windows/open-kiosk.ps1`) to get the new one.

## 32auctions sign-in

The source needs to sign in for private auctions, and for auctions that
hide their total from the public (it's shown only to the organizer). Sign-in
details are per event, in the **32auctions source** panel on the **Sources** tab. Values are stored
on this laptop (`db/source-secrets/32auctions.json`, readable only by its
owner) and never shown again; **Clear** removes them.

**Automatic (recommended).** Under **Sign in automatically**, save the
organizer account's email and password, then tap **Refresh now**. The source
signs in when it first needs the total and again whenever the session ends,
so nothing expires mid-event. If 32auctions turns the sign-in down, the
panel says why and the source doesn't try that password again by itself, so a
typo can't lock the account: save it again, or tap **Fetch now**, for one more
try. A sign-in page that doesn't look right (site maintenance, say) sends no
password, so the source just tries again on its next refresh. After the
password changes on 32auctions, save the new one here.

**Pasted cookies (fallback).** For accounts that use "Sign in with Google",
or if automatic sign-in stops working (for example, if 32auctions adds a
captcha):

1. In Edge or Chrome, sign in at 32auctions.com with the organizer account.
2. Press F12 to open the developer tools and choose the **Application** tab.
3. Under **Storage**, open **Cookies**, then `https://www.32auctions.com`.
4. Copy the **Value** of `_session_id` and of `auth_token` into **Or paste
   cookies from a signed-in browser** in the panel, and **Save** each.
5. Tap **Refresh now**.

Pasted cookies stop working when that browser signs out or the session ends;
the source then reports HTTP 401/403 or that the total isn't shown. Repeat
the steps, or switch to automatic sign-in.

**If you don't need the total from 32auctions,** set **Total comes from** to
the items' current bids, or to _not shown_ (venue cash and other entries
only). Neither needs a sign-in for a public auction.

## External push token

In the **External source** panel on the **Sources** tab, tap **Replace token**. The new token is
shown once; the old one stops working immediately. **Revoke** turns pushes
off until you create a new token.
