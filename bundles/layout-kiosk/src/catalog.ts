import { z } from "zod";
import type { Catalog } from "@32dashboards/layout-engine/data";

/*
 * What kiosk layouts can place, as plain data: names and descriptions for
 * people, each size's smallest readable size on the 1920x1080 stage, and the
 * settings each takes. The extension validates saved layouts against it; the
 * registry (registry.tsx) renders the same names, and a test keeps the two
 * in step.
 */

/** A card heading; empty hides it. */
const title = (fallback: string) => z.string().trim().max(60).default(fallback);
const none = z.object({}).strict();

export const kioskCatalog: Catalog = {
  header: {
    name: "Event header",
    description: "The event's name and logo.",
    category: "brand",
    placement: "block",
    variants: { default: { minWidth: 600, minHeight: 60 } },
    repeatable: false,
    settings: none,
  },
  total: {
    name: "Total raised",
    description: "The fundraising total and the cause. Make it the biggest thing on screen.",
    category: "money",
    placement: "block",
    variants: { hero: { minWidth: 900, minHeight: 200 }, compact: { minWidth: 400, minHeight: 100 } },
    repeatable: false,
    showsTotal: true,
    settings: none,
  },
  featuredItems: {
    name: "Featured items",
    description: "Auction items worth a look: valuable items with few bids.",
    category: "items",
    placement: "block",
    variants: { grid: { minWidth: 600, minHeight: 300 } },
    repeatable: false,
    settings: z.object({ title: title("Featured items"), size: z.number().int().min(1).max(12).default(6) }).strict(),
  },
  countdown: {
    name: "Time left",
    description: "A countdown to the event's end time.",
    category: "show",
    placement: "block",
    variants: { panel: { minWidth: 300, minHeight: 140 } },
    repeatable: false,
    settings: z.object({ title: title("Time left") }).strict(),
  },
  announcements: {
    name: "Announcements",
    description: "The event's announcements, one after another.",
    category: "show",
    placement: "block",
    variants: { list: { minWidth: 400, minHeight: 140 } },
    repeatable: false,
    settings: z.object({ title: title("Announcements") }).strict(),
  },
  sponsors: {
    name: "Sponsors",
    description: "Sponsor logos, one after another.",
    category: "brand",
    placement: "block",
    variants: { carousel: { minWidth: 300, minHeight: 140 } },
    repeatable: true,
    settings: z.object({ title: title("Thank you to our sponsors") }).strict(),
  },
  infoBar: {
    name: "Info bar",
    description: "Rotates through incentives, bid wars, prizes, items and more, and celebrates milestones.",
    category: "show",
    placement: "block",
    variants: { bar: { minWidth: 1200, minHeight: 100 } },
    repeatable: false,
    settings: none,
  },
  callToAction: {
    name: "Call to action",
    description: "The event's call to action, such as how to give.",
    category: "money",
    placement: "block",
    variants: { banner: { minWidth: 800, minHeight: 80 } },
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
  intermission: {
    name: "Intermission message",
    description: "The operator's intermission message and countdown.",
    category: "scene",
    placement: "block",
    variants: { hero: { minWidth: 900, minHeight: 300 } },
    repeatable: false,
    settings: none,
  },
  askMe: {
    name: "Ask Me",
    description: "The Ask Me title, message, and its own running total.",
    category: "scene",
    placement: "block",
    variants: { full: { minWidth: 1600, minHeight: 800 } },
    repeatable: false,
    settings: none,
  },
  grandCelebration: {
    name: "Celebration",
    description: "The end-of-night thank-you with the final total.",
    category: "scene",
    placement: "block",
    variants: { full: { minWidth: 1600, minHeight: 800 } },
    repeatable: false,
    showsTotal: true,
    settings: none,
  },
  standby: {
    name: "Standby",
    description: "Shown before an event is on screen.",
    category: "scene",
    placement: "block",
    variants: { full: { minWidth: 800, minHeight: 400 } },
    repeatable: false,
    settings: none,
  },
};
