import { defineConfig } from "@playwright/test";
import { PORT } from "./constants.js";

/*
 * Browser tests against a real NodeCG with a throwaway database. Build the
 * bundles first (`pnpm bundles:build`). `pnpm e2e` uses Playwright's Chromium;
 * where that can't run, start Edge or Chrome with --remote-debugging-port and
 * set E2E_CDP_URL to its address.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: "../.e2e-results",
  workers: 1,
  fullyParallel: false,
  timeout: 45_000,
  globalSetup: "./setup.ts",
  use: { baseURL: `http://127.0.0.1:${PORT}` },
});
