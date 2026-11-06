import { z } from "zod";

/**
 * What's behind a logo on screen: "auto" adds a plate only when the logo is
 * see-through and hard to read on the background; the others force a plate
 * (in the theme's text color), a glow outline, one color (the theme's text
 * color, for a see-through logo), or nothing.
 */
export const LOGO_BACKDROPS = ["auto", "plate", "outline", "mono", "none"] as const;
export const LogoBackdropSchema = z.enum(LOGO_BACKDROPS);
export type LogoBackdrop = z.infer<typeof LogoBackdropSchema>;

export const SponsorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  logoUrl: z.string().nullable(),
  sortOrder: z.number().int().nonnegative(),
  /** Omitted: "auto". (Optional, so records from before it existed, and the legacy API's, stay valid.) */
  backdrop: LogoBackdropSchema.optional(),
});

export type Sponsor = z.infer<typeof SponsorSchema>;

export const CreateSponsorInputSchema = SponsorSchema.omit({ id: true });
export type CreateSponsorInput = z.infer<typeof CreateSponsorInputSchema>;
