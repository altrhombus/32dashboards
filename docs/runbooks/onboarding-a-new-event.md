# Runbook: Setting up a new event

One install serves any number of events. A new event is set up in the
dashboard; no code changes, no restart. Past events stay around, so the
quickest start is often to duplicate last year's.

## The guided way

Open the dashboard's **New event** tab (or tap **Set up a new event** in the
Events panel). It walks through the steps below, one question at a time,
beside a live preview of the TV that fills in as you answer:

1. **Start:** paste the auction's public link (the one bidders get). It finds
   the auction's ids, its title, and the organization's name and picture,
   and fills them in. You can also copy an earlier event's look, goals and
   sponsors, or set up an event without an auction.
2. **Name:** the name, the cause, and when bidding closes.
3. **Money:** where the total comes from, the organizer sign-in, and
   **Connect and check**, which fetches the auction once and shows what it
   found (never the total itself).
4. **Look:** the logo (upload a better one if the auction's picture is a
   photo), colors picked from it, and fonts.
5. **Celebrations:** every $1,000 (or any step) up to a limit, plus one big
   goal.
6. **Extras:** how to give, and announcements.
7. **Ready:** what's set, then **Put it on the TVs**.

Every step can be skipped and changed later. If you leave partway, the
guide picks up where you left off. The rest of this runbook is the same
setup done by hand, panel by panel, which is quicker once you know it.

## Steps by hand

1. **Create the event.** On the dashboard's **Event** tab, in the **Events** panel, either type
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

3. **Configure the source** in its panel on the **Sources** tab:
   - **32auctions source**: the organization ID and auction ID (both from
     the auction's admin URL, `/organizations/<org>/auctions/<auction>`),
     the public path (`32auctions.com/<path>`, where the total raised is
     shown), and, for private auctions, the session cookie and auth token
     from a logged-in browser.
   - **Manual source**: nothing to set up; enter the total during the
     event.
   - **External source**: create a token and give it, with the event's
     id, to whoever runs the pushing program. The token is shown once.

4. **Set up the show** in the **Show content** panel on the **Event** tab:
   - _Event details_: the name and cause shown on the TV, when bidding
     closes (the TV counts down to it), announcements, and the Ask Me
     title and message.
   - _Look and sponsors_: sponsors with logos. **Edit the look** opens
     the event's colors, logo and fonts in the **Layouts** tab, beside a
     live preview of each scene: start from a palette, adjust it to the
     brand (each color warns if it's hard to read or broadcast-unsafe),
     pick fonts that ship with the kiosk, and save. Upload logos first in
     the dashboard's **Assets** tab.
   - _Call to action_: how people give, e.g. "Bid at 32auctions.com/gala".
   - _Hidden items_: words that keep matching items (e.g. "raffle") off
     the TV.
   - _Info bar rotation_, _Milestones_, _Incentives_, _Bid wars_,
     _Prizes_: what the TV rotates through and celebrates.

5. **Rehearse.** Put the event on the TV from the **Live** tab before
   doors open, check the preview and the status strip, and tap
   **Fetch now** to see real data arrive. See the
   [event-day runbook](event-day.md).
