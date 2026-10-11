import { z } from "zod";

/**
 * Replicant `spikeTotal`. The core owns the adjustment and applies it here,
 * so sources only ever report what they observed. This is the fix for the
 * current stack's "adjustment never reaches the display" bug, in miniature.
 */
export const spikeTotal = z.object({
  sourceId: z.string().nullable(),
  rawTotal: z.number(),
  adjustment: z.number(),
  total: z.number(),
  observedAt: z.string().nullable(),
});

export type SpikeTotal = z.infer<typeof spikeTotal>;
