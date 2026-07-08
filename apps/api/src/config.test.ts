import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const REQUIRED_ENV = {
  JWT_SECRET: "a".repeat(32),
  INTERNAL_TOKEN: "b".repeat(32),
  SCRAPER_CONTROL_TOKEN: "c".repeat(32),
};

describe("loadConfig", () => {
  it("treats an unset ADMIN_PASSWORD as undefined", () => {
    const config = loadConfig({ ...REQUIRED_ENV });
    expect(config.ADMIN_PASSWORD).toBeUndefined();
  });

  it("treats an empty-string ADMIN_PASSWORD as undefined (docker-compose's ${VAR:-} passes '' when unset in .env)", () => {
    const config = loadConfig({ ...REQUIRED_ENV, ADMIN_PASSWORD: "" });
    expect(config.ADMIN_PASSWORD).toBeUndefined();
  });

  it("passes through a real ADMIN_PASSWORD value", () => {
    const config = loadConfig({ ...REQUIRED_ENV, ADMIN_PASSWORD: "hunter2" });
    expect(config.ADMIN_PASSWORD).toBe("hunter2");
  });

  it("throws with a readable message when a required secret is missing", () => {
    const { JWT_SECRET: _omit, ...rest } = REQUIRED_ENV;
    expect(() => loadConfig(rest)).toThrow(/JWT_SECRET/);
  });

  it("throws when a required secret is too short", () => {
    expect(() => loadConfig({ ...REQUIRED_ENV, JWT_SECRET: "short" })).toThrow(/JWT_SECRET/);
  });
});
