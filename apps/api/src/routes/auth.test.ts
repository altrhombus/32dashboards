import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestContext, TEST_ADMIN_PASSWORD, type TestContext } from "../testUtils.js";

describe("auth", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(() => {
    ctx.dbHandle.close();
  });

  it("rejects an incorrect password with 401", async () => {
    const res = await request(ctx.app).post("/api/auth/login").send({ password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("accepts the correct password and sets a session cookie", async () => {
    const res = await request(ctx.app).post("/api/auth/login").send({ password: TEST_ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^session=/);
  });

  it("rejects protected routes without a session cookie", async () => {
    const res = await request(ctx.app).get("/api/events");
    expect(res.status).toBe(401);
  });

  it("allows protected routes with a valid session cookie", async () => {
    const login = await request(ctx.app).post("/api/auth/login").send({ password: TEST_ADMIN_PASSWORD });
    const cookie = login.headers["set-cookie"];
    if (!cookie) throw new Error("expected login to set a session cookie");
    const res = await request(ctx.app).get("/api/events").set("Cookie", cookie);
    expect(res.status).toBe(200);
  });

  it("rate limits repeated failed login attempts", async () => {
    for (let i = 0; i < 5; i++) {
      await request(ctx.app).post("/api/auth/login").send({ password: "wrong" });
    }
    const res = await request(ctx.app).post("/api/auth/login").send({ password: "wrong" });
    expect(res.status).toBe(429);
  });

  it("logout clears the session so protected routes 401 again", async () => {
    const agent = request.agent(ctx.app);
    await agent.post("/api/auth/login").send({ password: TEST_ADMIN_PASSWORD });
    expect((await agent.get("/api/events")).status).toBe(200);
    await agent.post("/api/auth/logout");
    expect((await agent.get("/api/events")).status).toBe(401);
  });

  it("does not mark the cookie Secure over plain HTTP (browsers silently drop Secure cookies set over HTTP, which broke login on the HTTP-only Docker Compose deployment)", async () => {
    const res = await request(ctx.app).post("/api/auth/login").send({ password: TEST_ADMIN_PASSWORD });
    expect(res.headers["set-cookie"]?.[0]).not.toMatch(/Secure/i);
  });

  it("marks the cookie Secure when nginx signals HTTPS via X-Forwarded-Proto (trust proxy is set to 1 in app.ts)", async () => {
    const res = await request(ctx.app)
      .post("/api/auth/login")
      .set("X-Forwarded-Proto", "https")
      .send({ password: TEST_ADMIN_PASSWORD });
    expect(res.headers["set-cookie"]?.[0]).toMatch(/Secure/i);
  });
});
