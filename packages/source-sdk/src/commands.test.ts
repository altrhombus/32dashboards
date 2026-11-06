import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formatZodError } from "./commands.js";

const errorFor = (schema: z.ZodTypeAny, value: unknown) => {
  const parsed = schema.safeParse(value);
  if (parsed.success) throw new Error("expected a validation error");
  return formatZodError(parsed.error);
};

describe("formatZodError", () => {
  it("names the entry a person would look for", () => {
    const schema = z.object({ patch: z.object({ announcements: z.array(z.string().max(5)) }) });
    expect(errorFor(schema, { patch: { announcements: ["ok", "much too long"] } })).toBe(
      "Announcement 2: is too long (5 characters at most)",
    );
  });

  it("names a field inside an entry", () => {
    const schema = z.object({ milestones: z.array(z.object({ amount: z.number().positive() })) });
    expect(errorFor(schema, { milestones: [{ amount: 0 }] })).toBe("Milestone 1 amount: must be more than 0");
  });

  it("says when a list is too long", () => {
    expect(errorFor(z.object({ milestones: z.array(z.number()).max(1) }), { milestones: [1, 2] })).toBe(
      "Milestone: has too many entries (1 at most)",
    );
  });

  it("falls back to the path for fields people don't edit by name", () => {
    expect(errorFor(z.object({ eventId: z.string().uuid() }), { eventId: "nope" })).toBe("eventId: Invalid uuid");
  });
});
