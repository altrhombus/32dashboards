# Runbook: Event checklist, start to finish

One page to follow for an event, from a few days before to packing up.
Tick the boxes as you go. Each step links to the runbook with more detail
if something doesn't go to plan.

This assumes the laptop is already set up ([venue setup](venue-setup.md))
and the setup this checklist was written for:

- **The laptop** runs everything, and drives one TV over HDMI.
- **A second computer** drives the other TV. It only shows the TV picture,
  over the network; nothing gets installed on it.
- **A phone** (or tablet) runs the show.

With one TV, skip everything about the second computer.

## A few days before

- [ ] **Clear the demo**, if it's still there. In a WSL terminal:
      `cd ~/32dashboards && pnpm demo --remove`. It also removes the demo's
      layouts and logos. Its two screens stay; rename them in the next step.
- [ ] **Set up the event** with the dashboard's **New event** tab. Have
      ready: the auction's public link, the organizer sign-in for
      32auctions, the logo, how much each celebration step is (e.g. every
      $1,000), and each Ask Me appeal with its title and message. Every step
      can be skipped and finished later. Details:
      [setting up a new event](onboarding-a-new-event.md).
- [ ] **Name the screens.** On the **Screens** tab, have one screen per TV,
      named so you can tell them apart, for example "Stage" and "Bar".
      Rename the ones there, or add and remove screens. For each scene, keep **Built-in** or
      pick a layout made in the **Layouts** tab.
- [ ] **Check the rest of the show content** on the **Event** tab, under
      **Show content**: logos (sponsors, or the causes you help), bid wars,
      prizes, announcements. Each section says what it's for. Two choices
      worth a look: under **Ask Me rounds**, whether Ask Me money is added
      to the total (leave it off if Ask Me gifts also go into the auction);
      under **Event details**, whether the TVs switch to Celebration on
      their own when bidding closes.
- [ ] **Rehearse at home** if you can: plug in the TV, and run through the
      steps for the venue below with the real event. Tap through each scene
      in the **Live** tab and watch the TV.
- [ ] **Charge the phone**, and pack: the laptop's charger, an HDMI cable
      long enough to reach the TV, and an HDMI adapter if the laptop needs
      one.

## At the venue: the laptop and its TV

- [ ] **Plug in the laptop's power.** Leave it plugged in all night.
- [ ] **Connect the TV over HDMI**, then press **Windows+P** and choose
      **Extend**. The laptop's own screen stays yours for the dashboard; the
      TV is a second screen. (Duplicate would show the dashboard on the TV.)
- [ ] **Keep Windows quiet** for the night:
  - Settings, System, Power: screen and sleep to **Never** when plugged in.
  - Settings, System, Notifications: turn on **Do not disturb**.
  - Settings, Windows Update: **Pause updates** for a week.
- [ ] **Join the venue's network.** The second computer and the phone must
      be on the same one. Guest Wi-Fi often stops devices from seeing each
      other: if the steps below can't connect, ask for the staff network, or
      use a phone hotspot or a travel router for all three devices.
- [ ] **Check the system.** Open a WSL terminal (Start, then Ubuntu) and
      run `cd ~/32dashboards && pnpm check-env`. Every line should say `ok`.
      Note the address it prints after "reachable at", like
      `http://192.168.1.20:9090`. The second computer needs it.
- [ ] **Open the dashboard** on the laptop: `http://127.0.0.1:9090`, and
      sign in as `admin`.
- [ ] **Show the TV picture.** On the **Screens** tab, find this TV's screen
      and click **Open on this computer**. A window opens. Drag it onto the
      TV, or press **Windows+Shift+Right arrow** to move it there. Then
      double-click it to fill the TV. The mouse pointer hides after a few
      seconds. On the Screens tab, that screen now says **Connected**.

## At the venue: the second computer and its TV

- [ ] **Do the same Windows settings** as on the laptop: power plugged in,
      sleep **Never**, **Do not disturb**, updates paused.
- [ ] **Join the same network** as the laptop.
- [ ] **Open the dashboard** in Edge or Chrome, at the address
      `pnpm check-env` printed (for example `http://192.168.1.20:9090`),
      and sign in as `admin`. If the page doesn't load, the two computers
      can't see each other: see the network step above, and
      [venue setup](venue-setup.md), step 6.
- [ ] **Show the TV picture.** On the **Screens** tab, click **Open on this
      computer** for the other screen, move the window to its TV, and
      double-click it to fill the screen.
- [ ] **Close the dashboard tab** on this computer, so nobody runs the show
      from it by accident. The TV picture keeps running in its own window.

## Before doors open

- [ ] **Open the console on your phone.** On the laptop, in the **Live**
      tab, tap **Open on your phone** and scan the code. Show that code only
      to your volunteers: anyone who scans it can run the show.
- [ ] **Check the status strip** at the top of the Live tab:
  - the screens: **2 screens connected**, or the name of the one that's
    missing;
  - the money: **receiving data**. If it says **no data yet**, tap
    **Fetch now**. If it says **needs a look**, it says why.
- [ ] **Put the event on the TVs.** In the Live tab, pick the event at the
      top, tap **Put on the TVs**, then tap again to confirm.
- [ ] **Clear the rehearsal.** Under **What the TV celebrated**, tap **Clear
      this list**.
- [ ] **Show Welcome** as guests arrive: tap **Welcome** under the scenes.

## During the show

Everything is in the **Live** tab, on the phone or the laptop. The phone's
tabs at the bottom are **Money**, **Ask Me**, **Scenes** and **More**.

- **Scenes:** tap one to switch the TVs. The one outlined in red is on now.
  **Main** is the usual show: the total, featured items and the info bar.
- **Cash and checks in the room:** tap an amount, or type another and tap
  **Add**. Each one is thanked on the TVs. **Take off** removes a mistake
  quietly. After counting the cash box, **Set the exact venue total**.
- **Ask Me:** switch to the **Ask Me** scene. Tap amounts as paddles go
  up. **Finish round** celebrates the round and brings up the next appeal.
  After the last one, the TVs go back to the scene before Ask Me and
  celebrate there. Leaving the Ask Me scene with money in the round finishes
  it, after a second tap.
- **No bids yet:** tap the scene to show items nobody has bid on, with QR
  codes to bid. Good for a quiet stretch.
- **Bidding closing:** the TVs count down the last minutes and announce
  when bidding closes. If the event is set to switch by itself, they go to
  **Celebration**; otherwise start it when you're ready.
- **Bid wars:** tap an amount next to an option.
- **Mistakes:** every action offers **Undo** for a few seconds, and
  **Your recent actions** keeps an Undo for each of your last 30.
- **Milestones** celebrate on their own.

More detail: [event day](event-day.md).

## If something goes wrong

- **A TV shows something stale or odd:** click on that TV's picture and
  press **F5**, then double-click it to fill the screen again. Nothing is
  lost.
- **A TV says it's not connected** (the Live tab names it): on that TV's
  computer, open the Screens tab and click **Open on this computer** again.
  Opening it twice is harmless.
- **The money stops updating:** the status strip says why. Keep going with
  cash and checks; the auction total catches up once it's fixed.
- **Nothing answers at all:** on the laptop, in a WSL terminal:
  `sudo systemctl restart 32dashboards-nodecg`. Everything (events, totals,
  the scene on the TVs) survives a restart, and the TVs reconnect by
  themselves.

More: [event day, troubleshooting](event-day.md#troubleshooting).

## After the event

- [ ] **Show Celebration** for the final thank-you (it needs a second tap).
- [ ] **Back up** on the laptop, in a WSL terminal:
      `cd ~/32dashboards && pnpm backup`. See
      [backup and restore](backup-and-restore.md).
- [ ] **Close the TV pictures:** click each one and press **Alt+F4**.
- [ ] **Undo the Windows settings** on both computers if you like: sleep,
      Do not disturb, and updates.
- [ ] Use **Reset Key** in the dashboard's **Settings** so the phone code
      stops working. Then sign in again on the laptop. The TV links don't
      run the show, so they can stay.
- [ ] **Clear the organizer password** in the **32auctions source** panel on
      the **Sources** tab, if you won't need it again soon.
