import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/config/**/*.ts"],
      exclude: ["src/lib/supabase/client.ts"],
    },
    testTimeout: 15000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
