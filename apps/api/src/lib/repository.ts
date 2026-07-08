import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DrizzleDb } from "../db/client.js";
import { events, incentives, sponsors, auctionState } from "../db/schema.js";
import {
  ThemeSchema,
  AskMeConfigSchema,
  ScraperSourceSchema,
  type EventConfig,
  type CreateEventInput,
  type UpdateEventInput,
  type Incentive,
  type CreateIncentiveInput,
  type UpdateIncentiveInput,
  type IncentiveStateInput,
  type Sponsor,
  type CreateSponsorInput,
  type AskMeConfig,
  type AuctionState,
  type ScrapeResultInput,
} from "@32dashboards/schema";
import { parseCurrencyValue, formatCurrency } from "@32dashboards/schema";
import { NotFoundError, ConflictError } from "./errors.js";

export { NotFoundError, ConflictError };

function nowIso(): string {
  return new Date().toISOString();
}

type EventRow = typeof events.$inferSelect;
type IncentiveRow = typeof incentives.$inferSelect;
type SponsorRow = typeof sponsors.$inferSelect;

function toIncentive(row: IncentiveRow): Incentive {
  return {
    id: row.id,
    name: row.name,
    target: row.target,
    active: row.active,
    displayNow: row.displayNow,
    displayUntilMet: row.displayUntilMet,
  };
}

function toSponsor(row: SponsorRow): Sponsor {
  return { id: row.id, name: row.name, logoUrl: row.logoUrl, sortOrder: row.sortOrder };
}

function toEventConfig(row: EventRow, incentiveRows: IncentiveRow[], sponsorRows: SponsorRow[]): EventConfig {
  return {
    id: row.id,
    slug: row.slug,
    isActive: row.isActive,
    name: row.name,
    causeName: row.causeName,
    endDateTime: row.endDateTime,
    theme: row.theme,
    announcements: row.announcements,
    askMe: row.askMe,
    incentives: [...incentiveRows].sort((a, b) => a.sortOrder - b.sortOrder).map(toIncentive),
    sponsors: [...sponsorRows].sort((a, b) => a.sortOrder - b.sortOrder).map(toSponsor),
    scraperSource: row.scraperSource,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function loadEventRow(db: DrizzleDb, id: string): EventRow | undefined {
  return db.select().from(events).where(eq(events.id, id)).get();
}

export function getEventConfig(db: DrizzleDb, id: string): EventConfig | null {
  const row = loadEventRow(db, id);
  if (!row) return null;
  const incentiveRows = db.select().from(incentives).where(eq(incentives.eventId, id)).all();
  const sponsorRows = db.select().from(sponsors).where(eq(sponsors.eventId, id)).all();
  return toEventConfig(row, incentiveRows, sponsorRows);
}

export function getActiveEventConfig(db: DrizzleDb): EventConfig | null {
  const row = db.select().from(events).where(eq(events.isActive, true)).get();
  if (!row) return null;
  return getEventConfig(db, row.id);
}

export function listEvents(db: DrizzleDb) {
  return db
    .select({
      id: events.id,
      slug: events.slug,
      name: events.name,
      isActive: events.isActive,
      endDateTime: events.endDateTime,
    })
    .from(events)
    .all();
}

export function createEvent(db: DrizzleDb, input: CreateEventInput): EventConfig {
  const existingSlug = db.select({ id: events.id }).from(events).where(eq(events.slug, input.slug)).get();
  if (existingSlug) throw new ConflictError(`an event with slug "${input.slug}" already exists`);

  const id = randomUUID();
  const now = nowIso();
  const theme = ThemeSchema.parse(input.theme ?? {});
  const askMe = AskMeConfigSchema.parse({});
  const scraperSource = ScraperSourceSchema.parse(input.scraperSource);

  db.insert(events)
    .values({
      id,
      slug: input.slug,
      isActive: false,
      name: input.name,
      causeName: input.causeName ?? "",
      endDateTime: input.endDateTime ?? null,
      theme,
      announcements: [],
      askMe,
      scraperSource,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return getEventConfig(db, id)!;
}

export function updateEvent(db: DrizzleDb, id: string, input: UpdateEventInput): EventConfig {
  const row = loadEventRow(db, id);
  if (!row) throw new NotFoundError(`event ${id} not found`);

  const theme = input.theme ? ThemeSchema.parse({ ...row.theme, ...input.theme }) : row.theme;
  const scraperSource = input.scraperSource
    ? ScraperSourceSchema.parse({ ...row.scraperSource, ...input.scraperSource })
    : row.scraperSource;

  db.update(events)
    .set({
      name: input.name ?? row.name,
      causeName: input.causeName ?? row.causeName,
      endDateTime: input.endDateTime !== undefined ? input.endDateTime : row.endDateTime,
      theme,
      scraperSource,
      updatedAt: nowIso(),
    })
    .where(eq(events.id, id))
    .run();

  return getEventConfig(db, id)!;
}

export function activateEvent(db: DrizzleDb, id: string): EventConfig {
  const row = loadEventRow(db, id);
  if (!row) throw new NotFoundError(`event ${id} not found`);

  db.transaction((tx) => {
    tx.update(events).set({ isActive: false }).where(eq(events.isActive, true)).run();
    tx.update(events).set({ isActive: true, updatedAt: nowIso() }).where(eq(events.id, id)).run();
  });

  return getEventConfig(db, id)!;
}

export function updateAnnouncements(db: DrizzleDb, id: string, announcements: string[]): EventConfig {
  const row = loadEventRow(db, id);
  if (!row) throw new NotFoundError(`event ${id} not found`);
  db.update(events).set({ announcements, updatedAt: nowIso() }).where(eq(events.id, id)).run();
  return getEventConfig(db, id)!;
}

export function updateAskMe(db: DrizzleDb, id: string, input: Partial<AskMeConfig>): EventConfig {
  const row = loadEventRow(db, id);
  if (!row) throw new NotFoundError(`event ${id} not found`);
  const askMe = AskMeConfigSchema.parse({ ...row.askMe, ...input });
  db.update(events).set({ askMe, updatedAt: nowIso() }).where(eq(events.id, id)).run();
  return getEventConfig(db, id)!;
}

export function replaceSponsors(db: DrizzleDb, id: string, input: CreateSponsorInput[]): EventConfig {
  const row = loadEventRow(db, id);
  if (!row) throw new NotFoundError(`event ${id} not found`);

  db.transaction((tx) => {
    tx.delete(sponsors).where(eq(sponsors.eventId, id)).run();
    for (const sponsor of input) {
      tx.insert(sponsors)
        .values({ id: randomUUID(), eventId: id, name: sponsor.name, logoUrl: sponsor.logoUrl, sortOrder: sponsor.sortOrder })
        .run();
    }
    tx.update(events).set({ updatedAt: nowIso() }).where(eq(events.id, id)).run();
  });

  return getEventConfig(db, id)!;
}

export function createIncentive(db: DrizzleDb, eventId: string, input: CreateIncentiveInput): EventConfig {
  const row = loadEventRow(db, eventId);
  if (!row) throw new NotFoundError(`event ${eventId} not found`);

  const existingCount = db.select({ id: incentives.id }).from(incentives).where(eq(incentives.eventId, eventId)).all().length;

  db.transaction((tx) => {
    tx.insert(incentives)
      .values({
        id: randomUUID(),
        eventId,
        name: input.name,
        target: input.target,
        active: input.active ?? false,
        displayNow: input.displayNow ?? false,
        displayUntilMet: input.displayUntilMet ?? false,
        sortOrder: existingCount,
      })
      .run();
    tx.update(events).set({ updatedAt: nowIso() }).where(eq(events.id, eventId)).run();
  });

  return getEventConfig(db, eventId)!;
}

function loadIncentiveRow(db: DrizzleDb, eventId: string, incentiveId: string): IncentiveRow | undefined {
  const row = db.select().from(incentives).where(eq(incentives.id, incentiveId)).get();
  if (!row || row.eventId !== eventId) return undefined;
  return row;
}

export function updateIncentive(db: DrizzleDb, eventId: string, incentiveId: string, input: UpdateIncentiveInput): EventConfig {
  const existing = loadIncentiveRow(db, eventId, incentiveId);
  if (!existing) throw new NotFoundError(`incentive ${incentiveId} not found on event ${eventId}`);

  db.transaction((tx) => {
    tx.update(incentives)
      .set({
        name: input.name ?? existing.name,
        target: input.target ?? existing.target,
        active: input.active ?? existing.active,
        displayNow: input.displayNow ?? existing.displayNow,
        displayUntilMet: input.displayUntilMet ?? existing.displayUntilMet,
      })
      .where(eq(incentives.id, incentiveId))
      .run();
    tx.update(events).set({ updatedAt: nowIso() }).where(eq(events.id, eventId)).run();
  });

  return getEventConfig(db, eventId)!;
}

export function setIncentiveState(db: DrizzleDb, eventId: string, incentiveId: string, input: IncentiveStateInput): EventConfig {
  return updateIncentive(db, eventId, incentiveId, input);
}

export function deleteIncentive(db: DrizzleDb, eventId: string, incentiveId: string): EventConfig {
  const existing = loadIncentiveRow(db, eventId, incentiveId);
  if (!existing) throw new NotFoundError(`incentive ${incentiveId} not found on event ${eventId}`);

  db.transaction((tx) => {
    tx.delete(incentives).where(eq(incentives.id, incentiveId)).run();
    tx.update(events).set({ updatedAt: nowIso() }).where(eq(events.id, eventId)).run();
  });

  return getEventConfig(db, eventId)!;
}

export function getAuctionState(db: DrizzleDb, eventId: string): AuctionState | null {
  const row = db.select().from(auctionState).where(eq(auctionState.eventId, eventId)).get();
  if (!row) return null;
  return {
    eventId: row.eventId,
    totalRaised: row.totalRaised,
    totalRaisedDisplay: row.totalRaisedDisplay,
    items: row.items as AuctionState["items"],
    refreshedAt: row.refreshedAt,
    sourceUrl: row.sourceUrl,
  };
}

export function saveScrapeResult(db: DrizzleDb, eventId: string, input: ScrapeResultInput): AuctionState {
  const totalRaised = parseCurrencyValue(input.totalRaisedRaw);
  const totalRaisedDisplay = formatCurrency(totalRaised);
  const row = {
    eventId,
    totalRaised,
    totalRaisedDisplay,
    items: input.items,
    refreshedAt: input.refreshedAt,
    sourceUrl: input.sourceUrl,
  };

  db.insert(auctionState)
    .values(row)
    .onConflictDoUpdate({
      target: auctionState.eventId,
      set: {
        totalRaised: row.totalRaised,
        totalRaisedDisplay: row.totalRaisedDisplay,
        items: row.items,
        refreshedAt: row.refreshedAt,
        sourceUrl: row.sourceUrl,
      },
    })
    .run();

  return getAuctionState(db, eventId)!;
}
