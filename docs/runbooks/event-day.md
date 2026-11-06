# Runbook: Event day

For a tick-box version from a few days before to packing up, see the
[event checklist](event-checklist.md).

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

3. **Show the TV picture on each TV.** On the computer connected to the
   TV (the laptop, or another computer that can reach the dashboard), open
   the dashboard's **Screens** tab and click **Open on this computer** for
   that TV's screen. Move the window onto the TV (drag it, or press
   Windows+Shift+arrow) and double-click it to fill the screen. Within ten
   seconds that screen says **Connected**, and the Live tab's status strip
   counts it. The Screens tab also shows each screen's link, to open by
   hand in Edge or Chrome on another computer.

   On the laptop, `infra/windows/open-kiosk.ps1 -Screen <id>` does the
   same with a dedicated Edge profile in kiosk mode; add
   `-Position 1920,0` to open it on a display to the right of a
   1920-wide main display.

4. **Put the event on the TVs.** In the Live tab, pick the event at the top
   left, tap **Put on the TVs**, then tap again to confirm. Check the strip:
   the source should say **receiving data**. **No data yet** means nothing
   has arrived (normal for manual entry until the first entry; otherwise
   tap **Fetch now**). The preview shows exactly what the TV shows.

5. **Run the show.** Everything during the event happens in the Live tab:
   - **Scenes.** The scene with the red outline is on the TV. Tap another
     to switch. **Welcome** is for arrivals (logo, cause, how to give,
     when bidding closes). For Intermission, type a message and pick a
     countdown first. Celebration (the end-of-night thank-you) needs a
     second tap.
   - **Cash and checks at the venue.** Tap +$20, +$50, +$100, or +$500, or
     type another amount: each is added to the venue total and thanked on
     the TV. **Take off** (beside Add) takes an amount back off, without a
     thank-you. After counting the cash box, use **Set the exact venue
     total** to replace the sum with the counted number (no thank-you).
   - **Undo.** The message at the bottom offers Undo for a few seconds;
     **Your recent actions** keeps an Undo for each of this device's last
     30 actions until the page reloads. Another device can't undo yours.
   - **Bid wars.** Tap +5, +25, or +100 next to an option, or type an amount.
   - **Incentives.** **Pin to info bar** keeps one on the TV until you
     unpin it.
   - **Ask Me.** Put Ask Me on the TVs (on a phone, the Ask Me tab opens
     by itself). Tap the big buttons, or **Other**, as paddles go up:
     each amount pops up on the TVs on its own. The pad shows where you
     are (**Ask Me 1 of 3 · Fund a kennel**).
     - **Finish round 1 · next: …** celebrates the round and brings up
       the next appeal at $0. **Skip** moves on from a round that raised
       nothing.
     - After the last round, the TVs go back to the scene from before Ask
       Me and celebrate there with tonight's Ask Me total.
     - Switching to another scene also finishes the round on now.
     - Every step has an Undo. **Clear this round** drops a round entered
       by mistake.
     - Without planned rounds, Ask Me is one appeal you can finish and
       run again.
   - **Milestones** fill the TVs for a few seconds (the milestone
     spotlight), then the show carries on by itself.
   - **Bidding closing.** In the last 10 minutes the countdown glows, and
     pulses in the last minute. The TVs announce 10, 5 and 1 minute left,
     then that bidding has closed. They switch to Celebration on their own
     only if the event says so (Event details); otherwise you do.
   - **What the TV celebrated** lists every donation, bid, and milestone
     the TV showed.

   **How the total on the TVs is worked out:** the source's total (for
   32auctions, the auction's own total) plus cash and checks at the
   venue, plus finished Ask Me rounds only if the event adds them (Show
   content, **Ask Me rounds**; off by default, because Ask Me gifts are
   usually entered in the auction too). The Money section shows the
   breakdown.

   Editing content (bid war options, prizes, logos) is in the
   **Show content** panel on the **Event** tab. Changes show on the
   TV as soon as you save.

6. **After the event.** Switch to Celebration. When you're done, back up:

   ```sh
   cd ~/32dashboards && pnpm backup
   ```

   Close each TV picture: click it and press Alt+F4.

## Troubleshooting

**TV not connected** (or a screen's name, **not connected**). That
screen's kiosk isn't open, or it lost its connection. Run step 3 again
for it; opening it twice is harmless. If the **Screens** tab
lists a TV as "open without a screen name", it was opened without a
screen, so it shows the built-in layouts.

**Changing what a screen shows mid-show.** In the Live tab, **On each
screen now** lists the named screens; pick another finished layout for
one. **Preview shows** picks which screen the preview follows. Build or
edit layouts beforehand in the **Layouts** tab, not during the show.

**A screen shows the built-in layout instead of the one chosen for it.**
The chosen layout was deleted or can't be shown. The screen falls back
rather than going blank; choose a layout for it again on the **Screens** tab.

**The source needs a look.** The status strip shows the reason. Common
ones:

- _Not configured for this event_: fill in the source's settings in its
  panel on the **Sources** tab (for 32auctions, the **32auctions source** panel).
- _Sign-in turned down_, or _HTTP 401/403_: the organizer sign-in in the
  **32auctions source** panel is wrong or has ended. Save the email and
  password again; see [rotating secrets](rotating-secrets.md#32auctions-sign-in).
- _Total raised not found_: check the auction's public path, or the site
  layout changed. Keep the show going with cash and checks in the **Money** section.

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
