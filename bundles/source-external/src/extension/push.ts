import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { formatZodError, type ReportOutcome, type SourceHandle } from "@32dashboards/source-sdk";
import { PushBodySchema } from "../model.js";

/*
 * The push endpoint's logic, separate from Express so it can be tested
 * directly. Only a SHA-256 hash of the token is stored; the token itself is
 * shown to the operator once, when it's created.
 */

export const hashToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export interface PushRequest {
  authorization: string | undefined;
  body: unknown;
}

export interface PushResponse {
  status: number;
  body: { outcome?: ReportOutcome; error?: string };
}

const STATUS_BY_OUTCOME: Record<ReportOutcome, number> = {
  stored: 200,
  invalid: 400,
  "unknown-event": 404,
  "wrong-source": 409,
  stale: 409,
};

const ERRORS: Partial<Record<ReportOutcome, string>> = {
  "unknown-event": "No event with that id",
  "wrong-source": `That event's source isn't "External push"; set it in the Events panel on the Event tab`,
  stale: "Older than the result already stored for that event",
};

export function tokenMatches(authorization: string | undefined, storedHash: string | undefined): boolean {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  if (!match || !storedHash) return false;
  const given = Buffer.from(hashToken(match[1]!), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function handlePush(
  request: PushRequest,
  deps: { tokenHash: string | undefined; handle: SourceHandle; now: () => string },
): PushResponse {
  if (!tokenMatches(request.authorization, deps.tokenHash)) {
    return { status: 401, body: { error: "Missing or wrong bearer token" } };
  }
  const parsed = PushBodySchema.safeParse(request.body);
  if (!parsed.success) return { status: 400, body: { outcome: "invalid", error: formatZodError(parsed.error) } };

  const outcome = deps.handle.report({ ...parsed.data, observedAt: parsed.data.observedAt ?? deps.now() });
  return { status: STATUS_BY_OUTCOME[outcome], body: { outcome, ...(ERRORS[outcome] && { error: ERRORS[outcome] }) } };
}
