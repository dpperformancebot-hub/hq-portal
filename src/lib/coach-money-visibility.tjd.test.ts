import * as React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ServerIdentity } from "@/lib/role-server";
import {
  SENTINEL_MONEY,
  SENTINEL_RATE,
  moneyLeaksInPayload,
  serialise,
} from "../../test/coach-money-fixtures";

// TJD owner rule: NO pay or money figure reaches a coach or head coach
// anywhere, and "view as coach" shows exactly what that coach sees, so the
// owner viewing the portal as a coach or head coach gets no money either. The
// owner (NOT viewing as anyone) and admin keep everything. One test per leak
// the audit found: each asserts the money is ABSENT (zeroed, column gone,
// route bounced) for a TJD coach / head coach / owner-as-coach and PRESENT
// for the TJD owner. Real data layer in demo mode, seed
// money replaced by sentinels (4321.99 / 8765). The cross-page sweep lives in
// coach-money-sweep.tjd.test.ts; DP regressions in coach-money-visibility.test.ts.

(globalThis as unknown as { React: typeof React }).React = React;

const h = vi.hoisted(() => ({ identity: null as unknown as ServerIdentity }));

// The default card comes from a server-only env var (the real figures are not
// in the repo). A FICTIONAL card, set before any module reads it.
const TEST_CARD = vi.hoisted(() => {
  const card = { brandWeekly: 60, brandFortnightly: 45, referralWeekly: 80, referralFortnightly: 61.25, clientWeekly: 110, clientFortnightly: 85 };
  process.env.TJD_DEFAULT_RATE_CARD = JSON.stringify(card);
  return card;
});

vi.mock("@/lib/brand", async (orig) => {
  const real = (await orig()) as { BRANDS: Record<string, unknown> };
  return { ...real, BRAND: real.BRANDS.tjd, BRAND_KEY: "tjd", IS_DP: false };
});
vi.mock("@/lib/seed", async (orig) => {
  const { moneySeed } = await import("../../test/coach-money-fixtures");
  return moneySeed(await orig());
});
vi.mock("@/lib/role-server", async () => {
  const ap = await import("@/lib/access-policy");
  const id = () => h.identity;
  return {
    NO_ACCESS_PATH: "/no-access",
    clerkAuthEnabled: () => false,
    getServerIdentity: async () => id(),
    getServerRole: async () => id().role,
    assertBrandManager: async () => (ap.canManageBrandContent(id()) ? null : ap.DENY.brand),
    assertFinancialsAccess: async () => (ap.canViewFinancials(id()) ? null : ap.DENY.financials),
    assertOwnerOnly: async () => (ap.canGrantRoles(id()) ? null : ap.DENY.ownerOnly),
  };
});
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set() {}, delete() {} }),
  headers: async () => new Headers(),
}));
vi.mock("react", async (orig) => ({ ...((await orig()) as Record<string, unknown>), cache: (fn: unknown) => fn }));
vi.mock("next/cache", () => ({ revalidatePath() {}, revalidateTag() {} }));

import { BRANDS } from "@/lib/brand";
import { moneyHiddenFromViewer } from "@/lib/access-policy";
import {
  forMoneyViewer,
  stripAnalyticsMoney,
  stripClientMoney,
  stripConversationMoneyAll,
  stripLeadMoneyAll,
  stripWrappedClientMoneyAll,
} from "@/lib/pay-visibility";
import { getCoachClientDetail, getCoachDashboardData, getCoachRosterData } from "@/lib/data";
import type { Role } from "@/lib/navigation";

const ident = (role: Role, over: Partial<ServerIdentity> = {}): ServerIdentity => ({
  role,
  realRole: role,
  displayName: null,
  linkedCoachId: null,
  impersonating: false,
  isHeadCoach: false,
  realIsHeadCoach: false,
  ...over,
});
const COACH = ident("coach", { linkedCoachId: "co2" });
const HEAD_COACH = ident("coach", { linkedCoachId: "co1", isHeadCoach: true, realIsHeadCoach: true });
const OWNER = ident("owner");
const OWNER_AS_COACH = ident("coach", { realRole: "owner", impersonating: true, linkedCoachId: "co2" });
const OWNER_AS_HEAD_COACH = ident("coach", { realRole: "owner", impersonating: true, linkedCoachId: "co1", isHeadCoach: true });
const ADMIN = ident("admin");

let clientId = "";
beforeAll(async () => {
  clientId = (await getCoachRosterData("co2", { viewer: OWNER })).clients[0]!.id;
});

/** Run a page server component as `identity`; the tree, or where it went. */
async function page(
  path: string,
  identity: ServerIdentity,
  params: Record<string, unknown> = {},
): Promise<{ redirect: string } | { tree: unknown; json: string }> {
  h.identity = identity;
  const mod = (await import(/* @vite-ignore */ `@/app/(hq)/${path}/page`)) as {
    default: (p: { params: Promise<unknown>; searchParams: Promise<unknown> }) => unknown;
  };
  try {
    const tree = await mod.default({ params: Promise.resolve(params), searchParams: Promise.resolve({}) });
    return { tree, json: serialise(tree) };
  } catch (e) {
    const m = String((e as Error).message);
    if (m.startsWith("NEXT_REDIRECT:")) return { redirect: m.slice(14) };
    throw e;
  }
}

/** The first element prop object in the tree that has `key`. */
function propOf(tree: unknown, key: string): unknown {
  const stack: unknown[] = [tree];
  while (stack.length) {
    const n = stack.pop();
    if (Array.isArray(n)) stack.push(...n);
    else if (n && typeof n === "object" && "props" in n) {
      const props = (n as { props: Record<string, unknown> }).props;
      if (key in props) return props[key];
      stack.push(props.children);
    }
  }
  return undefined;
}

const leaks = (json: string) => moneyLeaksInPayload(json);

function expectRendered(r: Awaited<ReturnType<typeof page>>): { tree: unknown; json: string } {
  if ("redirect" in r) throw new Error(`expected a render, got a redirect to ${r.redirect}`);
  return r;
}

// --- Policy -----------------------------------------------------------------

describe("moneyHiddenFromViewer (TJD)", () => {
  it("hides money from a real coach (plain or head), nobody else signed in as themselves", () => {
    expect(moneyHiddenFromViewer(COACH)).toBe(true);
    expect(moneyHiddenFromViewer(HEAD_COACH)).toBe(true);
    for (const r of ["owner", "admin", "va", "ops_manager", "sales", "ambassador_mgr"] as Role[]) {
      expect(moneyHiddenFromViewer({ realRole: r, role: r }), r).toBe(false);
    }
  });

  it("the owner viewing as a coach or head coach is money-blind too (exactly the coach's view)", () => {
    expect(moneyHiddenFromViewer(OWNER_AS_COACH)).toBe(true);
    expect(moneyHiddenFromViewer(OWNER_AS_HEAD_COACH)).toBe(true);
  });

  it("a forged effective role cannot lift it from a real coach", () => {
    expect(moneyHiddenFromViewer({ realRole: "coach", role: "owner" })).toBe(true);
  });

  it("never hides on a brand where coaches see pay (DP)", () => {
    expect(moneyHiddenFromViewer(COACH, true)).toBe(false);
    expect(moneyHiddenFromViewer(OWNER_AS_COACH, true)).toBe(false);
  });
});

// --- Central helpers --------------------------------------------------------

describe("client money strip helpers", () => {
  const client = { id: "c1", plan: "Weekly", payer: "monthly", weeklyRate: 4321.99, monthlyRate: 8765, cashCollected: 8765 };

  it("stripClientMoney zeroes price, monthly equivalent and billed-to-date, keeps cadence/payer", () => {
    const out = stripClientMoney(client);
    expect(out).toMatchObject({ weeklyRate: 0, monthlyRate: 0, cashCollected: 0, plan: "Weekly", payer: "monthly" });
    expect(client.weeklyRate).toBe(4321.99); // not mutated
    expect("cashCollected" in stripClientMoney({ id: "x", monthlyRate: 5 })).toBe(false);
  });

  it("wrapped rows, leads, inbox threads and analytics are stripped", () => {
    expect(stripWrappedClientMoneyAll([{ client, daysToRenewal: 3 }])[0]).toMatchObject({ client: { monthlyRate: 0 }, daysToRenewal: 3 });
    expect(stripLeadMoneyAll([{ id: "l", value: 8765 }])[0].value).toBe(0);
    expect(stripConversationMoneyAll([{ id: "t", ltv: 8765 }])[0].ltv).toBe(0);
    expect(stripAnalyticsMoney({ sourcePerf: [{ source: "IG", revenue: 8765 }] }).sourcePerf[0].revenue).toBe(0);
  });

  it("forMoneyViewer strips for a coach and the owner viewing as one, not the owner/admin", () => {
    const strip = (c: typeof client) => stripClientMoney(c);
    expect(forMoneyViewer(COACH, client, strip).monthlyRate).toBe(0);
    expect(forMoneyViewer(OWNER_AS_COACH, client, strip).monthlyRate).toBe(0);
    expect(forMoneyViewer(OWNER_AS_HEAD_COACH, client, strip).monthlyRate).toBe(0);
    expect(forMoneyViewer(OWNER, client, strip).monthlyRate).toBe(8765);
    expect(forMoneyViewer(ADMIN, client, strip).monthlyRate).toBe(8765);
  });
});

// --- Data layer (coach loaders) ---------------------------------------------

describe("coach loaders strip client money at the source", () => {
  it("getCoachRosterData: coach, owner-as-coach and no-viewer are stripped, owner viewer keeps it", async () => {
    expect(leaks(serialise(await getCoachRosterData("co2", { viewer: COACH })))).toEqual([]);
    expect(leaks(serialise(await getCoachRosterData("co2")))).toEqual([]); // fails closed
    expect(leaks(serialise(await getCoachRosterData("co1", { viewer: HEAD_COACH })))).toEqual([]);
    expect(leaks(serialise(await getCoachRosterData("co2", { viewer: OWNER_AS_COACH })))).toEqual([]);
    expect(leaks(serialise(await getCoachRosterData("co1", { viewer: OWNER_AS_HEAD_COACH })))).toEqual([]);
    const owner = await getCoachRosterData("co2", { viewer: OWNER });
    expect(owner.clients[0]!.monthlyRate).toBe(SENTINEL_MONEY);
    expect(owner.clients[0]!.weeklyRate).toBe(SENTINEL_RATE);
  });

  it("getCoachDashboardData: roster and at-risk lists carry no prices for a coach", async () => {
    const d = await getCoachDashboardData("co2", { viewer: COACH });
    expect(d.roster.length).toBeGreaterThan(0);
    expect(d.roster.every((c) => c.monthlyRate === 0 && c.weeklyRate === 0 && c.cashCollected === 0)).toBe(true);
    // The coach card's own rates are stripped by the page (stripCoachDashboardPay);
    // the client lists are stripped here at the source, for the owner-as-coach too.
    const oc = await getCoachDashboardData("co2", { viewer: OWNER_AS_COACH });
    expect(oc.roster.every((c) => c.monthlyRate === 0 && c.weeklyRate === 0 && c.cashCollected === 0)).toBe(true);
    expect(leaks(serialise(oc.roster))).toEqual([]);
    const o = await getCoachDashboardData("co2", { viewer: OWNER });
    expect(o.roster[0]!.monthlyRate).toBe(SENTINEL_MONEY);
  });

  it("getCoachClientDetail: stripped for a coach and the owner as coach, kept for the owner", async () => {
    const c = await getCoachClientDetail(clientId, "co2", COACH);
    expect(c?.client).toMatchObject({ weeklyRate: 0, monthlyRate: 0, cashCollected: 0 });
    const oc = await getCoachClientDetail(clientId, "co2", OWNER_AS_COACH);
    expect(oc?.client).toMatchObject({ weeklyRate: 0, monthlyRate: 0, cashCollected: 0 });
    expect((await getCoachClientDetail(clientId, "co2", OWNER))?.client.cashCollected).toBe(SENTINEL_MONEY);
  });
});

// --- Server actions ---------------------------------------------------------

describe("getClientPanelAction (check-ins / My Clients slide-over)", () => {
  it("returns the client with no money to a coach, a head coach and the owner viewing as either", async () => {
    const { getClientPanelAction } = await import("@/lib/client-panel-actions");
    for (const id of [COACH, HEAD_COACH, OWNER_AS_COACH, OWNER_AS_HEAD_COACH]) {
      h.identity = id;
      const out = await getClientPanelAction(clientId);
      expect(out?.detail.client.monthlyRate).toBe(0);
      expect(leaks(serialise(out))).toEqual([]);
    }
  });

  it("keeps it for the owner (not viewing as anyone)", async () => {
    const { getClientPanelAction } = await import("@/lib/client-panel-actions");
    h.identity = OWNER;
    expect((await getClientPanelAction(clientId))?.detail.client.weeklyRate).toBe(SENTINEL_RATE);
  });
});

// --- Coach screens ----------------------------------------------------------

describe("coach screens: payload has no client money for a coach or the owner viewing as one", () => {
  for (const [path, params] of [
    ["my-clients", {}],
    ["check-ins", {}],
    ["dashboard", {}],
    ["my-clients/[id]", null],
  ] as const) {
    it(`/${path}`, async () => {
      const p = params ?? { id: clientId };
      expect(leaks(expectRendered(await page(path, COACH, p)).json)).toEqual([]);
      expect(leaks(expectRendered(await page(path, OWNER_AS_COACH, p)).json)).toEqual([]);
      expect(leaks(expectRendered(await page(path, OWNER_AS_HEAD_COACH, p)).json)).toEqual([]);
    });
  }

  it("/coach-overview/[coachId]: the head coach gets the roster without prices, the owner with", async () => {
    expect(leaks(expectRendered(await page("coach-overview/[coachId]", HEAD_COACH, { coachId: "co2" })).json)).toEqual([]);
    const asHead = await page("coach-overview/[coachId]", OWNER_AS_HEAD_COACH, { coachId: "co2" });
    if (!("redirect" in asHead)) expect(leaks(asHead.json)).toEqual([]);
    const owner = expectRendered(await page("coach-overview/[coachId]", OWNER, { coachId: "co2" }));
    expect(owner.json).toContain(String(SENTINEL_MONEY));
  });
});

// --- All-client surfaces a head coach reaches ------------------------------

describe("all-client surfaces: stripped for a TJD head coach, intact for the owner", () => {
  it("/client-database: prices zeroed AND the $ column/CSV hidden (showMoney false)", async () => {
    const hc = expectRendered(await page("client-database", HEAD_COACH));
    expect(leaks(hc.json)).toEqual([]);
    expect(propOf(hc.tree, "showMoney")).toBe(false);
    const oh = expectRendered(await page("client-database", OWNER_AS_HEAD_COACH));
    expect(leaks(oh.json)).toEqual([]);
    expect(propOf(oh.tree, "showMoney")).toBe(false);
    const ow = expectRendered(await page("client-database", OWNER));
    expect(ow.json).toContain(String(SENTINEL_MONEY));
    expect(propOf(ow.tree, "showMoney")).toBe(true);
  });

  it("/client-database/[id]: monthly equivalent, LTV, billing tab gone for the head coach", async () => {
    const hc = expectRendered(await page("client-database/[id]", HEAD_COACH, { id: clientId }));
    expect(leaks(hc.json)).toEqual([]);
    expect(propOf(hc.tree, "showMoney")).toBe(false);
    const ow = expectRendered(await page("client-database/[id]", OWNER, { id: clientId }));
    expect(propOf(ow.tree, "client")).toMatchObject({ weeklyRate: SENTINEL_RATE, cashCollected: SENTINEL_MONEY });
    expect(propOf(ow.tree, "showMoney")).toBe(true);
  });

  for (const path of ["renewals", "va-dashboard", "coach-performance"]) {
    it(`/${path}: the wrapped client records carry no prices for the head coach (or the owner as one)`, async () => {
      expect(leaks(expectRendered(await page(path, HEAD_COACH)).json)).toEqual([]);
      const oh = await page(path, OWNER_AS_HEAD_COACH);
      if (!("redirect" in oh)) expect(leaks(oh.json)).toEqual([]);
      expect(expectRendered(await page(path, OWNER)).json).toContain(String(SENTINEL_MONEY));
    });
  }

  for (const [path, field] of [
    ["analytics", "revenue"],
    ["pipeline", "value"],
    ["inbox", "ltv"],
  ] as const) {
    it(`/${path}: ${field} zeroed and hidden for the head coach (URL-reachable)`, async () => {
      const hc = expectRendered(await page(path, HEAD_COACH));
      expect(leaks(hc.json)).toEqual([]);
      expect(hc.json).not.toContain(`"${field}":${SENTINEL_MONEY}`);
      expect(propOf(hc.tree, "showMoney")).toBe(false);
      const oh = expectRendered(await page(path, OWNER_AS_HEAD_COACH));
      expect(leaks(oh.json)).toEqual([]);
      expect(propOf(oh.tree, "showMoney")).toBe(false);
      const ow = expectRendered(await page(path, OWNER));
      expect(ow.json).toContain(`"${field}":${SENTINEL_MONEY}`);
      expect(propOf(ow.tree, "showMoney")).toBe(true);
    });
  }
});

// --- Blocked routes ---------------------------------------------------------

describe("money routes bounce a TJD coach (and the owner viewing as one) to the dashboard, never an error page", () => {
  for (const path of ["my-pay", "payroll", "financials", "settings", "daily-digest", "reports/[id]"]) {
    it(`/${path}`, async () => {
      const params = path === "reports/[id]" ? { id: "r1" } : {};
      expect(await page(path, COACH, params)).toEqual({ redirect: "/dashboard" });
      expect(await page(path, HEAD_COACH, params)).toEqual({ redirect: "/dashboard" });
      expect(await page(path, OWNER_AS_COACH, params)).toEqual({ redirect: "/dashboard" });
      expect(await page(path, OWNER_AS_HEAD_COACH, params)).toEqual({ redirect: "/dashboard" });
      // The owner NOT viewing as anyone gets the screen. /my-pay is a coach
      // screen; the owner reaches it signed in as themselves.
      expect("redirect" in (await page(path, OWNER, params))).toBe(false);
    });
  }

  it("/style-guide (sample $ figures) bounces a coach, renders for the owner", async () => {
    const mod = await import("@/app/style-guide/page");
    const run = async (id: ServerIdentity) => {
      h.identity = id;
      try {
        await mod.default();
        return null;
      } catch (e) {
        return String((e as Error).message);
      }
    };
    expect(await run(COACH)).toBe("NEXT_REDIRECT:/dashboard");
    expect(await run(HEAD_COACH)).toBe("NEXT_REDIRECT:/dashboard");
    expect(await run(OWNER_AS_COACH)).toBe("NEXT_REDIRECT:/dashboard");
    expect(await run(OWNER)).toBeNull();
  });

  it("the settings rate-card section is unreachable (settings bounces any coach)", async () => {
    expect(await page("settings", OWNER_AS_COACH)).toEqual({ redirect: "/dashboard" });
  });
});

// --- Client bundle ----------------------------------------------------------

describe("the TJD rate card is not in the client bundle", () => {
  it("brand.ts (imported by client components) carries no rate card", () => {
    const json = JSON.stringify(BRANDS);
    expect(json).not.toContain("defaultRateCard");
    expect(json).not.toContain("61.25");
  });

  it("the server-only default card still feeds the owner's New coach form", async () => {
    const { DEFAULT_RATE_CARD } = await import("@/lib/pay/default-rate-card");
    expect(DEFAULT_RATE_CARD).toEqual(TEST_CARD);
    const owner = expectRendered(await page("team/new-coach", OWNER));
    expect(propOf(owner.tree, "defaultCard")).toEqual(DEFAULT_RATE_CARD);
    expect(await page("team/new-coach", COACH)).toEqual({ redirect: "/team" });
    expect(await page("team/new-coach", OWNER_AS_COACH)).toEqual({ redirect: "/team" });
  });
});
