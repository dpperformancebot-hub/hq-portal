// Server-side Supabase client (service role) for the persistence layer
// (M5 phase 2). Distinct from src/lib/supabase.ts (anon, browser-safe):
// this one bypasses RLS and must NEVER be imported into client components.
//
// Gated by HQ_PERSISTENCE=true so the GHL-direct request path stays the
// default until the migration is applied and the owner flips the flag.

// NOTE: add `import "server-only"` here once the package is installed (no
// network in the build sandbox). Until then the SUPABASE_SERVICE_ROLE_KEY env
// var (no NEXT_PUBLIC prefix) already keeps the key out of client bundles.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BRAND } from "@/lib/brand";

export function persistenceEnabled(): boolean {
  return (
    process.env.HQ_PERSISTENCE === "true" &&
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

let admin: SupabaseClient | null = null;

export function dbAdmin(): SupabaseClient {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Persistence is on but Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local / Vercel.",
      );
    }
    admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        // Cache reads in Next's Data Cache for 30s. The full roster read
        // (~776 clients + leads) is ~3s uncached, which made every page slow
        // under the previous no-store setting. Data changes ~daily (GHL cron
        // sync) plus occasional coach-log imports / Kahunas check-ins, so a
        // 30s window keeps pages fast while surfacing changes within ~30s, no
        // redeploy needed.
        // Per brand (Brand.dbReadCacheSeconds): the cache is stale-while-
        // revalidate and outlives deploys, so a brand that cannot afford a
        // stale first read (TJD) turns it off entirely.
        fetch: (input, init) =>
          BRAND.dbReadCacheSeconds > 0
            ? fetch(input, { ...init, next: { revalidate: BRAND.dbReadCacheSeconds } })
            : fetch(input, { ...init, cache: "no-store" }),
      },
    });
  }
  return admin;
}
