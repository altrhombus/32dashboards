import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SecretStore } from "./secrets.js";

const tempFile = () => path.join(mkdtempSync(path.join(tmpdir(), "secrets-")), "db", "source-secrets", "x.json");

describe("SecretStore", () => {
  it("persists values to an owner-only file and reloads them", () => {
    const file = tempFile();
    const store = new SecretStore(file);
    store.set("event-1", "sessionCookie", "abc");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(new SecretStore(file).get("event-1", "sessionCookie")).toBe("abc");
  });

  it("clears values with null or empty strings and drops empty scopes", () => {
    const store = new SecretStore(tempFile());
    store.set("event-1", "a", "1");
    store.set("event-1", "b", "2");
    store.set("event-1", "a", null);
    expect(store.keys("event-1")).toEqual(["b"]);
    store.set("event-1", "b", "");
    expect(store.scopes()).toEqual([]);
  });

  it("copies and deletes scopes", () => {
    const file = tempFile();
    const store = new SecretStore(file);
    store.set("from", "a", "1");
    store.copyScope("from", "to");
    store.deleteScope("from");
    expect(store.read("to")).toEqual({ a: "1" });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ to: { a: "1" } });
  });
});
