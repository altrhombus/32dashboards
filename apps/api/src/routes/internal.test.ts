import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestContext, TEST_ADMIN_PASSWORD, TEST_INTERNAL_TOKEN, type TestContext } from "../testUtils.js";

type TestAgent = ReturnType<typeof request.agent>;

async function loggedInAgent(ctx: TestContext): Promise<TestAgent> {
  const agent = request.agent(ctx.app);
  await agent.post("/api/auth/login").send({ password: TEST_ADMIN_PASSWORD });
  return agent;
}

describe("internal scrape-result ingestion", () => {
  let ctx: TestContext;
  let agent: TestAgent;

  beforeEach(async () => {
    ctx = await createTestContext();
    agent = await loggedInAgent(ctx);
  });

  afterEach(() => {
    ctx.dbHandle.close();
  });

  it("rejects requests without a valid bearer token", async () => {
    const res = await request(ctx.app).post("/internal/scrape-result").send({
      items: [],
      totalRaisedRaw: "$100",
      refreshedAt: new Date().toISOString(),
      sourceUrl: null,
    });
    expect(res.status).toBe(401);
  });

  it("409s when there is no active event to attribute the result to", async () => {
    const res = await request(ctx.app)
      .post("/internal/scrape-result")
      .set("Authorization", `Bearer ${TEST_INTERNAL_TOKEN}`)
      .send({ items: [], totalRaisedRaw: "$100", refreshedAt: new Date().toISOString(), sourceUrl: null });
    expect(res.status).toBe(409);
  });

  it("parses totalRaisedRaw into a numeric total and persists it against the active event", async () => {
    const event = (
      await agent.post("/api/events").send({
        slug: "spring-2026",
        name: "Spring Auction",
        scraperSource: { orgId: "o", auctionId: "a", friendlyAuctionPath: "p" },
      })
    ).body;
    await agent.post(`/api/events/${event.id}/activate`);

    const res = await request(ctx.app)
      .post("/internal/scrape-result")
      .set("Authorization", `Bearer ${TEST_INTERNAL_TOKEN}`)
      .send({
        items: [{ title: "Gift Basket", picture_url: null, price: "$25", remaining: "2 days", value: "$40", bids: "1" }],
        totalRaisedRaw: "$12,345.67",
        refreshedAt: "2026-01-01T00:00:00.000Z",
        sourceUrl: "https://www.32auctions.com/p",
      });

    expect(res.status).toBe(200);
    expect(res.body.totalRaised).toBe(12345.67);
    expect(res.body.totalRaisedDisplay).toBe("$12,345.67");
    expect(res.body.items).toHaveLength(1);
  });
});
