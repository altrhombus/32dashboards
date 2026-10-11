# ADR-0001: Rearchitect on NodeCG with pluggable sources and schema-driven layouts

**Status:** Proposed
**Date:** 2026-10-10
**Deciders:** altrhombus (project owner)

## Context

32dashboards started as a single-file vanilla-JS kiosk page plus a separate
Python scraper (`32datasources`). In July 2026 it was rewritten into the
current monorepo: React display + admin apps, a Node/Express/SQLite API with
SSE push, and a Python scraper service, deployed as three containers behind
nginx.

That rewrite made the system robust, but not yet *flexible*:

- **Data source is hard-coded to 32auctions.** `ScraperSourceSchema` is
  32auctions-specific (org/auction ID, session cookie), the item wire format
  is 32auctions-shaped, and the scraper holds exactly one target in memory.
- **State is split across services.** Filters and the manual total
  adjustment live in the scraper's memory (lost on restart) while everything
  else lives in the API's SQLite. A concrete bug falls out of this: the
  manual adjustment is never applied to the total the displays show
  (`apps/scraper/scraper/worker.py` pushes the raw total; the API never
  adds the adjustment).
- **Results aren't attributed to a source.** `/internal/scrape-result`
  assigns incoming data to whichever event is active *when it arrives*, so a
  scrape in flight during an event switch lands on the wrong event.
- **One fixed layout.** The display is a single hand-built React page.
  Adding a new look, a break/intermission screen, or (eventually) a stream
  overlay means writing a new app.
- **We hand-rolled a broadcast-graphics framework.** Auth, live state sync
  (SSE), persistence, and an operator console are all custom code we
  maintain.

Established charity-livestream productions commonly build their graphics
on **NodeCG** (React + TypeScript bundles). Lessons from that practice that
are directly relevant to us:

- The fundraising total is the top of the information hierarchy: biggest
  element, frequent updates, no cents.
- A rotating bottom info bar carries everything secondary: up next,
  incentives and bid wars, prizes, calls to action.
- Bid wars, milestones, prizes, and "surprise and delight" moments on new
  donations drive engagement.
- Mature productions run dozens of layouts. They are only maintainable
  because components are responsive and layout variants are
  schema-driven.
- Every hour spent on graphics deserves an hour on operator controls.
  Confusing dashboards get misused or ignored.
- Practical rules: tabular numerals for counters and timers, design
  against worst-case strings (25-character names, very long titles), WCAG
  contrast, broadcast-safe colors.

### Deployment constraints (confirmed)

- **Venue TV only** for now. No stream/OBS output yet, but it must stay
  possible later without rework.
- **Kiosk model:** one presentation laptop plugged into the TV shows a local
  page full-screen. Admin work happens remotely by browsing to that laptop's
  admin URL. Nothing needs to be internet-facing.
- **Many events over time** on one install, one active at a time, with
  past and future events kept around for reuse.
- **Hardware is Windows on ARM64** (Snapdragon X-series). The development
  machine is the same platform.
- **Keep production separate from everyday laptop use.** The production
  stack must not install into, or depend on, the laptop's everyday Windows
  environment.

## Decision

Rebuild 32dashboards as a set of **NodeCG 2.x bundles** in a pnpm
monorepo. All state lives in a core bundle. Data sources are pluggable
adapter bundles. Screens are composed from shared components using
data-defined layouts and scenes.

### Shape

```
bundles/
  fundraiser-core/     Owns all domain state as Replicants: events (many,
                       one active), totals, incentives, bid wars,
                       milestones, prizes, sponsors, announcements, Ask Me,
                       scenes/layouts. Applies adjustment + filters. Hosts
                       the source-adapter registry and the dashboard
                       panels.
  source-32auctions/   Adapter: the current scraper, ported to TypeScript.
  source-manual/       Adapter: operator enters totals/items by hand, so
                       events without any platform still work.
  source-external/     Adapter: authenticated HTTP endpoint that accepts
                       pushed results, so a process in any language
                       (including the existing Python) can feed the core.
  layout-kiosk/        Venue-TV graphics: renders the active scene from
                       layout data.
packages/
  schema/              zod domain schemas (source of truth). Generates
                       Replicant JSON Schemas and TS types.
  source-sdk/          The adapter contract: config schema, lifecycle,
                       normalized result type, status/log reporting.
  ui/                  Responsive presentational components + design tokens
                       (existing package, extended).
  incentive-machine/   XState sequencing (existing, extended to bid wars
                       and milestones).
  layout-engine/       Resolves a layout definition (slots -> components
                       + variants) into a rendered tree.
```

### Key mechanics

- **Replicants replace** the Express API, SQLite schema, and SSE broadcast.
  NodeCG persists them to disk, validates them against JSON Schema, and
  syncs them live to every graphic and panel. **Messages** carry operator
  actions (trigger celebration, switch scene, refresh now).
- **Source adapters** register with `fundraiser-core` through its exported
  extension API and emit a normalized `SourceResult`
  (`{ sourceId, eventId, items, total, observedAt }`). Every result carries
  its event, so late results can't be misattributed. Adjustment, filters,
  and change detection (new bids and total jumps, for donation moments)
  run in the core, not the adapter. This fixes the current adjustment bug.
- **Schema-driven layouts.** Components declare their data dependencies and
  size variants. A *layout* is data that maps slots to components. A
  *scene* (main, intermission/countdown, Ask Me, celebration) is a layout
  the operator switches to. New looks are mostly configuration, and a
  future `layout-stream` bundle is just more layouts at 1920x1080.
- **Info bar.** The bottom marquee becomes a rotation of pluggable segments
  (up next, incentive and bid-war status, prizes, calls to action,
  announcements). Any bundle can contribute a segment type.
- **Operator UX is first-class.** Dashboard panels are designed around live
  operation (big obvious actions, a scene switcher, status at a glance),
  not ported 1:1 from the current CRUD forms.
- **Auth:** NodeCG login with the local provider. The kiosk uses a keyed
  graphic URL. Remote admin works over the LAN. Off-site admin goes over a
  tailnet (e.g. Tailscale), not port-forwarding.
- **Sponsor logos and other images** use NodeCG asset categories:
  dashboard upload instead of pasted URLs.
- **Display rules are enforced in `packages/ui`:** the total is the
  dominant element, whole-dollar formatting, `tabular-nums` on all
  counters, worst-case-string fixtures in component tests, and theme
  validation that checks WCAG contrast and flags non-broadcast-safe colors.
- **Runtime: NodeCG in WSL2, kiosk browser on Windows.**
  - NodeCG runs as a single Node (linux-arm64) process inside a dedicated
    WSL2 Ubuntu distro, supervised by a **systemd service** with
    restart-on-failure. Node, pnpm, the repo, and NodeCG's `db/` all live
    in the distro's own filesystem (`~/…`, never `/mnt/c`, which is slow
    and breaks file watching). Removing the distro removes the whole
    production stack.
  - **Networking:** WSL **mirrored networking** (`networkingMode=mirrored`
    in `%UserProfile%\.wslconfig`). Windows and the LAN reach NodeCG on
    the laptop's own address. The NodeCG port needs inbound allow rules in
    both Windows Defender Firewall and the Hyper-V firewall that applies to
    WSL.
  - **Startup: on demand.** Opening WSL starts the distro, and systemd
    brings NodeCG up. There's no Windows logon automation, because the
    operator starts things when needed (decided 2026-10-10). NodeCG must
    stay up after the WSL terminal closes. If WSL idle-stops the distro,
    fix that in `.wslconfig` before an event.
  - **Display:** the operator opens the keyed graphic URL
    (`http://127.0.0.1:<port>/…?key=…`, printed by `pnpm -s kiosk-url`) in
    a Windows-side Edge or Chrome, full-screen (F11 or `--kiosk`). It
    doesn't run inside WSLg, to avoid an extra rendering layer.
  - **Optional hardening:** disable `automount` and `interop` in the
    distro's `/etc/wsl.conf` so it can't see Windows drives or launch
    Windows programs. WSL is a clean *separation*, not a security sandbox.
  - Replicant persistence means a reboot resumes in place. A plain native
    Node install (no WSL) and Docker remain documented fallbacks, not the
    default.

## Options Considered

### Option A: Rebuild on NodeCG (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium. A new framework to learn, but it deletes our custom server, auth, sync, and persistence. |
| Cost | Free/open source. One process on existing hardware. |
| Scalability | Built for one production machine driving many graphics, which is our deployment model exactly. |
| Team familiarity | React/TS carries over. NodeCG concepts (bundles, Replicants, Messages) are new but small. |

**Pros:** Purpose-built for live event graphics. Live-synced, persisted,
schema-validated state for free. Built-in dashboard, login, and asset
uploads. The bundle model gives us natural plugin boundaries (sources,
layouts). Proven in large live productions, with an ecosystem of
community bundles we can learn from or integrate later. Actively maintained (v2.8.0, June 2026).

**Cons:** Framework lock-in. Local-auth passwords are HMAC-SHA256 rather
than argon2 (acceptable for LAN plus tailnet, not for direct internet
exposure). Bundle loading with pnpm workspaces and Vite builds needs
validating. Testing extensions needs a NodeCG API test double.

### Option B: Evolve the current custom stack

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low to start, grows over time as we re-implement framework features. |
| Cost | Free. Three containers or processes on the laptop. |
| Scalability | Adequate. |
| Team familiarity | Highest. It's our code. |

**Pros:** No migration. Strong existing tests. argon2 auth already in
place. We could add adapters and layouts to it.

**Cons:** We keep owning sync, persistence, auth, and a console that
NodeCG already provides. Two runtimes (Node + Python) and three services on
a venue laptop. Every flexibility feature (layouts, scenes, plugins) gets
designed from scratch, without the conventions a framework would supply.

### Option C: Keep Python as a separate scraper service under NodeCG

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium. Two runtimes and an HTTP boundary to secure. |
| Cost | Same hardware. Extra process to supervise. |
| Scalability | n/a |
| Team familiarity | Keeps the existing Python as-is. |

**Pros:** No port of the scraper.
**Cons:** The scraper's logic is about 150 lines, and each piece
(tenacity, BeautifulSoup, pydantic) has a direct TS equivalent (a retry
helper, cheerio with the same selectors, zod). Keeping Python adds a
runtime and a process for little gain. **Resolution:** port to TS, but
keep the door open through `source-external`, so any external process can
still feed the core.

## Trade-off Analysis

The deciding factor is that our **deployment model is NodeCG's core use
case**: one machine holds state, drives a display, and serves an operator
dashboard to other devices. Option B keeps the code we know, but obliges us
to keep re-building framework features as we add flexibility. The main
thing we give up is argon2-grade password storage. Given a LAN and tailnet
deployment with nothing internet-facing, that's an acceptable trade, and
it's documented so we revisit it if exposure changes.

The flexibility goals (pluggable sources, many layouts, future stream
output) are mostly *our* design: the adapter contract, core-owned state,
and schema-driven layouts. NodeCG makes them cheaper by giving us bundle
boundaries, synced state, and a dashboard host. It doesn't do them for us.

## Consequences

**Easier**
- Adding a data source: a new adapter bundle, with no core or layout
  changes.
- Adding a look or scene: layout data plus, at most, new components.
- Supporting non-32auctions events from day one (`source-manual`).
- Running at the venue: one process, state survives reboots, backup is
  copying NodeCG's `db/` directory.
- Keeping production isolated from everyday use: the whole stack lives in
  one WSL distro that can be exported (`wsl --export`), restored, or
  removed as a unit.
- A future stream/OBS output, which is another layout bundle.

**Harder**
- Contributors must learn NodeCG conventions.
- Testing extensions needs a NodeCG API double, plus fixture-driven
  adapter tests.
- Data migration from the current SQLite schema needs a one-time import
  script, if any live data is worth keeping.
- The firewall needs rules at both the Windows and Hyper-V layers, and
  NodeCG's lifetime depends on WSL keeping the distro running. These are
  more moving parts to document and verify than a single native service.

**Revisit**
- Auth strength if the admin ever becomes internet-facing (move to an
  OAuth provider or an authenticating proxy).
- Rive as an optional renderer for designer-authored animations
  (celebrations, info bar). It's out of scope for v1, but components should
  not preclude it.
- A stream layout bundle when there's demand.

## Risks to retire in the spike (Phase 1)

1. **Native module on linux-arm64:** NodeCG's SQLite persistence needs a
   native module. Confirm it installs in WSL Ubuntu on aarch64 with
   prebuilt binaries, or document the `build-essential` requirement. The
   distro currently has no `gcc` or `make`.
2. **pnpm + NodeCG:** bundles load from workspace packages via
   `bundles.paths`, and symlinked deps resolve correctly.
3. **Vite + React** graphics and dashboard panels build and hot-reload
   inside NodeCG, from the WSL filesystem.
4. **Mirrored networking:** the dashboard is reachable from a *second
   device* on the LAN at the laptop's IP, with the firewall rules in
   place.
5. **Stays up:** after opening WSL once, NodeCG keeps running (under
   systemd) after every WSL terminal is closed, and is still answering
   minutes later, which shows WSL doesn't idle-stop the distro.
6. **Kiosk browser** (Edge or Chrome, native arm64) shows the keyed URL
   full-screen when opened by hand.

## Spike findings (2026-10-10)

The scaffold is on branch `nodecg-spike`: `bundles/spike-core` (state +
source registry + dashboard panel), `bundles/spike-source` (fake source),
`bundles/spike-kiosk` (graphic), `packages/nodecg-react`, and a shared
`scripts/build-bundle.mjs`.

| Risk | Result |
|------|--------|
| 1. Native module on linux-arm64 | **Retired.** NodeCG 2.8.0's `better-sqlite3@12` installs as a native aarch64 binary on Node 24.21. (The legacy `apps/api`'s `better-sqlite3@11` compiles from source, so `build-essential` stays a documented prerequisite.) |
| 2. pnpm + NodeCG | **Retired, with a caveat.** NodeCG runs as a dependency with the repo root as its runtime root (it prints "experimental"). It loads `bundles/*` automatically, without needing `bundles.paths`. Cross-bundle extension APIs (`nodecg.extensions[...]`), `bundleDependencies` ordering, and cross-namespace Replicant reads all work. pnpm 11 blocks native install scripts by default, so `allowBuilds` must list `better-sqlite3` and `msgpackr-extract`. |
| 3. Vite + React | **Partially retired.** Graphics and panels build with Vite into `graphics/` and `dashboard/`, and extensions with esbuild into CJS. zod schemas generate the Replicant JSON Schemas NodeCG validates against. `--watch` rebuilds, but NodeCG has no HMR, so this needs a browser refresh, or an extension restart for extension changes. True HMR (e.g. a Vite dev-server plugin) is a follow-up. |
| 4. Mirrored networking | **Open.** It's blocked by the Hyper-V firewall (`DefaultInboundAction: Block` for the WSL VM). The Wi-Fi profile is Public, too. `infra/windows/setup-firewall.ps1` (admin) adds the rules. Verify from a second device. |
| 5. Stays up | **Open, and the risk is confirmed.** Processes started from a `wsl.exe` session die when it exits, so NodeCG must run under systemd (`infra/wsl/install-service.sh`). Still to verify: whether it survives all WSL terminals closing. If not, fix the idle timeout in `.wslconfig`. |
| 6. Kiosk browser | **Open.** It's opened by hand. Verify the keyed URL full-screen in Edge. |

**New finding: one failed local login demotes the user.** NodeCG's local
strategy upserts the user on *every* attempt, and a wrong password saves it
with an empty role list. One wrong password for `admin` removes superuser,
until the next correct login. The keyed kiosk URL is tied to that user, so
anyone who can reach `/login` can blank the venue TV. Verified: the keyed
graphic went from HTTP 200 to 302 after a single bad attempt. **Fixed
locally** with `patches/nodecg@2.8.0.patch` (via pnpm `patchedDependencies`):
a failed attempt now returns no user and never touches the database.
Verified against the running service: after a wrong password, admin stays
superuser and the keyed graphic still returns 200. An unknown username
creates no user row. The
patch is pinned to 2.8.0, so a NodeCG upgrade fails to install until the
patch is re-checked against the new version. That's intentional. Not yet
reported upstream. Keeping `/login` reachable only from the LAN or tailnet
still limits who can try.

**Smaller notes:**
- Under mirrored networking, a connection to a closed loopback port can
  hang instead of being refused, so health checks need timeouts.
- NodeCG binds IPv4 only (`0.0.0.0`), and Windows resolves `localhost` to
  `::1` first, which hangs. Kiosk URLs use `127.0.0.1`. Windows can't
  reach WSL through its *own* LAN IP without `hostAddressLoopback`; that
  doesn't affect other devices.
- `setup-firewall.ps1`'s Hyper-V rule landed with `VMCreatorId: Any`
  rather than WSL's ID. It works, but is broader than intended. Revisit.
- `wsl.exe` argument passing mangles quoting and strips characters such as
  CR, so non-trivial commands should run from script files.
- Turborepo sends anonymous telemetry by default
  (`TURBO_TELEMETRY_DISABLED=1` to opt out). NodeCG's dashboard pulls in a
  Vaadin usage-statistics package, whose install script is blocked in
  `allowBuilds`.

## Phase 2 notes (2026-10-10)

`bundles/fundraiser-core` replaces `spike-core`. `spike-source` and
`spike-kiosk` now run against it, until Phases 3 and 4 replace them.

- **Schemas:** the domain schemas live in `@32dashboards/schema/core`, a
  subpath export kept separate from the legacy schemas `apps/*` still use.
  The bundle re-exports them under their Replicant names, and the build
  generates the JSON Schemas NodeCG validates against.
- **Replicants:**
  - `events` (persisted): every event. Each event holds its own
    adjustment, filters, and `source.adapterId`.
  - `activeEventId` (persisted): the event on screen, if any.
  - `sourceResults` (persisted): the latest raw result per event.
  - `sources` (not persisted): adapters registered this run.
  - `liveState` (derived, not persisted): what graphics render. It holds
    the active event, its adjusted total, and the filtered items. The core
    recomputes it on every change to the persisted Replicants, including
    direct edits.
- **Messages:** `createEvent`, `updateEvent`, `duplicateEvent`,
  `deleteEvent`, `activateEvent`, `setAdjustment`, `nudgeAdjustment`, and
  `setFilters`. Each payload is zod-validated, and the ack returns the
  result or a readable error. Commands that change an event name it
  explicitly, so a click can't land on an event switched in meanwhile.
- **Source results** are stored on the event they name. They're dropped if
  the event doesn't exist, if the event isn't configured for that source,
  or if they're older than the stored result. An event with no source
  takes no results, which is the hook for `source-manual`.
- **Secrets stay out of core Replicants.** Any graphic can read them, so
  adapter settings and credentials belong to the adapter bundle (Phase 3).
- **Duplicate** copies an event's setup (look, sponsors, incentives,
  announcements, filters, source) with fresh ids. It resets the
  adjustment, the Ask Me total, and incentive progress.
- **Panels:** `Events` and `Live total` are interim operator panels, to be
  replaced by Phase 5's redesign.
- **Not done yet:** the environment-check script from Phase 1 still needs
  to cover the firewall and mirrored networking. Change detection for
  donation moments is Phase 3.

## Phase 3 notes (2026-10-10)

- **`packages/source-sdk`** is the adapter contract. It holds:
  - The core API types `FundraiserCoreApi` and `SourceHandle`. The core
    implements them, and adapters write core state only through a handle.
  - `createPollingSource`: polls the active event while that event names
    the source. It runs one cycle at a time, and switching events or
    editing settings aborts the cycle in flight. Each result carries the
    event id captured when its cycle started.
  - `createEventSettings`: per-event settings in a `configs` Replicant.
    They're copied when an event is duplicated and dropped when it's
    deleted.
  - A `SecretStore` and fetch/retry and money-parsing helpers.
  - A fake core for adapter tests.
- **Secrets** (session cookies, push-token hashes) live in owner-only files
  under `db/source-secrets/`, never in Replicants. Panels see only which
  keys are set. They're backed up with the rest of `db/`.
- **Core additions:**
  - Each registered source has a status, shown in a `sources` Replicant.
  - A shared `sourceLog` Replicant collects adapter log lines.
  - A `refreshSource` Message triggers an immediate fetch.
  - **Donation moments:** comparing each stored result with the previous
    one for the active event yields `total-increase` and `new-bid`
    moments, sent as the `donationMoment` Message and kept in `moments`.
    The first result for an event is a baseline, not a donation. Hidden
    items are never celebrated, and new-bid moments are capped per result.
- **`source-32auctions`:** a TypeScript port of the scraper, using cheerio
  with the legacy selectors. Its tests reuse the legacy HTML fixtures and
  assertions. Changes from the legacy scraper:
  - Item ids come from the item links.
  - Image URLs are absolute.
  - A missing or unreadable total fails the cycle instead of reporting $0.
  - Retry and timeouts follow the legacy tenacity policy.

  `cfg/source-32auctions.json` `baseUrl` points it at a local copy for
  testing.
- **`source-manual`:** totals and items entered by hand. Each edit is
  reported as a normal result, so adjustment, filters, and moments behave
  the same as for scraped data. Entries aren't copied on duplicate,
  because they record how an event went.
- **`source-external`:** `POST /source-external/results` with a bearer
  token, in the same normalized shape. The token is shown once, and only
  its SHA-256 hash is stored. The route sits outside NodeCG's login, so
  the token is its only gate. Bodies are capped at 100 kB by NodeCG's JSON
  parser. Responses: 401 for a bad token, 400 for invalid input, 404 for
  an unknown event, 409 for wrong-source or stale results.
- `spike-source` is removed. `spike-kiosk` stays until Phase 4.

## Phase 4 notes (2026-10-10)

- **Scenes are show state, owned by the core.** The persisted `scene`
  Replicant holds one of `main`, `intermission`, `askMe` or
  `celebration`, plus an optional intermission countdown and message. The
  `switchScene` Message changes it. Each output maps scenes to its own
  layouts, so a future stream bundle reuses the same scenes and Messages.
  `askMe.enabled` is no longer what puts Ask Me on screen; the scene is.
- **Show content per event:** milestones, bid wars (option totals kept by
  operators, adjusted with `nudgeBidWar`), prizes, a call to action, and
  info bar config (which segment kinds, in what order, for how long).
  Duplicating an event resets bid war totals. Events stored by earlier
  versions are upgraded with defaults at startup.
- **Threshold moments:** `milestone` and `incentive-met` moments are
  detected in the core whenever the *displayed* total crosses a threshold
  on the same event. So adjustments count, and a restart, a kiosk reload,
  or an event switch never re-celebrates.
- **`packages/layout-engine`:**
  - A layout is data: a fixed-size stage (1920x1080 by default) with a
    CSS grid whose named areas map to registered components and their
    size variants, plus full-stage overlays.
  - Components declare their data dependency as a `select` function.
  - `validateLayout` checks a layout against a registry.
  - Each slot sits behind an error boundary, so one failing component
    can't blank the screen.
  - The stage scales to fit any screen.
- **`incentive-machine` `infoBarMachine`:** an XState sequencer that
  rotates segments by key, holds a pinned segment, and plays queued
  celebrations one at a time without cutting any short. A data update
  keeps the rotation's place and timer. The legacy `incentiveMachine`
  stays for `apps/display` until that app is retired.
- **`bundles/layout-kiosk`** (replaces `spike-kiosk`):
  - One layout per scene, plus `standby` for when no event is on screen.
    The total is the hero element.
  - The info bar has one segment per incentive, bid war, prize,
    announcement, and sponsor, plus the item marquee and the call to
    action.
  - Milestones and met incentives interrupt the info bar. New bids and
    donations pop up as toasts.
  - Segment types live in the kiosk's registry in code. Another bundle
    contributing segment types at runtime is left for when a second output
    needs it.
- **Display rules in `packages/ui`:**
  - `formatTotal` shows whole dollars, rounded down. `formatAmount`
    rounds.
  - Every number uses tabular figures (`.num`, and on `body`).
  - Operator- and source-supplied text is clamped, with the full text in
    `title`.
  - Worst-case fixtures (a 25-character name, a 200-character title, an
    eight-digit total) are rendered in tests for every component that
    shows such text, and in a smoke test of every kiosk scene.
  - `validateTheme` checks WCAG contrast: 4.5:1 for body text, 3:1 for
    the accent and secondary colors used as large text. It also warns
    about colors outside the broadcast-legal 16–235 range.
- **Panels (interim):**
  - `Scene`: big scene buttons, and an intermission message and
    countdown.
  - `Show content`: edits the call to action, info bar rotation,
    milestones, incentives, bid wars (with quick +/- buttons), and prizes,
    and shows the theme check.
  - Phase 5 redesigns both for live operation.

## Action Items

1. [ ] **Phase 1 (spike):** NodeCG 2.8 + pnpm workspace + one Vite React
       graphic + one TS extension, running in WSL2 Ubuntu (aarch64) on
       Windows ARM64. Retire the risks above. Add an environment-check
       script that verifies arch, Node, pnpm, systemd, mirrored networking,
       and firewall rules.
2. [ ] **Phase 2 (core):** `fundraiser-core` Replicants generated from zod.
       Many events with one active, plus duplicate-event. Adjustment and
       filters in core. Operator Messages.
3. [ ] **Phase 3 (sources):** `source-sdk` contract. Port 32auctions to
       TS, reusing the existing HTML fixtures and integrity checks.
       `source-manual`. `source-external`. Change detection for donation
       moments.
4. [ ] **Phase 4 (layouts):** `layout-engine` and `layout-kiosk` scenes
       (main, intermission, Ask Me, celebration). Info-bar segments. Bid
       wars, milestones, prizes in `incentive-machine` and UI. Display rules
       and worst-case-string tests in `packages/ui`.
5. [ ] **Phase 5 (dashboard + venue ops):** operator panels designed for
       live use. Asset uploads for logos. Venue setup: a systemd unit and
       firewall rules as scripts, plus a runbook (including opening the
       kiosk URL full-screen). Backup/restore (NodeCG `db/` and
       `wsl --export`). Native and Docker fallbacks documented.
6. [ ] **Retire** `apps/api`, `apps/scraper`, `apps/admin`, `apps/display`
       once parity is reached. Git history preserves them.
7. [x] **Adjustment not reaching displays:** deferred to the rebuild and
       fixed in `fundraiser-core` (Phase 2). The core adds the adjustment
       into the derived `liveState` that graphics read. The legacy stack
       is not patched.
