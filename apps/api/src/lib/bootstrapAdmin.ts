import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DrizzleDb } from "../db/client.js";
import { settings } from "../db/schema.js";
import { hashPassword } from "./auth.js";

const ADMIN_PASSWORD_HASH_KEY = "admin_password_hash";

/**
 * Seeds the admin password hash on first boot. If ADMIN_PASSWORD is set,
 * hashes and stores that. Otherwise generates a random password and logs it
 * once so the operator can retrieve it from container logs -- this keeps
 * self-hosting easy without ever storing a plaintext password.
 */
export async function ensureAdminPassword(db: DrizzleDb, envPassword: string | undefined): Promise<void> {
  const existing = db.select().from(settings).where(eq(settings.key, ADMIN_PASSWORD_HASH_KEY)).get();
  if (existing) return;

  const password = envPassword ?? randomBytes(9).toString("base64url");
  const hash = await hashPassword(password);
  db.insert(settings).values({ key: ADMIN_PASSWORD_HASH_KEY, value: hash }).run();

  if (!envPassword) {
    console.log("=".repeat(60));
    console.log("No ADMIN_PASSWORD set -- generated one for first boot:");
    console.log(`  ${password}`);
    console.log("Save this now. It will not be shown again.");
    console.log("=".repeat(60));
  }
}

export function getAdminPasswordHash(db: DrizzleDb): string | undefined {
  return db.select().from(settings).where(eq(settings.key, ADMIN_PASSWORD_HASH_KEY)).get()?.value;
}
