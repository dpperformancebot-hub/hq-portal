import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import type { ServerIdentity } from "@/lib/role-server";

// The unit suite compiles .tsx with the classic JSX runtime (React.createElement)
// and the config is Node-only, so the page module needs React on the global.
(globalThis as unknown as { React: typeof React }).React = React;

// Brand.pay.coachCanSeePay = false (TJD): coaches and head coaches never see
// pay. BRAND resolves once at module load, so the TJD rule needs its own file
// with the brand mocked; the DP (unchanged) cases live in
// coach-pay-visibility.test.ts.

const h = vi.hoisted(() => ({
  identity: null as unknown as ServerIdentity,
  redirectedTo: null as string | null,
}));

vi.mock("@/lib/brand", async (orig) => {
  const real = (await orig()) as { BRANDS: Record<string, unknown> };
  return { ...real, BRAND: real.BRANDS.tjd, BRAND_KEY: "tjd", IS_DP: false };
});

vi.mock("@/lib/role-server", () => ({
  getServerIdentity: () => Promise.resolve(h.identity),
}));

// next/navigation's redirect() throws to abort rendering; mirror that so the
// page never runs past the guard.
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    h.redirectedTo = to;
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

// The page's views and data are irrelevant to the guard; stub them so the
// test never touches the datastore.
vi.mock("@/components/screens/coach-tools/my-pay-view", () => ({ MyPayView: () => null }));
vi.mock("@/components/screens/pay/tjd-my-pay-view", () => ({ TjdMyPayView: () => null }));
vi.mock("@/lib/data", () => ({
  getMyPayData: () => Promise.resolve({}),
  getClientsData: () => Promise.resolve([]),
  getCoachNamesData: () => Promise.resolve({}),
  getLeadsData: () => Promise.resolve([]),
}));

import { BRAND } from "@/lib/brand";
import {
  canViewCoachPay,
  canViewFinancials,
  canViewOwnPayScreen,
  canViewSalesPerformance,
  moneyHiddenFromViewer,
  payVisibleToViewer,
} from "@/lib/access-policy";
import { getNavGroups, getNavGroupsFor, visibleSlugsFor, type Role } from "@/lib/navigation";
import { stripCoachDashboardPay } from "@/lib/pay-visibility";
import { buildSearchIndex } from "@/lib/search-index";
import MyPayPage from "@/app/(hq)/my-pay/page";

const ident = (role: Role, over: Partial<ServerIdentity> = {}): ServerIdentity => ({
  role,
  realRole: role,
  displayName: null,
  linkedCoachId: role === "coach" ? "co1" : null,
  impersonating: false,
  isHeadCoach: false,
  realIsHeadCoach: false,
  ...over,
});
const coach = () => ident("coach");
const headCoach = () => ident("coach", { isHeadCoach: true, realIsHeadCoach: true });
const ownerAsCoach = () => ident("coach", { realRole: "owner", impersonating: true, linkedCoachId: "co1" });
const ownerAsHeadCoach = () =>
  ident("coach", { realRole: "owner", impersonating: true, linkedCoachId: "co1", isHeadCoach: true });

const navSlugs = (id: ServerIdentity) =>
  new Set(getNavGroupsFor({ role: id.role, isHeadCoach: id.isHeadCoach, realRole: id.realRole }).flatMap((g) => g.items.map((i) => i.slug)));

/** Runs the /my-pay server component and reports where it redirected, or
 *  null when it rendered. */
async function hitMyPay(id: ServerIdentity): Promise<string | null> {
  h.identity = id;
  h.redirectedTo = null;
  try {
    await MyPayPage();
  } catch (e) {
    if (!String((e as Error).message).startsWith("NEXT_REDIRECT")) throw e;
  }
  return h.redirectedTo;
}

beforeEach(() => {
  h.redirectedTo = null;
});

describe("TJD brand config", () => {
  it("TJD coaches cannot see pay", () => {
    expect(BRAND.pay.coachCanSeePay).toBe(false);
  });
});

describe("TJD nav: My Pay", () => {
  it("is hidden from a plain coach", () => {
    expect(navSlugs(coach()).has("my-pay")).toBe(false);
    // The rest of the coach toolset is untouched.
    expect(navSlugs(coach()).has("academy")).toBe(true);
    expect(visibleSlugsFor({ role: "coach" }).has("my-pay")).toBe(false);
    expect(getNavGroups("coach").flatMap((g) => g.items).some((i) => i.slug === "my-pay")).toBe(false);
  });

  it("is hidden from a head coach (Oversight still present)", () => {
    const slugs = navSlugs(headCoach());
    expect(slugs.has("my-pay")).toBe(false);
    expect(slugs.has("coach-overview")).toBe(true);
  });

  it("is hidden from an owner viewing as a coach or head coach (exactly the coach's nav)", () => {
    expect(navSlugs(ownerAsCoach()).has("my-pay")).toBe(false);
    expect(navSlugs(ownerAsHeadCoach()).has("my-pay")).toBe(false);
    expect(visibleSlugsFor({ role: "coach", realRole: "owner" }).has("my-pay")).toBe(false);
    // Same nav, slug for slug, as the coach / head coach being viewed.
    expect([...navSlugs(ownerAsCoach())].sort()).toEqual([...navSlugs(coach())].sort());
    expect([...navSlugs(ownerAsHeadCoach())].sort()).toEqual([...navSlugs(headCoach())].sort());
  });

  it("is hidden from a coach-shell identity whose real role is admin too", () => {
    expect(visibleSlugsFor({ role: "coach", realRole: "admin" }).has("my-pay")).toBe(false);
  });

  it("the owner NOT viewing as anyone is not pay-filtered", () => {
    expect(payVisibleToViewer({ role: "owner", realRole: "owner" })).toBe(true);
  });

  it("owner and admin keep Payroll and Financials", () => {
    for (const role of ["owner", "admin"] as Role[]) {
      const slugs = navSlugs(ident(role));
      expect(slugs.has("payroll")).toBe(true);
      expect(slugs.has("financials")).toBe(true);
    }
  });

  it("is not offered to a coach in the Cmd+K screen index", async () => {
    const items = await buildSearchIndex({ role: "coach", realRole: "coach", isHeadCoach: false, linkedCoachId: "co1" });
    expect(items.some((i) => i.href === "/my-pay")).toBe(false);
    // The owner viewing as a coach gets exactly the coach's Cmd+K: no My Pay.
    const asCoach = await buildSearchIndex({ role: "coach", realRole: "owner", isHeadCoach: false, linkedCoachId: "co1", impersonating: true });
    expect(asCoach.some((i) => i.href === "/my-pay")).toBe(false);
    const asHead = await buildSearchIndex({ role: "coach", realRole: "owner", isHeadCoach: true, linkedCoachId: "co1", impersonating: true });
    expect(asHead.some((i) => i.href === "/my-pay")).toBe(false);
  });
});

describe("TJD /my-pay route", () => {
  it("redirects a plain coach to their dashboard", async () => {
    expect(await hitMyPay(coach())).toBe("/dashboard");
  });

  it("redirects a head coach to their dashboard", async () => {
    expect(await hitMyPay(headCoach())).toBe("/dashboard");
  });

  it("redirects the owner viewing as a coach or head coach to the dashboard", async () => {
    expect(await hitMyPay(ownerAsCoach())).toBe("/dashboard");
    expect(await hitMyPay(ownerAsHeadCoach())).toBe("/dashboard");
  });

  it("renders for the owner", async () => {
    expect(await hitMyPay(ident("owner"))).toBeNull();
  });
});

describe("TJD pay policy", () => {
  it("payVisibleToViewer: real owner/admin only, and never in the coach view", () => {
    expect(payVisibleToViewer({ role: "coach", realRole: "coach" })).toBe(false);
    expect(payVisibleToViewer({ role: "va", realRole: "va" })).toBe(false);
    expect(payVisibleToViewer({ role: "owner", realRole: "owner" })).toBe(true);
    expect(payVisibleToViewer({ role: "admin", realRole: "admin" })).toBe(true);
    // Owner viewing as a coach: the coach view, no pay.
    expect(payVisibleToViewer({ role: "coach", realRole: "owner" })).toBe(false);
    // A forged effective role never grants pay: the real role still decides.
    expect(payVisibleToViewer({ role: "owner", realRole: "coach" })).toBe(false);
  });

  it("moneyHiddenFromViewer: coaches and the owner viewing as a coach; never the owner/admin themselves", () => {
    expect(moneyHiddenFromViewer(coach())).toBe(true);
    expect(moneyHiddenFromViewer(headCoach())).toBe(true);
    expect(moneyHiddenFromViewer(ownerAsCoach())).toBe(true);
    expect(moneyHiddenFromViewer(ownerAsHeadCoach())).toBe(true);
    expect(moneyHiddenFromViewer(ident("owner"))).toBe(false);
    expect(moneyHiddenFromViewer(ident("admin"))).toBe(false);
    expect(moneyHiddenFromViewer(ident("va"))).toBe(false);
    // Forged effective role cannot unlock money for a real coach.
    expect(moneyHiddenFromViewer({ role: "owner", realRole: "coach" })).toBe(true);
  });

  it("canViewOwnPayScreen refuses coaches, head coaches and the owner viewing as one; allows the owner", () => {
    expect(canViewOwnPayScreen(coach())).toBe(false);
    expect(canViewOwnPayScreen(headCoach())).toBe(false);
    expect(canViewOwnPayScreen(ownerAsCoach())).toBe(false);
    expect(canViewOwnPayScreen(ownerAsHeadCoach())).toBe(false);
    expect(canViewOwnPayScreen(ident("owner"))).toBe(true);
  });

  it("canViewCoachPay: no coach pay in the coach view (incl. the owner viewing as one); owner/admin see all", () => {
    expect(canViewCoachPay(coach(), "co1")).toBe(false);
    expect(canViewCoachPay(ownerAsCoach(), "co1")).toBe(false);
    expect(canViewCoachPay(ownerAsHeadCoach(), "co2")).toBe(false);
    expect(canViewCoachPay(ident("owner"), "co1")).toBe(true);
    expect(canViewCoachPay(ident("admin"), "co1")).toBe(true);
  });

  it("financials and sales performance refuse the owner viewing as a coach, allow the owner", () => {
    expect(canViewFinancials(ownerAsCoach())).toBe(false);
    expect(canViewFinancials(ownerAsHeadCoach())).toBe(false);
    expect(canViewSalesPerformance(ownerAsCoach())).toBe(false);
    expect(canViewFinancials(ident("owner"))).toBe(true);
    expect(canViewFinancials(ident("admin"))).toBe(true);
    expect(canViewSalesPerformance(ident("owner"))).toBe(true);
  });
});

describe("TJD coach dashboard data strip", () => {
  const dashboard = {
    coach: { id: "co1", name: "Coach A", weeklyRate: 60, fortnightlyRate: 45, adherence: 0.9 },
    roster: [{ id: "c1" }],
    checkInsThisWeek: 4,
    atRisk: [],
    auditsToReview: 2,
    pay: { gross: 1234, nextPayDate: "5 Nov 2026" },
    trends: { weeks: ["2026-10-05"], checkIns: [3], pay: [220], roster: [12] },
    retentionMonths: [],
  };

  it("removes every pay figure before the payload crosses to the client", () => {
    const out = stripCoachDashboardPay(dashboard);
    expect(out.pay).toEqual({ gross: 0, nextPayDate: "" });
    expect(out.trends.pay).toEqual([]);
    expect(out.coach?.weeklyRate).toBe(0);
    expect(out.coach?.fortnightlyRate).toBe(0);
    // No pay number survives anywhere in the serialised payload.
    const json = JSON.stringify(out);
    expect(json).not.toContain("1234");
    expect(json).not.toContain("220");
    expect(json).not.toContain("5 Nov 2026");
  });

  it("leaves performance data intact", () => {
    const out = stripCoachDashboardPay(dashboard);
    expect(out.checkInsThisWeek).toBe(4);
    expect(out.auditsToReview).toBe(2);
    expect(out.trends.checkIns).toEqual([3]);
    expect(out.trends.roster).toEqual([12]);
    expect(out.coach?.adherence).toBe(0.9);
  });
});
