#!/usr/bin/env node
// Creates cfg/nodecg.json (gitignored) with login enabled, a random session
// secret, and one local admin user. The password is stored the way NodeCG's
// local auth expects: "sha256:" + HMAC-SHA256(sessionSecret, password).
//
//   pnpm nodecg:setup                 generate a random admin password (printed once)
//   NODECG_ADMIN_PASSWORD=... pnpm nodecg:setup
//   pnpm nodecg:setup --force         overwrite an existing cfg/nodecg.json
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const cfgDir = path.resolve(import.meta.dirname, "..", "cfg");
const cfgPath = path.join(cfgDir, "nodecg.json");
const force = process.argv.includes("--force");

if (existsSync(cfgPath) && !force) {
  console.error(`${cfgPath} already exists. Re-run with --force to replace it (this logs everyone out).`);
  process.exit(1);
}

const sessionSecret = randomBytes(32).toString("hex");
const providedPassword = process.env.NODECG_ADMIN_PASSWORD;
const password = providedPassword || randomBytes(12).toString("base64url");
const passwordHash = createHmac("sha256", sessionSecret).update(password, "utf8").digest("hex");

const config = {
  host: "0.0.0.0",
  port: 9090,
  login: {
    enabled: true,
    sessionSecret,
    local: {
      enabled: true,
      allowedUsers: [{ username: "admin", password: `sha256:${passwordHash}` }],
    },
  },
};

mkdirSync(cfgDir, { recursive: true });
writeFileSync(cfgPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

console.log(`Wrote ${cfgPath}`);
console.log("Dashboard login: admin");
if (!providedPassword) console.log(`Generated password (shown once, store it somewhere safe): ${password}`);
