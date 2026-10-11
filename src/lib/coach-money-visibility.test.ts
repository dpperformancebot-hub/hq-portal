import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import type { ServerIdentity } from "@/lib/role-server";
import { SENTINEL_MONEY, SENTINEL_RATE, serialise } from "../../test/coach-money-fixtures";

// DP REGRESSION (Brand.pay.coachCanSeePay = true, the suite's pinned brand):
// the TJD "no money for coaches" work must leave DP exactly as it was. A DP
// coach still sees their own pay, and every surface that showed client money
// to a DP coach or head coach before still does. TJD cases live in
// coach-money-visibility.tjd.test.ts and coach-money-sweep.tjd.test.ts.

(globalThis as unknown as { React: typeof React }).React = React;

const h = vi.hoisted(() => ({ identity: null as unknown as ServerIdentity }));

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
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set() {}, delete() {} }),
  headers: async () => new Headers(),
}));
vi.mock("react", async (orig) => ({ ...((await orig()) as Record<string, unknown>), cache: (fn: unknown) => fn }));

import { BRAND } from "@/lib/brand";
import { moneyHiddenFromViewer } from "@/lib/access-policy";
import { getCoachClientDetail, getCoachRosterData } from "@/lib/data";

const COACH: ServerIdentity = {
  role: "coach",
  realRole: "coach",
  displayName: null,
  linkedCoachId: "co2",
  impersonating: false,
  isHeadCoach: false,
  realIsHeadCoach: false,
};
const HEAD_COACH: ServerIdentity = { ...COACH, linkedCoachId: "co1", isHeadCoach: true, realIsHeadCoach: true };

async function page(path: string, identity: ServerIdentity, params: Record<string, unknown> = {}) {
  h.identity = identity;
  const mod = (await import(/* @vite-ignore */ `@/app/(hq)/${path}/page`)) as {
    default: (p: { params: Promise<unknown>; searchParams: Promise<unknown> }) => unknown;
  };
  return mod.default({ params: Promise.resolve(params), searchParams: Promise.resolve({}) });
}

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

describe("DP: nothing is hidden from coaches", () => {
  it("the brand lets coaches see pay, so no viewer is money-blind", () => {
    expect(BRAND.pay.coachCanSeePay).toBe(true);
    expect(moneyHiddenFromViewer(COACH)).toBe(false);
    expect(moneyHiddenFromViewer(HEAD_COACH)).toBe(false);
  });

  it("coach loaders keep client prices (with or without a viewer)", async () => {
    const roster = await getCoachRosterData("co2");
    expect(roster.clients[0]!.monthlyRate).toBe(SENTINEL_MONEY);
    expect((await getCoachRosterData("co2", { viewer: COACH })).clients[0]!.weeklyRate).toBe(SENTINEL_RATE);
    const detail = await getCoachClientDetail(roster.clients[0]!.id, "co2", COACH);
    expect(detail?.client.cashCollected).toBe(SENTINEL_MONEY);
    // DP's coach card rates on coach screens are untouched too.
    expect(roster.coach?.weeklyRate).toBe(SENTINEL_RATE);
  });
});

describe("DP coach still sees their own pay, as before", () => {
  it("/dashboard sends a plain coach to the coach hub home (2026-10)", async () => {
    await expect(page("dashboard", COACH)).rejects.toThrow("NEXT_REDIRECT:/home");
  });

  it("/dashboard: pay card and rates are in the head coach's payload (hidePay false)", async () => {
    const tree = await page("dashboard", HEAD_COACH);
    expect(propOf(tree, "hidePay")).toBe(false);
    const data = propOf(tree, "data") as { coach: { weeklyRate: number }; pay: { nextPayDate: string } };
    expect(data.coach.weeklyRate).toBe(SENTINEL_RATE);
    expect(data.pay.nextPayDate).not.toBe("");
  });

  it("/my-pay renders the DP pay screen with the coach's own rates", async () => {
    const tree = await page("my-pay", COACH);
    const data = propOf(tree, "data") as { coach: { id: string; weeklyRate: number; fortnightlyRate: number } };
    expect(data.coach.id).toBe("co2");
    expect(data.coach.weeklyRate).toBe(SENTINEL_RATE);
    expect(data.coach.fortnightlyRate).toBe(SENTINEL_RATE);
  });
});

describe("DP head coach surfaces are unchanged", () => {
  it("/client-database keeps prices and the $ column", async () => {
    const tree = await page("client-database", HEAD_COACH);
    expect(propOf(tree, "showMoney")).toBe(true);
    expect(serialise(tree)).toContain(String(SENTINEL_MONEY));
  });

  for (const path of ["analytics", "pipeline", "inbox", "renewals"]) {
    it(`/${path} keeps its money (head coach by URL)`, async () => {
      const tree = await page(path, HEAD_COACH);
      expect(serialise(tree)).toContain(String(SENTINEL_MONEY));
      if (path !== "renewals") expect(propOf(tree, "showMoney")).toBe(true);
    });
  }

  it("/reports/[id] uses the same allowlist as /reports on DP: a coach is sent home, the owner gets in", async () => {
    await expect(page("reports/[id]", COACH, { id: "r1" })).rejects.toThrow("NEXT_REDIRECT");
    const OWNER: ServerIdentity = { ...COACH, role: "owner", realRole: "owner", linkedCoachId: null };
    const owner = await page("reports/[id]", OWNER, { id: "r1" }).then(
      () => "rendered",
      (e: Error) => e.message,
    );
    expect(owner).not.toMatch(/NEXT_REDIRECT/);
  });
});

describe("DP owner viewing as a coach is unchanged (the TJD view-as-coach rule is brand-gated)", () => {
  const OWNER_AS_COACH: ServerIdentity = { ...COACH, realRole: "owner", impersonating: true };
  const OWNER_AS_HEAD_COACH: ServerIdentity = { ...HEAD_COACH, realRole: "owner", impersonating: true, realIsHeadCoach: false };

  it("is not money-blind", () => {
    expect(moneyHiddenFromViewer(OWNER_AS_COACH)).toBe(false);
    expect(moneyHiddenFromViewer(OWNER_AS_HEAD_COACH)).toBe(false);
  });

  it("/dashboard keeps the pay card and rates (viewing as the head coach; a plain coach lands on /home)", async () => {
    await expect(page("dashboard", OWNER_AS_COACH)).rejects.toThrow("NEXT_REDIRECT:/home");
    const tree = await page("dashboard", OWNER_AS_HEAD_COACH);
    expect(propOf(tree, "hidePay")).toBe(false);
    expect((propOf(tree, "data") as { coach: { weeklyRate: number } }).coach.weeklyRate).toBe(SENTINEL_RATE);
  });

  it("/my-pay renders with the coach's rates; /my-clients and /client-database keep prices", async () => {
    const pay = propOf(await page("my-pay", OWNER_AS_COACH), "data") as { coach: { weeklyRate: number } };
    expect(pay.coach.weeklyRate).toBe(SENTINEL_RATE);
    expect(serialise(await page("my-clients", OWNER_AS_COACH))).toContain(String(SENTINEL_MONEY));
    expect(serialise(await page("client-database", OWNER_AS_HEAD_COACH))).toContain(String(SENTINEL_MONEY));
  });
});
