import { afterEach, describe, expect, it, vi } from "vitest";

// Brand.dbReadCacheSeconds: TJD reads Supabase fresh every time, DP keeps its
// 30s Data Cache. The cache is stale-while-revalidate and outlives deploys, so
// on TJD a quiet spell replayed a pre-import roster and a pre-invite invite
// list (the owner landed on /no-access). This pins the fetch options dbAdmin
// hands to every PostgREST request, per brand.

const captured: RequestInit[] = [];

async function readOnce(brandKey: "dp" | "tjd"): Promise<RequestInit> {
  vi.resetModules();
  vi.doMock("@/lib/brand", async (orig) => {
    const real = (await orig()) as { BRANDS: Record<string, unknown> };
    return { ...real, BRAND: real.BRANDS[brandKey] };
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  captured.length = 0;
  vi.stubGlobal("fetch", (_input: unknown, init: RequestInit) => {
    captured.push(init);
    return Promise.resolve(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
  });
  const { dbAdmin } = await import("@/lib/db/client");
  await dbAdmin().from("clients").select("id");
  expect(captured.length).toBe(1);
  return captured[0];
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("@/lib/brand");
});

describe("dbAdmin read cache per brand", () => {
  it("TJD never serves a cached read", async () => {
    const init = (await readOnce("tjd")) as RequestInit & { next?: unknown };
    expect(init.cache).toBe("no-store");
    expect(init.next).toBeUndefined();
  });

  it("DP keeps the 30 second Data Cache, unchanged", async () => {
    const init = (await readOnce("dp")) as RequestInit & { next?: { revalidate?: number } };
    expect(init.next?.revalidate).toBe(30);
    expect(init.cache).toBeUndefined();
  });
});
