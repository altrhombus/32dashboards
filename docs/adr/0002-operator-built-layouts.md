# ADR-0002: Operator-built layouts and named screens

**Status:** Accepted (2026-10-19)
**Date:** 2026-10-19
**Deciders:** altrhombus (project owner)

## Context

ADR-0001 made layouts data: a layout is a CSS grid on a fixed 1920x1080
stage whose named areas are filled by registered components
(`packages/layout-engine`). But that data lives in code
(`bundles/layout-kiosk/src/layouts.ts`), so changing what a screen shows
still means editing TypeScript and rebuilding. Every screen also shows the
same layout for a scene. The kiosk's heartbeat carries a random
`instanceId` per page load, so the system can count screens but can't tell
them apart.

What we learned while preparing the UX design session (2026-10-19):

- **The show runner should be able to build screens to their liking.**
  Each part of a screen (total, featured items, countdown, sponsors, info
  bar, ...) is a reusable component. A runner arranges them into the
  screens they want.
- **The runner may not be a developer.** Today one volunteer runs the
  night, but the system should be friendly enough for others.
- **Two large screens are on all evening**, and a third screen in another
  room is possible. The screens may want different layouts.
- **Each event brings its own brand.** Layouts must work with any event's
  colors, logos and fonts.
- **Mid-show work happens on a phone.** Building layouts doesn't have to,
  but choosing between them should.

The rules from ADR-0001 still hold:

- The total is the top of the information hierarchy.
- Text must be readable from across a room.
- One failing component must never blank a screen.
- Worst-case content (long names, eight-digit totals) must survive.

A builder that lets a volunteer break these rules undoes the work that
went into them.

## Decision

Layouts and screens become operator-edited data, stored in Replicants and
edited in a builder on the dashboard. The renderer (`LayoutRenderer`,
`LayoutDefinition`) doesn't change. The builder produces the same layout
definitions the code does today.

### Shape

```
            catalog (names, sizes, settings: plain data, no React)
              │                 │                     │
     builder panel       layout-kiosk extension   kiosk registry
   (drag, resize, set)   (validate, store)        (render)
              │                 │                     │
              └──────▶  Replicant `layouts`  ◀────────┘
                        Replicant `screens`  ──▶ kiosk?screen=lobby
```

### Key mechanics

- **A component catalog, separate from the React components.** Each
  component the kiosk can place gets an entry with:
  - a display name and a one-line description;
  - a category (money, items, show, brand);
  - its variants;
  - for each variant, the smallest size it's readable at on the stage,
    in design pixels;
  - whether it can repeat on one layout;
  - a zod schema for its settings (today's slot `options`, such as
    featured items' title and count).

  The catalog is plain data, so the extension (validation), the builder
  (palette and settings forms) and the registry (rendering) all import
  it. `defineComponent` checks that every registry entry has a catalog
  entry, and the reverse.
- **Layouts as blocks on a snap grid.** The builder edits a block layout:
  - a list of `{ component, variant, settings, x, y, w, h }` on a
    24 x 24 grid, so a cell is 80 x 45 design pixels;
  - full-stage overlays (thank-you toasts) as on/off switches.

  A pure `compileBlocks()` turns it into today's `LayoutDefinition`, with
  `grid-template-areas` and `repeat(24, 1fr)` tracks, so the renderer and
  `validateLayout` don't change. The built-in layouts are rewritten as
  block layouts too, so a runner can copy and edit them. Fixed-pixel
  tracks (the 88 px header, the 520 px side column) round to the nearest
  cell.
- **`layouts` Replicant (persisted, owned by layout-kiosk):**
  - each layout has an id, a name, and the scene it was made for (a hint,
    not a restriction);
  - a `published` block layout, an optional `draft`, and an `updatedAt`;
  - built-ins have `builtIn: true` and can be copied but not edited or
    deleted.

  Edits go to `draft`. `publishLayout` validates the draft and swaps it
  in, so a screen never shows a half-built layout.
- **Server-side validation.** The extension checks every saved draft and
  every publish against the catalog:
  - errors block the save: blocks overlapping or leaving the stage,
    unknown components, a block smaller than its variant's minimum, and
    invalid settings;
  - warnings allow it, but the builder and the publish step show them,
    e.g. "This layout has no total" or "The total isn't the largest
    block".

  Messages use `listenForCommand` with zod schemas, like core commands.
- **Named screens.** The kiosk URL gets `?screen=<id>` (`kiosk-url.sh` and
  `open-kiosk.ps1` take a screen name), and the heartbeat carries it, so
  a screen keeps its identity across reloads.
  - The persisted `screens` Replicant lists each screen: id, a name such
    as "Main room left", and a layout for each scene and for standby.
  - A screen that hasn't been set up uses the default screen's layouts.
  - The console's status strip shows each expected screen, so one of two
    going dark turns amber.
- **Never blank.** If a screen's layout is missing or fails validation at
  render time, the kiosk logs it and falls back to the built-in layout for
  that scene. Deleting a layout that a screen uses is refused, with the
  screen named.
- **Layouts don't carry a brand.** Colors, logos and fonts keep coming from
  the active event's theme, so one layout serves every event. The builder's
  preview renders with the active event's theme or with worst-case
  fixtures, using the real kiosk page in an iframe
  (`?preview&layout=<id>&draft`).
- **Building on a laptop or tablet, choosing on the phone.** The builder is
  a fullbleed dashboard panel for wide screens. The Live console gains a
  per-screen layout picker for each scene, so changing what's on a screen
  mid-show is a choice between finished layouts.
- **Drag and resize.** We use `react-grid-layout` (MIT), which already
  handles snapping, collisions and touch, rather than writing our own. Its
  `{ i, x, y, w, h }` items map one-to-one onto blocks.

## Options Considered

### Option A: Block builder compiled to today's layout definitions (chosen)

| Dimension | Assessment |
|-----------|------------|
| Volunteer-friendly | High: drag, resize, pick from a palette |
| Keeps ADR-0001 rules | Yes: minimum sizes and warnings enforced server-side |
| Renderer changes | None |
| Effort | Medium-high |

**Pros:** Full freedom where it's safe. Built-ins become editable starting
points. Second screens and rooms need no code.

**Cons:**
- The snap grid is coarser than hand-written CSS, so the built-ins shift
  slightly when converted.
- It's a new dependency.
- It's the largest UI surface in the project.

### Option B: Fixed templates with swappable slots

Pick a template ("big total with sidebar", "two columns", "full screen"),
then choose which component fills each box.

| Dimension | Assessment |
|-----------|------------|
| Volunteer-friendly | Highest: nothing to drag |
| Freedom | Low: new arrangements need a developer |
| Effort | Low |

**Pros:** Hard to make a bad screen. Works on a phone.

**Cons:** It doesn't meet the request: the runner chooses parts but
doesn't build the screen. Every new arrangement is code again.

We keep this as the builder's starting experience: "New layout" offers
templates, which are just block layouts.

### Option C: Expose the CSS grid directly (tracks and area strings)

| Dimension | Assessment |
|-----------|------------|
| Volunteer-friendly | Low |
| Freedom | Highest |
| Effort | Low-medium |

**Pros:** Pixel-exact. No compile step.

**Cons:** Only a developer can use it. It's easy to make unreadable
screens. That's who edits layouts.ts today, so this adds little.

## Trade-off Analysis

The real tension is freedom against a bad night: an unreadable screen, a
missing total, or a blank TV. Option A takes freedom with guardrails
enforced on the server, not just in the UI:

- minimum sizes;
- warnings for the hierarchy;
- draft and publish;
- falling back to a built-in layout.

Option B's safety comes from offering templates first. Option C's
precision is the only thing given up. A 24-cell grid should be precise
enough for a 1080p TV seen from across a room; converting the built-in
layouts in step 1 tests that.

## Consequences

- **Easier:**
  - new looks, second screens and other rooms without code;
  - showing different things on the two screens;
  - per-screen status in the console;
  - a stream output later reuses the catalog and the builder.
- **Harder:**
  - catalog entries must be maintained alongside components;
  - built-in layouts must be migrated to blocks;
  - tests must cover `compileBlocks` and the validation rules.
- **Revisit:**
  - **Per-event layout overrides.** Layouts are global for now, so an
    event that wants its own arrangement needs this.
  - **Info bar segment types and moment styles.** Making these
    operator-editable could use the same catalog pattern.
  - **Fonts.** Bundling fonts so the kiosk works offline is separate
    work, but the builder's preview depends on it to be accurate.

## Implementation plan

Each step ships on its own and is useful without the next.

1. **Saved layouts and named screens** (no builder UI):
   - add the catalog, the block format and `compileBlocks`;
   - rewrite the built-ins as blocks;
   - add the `layouts` and `screens` Replicants and the never-blank
     fallback;
   - add `?screen=` to the kiosk, `kiosk-url.sh` and `open-kiosk.ps1`;
   - make the console's status strip per screen;
   - add a simple "Screens" panel that names screens and picks a layout
     for each scene.

   Outcome: two screens can show different built-in layouts.
2. **The builder:**
   - a fullbleed panel with a palette from the catalog, a 24 x 24 canvas,
     drag and resize, minimum sizes, and warnings;
   - a live preview iframe;
   - copy, rename, draft, publish and delete;
   - templates for "New layout".
3. **Settings and polish:**
   - settings forms generated from each catalog entry's zod schema;
   - a variant picker;
   - overlay switches;
   - per-screen layout pickers in the Live console;
   - keyboard moves and resizes for blocks.

## Step 1 notes (2026-10-19)

What step 1 built, and where it differs from the decision above.

- **`packages/layout-engine`:**
  - `blocks.ts` adds the block layout schema, `compileBlocks`,
    `validateBlocks`, `normalizeBlocks`, and the `Catalog` type.
  - The new `@32dashboards/layout-engine/data` entry point leaves out
    React, so the extension and the schema build can import it.
  - The grid's gap and padding are layout settings, 20 px and 24 px by
    default. The cells shrink to fit them, so a block's size in pixels
    depends on both (`blockSize`).
  - The renderer is unchanged.
- **The catalog** (`bundles/layout-kiosk/src/catalog.ts`) lists the 13
  components with their names, sizes, readable minimums and settings. A
  test keeps it and the registry in step, rather than `defineComponent`
  checking it.
- **Built-in layouts stay in code**, rewritten as block layouts, rather
  than stored in the `layouts` Replicant with `builtIn: true`.
  - Their ids are `builtin:<scene>`.
  - Copying one stores an ordinary saved layout.
  - This way a code change to a built-in reaches every install without a
    data migration.
  - Converting them to the snap grid moved some blocks by a few pixels:
    the header is 68 px tall instead of 88 px, the total 243 px instead
    of 230 px, and the info bar 111 px instead of 128 px.
- **The "total isn't the largest block" warning was dropped.** On the
  main layout, featured items rightly cover more of the screen than the
  total does. The rule is about the biggest *text*, which block sizes
  can't measure. The "nothing shows the total" warning stays, for the
  main, intermission and celebration scenes.
- **`layouts` Replicant and Messages** (layout-kiosk):
  - `copyLayout`, `renameLayout`, `saveLayoutDraft`, `publishLayout`,
    `discardLayoutDraft` and `deleteLayout`, all validated on the
    server.
  - The builder (step 2) will use the draft and publish Messages; the
    panel doesn't use them yet.
- **Screens belong to fundraiser-core:**
  - The `screens` Replicant and the `saveScreen` and `deleteScreen`
    Messages are owned by the core, not the kiosk.
  - The heartbeat's `screenId` lands in `outputs`.
  - `screenPresence()` in `@32dashboards/schema/core` matches the two
    for the Live console and the panel.
  - Layout ids are opaque to the core, so a stream output could keep its
    own layouts under the same screens.
- **No default screen.** A kiosk opened without `?screen=`, or with an id
  nobody set up, shows the built-in layouts. The panel lists it as
  unnamed, with a button to set it up.
- **"Screens and layouts" panel** (layout-kiosk) can:
  - add, rename and remove screens;
  - choose a layout for each scene;
  - show whether each screen is connected;
  - copy, rename and delete layouts.

  Its two-tap `ConfirmButton` moved from the Live console to
  `@32dashboards/nodecg-react`.
- **The Live console's status strip** names a missing screen
  ("Main room left not connected"), or counts them ("1 of 2 screens
  connected").
- **Scripts:**
  - `kiosk-url.sh [screen-id]`.
  - `open-kiosk.ps1 -Screen <id> [-Position x,y]`, with one Edge profile
    per screen so two kiosks can run on one laptop.
  - Opening two kiosks on two displays from one laptop hasn't been tried
    on site yet.

- **Found while testing on the service:**
  - **Parts don't grow with their block.** The text inside each part has
    a fixed size, so a total block made three times taller shows the same
    number with more space around it. For the builder to be worth using,
    parts should scale with their block, for example with CSS container
    query units, between their minimum and a cap. This belongs in step 2.
  - **The Live console's preview isn't any particular screen.** It shows
    the built-in layouts. It should follow one screen, or let you pick
    which; that's for the design session.

## Steps 2 and 3 notes (2026-10-20)

What was built in steps 2 and 3, and where it differs from the plan.

- **Content scales with its block.**
  - Each catalog size has a `reference` (the block size its text is designed
    for; the built-in Main layout's blocks) and a `maxScale`.
  - The renderer measures each slot and applies CSS `zoom` with
    `contentScale()`: the smaller of the width and height ratios, clamped
    between 0.6 and `maxScale`. Unlike a transform, `zoom` scales the
    content while it still lays out to fill the block.
  - The full-screen scenes keep a cap of 1.
  - Per-component TV-size CSS is now keyed on `data-component`, not the
    grid area name.
- **The Layouts tab** (fullbleed panel `builder` in layout-kiosk):
  - **Palette:** the catalog's components, grouped. Each is added where it
    fits: at its reference size, else at its minimum, else "no room".
  - **Canvas:** the real kiosk in an iframe
    (`?preview&layout=<id>&view=<scene>&draft&sample=demo|worst`), under
    a react-grid-layout 2.2.4 grid that blocks collisions, caps the grid
    at 24 rows, and won't shrink a block below its readable size.
  - **Inspector:** the selected block's size on the TV and its text
    scale, its style (size variant), and its settings. A form is generated
    from the catalog's settings schema for text, whole-number and on/off
    fields. With nothing selected, it shows the gap, the padding, and the
    thank-you pop-ups switch.
  - **Problems:** errors and warnings appear as you edit. Edits save as a
    draft 0.6 s after each change if there are no errors; Publish is
    enabled once the draft is saved and error-free.
  - **Undo and redo:** up to 50 steps.
  - **Keyboard:** arrows move the selected block, Shift+arrows resize it,
    Delete removes it, Ctrl+Z and Ctrl+Y undo and redo.
  - **Built-in layouts** open read-only, with "Copy to change it".
  - **New layout:** a name, a scene, and a starting point: the Blank, Big
    total or Total and items template, or that scene's built-in layout.
    `copyLayout` takes `template:<id>` and an optional `view`.
- **Preview data:** "the event on screen", "a sample show", or "the
  longest text" (`src/samples.ts`; the kiosk tests use the same worst-case
  data). Samples wear the on-screen event's theme when there is one.
  Preview-only URL options are ignored without `?preview`, so a TV can't
  get stuck on a draft.
- **The Live console:**
  - "On each screen now" changes a named screen's layout for what's on
    air, among finished layouts, with Undo.
  - "Preview shows" makes the preview follow one named screen.
  - The console reads layout-kiosk's `layouts` Replicant by name and only
    needs ids, names and scenes, so the core still doesn't depend on that
    bundle.
- **Screens and layouts panel:** "Edit" and "View" open a layout in the
  Layouts tab.
- **Fixed along the way:** step 1 had dropped the built-in layouts' card
  headings, because their blocks weren't filled with the catalog's
  defaults. Built-ins and templates are now normalized when they're
  defined, and a test covers it.
- **Not done:**
  - dragging from the palette onto the canvas (click to add instead);
  - editing several layouts at once in one tab;
  - noticing edits made to the same layout in another tab, which the
    server's copy only replaces when you have nothing unsaved.

## Event look notes (2026-10-20)

The look stays with the event, as decided above, but it's now edited in
the Layouts tab beside the same live preview.

- **"Event look" mode in the Layouts tab** edits one event's theme:
  - starting palettes (`PALETTES` in `@32dashboards/ui`, each tested
    against `validateTheme`);
  - the four colors, with each one's contrast or broadcast-safe warning
    shown under it;
  - the logo, from the event-logos assets;
  - the word and number fonts.

  The preview shows any scene; it uses the event's real content when the
  event is on screen, and the sample show otherwise. Unsaved changes are
  posted to the preview iframe (`PREVIEW_THEME_MESSAGE`, preview only).
  Saving uses `updateEvent`.
- **The Show content panel** summarizes the look and links to it. It no
  longer edits colors or the logo itself, so there's one place to change
  them.
- **Fonts ship with the kiosk:** five word fonts and three number fonts
  from Fontsource (OFL), latin only, about 1.2 MB in all. A font name
  that isn't bundled still works, falling back to a system font, and the
  editor says so.
- **Fixed:** the event's word font never reached the TV. `body` resolved
  `--font-display` at `:root`, before the theme overrode it, so only
  components that ask for the number font directly got the theme's
  choice. `ThemeProvider` now sets `font-family` itself.
- **New events start broadcast-safe:** the default accent is `#ebc81e`
  instead of `#ffd700`. Events already saved keep their colors.
- **Not done:** per-layout looks (a lobby screen with its own
  background), left for the design session.

## Questions for the design session

- Which components are missing from the catalog? For example: a QR code
  to give, a "recent bids" list, a big clock, a single item spotlight, or
  free text or an image.
- Is 24 x 24 the right grid, or is something coarser easier to use?
- Should the two room screens show the same thing by default?
- Should a runner be able to break the "total is the largest" rule after a
  warning, or never?
- Do layouts belong to the system (shared by every event), to an event, or
  to both?
