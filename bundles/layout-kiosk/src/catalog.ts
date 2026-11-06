import { z } from "zod";
import type { Catalog } from "@32dashboards/layout-engine/data";
import { SPONSORS_TITLE } from "@32dashboards/schema/core";

/*
 * What kiosk layouts can place, as plain data: names and descriptions for
 * people, each size's smallest readable size on the 1920x1080 stage, the
 * block size its text is designed for (content scales from there), and the
 * settings each takes. Reference sizes are the built-in Main layout's blocks. The extension validates saved layouts against it; the
 * registry (registry.tsx) renders the same names, and a test keeps the two
 * in step.
 */

/** A card heading; empty hides it. */
const title = (fallback: string) => z.string().trim().max(60).default(fallback);
const none = z.object({}).strict();

/** What a Featured items block shows: both, taking turns, or just one. */
export const ITEM_VIEWS = ["both", "featured", "noBids"] as const;
export type ItemView = (typeof ITEM_VIEWS)[number];

export const kioskCatalog: Catalog = {
  header: {
    name: "Event header",
    description: "The event's name and logo.",
    category: "brand",
    placement: "block",
    variants: { default: { minWidth: 600, minHeight: 60, reference: { height: 68 }, maxScale: 1.6 } },
    repeatable: false,
    settings: none,
  },
  total: {
    name: "Total raised",
    description: "The fundraising total and the cause. Make it the biggest thing on screen.",
    category: "money",
    placement: "block",
    variants: {
      hero: { minWidth: 900, minHeight: 200, reference: { width: 1250, height: 243 }, maxScale: 2.2 },
      compact: { minWidth: 400, minHeight: 100, reference: { width: 400, height: 100 }, maxScale: 2.5 },
    },
    repeatable: false,
    showsTotal: true,
    settings: none,
  },
  featuredItems: {
    name: "Featured items",
    description:
      "Auction items worth a look: valuable items with few bids, taking turns with items that have no bids yet and QR codes to bid. Shows just one of them if you choose.",
    category: "items",
    placement: "block",
    variants: { grid: { minWidth: 600, minHeight: 300, reference: { width: 1320, height: 550 }, maxScale: 1.6 } },
    repeatable: false,
    settings: z
      .object({
        title: title("Featured items"),
        size: z.number().int().min(1).max(12).default(6),
        show: z.enum(ITEM_VIEWS).default("both"),
        featuredSeconds: z.number().int().min(5).max(300).default(30),
        noBidsSeconds: z.number().int().min(5).max(300).default(20),
      })
      .strict(),
  },
  noBidItems: {
    name: "No bids yet",
    description: "A couple of items nobody has bid on yet, large, each with a QR code that opens it.",
    category: "items",
    placement: "block",
    variants: { spotlight: { minWidth: 900, minHeight: 500, reference: { width: 1872, height: 772 }, maxScale: 1.3 } },
    repeatable: false,
    settings: z.object({ size: z.number().int().min(1).max(2).default(2) }).strict(),
  },
  countdown: {
    name: "Time left",
    description: "A countdown to the event's end time.",
    category: "show",
    placement: "block",
    variants: { panel: { minWidth: 300, minHeight: 140, reference: { width: 532, height: 155 }, maxScale: 2.5 } },
    repeatable: false,
    settings: z.object({ title: title("Time left") }).strict(),
  },
  announcements: {
    name: "Announcements",
    description: "The event's announcements, one after another.",
    category: "show",
    placement: "block",
    variants: { list: { minWidth: 400, minHeight: 140, reference: { width: 532, height: 155 }, maxScale: 1.8 } },
    repeatable: false,
    settings: z.object({ title: title("Announcements") }).strict(),
  },
  sponsors: {
    name: "Logos",
    description:
      "The event's logos (sponsors, or the causes it helps), one after another. Unless you set a heading here, it uses the event's.",
    category: "brand",
    placement: "block",
    variants: { carousel: { minWidth: 300, minHeight: 140, reference: { width: 532, height: 199 } } },
    repeatable: true,
    settings: z.object({ title: title(SPONSORS_TITLE) }).strict(),
  },
  infoBar: {
    name: "Info bar",
    description: "Rotates through incentives, bid wars, prizes, items and more, and celebrates milestones.",
    category: "show",
    placement: "block",
    variants: { bar: { minWidth: 1200, minHeight: 100, reference: { height: 111 }, maxScale: 1.6 } },
    repeatable: false,
    settings: none,
  },
  callToAction: {
    name: "Call to action",
    description: "The event's call to action, such as how to give.",
    category: "money",
    placement: "block",
    variants: { banner: { minWidth: 800, minHeight: 80, reference: { width: 1000, height: 80 }, maxScale: 2.5 } },
    repeatable: false,
    settings: none,
  },
  toasts: {
    name: "Thank-you pop-ups",
    description: "Pops up a thank-you when a donation or bid comes in.",
    category: "money",
    placement: "overlay",
    variants: { stack: { minWidth: 0, minHeight: 0 } },
    repeatable: false,
    settings: none,
  },
  milestoneSpotlight: {
    name: "Milestone spotlight",
    description: "Fills the screen for a few seconds when a milestone or goal is reached.",
    category: "money",
    placement: "overlay",
    variants: { full: { minWidth: 0, minHeight: 0 } },
    repeatable: false,
    settings: none,
  },
  milestoneBanner: {
    name: "Milestone banner",
    description:
      "A strip along the top when a milestone is reached or bidding is closing, for scenes that shouldn't be covered.",
    category: "money",
    placement: "overlay",
    variants: { strip: { minWidth: 0, minHeight: 0 } },
    repeatable: false,
    settings: none,
  },
  askMeWrap: {
    name: "Ask Me wrap-up",
    description: "When an Ask Me round finishes, shows what it raised for a few seconds.",
    category: "money",
    placement: "overlay",
    variants: { full: { minWidth: 0, minHeight: 0 } },
    repeatable: false,
    settings: none,
  },
  welcome: {
    name: "Welcome",
    description: "For arrivals: the logo, the event and its cause, a QR code to give, and when bidding closes.",
    category: "scene",
    placement: "block",
    variants: { hero: { minWidth: 1200, minHeight: 500, reference: { width: 1872, height: 900 }, maxScale: 1.3 } },
    repeatable: false,
    settings: none,
  },
  intermission: {
    name: "Intermission message",
    description: "The operator's intermission message and countdown.",
    category: "scene",
    placement: "block",
    variants: { hero: { minWidth: 900, minHeight: 300, reference: { width: 1872, height: 506 }, maxScale: 1.5 } },
    repeatable: false,
    settings: none,
  },
  askMe: {
    name: "Ask Me",
    description: "The Ask Me title, message, and its own running total.",
    category: "scene",
    placement: "block",
    variants: { full: { minWidth: 1600, minHeight: 800, reference: { width: 1920, height: 1080 }, maxScale: 1 } },
    repeatable: false,
    settings: none,
  },
  grandCelebration: {
    name: "Celebration",
    description: "The end-of-night thank-you with the final total.",
    category: "scene",
    placement: "block",
    variants: { full: { minWidth: 1600, minHeight: 800, reference: { width: 1920, height: 1080 }, maxScale: 1 } },
    repeatable: false,
    showsTotal: true,
    settings: none,
  },
  standby: {
    name: "Standby",
    description: "Shown before an event is on screen.",
    category: "scene",
    placement: "block",
    variants: { full: { minWidth: 800, minHeight: 400, reference: { width: 1920, height: 1080 }, maxScale: 1 } },
    repeatable: false,
    settings: none,
  },
};
