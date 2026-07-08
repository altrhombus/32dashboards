import path from "node:path";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { ensureAdminPassword } from "./lib/bootstrapAdmin.js";
import { createApp } from "./app.js";

const config = loadConfig();
const { db } = createDb(path.join(config.DATA_DIR, "db.sqlite"));

await ensureAdminPassword(db, config.ADMIN_PASSWORD);

const app = createApp({
  db,
  jwtSecret: config.JWT_SECRET,
  internalToken: config.INTERNAL_TOKEN,
  allowedOrigins: config.ALLOWED_ORIGINS,
  isProduction: config.NODE_ENV === "production",
  scraperConfig: { baseUrl: config.SCRAPER_BASE_URL, controlToken: config.SCRAPER_CONTROL_TOKEN },
});

app.listen(config.PORT, () => {
  console.log(`32dashboards api listening on :${config.PORT}`);
});
