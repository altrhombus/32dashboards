import { z } from "zod";

export const ThemeSchema = z.object({
  accentColor: z.string().default("#ffd700"),
  secondaryColor: z.string().default("#4dd0e1"),
  backgroundFrom: z.string().default("#181c2a"),
  backgroundTo: z.string().default("#23284a"),
  logoUrl: z.string().url().nullable().default(null),
  fontDisplay: z.string().default("Montserrat"),
  fontMono: z.string().default("Share Tech Mono"),
});

export type Theme = z.infer<typeof ThemeSchema>;
