import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  ETSY_API_KEY: z.string().min(1, "ETSY_API_KEY is required"),
  ETSY_SHARED_SECRET: z.string().min(1, "ETSY_SHARED_SECRET is required"),
  ETSY_SHOP_ID: z.string().min(1, "ETSY_SHOP_ID is required"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  ETSY_ACCESS_TOKEN: z.string().optional(),
  ETSY_REFRESH_TOKEN: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ADMIN_API_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => `  ${i.path}: ${i.message}`).join("\n");
    throw new Error(`Missing or invalid environment variables:\n${errors}`);
  }
  _env = parsed.data;
  return _env;
}
