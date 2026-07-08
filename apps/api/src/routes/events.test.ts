import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestContext, TEST_ADMIN_PASSWORD, type TestContext } from "../testUtils.js";

type TestAgent = ReturnType<typeof request.agent>;

async function loggedInAgent(ctx: TestContext): Promise<TestAgent> {
  const agent = request.agent(ctx.app);
  await agent.post("/api/auth/login").send({ password: TEST_ADMIN_PASSWORD });
  return agent;
}

function sampleEventInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    slug: "spring-2026",
    name: "Spring Auction 2026",
    causeName: "Local Animal Shelter",
    scraperSource: {
      orgId: "org123",
      auctionId: "auc456",
      friendlyAuctionPath: "my-auction",
    },
    ...overrides,
  };
}

describe("events CRUD", () => {
  let ctx: TestContext;
  let agent: TestAgent;

  beforeEach(async () => {
    ctx = await createTestContext();
    agent = await loggedInAgent(ctx);
  });

  afterEach(() => {
    ctx.dbHandle.close();
  });

  it("creates an event and returns it with defaults applied", async () => {
    const res = await agent.post("/api/events").send(sampleEventInput());
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe("spring-2026");
    expect(res.body.isActive).toBe(false);
    expect(res.body.incentives).toEqual([]);
    expect(res.body.theme.accentColor).toBe("#ffd700");
    expect(res.body.scraperSource.orgId).toBe("org123");
  });

  it("rejects a duplicate slug with 409", async () => {
    await agent.post("/api/events").send(sampleEventInput());
    const res = await agent.post("/api/events").send(sampleEventInput());
    expect(res.status).toBe(409);
  });

  it("rejects an invalid create payload with 400", async () => {
    const res = await agent.post("/api/events").send({ slug: "" });
    expect(res.status).toBe(400);
  });

  it("lists created events", async () => {
    await agent.post("/api/events").send(sampleEventInput());
    const res = await agent.get("/api/events");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("404s for a nonexistent event", async () => {
    const res = await agent.get("/api/events/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("activates an event and enforces only one active at a time", async () => {
    const a = (await agent.post("/api/events").send(sampleEventInput())).body;
    const b = (await agent.post("/api/events").send(sampleEventInput({ slug: "fall-2026" }))).body;

    await agent.post(`/api/events/${a.id}/activate`);
    let listRes = await agent.get("/api/events");
    expect(listRes.body.find((e: { id: string }) => e.id === a.id).isActive).toBe(true);

    await agent.post(`/api/events/${b.id}/activate`);
    listRes = await agent.get("/api/events");
    expect(listRes.body.find((e: { id: string }) => e.id === a.id).isActive).toBe(false);
    expect(listRes.body.find((e: { id: string }) => e.id === b.id).isActive).toBe(true);
  });

  it("updates announcements", async () => {
    const event = (await agent.post("/api/events").send(sampleEventInput())).body;
    const res = await agent.put(`/api/events/${event.id}/announcements`).send({ announcements: ["Doors open at 6pm"] });
    expect(res.status).toBe(200);
    expect(res.body.announcements).toEqual(["Doors open at 6pm"]);
  });

  it("rejects an announcement over 200 chars", async () => {
    const event = (await agent.post("/api/events").send(sampleEventInput())).body;
    const res = await agent.put(`/api/events/${event.id}/announcements`).send({ announcements: ["x".repeat(201)] });
    expect(res.status).toBe(400);
  });

  it("creates, updates, and deletes an incentive, preserving displayNow/displayUntilMet/active semantics", async () => {
    const event = (await agent.post("/api/events").send(sampleEventInput())).body;

    const created = await agent.post(`/api/events/${event.id}/incentives`).send({ name: "Match $500", target: 500 });
    expect(created.status).toBe(201);
    const incentive = created.body.incentives[0];
    expect(incentive.active).toBe(false);
    expect(incentive.displayNow).toBe(false);
    expect(incentive.displayUntilMet).toBe(false);

    const stateRes = await agent.post(`/api/events/${event.id}/incentives/${incentive.id}/state`).send({ displayNow: true });
    expect(stateRes.status).toBe(200);
    expect(stateRes.body.incentives[0].displayNow).toBe(true);

    const deleteRes = await agent.delete(`/api/events/${event.id}/incentives/${incentive.id}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.incentives).toHaveLength(0);
  });

  it("404s setting state on a nonexistent incentive", async () => {
    const event = (await agent.post("/api/events").send(sampleEventInput())).body;
    const res = await agent.post(`/api/events/${event.id}/incentives/does-not-exist/state`).send({ active: true });
    expect(res.status).toBe(404);
  });

  it("rejects a negative incentive target", async () => {
    const event = (await agent.post("/api/events").send(sampleEventInput())).body;
    const res = await agent.post(`/api/events/${event.id}/incentives`).send({ name: "Bad", target: -5 });
    expect(res.status).toBe(400);
  });

  it("replaces the sponsor list wholesale", async () => {
    const event = (await agent.post("/api/events").send(sampleEventInput())).body;
    const res = await agent
      .put(`/api/events/${event.id}/sponsors`)
      .send({ sponsors: [{ name: "Acme Co", logoUrl: "/logos/acme.png", sortOrder: 0 }] });
    expect(res.status).toBe(200);
    expect(res.body.sponsors).toHaveLength(1);
    expect(res.body.sponsors[0].name).toBe("Acme Co");
  });

  it("persists data across a simulated restart (reopening the same sqlite file)", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const { createDb } = await import("../db/client.js");
    const { createApp } = await import("../app.js");
    const { TEST_JWT_SECRET, TEST_INTERNAL_TOKEN, TEST_SCRAPER_CONTROL_TOKEN } = await import("../testUtils.js");

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "32dashboards-api-test-"));
    const dbFile = path.join(dir, "db.sqlite");
    const scraperConfig = { baseUrl: "http://127.0.0.1:39999", controlToken: TEST_SCRAPER_CONTROL_TOKEN };

    const first = createDb(dbFile);
    const firstApp = createApp({
      db: first.db,
      jwtSecret: TEST_JWT_SECRET,
      internalToken: TEST_INTERNAL_TOKEN,
      allowedOrigins: ["http://localhost:5173"],
      isProduction: false,
      scraperConfig,
    });
    const { ensureAdminPassword } = await import("../lib/bootstrapAdmin.js");
    await ensureAdminPassword(first.db, TEST_ADMIN_PASSWORD);
    const firstAgent = request.agent(firstApp);
    await firstAgent.post("/api/auth/login").send({ password: TEST_ADMIN_PASSWORD });
    await firstAgent.post("/api/events").send(sampleEventInput());
    first.close();

    const second = createDb(dbFile);
    const secondApp = createApp({
      db: second.db,
      jwtSecret: TEST_JWT_SECRET,
      internalToken: TEST_INTERNAL_TOKEN,
      allowedOrigins: ["http://localhost:5173"],
      isProduction: false,
      scraperConfig,
    });
    const secondAgent = request.agent(secondApp);
    await secondAgent.post("/api/auth/login").send({ password: TEST_ADMIN_PASSWORD });
    const res = await secondAgent.get("/api/events");
    expect(res.body).toHaveLength(1);
    expect(res.body[0].slug).toBe("spring-2026");
    second.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
