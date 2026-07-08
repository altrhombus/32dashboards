import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import type { DrizzleDb } from "./db/client.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createAuthRouter } from "./routes/auth.js";
import { createEventsRouter } from "./routes/events.js";
import { createScraperProxyRouter } from "./routes/scraperProxy.js";
import { createInternalRouter } from "./routes/internal.js";
import { createSseRouter } from "./routes/sse.js";
import type { ScraperClientConfig } from "./lib/scraperClient.js";

export interface AppDeps {
  db: DrizzleDb;
  jwtSecret: string;
  internalToken: string;
  allowedOrigins: string[];
  scraperConfig: ScraperClientConfig;
}

export function createApp(deps: AppDeps): Express {
  const { db, jwtSecret, internalToken, allowedOrigins, scraperConfig } = deps;
  const app = express();

  app.disable("x-powered-by");
  // Trust exactly one hop: nginx (infra/nginx/nginx.conf.template sets
  // X-Forwarded-Proto from its own $scheme, not a client-suppliable value).
  // This is what lets req.secure reflect the real browser<->nginx scheme
  // rather than the scheme of this internal-network-only api<->nginx hop,
  // which is always plain HTTP regardless of what the public edge is doing.
  app.set("trust proxy", 1);
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", createAuthRouter({ db, jwtSecret }));

  const auth = requireAuth(jwtSecret);
  app.use("/api/events", auth, createEventsRouter(db, scraperConfig));
  app.use("/api/events/:id/scraper", auth, createScraperProxyRouter(db, scraperConfig));

  app.use("/internal", createInternalRouter({ db, internalToken }));

  app.use("/events", createSseRouter(db));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
