import { z } from "zod";

/**
 * Field names/semantics preserved from the legacy api/server.js normalizeIncentive():
 * displayNow/displayUntilMet/active retain their exact original meaning.
 */
export const IncentiveSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  target: z.number().nonnegative(),
  active: z.boolean().default(false),
  displayNow: z.boolean().default(false),
  displayUntilMet: z.boolean().default(false),
});

export type Incentive = z.infer<typeof IncentiveSchema>;

export const CreateIncentiveInputSchema = IncentiveSchema.omit({ id: true }).partial({
  active: true,
  displayNow: true,
  displayUntilMet: true,
});
export type CreateIncentiveInput = z.infer<typeof CreateIncentiveInputSchema>;

export const UpdateIncentiveInputSchema = IncentiveSchema.omit({ id: true }).partial();
export type UpdateIncentiveInput = z.infer<typeof UpdateIncentiveInputSchema>;

export const IncentiveStateInputSchema = z
  .object({
    displayNow: z.boolean().optional(),
    displayUntilMet: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => v.displayNow !== undefined || v.displayUntilMet !== undefined || v.active !== undefined, {
    message: "at least one of displayNow, displayUntilMet, active must be provided",
  });
export type IncentiveStateInput = z.infer<typeof IncentiveStateInputSchema>;
