# Runbook: Event day

The presentation laptop runs everything: NodeCG inside WSL, and the kiosk
full-screen on the TV. Operators control the show from the dashboard's
**Live** tab, on the laptop or on any phone, tablet, or laptop on the same
network.

## Steps

1. **Start NodeCG.** On the presentation laptop, open a WSL terminal
   (Start menu, then "Ubuntu"). systemd starts NodeCG on its own. Check
   that everything is ready:

   ```sh
   cd ~/32dashboards && pnpm check-env
   ```

   Every line should say `ok`. A `warn` about backups is fine before the
   first event. You can close the terminal; NodeCG keeps running.

2. **Open the console on the operator's phone.** On the laptop, open the
   **Live** tab and tap **Open on your phone**: a phone on the same Wi-Fi
   scans the code and gets the console, signed in. On a phone the console
   has tabs at the bottom (Money, Ask Me, Scenes, More); the Ask Me tab
   opens by itself when Ask Me goes on the TV. Show the code only to
   volunteers: anyone who scans it can run the show (to shut everyone out
   afterwards, use **Reset Key** in the dashboard's **Settings**). Without
   the code, browse to `http://<laptop-ip>:9090` (`pnpm check-env` prints
   the address under "reachable at") and log in as `admin`.

3. **Open the kiosk on the TV.** On the presentation laptop, with the TV
   connected as its display, run in PowerShell:

   ```powershell
   powershell -ExecutionPolicy Bypass -File \\wsl.localhost\Ubuntu\home\<you>\32dashboards\infra\windows\open-kiosk.ps1
   ```

   Edge opens the kiosk full-screen. Within ten seconds the Live tab's
   status strip should say **TV connected**.

   With named screens (see [venue setup](venue-setup.md), step 8), open
   each one by its id, and say which display it goes on:

   ```powershell
   ...\open-kiosk.ps1 -Screen main-left
   ...\open-kiosk.ps1 -Screen main-right -Position 1920,0
   ```

   The strip then says **2 screens connected**, or names the screen
   that's missing.

4. **Put the event on the TV.** In the Live tab, pick the event at the top
   left, tap **Put on TV**, then tap again to confirm. Check the strip:
   the source should say **receiving data** (manual-entry events say so
   after the first entry). The preview shows exactly what the TV shows.

5. **Run the show.** Everything during the event happens in the Live tab:
   - **Scenes.** The scene with the red outline is on the TV. Tap another
     to switch. For Intermission, type a message and pick a countdown
     first. Celebration (the end-of-night thank-you) needs a second tap.
   - **Money taken at the venue.** Tap +$20, +$50, +$100, or +$500, or
     type another amount. The TV shows a thank-you. Use **Undo** in the
     message at the bottom if you tapped the wrong amount. To fix the
     venue total without a thank-you, use **Correct the venue total**.
   - **Bid wars.** Tap +5, +25, or +100 next to an option.
   - **Incentives.** **Pin to info bar** keeps one on the TV until you
     unpin it.
   - **Ask Me.** While the Ask Me scene is on, quick buttons add to the
     Ask Me total on the TV.
   - **What the TV celebrated** lists every donation, bid, and milestone
     the TV showed.

   Editing content (bid war options, prizes, sponsors, logos) is in the
   **Show content** panel on the **Event** tab. Changes show on the
   TV as soon as you save.

6. **After the event.** Switch to Celebration. When you're done, back up:

   ```sh
   cd ~/32dashboards && pnpm backup
   ```

   Close the kiosk with Alt+F4 on the TV.

## Troubleshooting

**TV not connected** (or a screen's name, **not connected**). That
screen's kiosk isn't open, or it lost its connection. Run step 3 again
for it; opening it twice is harmless. If the **Screens** tab
lists a TV as "open without a screen name", it was opened without
`-Screen`, so it shows the built-in layouts.

**Changing what a screen shows mid-show.** In the Live tab, **On each
screen now** lists the named screens; pick another finished layout for
one. **Preview shows** picks which screen the preview follows. Build or
edit layouts beforehand in the **Layouts** tab, not during the show.

**A screen shows the built-in layout instead of the one chosen for it.**
The chosen layout was deleted or can't be shown. The screen falls back
rather than going blank; choose a layout for it again in **Screens and
layouts**.

**The source needs a look.** The status strip shows the reason. Common
ones:

- _Not configured for this event_: fill in the source's settings in its
  panel on the **Sources** tab (for 32auctions, the **32auctions source** panel).
- _HTTP 401/403_: the auction needs a fresh session cookie; see
  [rotating secrets](rotating-secrets.md).
- _Total raised not found_: check the auction's public path, or the site
  layout changed. Keep the show going with **Add cash or checks**.

Tap **Fetch now** after fixing it.

**The dashboard won't load on a phone.** Check that the phone is on the
same network as the laptop, and that Windows sees that network as
Private, or that the firewall rules exist (`pnpm check-env`, last
section). See [venue setup](venue-setup.md), step 6.

**NodeCG isn't answering at all.** In a WSL terminal:

```sh
systemctl status 32dashboards-nodecg      # is it running?
journalctl -u 32dashboards-nodecg -n 50   # why did it stop?
sudo systemctl restart 32dashboards-nodecg
```

Everything (events, totals, the scene) survives a restart.

**Something looks wrong on the TV.** The TV reloads cleanly: click on it
and press F5. Nothing is lost.
