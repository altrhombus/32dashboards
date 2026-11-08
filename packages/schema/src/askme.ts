import { z } from "zod";

export const AskMeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  title: z.string().max(120).default("Ask Me Spotlight"),
  message: z.string().max(1200).default(""),
  total: z.number().nonnegative().default(0),
  /** The amount buttons on the console, in order. Empty: from the message, or the usual ones. */
  amounts: z.array(z.number().finite().positive().max(1_000_000)).max(8).default([]),
});

export type AskMeConfig = z.infer<typeof AskMeConfigSchema>;
