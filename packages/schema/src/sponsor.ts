import { z } from "zod";

export const SponsorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  logoUrl: z.string().nullable(),
  sortOrder: z.number().int().nonnegative(),
});

export type Sponsor = z.infer<typeof SponsorSchema>;

export const CreateSponsorInputSchema = SponsorSchema.omit({ id: true });
export type CreateSponsorInput = z.infer<typeof CreateSponsorInputSchema>;
