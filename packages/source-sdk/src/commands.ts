import type NodeCG from "nodecg/types";
import { ZodError, type ZodIssue, type z } from "zod";

/** An error the operator can fix (unknown event, bad input…). Its message is shown in panels. */
export class CommandError extends Error {
  override name = "CommandError";
}

/** What people call the fields they're most likely to get wrong, where a field's path means nothing to them. */
const FIELD_NAMES: Record<string, string> = {
  announcements: "Announcement",
  askMeRounds: "Ask Me round",
  bidWars: "Bid war",
  callToAction: "Call to action",
  incentives: "Incentive",
  liveLots: "Live item",
  milestones: "Milestone",
  prizes: "Prize",
  sponsors: "Logo",
};

/** "announcements.3" -> "Announcement 4", "milestones.0.amount" -> "Milestone 1 amount". */
function fieldName(path: (string | number)[]): string {
  const [root, index, ...rest] = path;
  if (root === "patch") return fieldName(path.slice(1));
  const name = typeof root === "string" ? FIELD_NAMES[root] : undefined;
  if (!name) return path.join(".") || "(root)";
  if (typeof index !== "number") return name;
  return [`${name} ${index + 1}`, ...rest].join(" ");
}

function issueText(issue: ZodIssue): string {
  if (issue.code === "too_big" && issue.type === "string") return `is too long (${issue.maximum} characters at most)`;
  if (issue.code === "too_big" && issue.type === "array") return `has too many entries (${issue.maximum} at most)`;
  if (issue.code === "too_small" && issue.type === "number") {
    return issue.inclusive ? `must be at least ${issue.minimum}` : `must be more than ${issue.minimum}`;
  }
  if (issue.code === "too_small" && issue.type === "string") return "can't be empty";
  return issue.message;
}

export function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => `${fieldName(issue.path)}: ${issueText(issue)}`).join("; ");
}

function toCommandError(err: unknown): Error {
  if (err instanceof ZodError) return new CommandError(formatZodError(err));
  if (err instanceof Error) return err;
  return new Error(String(err));
}

/**
 * Listens for an operator Message: validates the payload with `schema`, runs
 * the command, and acks its result, or a readable Error if validation or the
 * command fails. Async commands are awaited before acking.
 */
export function listenForCommand<S extends z.ZodTypeAny>(
  nodecg: NodeCG.ServerAPI,
  name: string,
  schema: S,
  run: (payload: z.output<S>) => unknown,
): void {
  nodecg.listenFor(name, (raw: unknown, ack) => {
    const fail = (err: unknown) => {
      const error = toCommandError(err);
      nodecg.log.warn(`${name} rejected: ${error.message}`);
      if (ack && !ack.handled) ack(error);
    };
    const succeed = (reply: unknown) => {
      if (ack && !ack.handled) ack(null, reply);
    };
    try {
      const reply = run(schema.parse(raw));
      if (reply instanceof Promise) reply.then(succeed, fail);
      else succeed(reply);
    } catch (err) {
      fail(err);
    }
  });
}
