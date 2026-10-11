# 32dashboards

A reusable, config-driven presentation suite for silent-auction dashboards
(inspired by Games Done Quick's marathon donation displays), built to scrape
[32auctions](https://www.32auctions.com) and present live stats — featured
items, a countdown, sponsor logos, a bottom-scrolling item marquee, the
running total raised, tiered fundraising incentives with celebration
animations, and an interactive "Ask Me" spotlight mode.

One deployment serves **any number of events over time** — reusing it for a
new auction is a config change through the admin UI, not a code change or
redeploy. See [`docs/runbooks/onboarding-a-new-event.md`](docs/runbooks/onboarding-a-new-event.md).

## Rewrite status

This is a ground-up rewrite of the original single-file vanilla-JS
dashboard + separate Python scraper repo, done to make the system reusable
across events, robust, and production-grade rather than the raw/fragile
original. The legacy implementation is kept for reference under
[`legacy/`](legacy/) but no longer runs.

**Complete and verified** (each item below was exercised live — real
browser, real containers, real HTTP calls — not just unit-tested in
isolation):

- Full data model and auth: multi-event SQLite storage with only one event
  active at a time (enforced at the DB level), argon2id+JWT admin auth,
  zod-validated CRUD for events/incentives/sponsors/announcements/Ask Me.
- Live push updates: SSE broadcast from the API to every connected display,
  verified with multiple simultaneous subscribers and a restart-recovery
  check.
- Public kiosk display: all panels rebuilt as React components — featured
  items, countdown, sponsor carousel, bottom marquee, incentive tracker +
  two-stage celebration overlay, Ask Me full-takeover mode, end-of-auction
  celebration — driven by an XState machine (`packages/incentive-machine`)
  replacing the old hand-rolled timer logic.
- Admin panel: login, event switcher, and full config editing for every
  event field, including live incentive "Display Now" / "Display Until
  Met" toggles.
- Scraper: rewritten in Python with real request timeouts, retry/backoff,
  pydantic-validated output, and an integrity check that fails loudly if
  32auctions' markup changes instead of silently returning empty data (the
  original scraper's biggest silent-failure risk).
- Deployment: `docker compose up --build` brings up the full stack behind
  one public nginx port, with the API and scraper reachable only on the
  internal Docker network; verified end-to-end including SSE-through-nginx
  and volume persistence across a container restart.
- CI (`.github/workflows/ci.yml`): lint/typecheck/test/build for the
  TypeScript workspace, pytest for the scraper.

**Known gaps — not yet done:**

- No automated deploy pipeline (CI verifies the build but doesn't publish
  images or deploy anywhere).
- No TLS termination in the bundled nginx config — put a TLS-terminating
  proxy or load balancer in front for anything beyond local/LAN use.
- No in-app "change admin password" flow yet; rotation is a manual DB
  update (documented in [`docs/runbooks/rotating-secrets.md`](docs/runbooks/rotating-secrets.md)).
- No automated backups of the SQLite data volume.
- No Docker healthcheck blocks, structured logging/metrics, or alerting.
- No persisted end-to-end test suite (Playwright) — functional
  verification during development was done with ad hoc scripts, not
  checked into the repo as a repeatable suite.
- `apps/display` and `apps/admin` have no component-level automated tests
  yet (`packages/ui`, `packages/schema`, `packages/incentive-machine`,
  `apps/api`, and `apps/scraper` do).
- Sponsor logos are just an image URL field — there's no built-in
  upload/hosting for them; host the image somewhere reachable and paste
  the URL in.

## Architecture

A pnpm/Turborepo monorepo:

```
apps/
  display/         Public kiosk display (React + TypeScript + Vite)
  admin/            Operator control panel (React + TypeScript + Vite)
  api/               Backend (Node + TypeScript + Express, SQLite via Drizzle,
                      SSE broadcast to displays, auth, admin CRUD)
  scraper/            32auctions scraper (Python, Flask control API + a
                      background worker with retries/timeouts)
packages/
  schema/             Shared wire-format contracts (zod, source of truth for
                      every JSON shape crossing a network boundary)
  ui/                 Reusable design-token + presentational component
                      library shared by the display and admin apps
  incentive-machine/  XState state machine driving incentive display and
                      celebration sequencing, unit-tested in isolation
infra/
  docker-compose.yml  Full stack: one public port (nginx), api + scraper on
                      an internal-only network
  nginx/               Reverse-proxy config
  web/                 Dockerfile building both React apps and serving them
                      via nginx
docs/
  runbooks/           Operational procedures (onboarding an event, rotating
                      secrets)
```

Legacy vanilla-JS implementation is preserved for reference under
[`legacy/`](legacy/) and is not part of the running system.

## Quick start (local development)

Requires Node 22 (see `.nvmrc`) and pnpm.

```bash
pnpm install
pnpm turbo run build   # builds packages/schema first, then everything depending on it

# Terminal 1 — API
cd apps/api
JWT_SECRET=$(openssl rand -hex 32) \
INTERNAL_TOKEN=$(openssl rand -hex 32) \
SCRAPER_CONTROL_TOKEN=$(openssl rand -hex 32) \
ADMIN_PASSWORD=devpassword \
pnpm dev

# Terminal 2 — public display
cd apps/display && pnpm dev    # http://localhost:5173

# Terminal 3 — admin panel
cd apps/admin && pnpm dev      # http://localhost:5174 (proxies /api to the api dev server)

# Terminal 4 — scraper (optional for frontend-only work)
cd apps/scraper
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt
API_BASE_URL=http://127.0.0.1:8090 \
INTERNAL_TOKEN=<same as above> \
CONTROL_TOKEN=<same as SCRAPER_CONTROL_TOKEN above> \
python -m scraper.main
```

Run `pnpm turbo run lint typecheck test` before committing — this is what
CI runs (`.github/workflows/ci.yml`), alongside `pytest` for the scraper.

## Production deployment

```bash
cd infra
cp .env.example .env   # fill in JWT_SECRET, INTERNAL_TOKEN, SCRAPER_CONTROL_TOKEN, ADMIN_PASSWORD
docker compose up --build -d
```

This publishes exactly one port (80, via nginx), which serves the display
at `/`, the admin panel at `/admin`, and reverse-proxies `/api/*` and
`/events` to the API. The `api` and `scraper` containers have no published
ports — reachable only from `web` on the internal Docker network.

Data (events, incentives, admin password hash) persists in a named Docker
volume (`api_data`) across restarts.

### First run

A fresh deployment starts with **zero events** — the public display at `/`
will just show "Waiting for event configuration…" until you create and
activate one:

1. If you didn't set `ADMIN_PASSWORD` in `infra/.env`, find the
   auto-generated one in the API's startup logs: `docker compose logs api`
   (printed once, on first boot only).
2. Open `/admin`, log in, and create your first event — see
   [`docs/runbooks/onboarding-a-new-event.md`](docs/runbooks/onboarding-a-new-event.md)
   for the full walkthrough (org/auction ID, theme, incentives, sponsors).
3. Click **Activate**. The public display updates live within one SSE push
   — no reload needed — and the scraper immediately starts polling the
   configured 32auctions listing.

## Architecture decisions

- [ADR-0001: Rearchitect on NodeCG](docs/adr/0001-rearchitect-on-nodecg.md)
  (proposed): pluggable data sources, core-owned state, schema-driven
  layouts.

## Operations

- [Onboarding a new event](docs/runbooks/onboarding-a-new-event.md)
- [Rotating secrets](docs/runbooks/rotating-secrets.md) (admin password,
  32auctions session cookie, internal service tokens)
