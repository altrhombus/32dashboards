import type { NextFunction, Request, RequestHandler, Response } from "express";
import { BadRequestError, ConflictError, NotFoundError } from "./errors.js";

export function asyncHandler(fn: (req: Request, res: Response) => unknown): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const handleError = (err: unknown) => {
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof ConflictError) {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err instanceof BadRequestError) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    };

    // fn() may throw synchronously (repository functions do) or return a
    // rejected promise -- both paths must route through the same mapping,
    // so the synchronous call itself needs its own try/catch rather than
    // relying on Promise.resolve() alone, which only wraps values that are
    // already returned, not exceptions thrown before a return happens.
    try {
      Promise.resolve(fn(req, res)).catch(handleError);
    } catch (err) {
      handleError(err);
    }
  };
}
