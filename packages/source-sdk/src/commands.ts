import type NodeCG from "nodecg/types";
import { ZodError, type z } from "zod";

/** An error the operator can fix (unknown event, bad input…). Its message is shown in panels. */
export class CommandError extends Error {
  override name = "CommandError";
}

export function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
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
