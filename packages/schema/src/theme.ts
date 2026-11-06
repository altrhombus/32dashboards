import { z } from "zod";

export const ThemeSchema = z.object({
  /** Broadcast-safe gold (each channel 16–235); see the UI's PALETTES. */
  accentColor: z.string().default("#ebc81e"),
  secondaryColor: z.string().default("#4dd0e1"),
  backgroundFrom: z.string().default("#181c2a"),
  backgroundTo: z.string().default("#23284a"),
  logoUrl: z.string().url().nullable().default(null),
  fontDisplay: z.string().default("Montserrat"),
  fontMono: z.string().default("Share Tech Mono"),
  /** Body text; light on dark backgrounds, dark on light ones. */
  textColor: z.string().default("#f4f6ff"),
  /**
   * The background: the two colors as a gradient, the first as a solid
   * color, or a gradient with a soft glow of the accent behind the total.
   */
  backgroundStyle: z.enum(["gradient", "solid", "glow"]).default("gradient"),
  /** A very slow, faint drift of the event's colors behind everything. Off by default. */
  backgroundMotion: z.boolean().default(false),
});

export type Theme = z.infer<typeof ThemeSchema>;
