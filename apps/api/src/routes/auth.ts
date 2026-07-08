import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { DrizzleDb } from "../db/client.js";
import { getAdminPasswordHash } from "../lib/bootstrapAdmin.js";
import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE_MS, signSessionToken, verifyPassword } from "../lib/auth.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateBody } from "../middleware/validateBody.js";

const LoginSchema = z.object({ password: z.string().min(1) });

export interface AuthRouterDeps {
  db: DrizzleDb;
  jwtSecret: string;
}

export function createAuthRouter({ db, jwtSecret }: AuthRouterDeps): Router {
  const router = Router();

  // Scoped per-router (not module-level) so each app instance gets its own
  // MemoryStore -- a module-level limiter would be shared by every app
  // created in the same process, which is both wrong for tests (isolated
  // instances leaking rate-limit state into each other) and a latent bug.
  const loginRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too many login attempts, try again shortly" },
  });

  router.post("/login", loginRateLimit, validateBody(LoginSchema), async (req, res) => {
    const { password } = req.body as z.infer<typeof LoginSchema>;
    const hash = getAdminPasswordHash(db);
    if (!hash || !(await verifyPassword(hash, password))) {
      res.status(401).json({ error: "invalid password" });
      return;
    }

    const token = await signSessionToken(jwtSecret);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      // Per-request, not a static NODE_ENV check: a `Secure` cookie set
      // over a plain-HTTP connection is silently dropped by the browser
      // (never actually stored), which broke login entirely on the
      // Docker Compose deployment -- nginx doesn't terminate TLS by
      // default, so "production" here still means HTTP unless an
      // operator adds TLS in front. This tracks the real scheme (via
      // app.set("trust proxy", 1) + nginx's X-Forwarded-Proto) so it's
      // correct in both cases without a config flag to remember to flip.
      secure: req.secure,
      sameSite: "lax",
      maxAge: SESSION_COOKIE_MAX_AGE_MS,
    });
    res.json({ ok: true });
  });

  router.post("/logout", (req, res) => {
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  router.get("/session", requireAuth(jwtSecret), (req, res) => {
    res.json({ authenticated: true });
  });

  return router;
}
