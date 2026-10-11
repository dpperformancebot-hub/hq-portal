import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import type { ServerIdentity } from "@/lib/role-server";

// Brand.pay.coachCanSeePay = false (TJD): the /dashboard server component must
// strip every pay figure from the coach dashboard payload BEFORE it crosses to
// the client (RSC props ship even when unrendered), for a coach, a head coach
// AND the owner viewing as either (TJD "view as coach" shows exactly the
// coach's view). Brand mocked to TJD; data layer mocked. DP behaviour lives in
// coach-pay-visibility.test.ts.

// The unit suite compiles .tsx with the classic JSX runtime (React.createElement)
// and the config is Node-only, so the page module needs React on the global.
(globalThis as unknown as { React: typeof React }).React = React;

const h = vi.hoisted(() => ({ identity: null as unknown as ServerIdentity }));

vi.mock("@/lib/brand", async (orig) => {
  const real = (await orig()) as { BRANDS: Record<string, unknown> };
  return { ...real, BRAND: real.BRANDS.tjd, BRAND_KEY: "tjd", IS_DP: false };
});
vi.mock("@/lib/role-server", () => ({ getServerIdentity: () => Promise.resolve(h.identity) }));

const DASH = {
  coach: { id: "co1", name: "Coach A", weeklyRate: 60, fortnightlyRate: 45, adherence: 0.9 },
  roster: [],
  checkInsThisWeek: 4,
  atRisk: [],
  auditsToReview: 2,
  pay: { gross: 1234, nextPayDate: "5 Nov 2026" },
  trends: { weeks: ["2026-10-05"], checkIns: [3], pay: [220], roster: [12] },
  retentionMonths: [],
};

vi.mock("@/lib/data", () => ({
  getCoachDashboardData: () => Promise.resolve(structuredClone(DASH)),
  getDashboardData: () => Promise.reject(new Error("owner dashboard not under test")),
  getSalesDashboardData: () => Promise.resolve({}),
  getVaDashboardData: () => Promise.resolve({}),
  liveMode: () => false,
}));
vi.mock("@/lib/db/client", () => ({ persistenceEnabled: () => false, dbAdmin: () => ({}) }));
vi.mock("@/lib/capacity", () => ({
  getCoachCapacityPair: () => Promise.resolve({ nextWeek: null }),
  openWeekStart: () => "2026-10-12",
}));
vi.mock("@/lib/pause-actions", () => ({ listPauses: () => Promise.resolve([]) }));
vi.mock("@/lib/feedback-responses", () => ({ listCoachFeedbackResponses: () => Promise.resolve([]) }));
vi.mock("@/lib/onboarding-actions", () => ({ listOnboarding: () => Promise.resolve({ rows: [] }) }));
vi.mock("@/lib/seed", () => ({ getTasks: () => [] }));
vi.mock("@/lib/tasks", () => ({ listTasks: () => Promise.resolve([]) }));
vi.mock("@/components/screens/dashboard/dashboard-view", () => ({ DashboardView: () => null }));
vi.mock("@/components/screens/role-dashboards/coach-dashboard-view", () => ({ CoachDashboardView: () => null }));
vi.mock("@/components/screens/role-dashboards/sales-dashboard-view", () => ({ SalesDashboardView: () => null }));
vi.mock("@/components/screens/role-dashboards/va-dashboard-view", () => ({ VaDashboardView: () => null }));

import DashboardPage from "@/app/(hq)/dashboard/page";

const ident = (over: Partial<ServerIdentity> = {}): ServerIdentity => ({
  role: "coach",
  realRole: "coach",
  displayName: null,
  linkedCoachId: "co1",
  impersonating: false,
  isHeadCoach: false,
  realIsHeadCoach: false,
  ...over,
});

type CoachProps = { data: typeof DASH; hidePay: boolean };

/** Render the server component one level: return the props handed to the
 *  (client) CoachDashboardView, i.e. exactly what crosses the RSC boundary. */
async function coachDashboardProps(id: ServerIdentity): Promise<CoachProps> {
  h.identity = id;
  const tree = (await DashboardPage({ searchParams: Promise.resolve({}) })) as React.ReactElement<{
    children: React.ReactElement<CoachProps>;
  }>;
  return tree.props.children.props;
}

describe("TJD /dashboard: coach pay never crosses to the client", () => {
  it("strips pay for a plain coach", async () => {
    const { data, hidePay } = await coachDashboardProps(ident());
    expect(hidePay).toBe(true);
    expect(data.pay).toEqual({ gross: 0, nextPayDate: "" });
    expect(data.trends.pay).toEqual([]);
    expect(data.coach.weeklyRate).toBe(0);
    expect(data.coach.fortnightlyRate).toBe(0);
    const json = JSON.stringify(data);
    expect(json).not.toContain("1234");
    expect(json).not.toContain("5 Nov 2026");
    // Performance stays.
    expect(data.checkInsThisWeek).toBe(4);
    expect(data.trends.checkIns).toEqual([3]);
  });

  it("strips pay for a head coach", async () => {
    const { data, hidePay } = await coachDashboardProps(ident({ isHeadCoach: true, realIsHeadCoach: true }));
    expect(hidePay).toBe(true);
    expect(data.pay.gross).toBe(0);
    expect(data.trends.pay).toEqual([]);
  });

  it("strips pay for the owner viewing as a coach (exactly the coach's view)", async () => {
    const { data, hidePay } = await coachDashboardProps(ident({ realRole: "owner", impersonating: true }));
    expect(hidePay).toBe(true);
    expect(data.pay).toEqual({ gross: 0, nextPayDate: "" });
    expect(data.trends.pay).toEqual([]);
    expect(data.coach.weeklyRate).toBe(0);
    expect(data.coach.fortnightlyRate).toBe(0);
    expect(JSON.stringify(data)).not.toContain("1234");
    expect(data.checkInsThisWeek).toBe(4);
  });

  it("strips pay for the owner viewing as a head coach", async () => {
    const { data, hidePay } = await coachDashboardProps(ident({ realRole: "owner", impersonating: true, isHeadCoach: true }));
    expect(hidePay).toBe(true);
    expect(data.pay.gross).toBe(0);
    expect(data.trends.pay).toEqual([]);
    expect(data.coach.weeklyRate).toBe(0);
  });
});
