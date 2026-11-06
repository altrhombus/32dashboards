import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SecretStore } from "./secrets.js";

const tempDir = () => mkdtempSync(path.join(tmpdir(), "secrets-"));
const tempFile = () => path.join(tempDir(), "db", "source-secrets", "x.json");
const keyFile = path.join(tempDir(), "keys", "secrets.key");

describe("SecretStore", () => {
  it("persists values to an owner-only file and reloads them", () => {
    const file = tempFile();
    const store = new SecretStore(file, keyFile);
    store.set("event-1", "sessionCookie", "abc");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(new SecretStore(file, keyFile).get("event-1", "sessionCookie")).toBe("abc");
  });

  it("keeps values sealed on disk, with an owner-only key of its own", () => {
    const file = tempFile();
    new SecretStore(file, keyFile).set("event-1", "password", "hunter2-plain");
    expect(readFileSync(file, "utf8")).not.toContain("hunter2-plain");
    expect(readFileSync(file, "utf8")).not.toContain("event-1");
    expect(statSync(keyFile).mode & 0o777).toBe(0o600);
  });

  it("seals a file from before sealing the first time it's opened", () => {
    const file = tempFile();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ "event-1": { password: "hunter2-plain" } }));
    expect(new SecretStore(file, keyFile).get("event-1", "password")).toBe("hunter2-plain");
    expect(readFileSync(file, "utf8")).not.toContain("hunter2-plain");
    expect(new SecretStore(file, keyFile).get("event-1", "password")).toBe("hunter2-plain");
  });

  it("says what to do when the key is the wrong one, as after a restore elsewhere", () => {
    const file = tempFile();
    new SecretStore(file, keyFile).set("event-1", "a", "1");
    const otherKey = path.join(tempDir(), "other.key");
    expect(() => new SecretStore(file, otherKey)).toThrow(/enter the source's credentials again/);
  });

  it("clears values with null or empty strings and drops empty scopes", () => {
    const store = new SecretStore(tempFile(), keyFile);
    store.set("event-1", "a", "1");
    store.set("event-1", "b", "2");
    store.set("event-1", "a", null);
    expect(store.keys("event-1")).toEqual(["b"]);
    store.set("event-1", "b", "");
    expect(store.scopes()).toEqual([]);
  });

  it("copies and deletes scopes", () => {
    const file = tempFile();
    const store = new SecretStore(file, keyFile);
    store.set("from", "a", "1");
    store.copyScope("from", "to");
    store.deleteScope("from");
    expect(store.read("to")).toEqual({ a: "1" });
    expect(new SecretStore(file, keyFile).scopes()).toEqual(["to"]);
  });
});
