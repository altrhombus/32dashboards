import { z } from "zod";

export const AskMeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  title: z.string().max(120).default("Ask Me Spotlight"),
  message: z.string().max(1200).default(""),
  total: z.number().nonnegative().default(0),
});

export type AskMeConfig = z.infer<typeof AskMeConfigSchema>;
