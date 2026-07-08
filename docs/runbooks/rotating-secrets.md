# Runbook: Rotating Secrets

Three kinds of secrets exist in this system, each with a different rotation
procedure: the admin password, the 32auctions session cookie/auth token
(per event), and the internal service tokens (`JWT_SECRET`,
`INTERNAL_TOKEN`, `SCRAPER_CONTROL_TOKEN`).

## Rotating the admin password

The admin password is stored as an argon2id hash in the API's SQLite
database (`settings` table), seeded once on first boot from the
`ADMIN_PASSWORD` environment variable (or randomly generated and printed to
the `api` container's logs if that env var was never set).

**There is currently no in-app "change password" flow.** To rotate it:

1. Generate a new password.
2. Compute its argon2id hash (the same way the API does, so it's a drop-in
   replacement):
   ```bash
   cd apps/api
   node -e "const a=require('argon2'); a.hash(process.argv[1]).then(h=>console.log(h))" '<new-password>'
   ```
3. Update the `settings` row directly:
   ```bash
   docker compose exec api node -e "
     const Database = require('better-sqlite3');
     const db = new Database('/data/db.sqlite');
     db.prepare(\"UPDATE settings SET value = ? WHERE key = 'admin_password_hash'\").run('<hash-from-step-2>');
   "
   ```
4. All existing admin sessions remain valid until their JWT expires (12h)
   — if you're rotating because of a suspected compromise, also rotate
   `JWT_SECRET` (below) to invalidate every existing session immediately.

## Rotating a 32auctions session cookie / auth token

32auctions session cookies expire periodically; when they do, the
scraper's `total_raised` figure silently stops updating (item scraping
still works, since that doesn't require authentication) and
`GET /api/events/:id/scraper/status` will start showing a `lastError`.

1. Log into 32auctions.com in a browser as the account that has access to
   the auction's summary page.
2. Open DevTools → Application/Storage → Cookies, and copy the values of
   `_session_id` and `auth_token`.
3. In the admin UI, open the active event → **32auctions Source** → paste
   the new values into **Session cookie** / **Auth token** → **Save**.
   Saving immediately re-pushes the config to the scraper (no restart
   needed) and the next scrape cycle picks it up.
4. Confirm via `GET /api/events/:id/scraper/status` that `lastError`
   clears and `lastTotalDisplay` starts updating again.

## Rotating `JWT_SECRET`, `INTERNAL_TOKEN`, or `SCRAPER_CONTROL_TOKEN`

These live in `infra/.env` and are only ever read from environment
variables (never persisted to the database) — rotating them is a redeploy,
not a data migration.

1. Generate new values: `openssl rand -hex 32` (each token independently).
2. Update `infra/.env`.
3. `docker compose up -d --build` (or just `--force-recreate` if no code
   changed) to restart `api` and `scraper` with the new values.

**Effects of rotating each:**
- `JWT_SECRET` — invalidates every existing admin session immediately;
  all operators need to log in again. Use this if an admin session may
  have been compromised.
- `INTERNAL_TOKEN` — the scraper's pushes to `/internal/scrape-result`
  will start failing (401) until the scraper container is also restarted
  with the matching new value — rotate both together.
- `SCRAPER_CONTROL_TOKEN` — the API's calls to the scraper's control API
  (`/config`, `/refresh`, `/filters`, `/adjustment`, `/status`) will start
  failing until both containers are restarted with the matching new
  value — rotate both together.

Since `api` and `scraper` read these from `infra/.env` at container start,
a plain `docker compose up -d` (which recreates containers whose env
changed) is sufficient — no code change or image rebuild required unless
you also changed application code.
