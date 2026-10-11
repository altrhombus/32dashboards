# 32dashboards

A reusable, config-driven presentation suite for silent-auction dashboards
(inspired by Games Done Quick's marathon donation displays), built to scrape
[32auctions](https://www.32auctions.com) and present live stats — featured
items, a countdown, sponsor logos, a bottom-scrolling item marquee, the
running total raised, tiered fundraising incentives with celebration
animations, and an interactive "Ask Me" spotlight mode.

One install serves **any number of events over time**: a new event is set
up in the dashboard, not in code. See
[setting up a new event](docs/runbooks/onboarding-a-new-event.md).

## How it runs

One presentation laptop drives the venue TV. [NodeCG](https://www.nodecg.dev)
runs inside WSL on that laptop and holds all state; the TV shows the kiosk
graphic full-screen in Edge; operators run the show from the NodeCG
dashboard on any device on the same network. The decision and its
trade-offs are in [ADR-0001](docs/adr/0001-rearchitect-on-nodecg.md).

```
bundles/
  fundraiser-core/    All state (events, totals, scenes, show content) as
                      Replicants, operator Messages, donation-moment
                      detection, the source-adapter registry, and the
                      dashboard: the Live console plus setup panels.
  source-32auctions/  Scrapes a 32auctions auction (TypeScript + cheerio).
  source-manual/      Totals and items entered by hand.
  source-external/    Bearer-token HTTP endpoint, so any program can push results.
  layout-kiosk/       The venue-TV graphic: one data-defined layout per scene.
packages/
  schema/             zod schemas; `@32dashboards/schema/core` generates the
                      Replicant JSON Schemas NodeCG validates against.
  source-sdk/         The adapter contract, polling runner, secret store.
  layout-engine/      Renders layouts defined as data (grid areas -> components).
  incentive-machine/  XState sequencing for the info bar and celebrations.
  ui/                 Presentational components and display rules.
  nodecg-react/       React hooks and shared styling for panels and graphics.
  nodecg-testing/     A NodeCG API double for extension tests.
infra/
  wsl/                The systemd unit installer.
  windows/            Firewall rules, and opening the kiosk full-screen.
```

## Running an event

- [Setting up the presentation laptop](docs/runbooks/venue-setup.md) (once)
- [Setting up a new event](docs/runbooks/onboarding-a-new-event.md)
- [Event day](docs/runbooks/event-day.md), including troubleshooting
- [Backup and restore](docs/runbooks/backup-and-restore.md)
- [Rotating secrets](docs/runbooks/rotating-secrets.md)
- [Fallbacks when WSL isn't an option](docs/runbooks/fallbacks.md)

## Development

Requires Node 24 (`.nvmrc`) and pnpm 11, inside WSL on the target laptop
(see [venue setup](docs/runbooks/venue-setup.md)).

```sh
pnpm install
pnpm nodecg:setup                         # once: cfg/nodecg.json and an admin password
pnpm bundles:build
pnpm nodecg:start                         # http://127.0.0.1:9090 (or run the systemd service)
pnpm --filter "./bundles/*" dev           # rebuild bundles on change
```

Graphics and panels pick up a rebuild on browser refresh; extension and
schema changes need a NodeCG restart. Run
`pnpm turbo run lint typecheck test` before committing; CI runs the same.

## Legacy stack

`apps/` (React display and admin, Express API, Python scraper, deployed
with `infra/docker-compose.yml`) is the previous architecture. It's kept
until the NodeCG stack has run a real event, then removed (ADR-0001, action
item 6). The original single-file implementation is under
[`legacy/`](legacy/) for reference. Neither runs in production.
