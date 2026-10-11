import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFakeNodecg } from "@32dashboards/nodecg-testing";
import { SecretStore } from "@32dashboards/source-sdk";
import { createFakeCore, testEvent } from "@32dashboards/source-sdk/testing";
import sourceExternal from "../src/extension/index.js";
import { handlePush, hashToken, tokenMatches } from "../src/extension/push.js";
import { PUSH_PATH, type EndpointReplicant } from "../src/model.js";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = "2026-10-10T12:00:00.000Z";

describe("tokenMatches", () => {
  it("accepts only the right bearer token", () => {
    const stored = hashToken("secret");
    expect(tokenMatches("Bearer secret", stored)).toBe(true);
    expect(tokenMatches("bearer secret", stored)).toBe(true);
    expect(tokenMatches("Bearer wrong", stored)).toBe(false);
    expect(tokenMatches("secret", stored)).toBe(false);
    expect(tokenMatches(undefined, stored)).toBe(false);
    expect(tokenMatches("Bearer secret", undefined)).toBe(false);
  });
});

describe("handlePush", () => {
  const setup = () => {
    const core = createFakeCore([testEvent(A, "external")]);
    const handle = core.registerSource("external", { label: "External push" });
    const push = (body: unknown, authorization = "Bearer t") =>
      handlePush({ authorization, body }, { tokenHash: hashToken("t"), handle, now: () => NOW });
    return { core, push };
  };

  it("reports a valid push, defaulting observedAt to now", () => {
    const { core, push } = setup();
    expect(push({ eventId: A, total: 12.5, items: [{ id: "1", title: "Quilt" }] })).toEqual({
      status: 200,
      body: { outcome: "stored" },
    });
    expect(core.reports[0]).toMatchObject({ sourceId: "external", eventId: A, total: 12.5, observedAt: NOW });
  });

  it("refuses bad tokens before reading the body", () => {
    const { core, push } = setup();
    expect(push({ eventId: A, total: 1 }, "Bearer nope").status).toBe(401);
    expect(core.reports).toEqual([]);
  });

  it("explains invalid bodies", () => {
    const { push } = setup();
    const response = push({ eventId: A, total: -1, extra: true });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/total/);
  });

  it("maps core outcomes to HTTP statuses", () => {
    const { core, push } = setup();
    core.nextOutcome = "wrong-source";
    expect(push({ eventId: A, total: 1 })).toMatchObject({ status: 409, body: { outcome: "wrong-source" } });
    core.nextOutcome = "unknown-event";
    expect(push({ eventId: A, total: 1 }).status).toBe(404);
  });
});

describe("source-external extension", () => {
  it("creates a token once, stores only its hash, and mounts the route", async () => {
    const fake = createFakeNodecg("source-external");
    const secrets = new SecretStore(path.join(mkdtempSync(path.join(tmpdir(), "ext-")), "s.json"));
    sourceExternal(fake.api, createFakeCore([testEvent(A, "external")]), secrets);

    const token = (await fake.send("rotateToken", undefined)) as string;
    expect(token.length).toBeGreaterThan(30);
    expect(JSON.stringify(secrets.read("install"))).not.toContain(token);
    expect(secrets.get("install", "tokenHash")).toBe(hashToken(token));
    expect(fake.replicant<EndpointReplicant>("endpoint").value).toMatchObject({ path: PUSH_PATH });
    expect(fake.replicant<EndpointReplicant>("endpoint").value.tokenCreatedAt).not.toBeNull();

    const [[router]] = fake.world.mounts as [[{ routes: { method: string; path: string }[] }]];
    expect(router.routes).toEqual([expect.objectContaining({ method: "post", path: PUSH_PATH })]);

    await fake.send("revokeToken", null);
    expect(secrets.scopes()).toEqual([]);
    expect(fake.replicant<EndpointReplicant>("endpoint").value.tokenCreatedAt).toBeNull();
  });
});
