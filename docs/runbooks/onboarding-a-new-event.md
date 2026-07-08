# Runbook: Onboarding a New Event

Reusing this system for a new auction/event requires **zero code changes** —
everything is config, created through the admin UI (or its API) and stored
in the API's SQLite database. This is the entire point of the config-driven
multi-event design: one deployment, many events over time.

## Prerequisites

- The system is already deployed (see the root `README.md` for first-time
  setup) and you can reach `http://<your-host>/admin`.
- You know the new event's 32auctions details: organization ID, auction ID,
  and the "friendly path" (the slug in the auction's public URL).
- If the auction's total-raised figure requires an authenticated session
  (per 32auctions, this is common), you'll also need a valid
  `_session_id` cookie and `auth_token` value from a logged-in browser
  session on 32auctions.com.

## Steps

1. **Log in** at `/admin` with the shared admin password.
2. **Create the event**: on the Events page, fill in:
   - Slug — a short unique identifier (e.g. `spring-gala-2027`), used
     internally only, never shown to the public.
   - Name — the auction's display name, shown in the kiosk header.
   - Cause name — shown in "total raised for &lt;cause&gt;" text.
   - 32auctions org ID / auction ID / friendly path.
   Click **Create Event**. It's created inactive — the current active
   event (if any) keeps running until you explicitly switch over.
3. **Configure the new event** (click into it from the Events list):
   - **Theme** — accent/secondary/background colors, logo URL, fonts. This
     is what actually reskins the kiosk display per event — no rebuild
     needed, it's applied at runtime.
   - **32auctions Source** — double-check org/auction ID/path; add the
     session cookie and auth token here if the total-raised figure needs
     authentication (see the secret-rotation runbook for where these come
     from and how to refresh them).
   - **Announcements**, **Ask Me Mode**, **Incentives**, **Sponsors** — set
     up as needed for this event. None of this affects the currently-live
     event until you activate.
4. **Activate the event**: back on the Events list, click **Activate** on
   the new event's row. This does three things immediately:
   - Deactivates whatever event was previously active (only one can be
     active at a time — enforced at the database level, not just in the
     UI).
   - Pushes the new event's scraper source config to the scraper service,
     which immediately starts scraping the new auction.
   - Broadcasts the new event's config to every connected public display
     over SSE — screens update live, no reload needed.
5. **Verify**: open the public display (`/`) and confirm the header shows
   the new event's name and the theme/branding looks right. Give the
   scraper one refresh cycle (default 10s, configurable per event) and
   confirm featured items / total raised populate. Check
   `GET /api/events/:id/scraper/status` (via the admin, or directly with
   the admin session cookie) if items don't show up — `lastError` will
   tell you if the scraper is failing (wrong org/auction ID, upstream
   markup change, etc.).

## Rolling back

If something's misconfigured, either fix the event's config and it'll
re-push to the scraper automatically on save, or activate a different
(previously-configured) event to take the broken one off the public
display immediately.
