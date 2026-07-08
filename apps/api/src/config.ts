import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8090),
  DATA_DIR: z.string().default("./data"),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters -- generate one with `openssl rand -hex 32`"),
  INTERNAL_TOKEN: z
    .string()
    .min(32, "INTERNAL_TOKEN must be at least 32 characters -- generate one with `openssl rand -hex 32`"),
  ADMIN_PASSWORD: z.string().min(1).optional(),
  SCRAPER_BASE_URL: z.string().default("http://scraper:8081"),
  SCRAPER_CONTROL_TOKEN: z
    .string()
    .min(32, "SCRAPER_CONTROL_TOKEN must be at least 32 characters -- generate one with `openssl rand -hex 32`"),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://localhost:5174")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
