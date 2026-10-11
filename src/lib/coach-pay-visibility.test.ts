import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import type { ServerIdentity } from "@/lib/role-server";

// The unit suite compiles .tsx with the classic JSX runtime (React.createElement)
// and the config is Node-only, so the page module needs React on the global.
(globalThis as unknown as { React: typeof React }).React = React;

// Brand.pay.coachCanSeePay = true (DP, the suite's pinned brand): coach pay
// behaviour is UNCHANGED. The TJD (false) cases live in
// coach-pay-visibility.tjd.test.ts.

const h = vi.hoisted(() => ({
  identity: null as unknown as ServerIdentity,
  redirectedTo: null as string | null,
}));

vi.mock("@/lib/role-server", () => ({
  getServerIdentity: () => Promise.resolve(h.identity),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    h.redirectedTo = to;
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock("@/components/screens/coach-tools/my-pay-view", () => ({ MyPayView: () => null }));
vi.mock("@/components/screens/pay/tjd-my-pay-view", () => ({ TjdMyPayView: () => null }));
vi.mock("@/lib/data", () => ({ getMyPayData: () => Promise.resolve({}) }));

import { BRAND, BRANDS } from "@/lib/brand";
import {
  canManageBrandContent,
  canViewCoachPay,
  canViewFinancials,
  canViewOwnPayScreen,
  moneyHiddenFromViewer,
  payVisibleToViewer,
} from "@/lib/access-policy";
import { getNavGroupsFor, visibleSlugsFor, type Role } from "@/lib/navigation";
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

describe("coachCanSeePay per brand", () => {
  it("DP coaches see pay, TJD coaches do not", () => {
    expect(BRANDS.dp.pay.coachCanSeePay).toBe(true);
    expect(BRANDS.tjd.pay.coachCanSeePay).toBe(false);
    expect(BRAND.pay.coachCanSeePay).toBe(true); // suite is pinned to DP
  });
});

describe("DP (unchanged): My Pay", () => {
  it("a plain coach and a head coach still see My Pay in the nav", () => {
    expect(visibleSlugsFor({ role: "coach" }).has("my-pay")).toBe(true);
    const head = getNavGroupsFor({ role: "coach", isHeadCoach: true }).flatMap((g) => g.items.map((i) => i.slug));
    expect(head).toContain("my-pay");
  });

  it("a plain coach can still reach /my-pay", async () => {
    expect(await hitMyPay(ident("coach"))).toBeNull();
  });

  it("a head coach on their own login can still reach /my-pay", async () => {
    expect(await hitMyPay(ident("coach", { isHeadCoach: true, realIsHeadCoach: true }))).toBeNull();
  });

  it("the owner viewing as a coach can still reach /my-pay", async () => {
    expect(await hitMyPay(ident("coach", { realRole: "owner", impersonating: true }))).toBeNull();
  });

  it("the owner viewing as a coach or head coach still has My Pay in the nav, and no money is hidden", () => {
    expect(visibleSlugsFor({ role: "coach", realRole: "owner" }).has("my-pay")).toBe(true);
    expect(visibleSlugsFor({ role: "coach", realRole: "owner", isHeadCoach: true }).has("my-pay")).toBe(true);
    const ownerAsCoach = ident("coach", { realRole: "owner", impersonating: true });
    expect(payVisibleToViewer(ownerAsCoach)).toBe(true);
    expect(moneyHiddenFromViewer(ownerAsCoach)).toBe(false);
    expect(moneyHiddenFromViewer(ident("coach"))).toBe(false);
    expect(canViewOwnPayScreen(ownerAsCoach)).toBe(true);
    expect(canViewCoachPay(ownerAsCoach, "co1")).toBe(true);
    expect(canViewFinancials(ownerAsCoach)).toBe(true);
    expect(canManageBrandContent(ownerAsCoach)).toBe(true);
  });

  it("non-pay roles are still redirected", async () => {
    expect(await hitMyPay(ident("va"))).toBe("/dashboard");
    expect(await hitMyPay(ident("ops_manager"))).toBe("/tasks");
  });
});

describe("payVisibleToViewer / canViewOwnPayScreen flag matrix (pure)", () => {
  const roles: Role[] = ["owner", "admin", "coach", "va", "sales", "ops_manager", "ambassador_mgr"];

  it("flag true: everyone passes the brand gate (other rules decide)", () => {
    for (const r of roles) expect(payVisibleToViewer({ realRole: r, role: r }, true)).toBe(true);
    // Including the owner viewing as a coach (DP unchanged).
    expect(payVisibleToViewer({ realRole: "owner", role: "coach" }, true)).toBe(true);
  });

  it("flag false: only the real owner/admin pass, and not while viewing as a coach", () => {
    for (const r of roles) expect(payVisibleToViewer({ realRole: r, role: r }, false)).toBe(r === "owner" || r === "admin");
    expect(payVisibleToViewer({ realRole: "owner", role: "coach" }, false)).toBe(false);
    expect(payVisibleToViewer({ realRole: "coach", role: "owner" }, false)).toBe(false);
  });

  it("canViewOwnPayScreen with the flag off refuses coach + head coach + owner as coach, keeps the owner", () => {
    const base = { linkedCoachId: "co1", isHeadCoach: false };
    expect(canViewOwnPayScreen({ ...base, role: "coach", realRole: "coach" }, false)).toBe(false);
    expect(canViewOwnPayScreen({ ...base, role: "coach", realRole: "coach", isHeadCoach: true }, false)).toBe(false);
    expect(canViewOwnPayScreen({ ...base, role: "coach", realRole: "owner" }, false)).toBe(false);
    // Flag on: the owner viewing as a coach keeps it (DP unchanged).
    expect(canViewOwnPayScreen({ ...base, role: "coach", realRole: "owner" }, true)).toBe(true);
    expect(canViewOwnPayScreen({ ...base, role: "owner", realRole: "owner" }, false)).toBe(true);
    // Flag on: unchanged from before.
    expect(canViewOwnPayScreen({ ...base, role: "coach", realRole: "coach" }, true)).toBe(true);
    expect(canViewOwnPayScreen({ ...base, role: "va", realRole: "va" }, true)).toBe(false);
  });
});
