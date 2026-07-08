import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Theme, AskMeConfig, ScraperSource } from "@32dashboards/schema";

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
    name: text("name").notNull(),
    causeName: text("cause_name").notNull().default(""),
    endDateTime: text("end_date_time"),
    theme: text("theme", { mode: "json" }).notNull().$type<Theme>(),
    announcements: text("announcements", { mode: "json" }).notNull().$type<string[]>(),
    askMe: text("ask_me", { mode: "json" }).notNull().$type<AskMeConfig>(),
    scraperSource: text("scraper_source", { mode: "json" }).notNull().$type<ScraperSource>(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    // Enforces "at most one active event" at the DB layer, not just in application code.
    onlyOneActive: uniqueIndex("events_only_one_active").on(table.isActive).where(sql`${table.isActive} = 1`),
  })
);

export const incentives = sqliteTable("incentives", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  target: real("target").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  displayNow: integer("display_now", { mode: "boolean" }).notNull().default(false),
  displayUntilMet: integer("display_until_met", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const sponsors = sqliteTable("sponsors", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Latest scrape snapshot per event -- survives an API restart so the
// display doesn't blank out while waiting for the next scrape cycle.
export const auctionState = sqliteTable("auction_state", {
  eventId: text("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  totalRaised: real("total_raised").notNull().default(0),
  totalRaisedDisplay: text("total_raised_display").notNull().default("$0"),
  items: text("items", { mode: "json" }).notNull().$type<unknown[]>(),
  refreshedAt: text("refreshed_at").notNull(),
  sourceUrl: text("source_url"),
});

// Single-row key/value store, currently just the admin password hash.
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
