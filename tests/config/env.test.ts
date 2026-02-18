import { describe, it, expect, vi, beforeEach } from "vitest";

describe("getEnv", () => {
  const VALID_ENV = {
    ANTHROPIC_API_KEY: "sk-ant-test-key",
    ETSY_API_KEY: "etsy-test-key",
    ETSY_SHARED_SECRET: "etsy-secret",
    ETSY_SHOP_ID: "12345",
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  };

  beforeEach(() => {
    vi.resetModules();
    // Restore process.env — each test sets its own
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ETSY_API_KEY", "");
    vi.stubEnv("ETSY_SHARED_SECRET", "");
    vi.stubEnv("ETSY_SHOP_ID", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  });

  it("returns parsed config when all required vars are present", async () => {
    for (const [key, val] of Object.entries(VALID_ENV)) {
      vi.stubEnv(key, val);
    }
    const { getEnv } = await import("@/config/env");
    const env = getEnv();
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-test-key");
    expect(env.ETSY_SHOP_ID).toBe("12345");
  });

  it("throws when a required var is missing", async () => {
    // Set all but ANTHROPIC_API_KEY
    for (const [key, val] of Object.entries(VALID_ENV)) {
      if (key !== "ANTHROPIC_API_KEY") vi.stubEnv(key, val);
    }
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { getEnv } = await import("@/config/env");
    expect(() => getEnv()).toThrow("ANTHROPIC_API_KEY");
  });

  it("passes when optional vars are missing", async () => {
    for (const [key, val] of Object.entries(VALID_ENV)) {
      vi.stubEnv(key, val);
    }
    // OPENAI_API_KEY is optional — don't set it
    const { getEnv } = await import("@/config/env");
    const env = getEnv();
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it("caches result on second call", async () => {
    for (const [key, val] of Object.entries(VALID_ENV)) {
      vi.stubEnv(key, val);
    }
    const { getEnv } = await import("@/config/env");
    const first = getEnv();
    const second = getEnv();
    expect(first).toBe(second);
  });

  it("throws when a required var is an empty string", async () => {
    for (const [key, val] of Object.entries(VALID_ENV)) {
      vi.stubEnv(key, val);
    }
    vi.stubEnv("ETSY_API_KEY", "");
    const { getEnv } = await import("@/config/env");
    expect(() => getEnv()).toThrow("ETSY_API_KEY");
  });
});
