#!/usr/bin/env node
// Sets up, or removes, a realistic demo show on the running NodeCG service:
// an event with items, venue cash, $1,000 milestones, an incentive, a bid
// war, a prize, sponsors with logos, a look, and a layout for a second
// screen. For walkthroughs, design sessions, and training volunteers.
//
//   pnpm demo            set it up (refused if it already exists)
//   pnpm demo --reset    remove it, then set it up again
//   pnpm demo --remove   remove it
//
// With `--auction <public path> <org id> <auction id>` (e.g. --auction
// SpringGala2025 12345 67890), the items, photos and bids come from that
// 32auctions auction instead of made-up ones. Its total is never shown: the
// demo's total is venue cash only, so a past auction's result stays private.
//
// Everything it makes is named "Demo: …" or "demo-…", and only those are
// removed. Named screens are created only when there are none, and are kept
// on removal (they point back at the built-in layouts). Log in to the
// dashboard once first; the script uses the admin user's key, like
// kiosk-url.sh.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVENT_NAME = "Demo: Spring Gala 2026";
const LAYOUT_NAME = "Demo: Big total";
const ASSET_DIR = path.join(ROOT, "scripts", "demo");
const argv = process.argv.slice(2);
const args = new Set(argv);
const auctionAt = argv.indexOf("--auction");
const auction =
  auctionAt === -1
    ? null
    : { friendlyAuctionPath: argv[auctionAt + 1], orgId: argv[auctionAt + 2], auctionId: argv[auctionAt + 3] };
if (auction && !(auction.friendlyAuctionPath && auction.orgId && auction.auctionId)) {
  console.error("Usage: pnpm demo --auction <public path> <org id> <auction id>");
  process.exit(2);
}

function adminKey() {
  try {
    return execFileSync(
      "sqlite3",
      [
        path.join(ROOT, "db", "nodecg.sqlite3"),
        "select k.secret_key from api_key k join user u on u.id = k.userId where u.name = 'admin' limit 1;",
      ],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return "";
  }
}

function port() {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, "cfg", "nodecg.json"), "utf8")).port ?? 9090;
  } catch {
    return 9090;
  }
}

const KEY = adminKey();
if (!KEY) {
  console.error("No API key for admin yet: log in to the dashboard once, then re-run.");
  process.exit(1);
}
// 127.0.0.1, not localhost: under WSL mirrored networking ::1 hangs.
const HOST = `http://127.0.0.1:${port()}`;
const socket = io(HOST, { query: { token: KEY }, transports: ["websocket"], reconnection: false });
await new Promise((resolve, reject) => {
  socket.on("connect", resolve);
  socket.on("connect_error", (err) => reject(new Error(`Can't reach NodeCG at ${HOST}: ${err.message}`)));
}).catch((err) => {
  console.error(err.message);
  process.exit(1);
});

const send = (bundleName, messageName, content) =>
  new Promise((resolve, reject) =>
    socket.emit("message", { bundleName, messageName, content }, (err, value) =>
      err ? reject(new Error(`${messageName}: ${err.message ?? JSON.stringify(err)}`)) : resolve(value),
    ),
  );
const core = (name, content) => send("fundraiser-core", name, content);
const read = (name, namespace) =>
  new Promise((resolve) => socket.emit("replicant:read", { name, namespace }, (_err, value) => resolve(value)));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Saturday at 9 p.m. local time, at least a day out, so the countdown has room. */
function nextSaturdayEvening() {
  const date = new Date();
  date.setDate(date.getDate() + ((6 - date.getDay() + 7) % 7 || 7));
  date.setHours(21, 0, 0, 0);
  return date.toISOString();
}

async function remove() {
  const events = (await read("events", "fundraiser-core")) ?? [];
  const demoLayouts = ((await read("layouts", "layout-kiosk")) ?? []).filter((l) => l.name.startsWith("Demo:"));
  const demoIds = new Set(demoLayouts.map((l) => l.id));
  for (const screen of (await read("screens", "fundraiser-core")) ?? []) {
    const layouts = Object.fromEntries(Object.entries(screen.layouts).filter(([, id]) => !demoIds.has(id)));
    if (Object.keys(layouts).length !== Object.keys(screen.layouts).length) {
      await core("saveScreen", { ...screen, layouts });
    }
  }
  for (const layout of demoLayouts) await send("layout-kiosk", "deleteLayout", { layoutId: layout.id });
  const active = await read("activeEventId", "fundraiser-core");
  for (const event of events.filter((e) => e.name === EVENT_NAME)) {
    if (event.id === active) await core("activateEvent", { eventId: null });
    await core("deleteEvent", { eventId: event.id });
  }
  for (const category of ["event-logos", "sponsor-logos"]) {
    const dir = path.join(ROOT, "assets", "fundraiser-core", category);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) if (file.startsWith("demo-")) rmSync(path.join(dir, file));
  }
  console.log(
    `Removed the demo: ${events.filter((e) => e.name === EVENT_NAME).length} event, ${demoLayouts.length} layout, and its logos.`,
  );
}

/** Copies the demo logos into an asset category and waits for NodeCG to list them; returns url by file name. */
async function addLogos(category, files) {
  const dir = path.join(ROOT, "assets", "fundraiser-core", category);
  mkdirSync(dir, { recursive: true });
  for (const file of files) copyFileSync(path.join(ASSET_DIR, file), path.join(dir, file));
  for (let i = 0; i < 40; i++) {
    const assets = (await read(`assets:${category}`, "fundraiser-core")) ?? [];
    const found = Object.fromEntries(
      files.map((file) => [file, assets.find((a) => a.base === file)?.url]).filter(([, url]) => url),
    );
    if (Object.keys(found).length === files.length) return found;
    await sleep(250);
  }
  throw new Error(`NodeCG didn't pick up the ${category} files; check assets/fundraiser-core/${category}.`);
}

async function setUp() {
  const events = (await read("events", "fundraiser-core")) ?? [];
  if (events.some((e) => e.name === EVENT_NAME)) {
    throw new Error(`"${EVENT_NAME}" already exists. Use --reset to start it over, or --remove.`);
  }

  const logos = await addLogos("event-logos", ["demo-spring-gala-logo.svg"]);
  const sponsorLogos = await addLogos("sponsor-logos", [
    "demo-northside-bakery.svg",
    "demo-riverbend-credit-union.svg",
    "demo-harbor-hardware.svg",
  ]);

  const eventId = await core("createEvent", { name: EVENT_NAME, causeName: "Riverside Animal Shelter" });
  const id = () => crypto.randomUUID();
  const milestoneLabels = {
    5000: "A month of food for every dog",
    10000: "New puppy play yard",
    15000: "Vet care for 40 cats",
    20000: "Stretch goal: a transport van",
  };
  await core("updateEvent", {
    eventId,
    patch: {
      endDateTime: nextSaturdayEvening(),
      source: { adapterId: auction ? "32auctions" : "manual" },
      announcements: [
        "Dessert auction opens at 8:00",
        "Silent auction closes at 9:00. Check your bids!",
        "Thank you to our volunteers",
      ],
      callToAction: "Scan the code on your table to bid or give",
      // A celebration every $1,000 (until there's a rule for that).
      milestones: Array.from({ length: 20 }, (_, i) => (i + 1) * 1000).map((amount) => ({
        id: id(),
        amount,
        label: milestoneLabels[amount] ?? "",
      })),
      incentives: [{ id: id(), name: "Fund the new cat wing", target: 15000, active: true }],
      bidWars: [
        {
          id: id(),
          name: "Name the shelter's new kitten",
          options: [
            { id: id(), name: "Biscuit", total: 340 },
            { id: id(), name: "Pepper", total: 280 },
            { id: id(), name: "Mochi", total: 150 },
          ],
        },
      ],
      prizes: [
        {
          id: id(),
          name: "Weekend at the lake cabin",
          description: "Two nights for four, drawn at 9:15",
          minimumDonation: 50,
        },
      ],
      sponsors: [
        { id: id(), name: "Northside Bakery", logoUrl: sponsorLogos["demo-northside-bakery.svg"], sortOrder: 0 },
        {
          id: id(),
          name: "Riverbend Credit Union",
          logoUrl: sponsorLogos["demo-riverbend-credit-union.svg"],
          sortOrder: 1,
        },
        { id: id(), name: "Harbor Hardware", logoUrl: sponsorLogos["demo-harbor-hardware.svg"], sortOrder: 2 },
      ],
      askMe: {
        title: "Fund a kennel",
        message: "Every **$250** builds one new kennel.\n\nRaise your paddle!",
        total: 0,
      },
      theme: {
        // The "Forest" palette, which passes the contrast and broadcast-safe checks.
        accentColor: "#a8e063",
        secondaryColor: "#e8d27a",
        backgroundFrom: "#13261c",
        backgroundTo: "#1d3b2a",
        logoUrl: logos["demo-spring-gala-logo.svg"],
        fontDisplay: "Atkinson Hyperlegible",
        fontMono: "JetBrains Mono",
      },
    },
  });

  let itemNote;
  if (auction) {
    // A finished auction doesn't change, so check it rarely; never show its total.
    await send("source-32auctions", "setConfig", {
      eventId,
      config: { ...auction, refreshIntervalSeconds: 300, totalFrom: "none" },
    });
    await core("setAdjustment", { eventId, amount: 9630 });
    await core("refreshSource", { eventId }).catch(() => {});
    itemNote = `items, photos and bids from 32auctions.com/${auction.friendlyAuctionPath} (its total isn't shown); $9,630 venue cash`;
  } else {
    // Items and the online total, as if from the auction site.
    const items = [
      ["Weekend at the lake cabin", 420, 900, 4],
      ["Chef's table dinner for six", 340, 900, 2],
      ["Signed print by a local artist", 85, 250, 0],
      ["Season tickets, two seats", 410, 800, 2],
      ["Hot air balloon ride for two", 150, 450, 1],
      ["Pottery class for four", 60, 200, 0],
      ["Golf foursome at Riverside Links", 220, 400, 5],
      ["Wine tasting for ten", 300, 500, 7],
      ["Handmade quilt", 175, 300, 3],
      ["Dog-walking for a month", 90, 240, 1],
      ["Kayak tour for two", 110, 200, 2],
      ["Coffee for a year", 260, 365, 6],
    ];
    for (const [title, currentBid, value, bidCount] of items) {
      await send("source-manual", "upsertItem", {
        eventId,
        item: { title, currentBid, value, bidCount, remaining: "2 hours" },
      });
    }
    await send("source-manual", "setTotal", { eventId, total: 7350 });
    // Cash and checks taken at the venue, so the total sits just under a milestone.
    await core("setAdjustment", { eventId, amount: 2280 });
    itemNote = `${items.length} made-up auction items; $7,350 online plus $2,280 at the venue`;
  }

  const layoutId = await send("layout-kiosk", "copyLayout", {
    fromId: "template:bigTotal",
    name: LAYOUT_NAME,
    view: "main",
  });

  const screens = (await read("screens", "fundraiser-core")) ?? [];
  let screenNote;
  if (screens.length === 0) {
    await core("saveScreen", { id: "main-left", name: "Main room left", layouts: {} });
    await core("saveScreen", { id: "main-right", name: "Main room right", layouts: { main: layoutId } });
    screenNote =
      'Named screens "Main room left" (main-left) and "Main room right" (main-right, with the big-total layout).';
  } else {
    // Screens the demo made before (or ones with the same ids) get the layout back after a reset.
    const right = screens.find((s) => s.id === "main-right");
    if (right && !right.layouts.main) {
      await core("saveScreen", { ...right, layouts: { ...right.layouts, main: layoutId } });
      screenNote = `Kept your named screens; "${right.name}" shows the big-total layout.`;
    } else {
      screenNote = `Kept your ${screens.length} named screen(s); choose "${LAYOUT_NAME}" for one in the Live tab if you like.`;
    }
  }

  const active = await read("activeEventId", "fundraiser-core");
  for (const event of events.filter((e) => e.name === EVENT_NAME)) {
    if (event.id === active) await core("activateEvent", { eventId: null });
    await core("deleteEvent", { eventId: event.id });
  }
  for (const category of ["event-logos", "sponsor-logos"]) {
    const dir = path.join(ROOT, "assets", "fundraiser-core", category);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) if (file.startsWith("demo-")) rmSync(path.join(dir, file));
  }
  console.log(
    `Removed the demo: ${events.filter((e) => e.name === EVENT_NAME).length} event, ${demoLayouts.length} layout, and its logos.`,
  );
}

/** Copies the demo logos into an asset category and waits for NodeCG to list them; returns url by file name. */
async function addLogos(category, files) {
  const dir = path.join(ROOT, "assets", "fundraiser-core", category);
  mkdirSync(dir, { recursive: true });
  for (const file of files) copyFileSync(path.join(ASSET_DIR, file), path.join(dir, file));
  for (let i = 0; i < 40; i++) {
    const assets = (await read(`assets:${category}`, "fundraiser-core")) ?? [];
    const found = Object.fromEntries(
      files.map((file) => [file, assets.find((a) => a.base === file)?.url]).filter(([, url]) => url),
    );
    if (Object.keys(found).length === files.length) return found;
    await sleep(250);
  }
  throw new Error(`NodeCG didn't pick up the ${category} files; check assets/fundraiser-core/${category}.`);
}

async function setUp() {
  const events = (await read("events", "fundraiser-core")) ?? [];
  if (events.some((e) => e.name === EVENT_NAME)) {
    throw new Error(`"${EVENT_NAME}" already exists. Use --reset to start it over, or --remove.`);
  }

  const logos = await addLogos("event-logos", ["demo-spring-gala-logo.svg"]);
  const sponsorLogos = await addLogos("sponsor-logos", [
    "demo-northside-bakery.svg",
    "demo-riverbend-credit-union.svg",
    "demo-harbor-hardware.svg",
  ]);

  const eventId = await core("createEvent", { name: EVENT_NAME, causeName: "Riverside Animal Shelter" });
  const id = () => crypto.randomUUID();
  const milestoneLabels = {
    5000: "A month of food for every dog",
    10000: "New puppy play yard",
    15000: "Vet care for 40 cats",
    20000: "Stretch goal: a transport van",
  };
  await core("updateEvent", {
    eventId,
    patch: {
      endDateTime: nextSaturdayEvening(),
      source: { adapterId: auction ? "32auctions" : "manual" },
      announcements: [
        "Dessert auction opens at 8:00",
        "Silent auction closes at 9:00. Check your bids!",
        "Thank you to our volunteers",
      ],
      callToAction: "Scan the code on your table to bid or give",
      // A celebration every $1,000 (until there's a rule for that).
      milestones: Array.from({ length: 20 }, (_, i) => (i + 1) * 1000).map((amount) => ({
        id: id(),
        amount,
        label: milestoneLabels[amount] ?? "",
      })),
      incentives: [{ id: id(), name: "Fund the new cat wing", target: 15000, active: true }],
      bidWars: [
        {
          id: id(),
          name: "Name the shelter's new kitten",
          options: [
            { id: id(), name: "Biscuit", total: 340 },
            { id: id(), name: "Pepper", total: 280 },
            { id: id(), name: "Mochi", total: 150 },
          ],
        },
      ],
      prizes: [
        {
          id: id(),
          name: "Weekend at the lake cabin",
          description: "Two nights for four, drawn at 9:15",
          minimumDonation: 50,
        },
      ],
      sponsors: [
        { id: id(), name: "Northside Bakery", logoUrl: sponsorLogos["demo-northside-bakery.svg"], sortOrder: 0 },
        {
          id: id(),
          name: "Riverbend Credit Union",
          logoUrl: sponsorLogos["demo-riverbend-credit-union.svg"],
          sortOrder: 1,
        },
        { id: id(), name: "Harbor Hardware", logoUrl: sponsorLogos["demo-harbor-hardware.svg"], sortOrder: 2 },
      ],
      askMe: {
        title: "Fund a kennel",
        message: "Every **$250** builds one new kennel.\n\nRaise your paddle!",
        total: 0,
      },
      theme: {
        // The "Forest" palette, which passes the contrast and broadcast-safe checks.
        accentColor: "#a8e063",
        secondaryColor: "#e8d27a",
        backgroundFrom: "#13261c",
        backgroundTo: "#1d3b2a",
        logoUrl: logos["demo-spring-gala-logo.svg"],
        fontDisplay: "Atkinson Hyperlegible",
        fontMono: "JetBrains Mono",
      },
    },
  });

  let itemNote;
  if (auction) {
    // A finished auction doesn't change, so check it rarely; never show its total.
    await send("source-32auctions", "setConfig", {
      eventId,
      config: { ...auction, refreshIntervalSeconds: 300, totalFrom: "none" },
    });
    await core("setAdjustment", { eventId, amount: 9630 });
    await core("refreshSource", { eventId }).catch(() => {});
    itemNote = `items, photos and bids from 32auctions.com/${auction.friendlyAuctionPath} (its total isn't shown); $9,630 venue cash`;
  } else {
    // Items and the online total, as if from the auction site.
    const items = [
      ["Weekend at the lake cabin", 420, 900, 4],
      ["Chef's table dinner for six", 340, 900, 2],
      ["Signed print by a local artist", 85, 250, 0],
      ["Season tickets, two seats", 410, 800, 2],
      ["Hot air balloon ride for two", 150, 450, 1],
      ["Pottery class for four", 60, 200, 0],
      ["Golf foursome at Riverside Links", 220, 400, 5],
      ["Wine tasting for ten", 300, 500, 7],
      ["Handmade quilt", 175, 300, 3],
      ["Dog-walking for a month", 90, 240, 1],
      ["Kayak tour for two", 110, 200, 2],
      ["Coffee for a year", 260, 365, 6],
    ];
    for (const [title, currentBid, value, bidCount] of items) {
      await send("source-manual", "upsertItem", {
        eventId,
        item: { title, currentBid, value, bidCount, remaining: "2 hours" },
      });
    }
    await send("source-manual", "setTotal", { eventId, total: 7350 });
    // Cash and checks taken at the venue, so the total sits just under a milestone.
    await core("setAdjustment", { eventId, amount: 2280 });
    itemNote = `${items.length} made-up auction items; $7,350 online plus $2,280 at the venue`;
  }

  const layoutId = await send("layout-kiosk", "copyLayout", {
    fromId: "template:bigTotal",
    name: LAYOUT_NAME,
    view: "main",
  });

  const screens = (await read("screens", "fundraiser-core")) ?? [];
  let screenNote;
  if (screens.length === 0) {
    await core("saveScreen", { id: "main-left", name: "Main room left", layouts: {} });
    await core("saveScreen", { id: "main-right", name: "Main room right", layouts: { main: layoutId } });
    screenNote =
      'Named screens "Main room left" (main-left) and "Main room right" (main-right, with the big-total layout).';
  } else {
    screenNote = `Kept your ${screens.length} named screen(s); choose "${LAYOUT_NAME}" for one in the Live tab if you like.`;
  }

  const active = await read("activeEventId", "fundraiser-core");
  if (!active) {
    await core("activateEvent", { eventId });
    await core("switchScene", { id: "main" });
  }

  console.log(`Set up "${EVENT_NAME}":`);
  console.log(`  - ${itemNote}, for $9,630 in all`);
  console.log("  - a milestone every $1,000; one more $370 crosses $10,000 and celebrates");
  console.log("  - an incentive, a bid war, a prize, three sponsors with logos, and Ask Me");
  console.log("  - the Forest look with Atkinson Hyperlegible and JetBrains Mono");
  console.log(`  - ${screenNote}`);
  console.log(
    active ? "  - Another event is on screen, so the demo isn't. Put it on TV in the Live tab." : "  - On screen now.",
  );
  console.log(`Open the TVs with: pnpm -s kiosk-url main-left   (and main-right)`);
  console.log("Remove it with: pnpm demo --remove");
}

try {
  if (args.has("--remove") || args.has("--reset")) await remove();
  if (!args.has("--remove")) await setUp();
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  socket.close();
}
