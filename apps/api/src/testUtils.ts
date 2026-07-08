import { createDb, type DbHandle } from "./db/client.js";
import { ensureAdminPassword } from "./lib/bootstrapAdmin.js";
import { createApp } from "./app.js";
import type { Express } from "express";

export const TEST_JWT_SECRET = "test-jwt-secret-at-least-32-characters-long";
export const TEST_INTERNAL_TOKEN = "test-internal-token-at-least-32-characters";
export const TEST_ADMIN_PASSWORD = "correct horse battery staple";
export const TEST_SCRAPER_CONTROL_TOKEN = "test-scraper-control-token-32-chars-min";

export interface TestContext {
  app: Express;
  dbHandle: DbHandle;
}

export async function createTestContext(): Promise<TestContext> {
  const dbHandle = createDb(":memory:");
  await ensureAdminPassword(dbHandle.db, TEST_ADMIN_PASSWORD);
  const app = createApp({
    db: dbHandle.db,
    jwtSecret: TEST_JWT_SECRET,
    internalToken: TEST_INTERNAL_TOKEN,
    allowedOrigins: ["http://localhost:5173"],
    scraperConfig: { baseUrl: "http://127.0.0.1:39999", controlToken: TEST_SCRAPER_CONTROL_TOKEN },
  });
  return { app, dbHandle };
}
