import type { Request } from "express";
import { BadRequestError } from "./errors.js";

/**
 * Express 5's ParamsDictionary types values as `string | string[]` (path
 * patterns can now produce arrays for repeating segments). Every route in
 * this app uses single named params, so this narrows defensively at
 * runtime rather than trusting a type assertion.
 */
export function paramString(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new BadRequestError(`missing or invalid path parameter: ${name}`);
  }
  return value;
}
