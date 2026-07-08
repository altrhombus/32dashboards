import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE, verifySessionToken } from "../lib/auth.js";

export function requireAuth(jwtSecret: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== "string" || !(await verifySessionToken(jwtSecret, token))) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    next();
  };
}
