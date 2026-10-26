import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createFakeNodecg } from "@32dashboards/nodecg-testing";
import { createPollingSource, type PollContext, type PollResult } from "./polling.js";
import { SecretStore } from "./secrets.js";
import { createFakeCore, testEvent } from "./testing.js";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const configSchema = z.object({ url: z.string(), intervalSeconds: z.number().int().positive() });
type Config = z.infer<typeof configSchema>;

function setup(poll: (ctx: PollContext<Config>) => Promise<PollResult>) {
  const fake = createFakeNodecg("source-test");
  const core = createFakeCore([testEvent(A, "test"), testEvent(B, "test")]);
  const secrets = new SecretStore(path.join(mkdtempSync(path.join(tmpdir(), "poll-")), "s.json"));
  const calls: PollContext<Config>[] = [];
  const source = createPollingSource(
    fake.api,
    {
      id: "test",
      label: "Test",
      configSchema,
      secretKeys: ["token"],
      requiredSecrets: ["token"],
      intervalSeconds: (c) => c.intervalSeconds,
      poll: (ctx) => {
        calls.push(ctx);
        return poll(ctx);
      },
    },
    { core, secrets, now: () => "2026-10-10T12:00:00.000Z" },
  );
  const configure = async (eventId: string, config: Config = { url: "u", intervalSeconds: 10 }) => {
    await fake.send("setConfig", { eventId, config });
    await fake.send("setSecret", { eventId, key: "token", value: "t" });
  };
  return { fake, core, secrets, source, calls, configure, lastStatus: () => core.statuses.at(-1) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createPollingSource", () => {
  it("runs once on demand for an event that isn't on screen, and stores the result for it", async () => {
    const t = setup(async () => ({ total: 50, items: [{ id: "1", title: "Quilt" }] }));
    await expect(t.source.runOnce(B)).rejects.toThrow(/settings aren't saved/);
    await t.configure(B);
    const { result, outcome } = await t.source.runOnce(B);
    expect(result.total).toBe(50);
    expect(outcome).toBe("stored");
    expect(t.core.reports).toEqual([expect.objectContaining({ eventId: B, total: 50 })]);
    // Regular polling is untouched: nothing is on screen.
    expect(t.lastStatus()).toMatchObject({ state: "idle" });
  });

  it("idles until the active event uses this source", async () => {
    const t = setup(async () => ({ total: 1 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(t.lastStatus()).toMatchObject({ state: "idle" });
    expect(t.calls).toHaveLength(0);
  });

  it("says what's missing when run on demand", async () => {
    const t = setup(async () => ({ total: 1 }));
    await t.fake.send("setConfig", { eventId: A, config: { url: "u", intervalSeconds: 10 } });
    await expect(t.source.runOnce(A)).rejects.toThrow("Missing token");
  });

  it("reports what's missing instead of polling", async () => {
    const t = setup(async () => ({ total: 1 }));
    t.core.activate(A);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.lastStatus()).toMatchObject({ state: "error", message: "Not configured for this event", eventId: A });

    await t.fake.send("setConfig", { eventId: A, config: { url: "u", intervalSeconds: 10 } });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.lastStatus()).toMatchObject({ state: "error", message: "Missing token" });
    expect(t.calls).toHaveLength(0);
  });

  it("polls the active event on its interval and reports with that event's id", async () => {
    const t = setup(async () => ({ total: 1234, items: [{ id: "1", title: "Guitar" }] }));
    await t.configure(A, { url: "u", intervalSeconds: 10 });
    t.core.activate(A);
    await vi.advanceTimersByTimeAsync(0);

    expect(t.calls[0]).toMatchObject({ eventId: A, config: { url: "u" }, secrets: { token: "t" } });
    expect(t.core.reports).toEqual([
      expect.objectContaining({ sourceId: "test", eventId: A, total: 1234, observedAt: "2026-10-10T12:00:00.000Z" }),
    ]);
    expect(t.lastStatus()).toMatchObject({ state: "ok", message: "$1,234 · 1 item" });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(t.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.calls).toHaveLength(2);
  });

  it("aborts a slow fetch when the active event changes, and never reports it", async () => {
    let release: (() => void) | undefined;
    const t = setup(
      (ctx) =>
        new Promise((resolve) => {
          release = () => resolve({ total: ctx.eventId === A ? 1 : 2 });
        }),
    );
    await t.configure(A);
    await t.configure(B);
    t.core.activate(A);
    await vi.advanceTimersByTimeAsync(0);
    const first = t.calls[0]!;

    t.core.activate(B);
    expect(first.signal.aborted).toBe(true);
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.calls.map((c) => c.eventId)).toEqual([A, B]);

    release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.core.reports.map((r) => [r.eventId, r.total])).toEqual([[B, 2]]);
  });

  it("reports failures, logs them, and tries again next interval", async () => {
    let fail = true;
    const t = setup(async () => {
      if (fail) throw new Error("HTTP 503");
      return { total: 5 };
    });
    await t.configure(A);
    t.core.activate(A);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.lastStatus()).toMatchObject({ state: "error", message: "HTTP 503" });
    expect(t.core.logs).toEqual([expect.objectContaining({ level: "error", message: "Fetch failed: HTTP 503" })]);

    fail = false;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.lastStatus()).toMatchObject({ state: "ok" });
  });

  it("refreshes immediately on request", async () => {
    const t = setup(async () => ({ total: 1 }));
    await t.configure(A, { url: "u", intervalSeconds: 60 });
    t.core.activate(A);
    await vi.advanceTimersByTimeAsync(0);
    t.core.requestRefresh("test", A);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.calls).toHaveLength(2);
  });

  it("restarts when the active event's settings change", async () => {
    const t = setup(async () => ({ total: 1 }));
    await t.configure(A, { url: "u", intervalSeconds: 60 });
    t.core.activate(A);
    await vi.advanceTimersByTimeAsync(0);
    await t.fake.send("setConfig", { eventId: A, config: { url: "v", intervalSeconds: 60 } });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.calls.map((c) => c.config.url)).toEqual(["u", "v"]);
  });

  it("validates settings Messages", async () => {
    const t = setup(async () => ({ total: 1 }));
    await expect(t.fake.send("setConfig", { eventId: A, config: { url: "u" } })).rejects.toThrow(/intervalSeconds/);
    await expect(t.fake.send("setSecret", { eventId: A, key: "other", value: "x" })).rejects.toThrow(/Unknown secret/);
    await expect(
      t.fake.send("setConfig", {
        eventId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        config: { url: "u", intervalSeconds: 1 },
      }),
    ).rejects.toThrow(/No event/);
  });

  it("shows which secrets are set without exposing values", async () => {
    const t = setup(async () => ({ total: 1 }));
    await t.configure(A);
    expect(t.fake.replicant("secretStatus").value).toEqual({ [A]: ["token"] });
    expect(JSON.stringify(t.fake.world.replicants.get(`source-test:configs`)?.value)).not.toContain('"t"');
  });

  it("copies settings to duplicated events and drops them for deleted ones", async () => {
    const t = setup(async () => ({ total: 1 }));
    await t.configure(A);
    const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    t.core.setEvents([...t.core.listEvents(), testEvent(C, "test")]);
    t.core.duplicate(A, C);
    expect(t.source.settings.getConfig(C)).toEqual({ url: "u", intervalSeconds: 10 });
    expect(t.secrets.read(C)).toEqual({ token: "t" });

    t.core.setEvents(t.core.listEvents().filter((e) => e.id !== A));
    expect(t.source.settings.getConfig(A)).toBeUndefined();
    expect(t.secrets.scopes()).toEqual([C]);
  });

  it("stops cleanly", async () => {
    const t = setup(async () => ({ total: 1 }));
    await t.configure(A);
    t.core.activate(A);
    await vi.advanceTimersByTimeAsync(0);
    t.source.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.calls).toHaveLength(1);
  });
});
