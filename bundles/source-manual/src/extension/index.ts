import { randomUUID } from "node:crypto";
import type NodeCG from "nodecg/types";
import { CommandError, getCore, listenForCommand, type FundraiserCoreApi } from "@32dashboards/source-sdk";
import { SOURCE_ID, manualMessageSchemas, type EntriesReplicant, type ManualEntry } from "../model.js";

const EMPTY: ManualEntry = { total: 0, items: [] };

/**
 * A source for events without a platform. Every edit is reported to the
 * core as a fresh observation, exactly like a scraped result, so the
 * adjustment, filters, and donation moments all work the same way.
 */
export default function sourceManual(nodecg: NodeCG.ServerAPI, core: FundraiserCoreApi = getCore(nodecg.extensions)) {
  const handle = core.registerSource(SOURCE_ID, { label: "Manual entry" });
  const entries = nodecg.Replicant<EntriesReplicant>("entries", { defaultValue: {} });
  const plain = (): EntriesReplicant => JSON.parse(JSON.stringify(entries.value ?? {}));

  const report = (eventId: string, entry: ManualEntry) => {
    const outcome = handle.report({
      eventId,
      total: entry.total,
      items: entry.items,
      observedAt: new Date().toISOString(),
    });
    if (outcome === "wrong-source") {
      throw new CommandError(`Set this event's source to "Manual entry" in the Events panel first.`);
    }
    if (outcome !== "stored") throw new CommandError(`The core didn't accept the update (${outcome}).`);
  };

  /** Applies an edit to one event's entry, reports it, then saves it. Nothing is saved if the core refuses it. */
  const edit = (eventId: string, change: (entry: ManualEntry) => ManualEntry) => {
    if (!core.getEvent(eventId)) throw new CommandError(`No event with id ${eventId}`);
    const all = plain();
    const next = change(all[eventId] ?? EMPTY);
    report(eventId, next);
    entries.value = { ...all, [eventId]: next };
    handle.setStatus({ state: "ok", message: "Entered by hand", eventId });
  };

  const round = (n: number) => Math.round(n * 100) / 100;

  listenForCommand(nodecg, "setTotal", manualMessageSchemas.setTotal, ({ eventId, total }) =>
    edit(eventId, (entry) => ({ ...entry, total: round(total) })),
  );
  listenForCommand(nodecg, "addDonation", manualMessageSchemas.addDonation, ({ eventId, amount }) =>
    edit(eventId, (entry) => ({ ...entry, total: round(entry.total + amount) })),
  );
  listenForCommand(nodecg, "upsertItem", manualMessageSchemas.upsertItem, ({ eventId, item }) => {
    const id = item.id ?? randomUUID();
    edit(eventId, (entry) => {
      const exists = entry.items.some((i) => i.id === id);
      if (item.id && !exists) throw new CommandError("That item no longer exists.");
      const next = { ...item, id };
      return { ...entry, items: exists ? entry.items.map((i) => (i.id === id ? next : i)) : [...entry.items, next] };
    });
    return id;
  });
  listenForCommand(nodecg, "removeItem", manualMessageSchemas.removeItem, ({ eventId, itemId }) =>
    edit(eventId, (entry) => ({ ...entry, items: entry.items.filter((i) => i.id !== itemId) })),
  );

  // Entries describe how one event went, so they're not copied on
  // duplicate; they are dropped when the event is deleted.
  core.onEventsChange((events) => {
    const live = new Set(events.map((e) => e.id));
    const all = plain();
    const kept = Object.fromEntries(Object.entries(all).filter(([id]) => live.has(id)));
    if (Object.keys(kept).length !== Object.keys(all).length) entries.value = kept;
  });

  // "Refresh now" re-sends what's stored, e.g. after the event's source was switched to manual.
  handle.onRefreshRequested((eventId) => {
    const entry = plain()[eventId];
    if (entry) report(eventId, entry);
  });

  const describeActive = () => {
    const active = core.getActiveEventId();
    const usesManual = active && core.getEvent(active)?.source.adapterId === SOURCE_ID;
    handle.setStatus(
      usesManual
        ? { state: "ok", message: "Entered by hand", eventId: active }
        : { state: "idle", message: "Not used by the active event" },
    );
  };
  core.onActiveEventChange(describeActive);
  core.onEventsChange(describeActive);
  describeActive();
}
