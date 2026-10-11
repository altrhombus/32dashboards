# Runbook: Setting up a new event

One install serves any number of events. A new event is set up in the
dashboard; no code changes, no restart. Past events stay around, so the
quickest start is often to duplicate last year's.

## Steps

1. **Create the event.** In the dashboard's **Events** panel, either type
   a name and tap **Create**, or tap **Duplicate** on a past event.
   Duplicating copies the look, sponsors, incentives, milestones, bid
   wars, prizes, announcements, filters, and source settings, and resets
   anything that describes how that event went (venue money, bid war
   totals, the Ask Me total). Nothing goes on the TV until you put it
   there.

2. **Pick its data source** in the same panel:
   - **32auctions** for an auction on 32auctions.com,
   - **Manual entry** when totals and items are entered by hand,
   - **External push** when another program sends results (see
     `bundles/source-external/src/extension/index.ts` for the format).

3. **Configure the source** in its panel:
   - **32auctions source**: the organization ID and auction ID (both from
     the auction's admin URL, `/organizations/<org>/auctions/<auction>`),
     the public path (`32auctions.com/<path>`, where the total raised is
     shown), and, for private auctions, the session cookie and auth token
     from a logged-in browser.
   - **Manual source**: nothing to set up; enter the total during the
     event.
   - **External source**: create a token and give it, with the event's
     id, to whoever runs the pushing program. The token is shown once.

4. **Set up the show** in the **Show content** panel:
   - *Event details*: the name and cause shown on the TV, when bidding
     closes (the TV counts down to it), announcements, and the Ask Me
     title and message.
   - *Look and sponsors*: event logo, colors (the panel warns about
     hard-to-read or broadcast-unsafe colors), and sponsors with logos.
     Upload logos first in the dashboard's **Assets** tab.
   - *Call to action*: how people give, e.g. "Bid at 32auctions.com/gala".
   - *Hidden items*: words that keep matching items (e.g. "raffle") off
     the TV.
   - *Info bar rotation*, *Milestones*, *Incentives*, *Bid wars*,
     *Prizes*: what the TV rotates through and celebrates.

5. **Rehearse.** Put the event on the TV from the **Live** tab before
   doors open, check the preview and the status strip, and tap
   **Fetch now** to see real data arrive. See the
   [event-day runbook](event-day.md).
