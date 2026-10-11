import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit-test runner for the HQ's pure logic: the GHL/DB mappers and the
// HQ-owned server actions' guards. No DOM, no Next runtime: tests mock the
// Supabase admin client and next/cache, so this stays a fast Node-only suite.
// The "@/..." alias mirrors tsconfig.json "paths" so test imports match app
// imports exactly.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
    // Pin the brand. BRAND is resolved once at module load from
    // NEXT_PUBLIC_BRAND, so without this the result of the suite depended on
    // whatever the shell happened to export: running it as tjd failed 14
    // DP-config tests that were not brand-pinned. Brand-specific behaviour is
    // covered by reading the BRANDS map directly (see brand.test.ts), which
    // does not care what the process was built as.
    env: { NEXT_PUBLIC_BRAND: "dp" },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // See test/server-only-stub.ts: keeps the build-time guard, out of Node.
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
});
