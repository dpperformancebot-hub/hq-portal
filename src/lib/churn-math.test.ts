import { describe, expect, it } from "vitest";
import { monthlyAverageChurn, monthlyAverageRetention, monthlyRetentionSeries } from "./churn-math";

// Fixed "now": 2026-06-15, so complete months run through May 2026.
const NOW = new Date(2026, 5, 15).getTime();

describe("monthlyAverageChurn", () => {
  it("returns 0 with no clients", () => {
    expect(monthlyAverageChurn([], NOW)).toBe(0);
  });

  it("returns 0 when nobody has churned", () => {
    const clients = [
      { startDate: "2026-01-10", endDate: null },
      { startDate: "2026-02-05", endDate: null },
    ];
    expect(monthlyAverageChurn(clients, NOW)).toBe(0);
  });

  it("averages per-month rates, not the all-time share", () => {
    // Jan: 4 on the roster, 1 churns -> 0.25. Feb-May: 3 remain, 0 churn -> 0.
    // Monthly average = 0.25 / 5 = 0.05; all-time would be 1/4 = 0.25.
    const clients = [
      { startDate: "2026-01-01", endDate: null },
      { startDate: "2026-01-01", endDate: null },
      { startDate: "2026-01-01", endDate: null },
      { startDate: "2026-01-01", endDate: "2026-01-25" },
    ];
    expect(monthlyAverageChurn(clients, NOW)).toBeCloseTo(0.05, 5);
  });

  it("counts same-month join-and-churn in that month's denominator", () => {
    // May: 1 existing + 1 started during May, the newcomer churns -> 1/2.
    const clients = [
      { startDate: "2026-05-01", endDate: null },
      { startDate: "2026-05-03", endDate: "2026-05-27" },
    ];
    // May is the only complete month with a roster (both start in May).
    expect(monthlyAverageChurn(clients, NOW)).toBeCloseTo(0.5, 5);
  });

  it("skips months before the coach had any clients", () => {
    // First start is March; Jan/Feb contribute nothing.
    const clients = [
      { startDate: "2026-03-01", endDate: "2026-03-25" },
      { startDate: "2026-03-01", endDate: null },
    ];
    // Mar: 2 -> 1 churn = 0.5. Apr, May: 1 active, 0 churn.
    expect(monthlyAverageChurn(clients, NOW)).toBeCloseTo(0.5 / 3, 5);
  });

  it("treats a brand-new roster's early dropout as excluded, not churn (R5-5)", () => {
    const clients = [
      { startDate: "2026-06-02", endDate: "2026-06-10" }, // <3w: excluded
      { startDate: "2026-06-02", endDate: null },
    ];
    expect(monthlyAverageChurn(clients, NOW)).toBe(0);
  });
});

describe("monthlyRetentionSeries (D1/D2)", () => {
  it("returns one point per complete month with retention = 1 - churn", () => {
    const clients = [
      { startDate: "2026-01-01", endDate: null },
      { startDate: "2026-01-01", endDate: null },
      { startDate: "2026-01-01", endDate: "2026-01-25" },
    ];
    const series = monthlyRetentionSeries(clients, NOW);
    // Jan..May 2026 = 5 complete months.
    expect(series).toHaveLength(5);
    expect(series[0].month).toBe("2026-01");
    expect(series[0].churn).toBeCloseTo(1 / 3, 5);
    expect(series[0].retention).toBeCloseTo(2 / 3, 5);
    expect(series[1].churned).toBe(0);
    expect(series[1].retention).toBe(1);
  });

  it("computes avg weeks-at-churn per month from Dan's formula", () => {
    // Two churns in March: tenures 4 weeks (28d) and 8 weeks (56d) -> avg 6.
    const clients = [
      { startDate: "2026-02-03", endDate: "2026-03-03" },
      { startDate: "2026-01-06", endDate: "2026-03-03" },
      { startDate: "2026-01-01", endDate: null },
    ];
    const series = monthlyRetentionSeries(clients, NOW);
    const march = series.find((m) => m.month === "2026-03");
    expect(march?.churned).toBe(2);
    expect(march?.avgChurnWeeks).toBeCloseTo(6, 1);
    // A month with no churn reports null, not 0.
    const april = series.find((m) => m.month === "2026-04");
    expect(april?.avgChurnWeeks).toBeNull();
  });
});

describe("monthlyAverageRetention (D1)", () => {
  it("is the complement of monthly average churn", () => {
    const clients = [
      { startDate: "2026-01-01", endDate: null },
      { startDate: "2026-01-01", endDate: "2026-01-25" },
    ];
    expect(monthlyAverageRetention(clients, NOW)).toBeCloseTo(1 - monthlyAverageChurn(clients, NOW), 8);
  });
});

// R5-5: early dropouts (<3 weeks) leave churn maths entirely.
import { CHURN_EXCLUSION_NOTE, EARLY_DROP_WEEKS } from "@/lib/churn-math";

describe("early-dropout exclusion (R5-5)", () => {
  it("drops sub-3-week cancellations from numerator AND denominator", () => {
    const clients = [
      { startDate: "2026-01-05", endDate: "2026-01-15" }, // 1.4w: excluded
      { startDate: "2026-01-05", endDate: "2026-03-05" }, // 8.4w churn, counts
      { startDate: "2026-01-05", endDate: null }, // retained
    ];
    const series = monthlyRetentionSeries(clients, Date.parse("2026-04-15"));
    // January: 2 counted (excluded dropout gone), 0 churned.
    expect(series[0].denom).toBe(2);
    expect(series[0].churned).toBe(0);
    // March: the 8-week churn lands, avg weeks unpolluted by the early drop.
    const march = series.find((m) => m.month === "2026-03");
    expect(march?.churned).toBe(1);
    expect(march?.avgChurnWeeks).toBeCloseTo(8.4, 0);
  });
  it("documents the rule", () => {
    expect(CHURN_EXCLUSION_NOTE).toContain(String(EARLY_DROP_WEEKS));
  });
});

// R8-3: Dan's dashboard formula — per month churned ÷ END-of-month active,
// averaged across months; total churned basis, never coach averages.
import { dashboardChurnStats } from "@/lib/churn-math";

describe("dashboardChurnStats (R8-3)", () => {
  it("divides by end-of-month active, not on-books-during-month", () => {
    // January: 1 churns (8.6w tenure, past the early-drop cutoff), 2 remain
    // active at month end. Dan's basis: 1/2 = 50%, NOT 1/3.
    const clients = [
      { startDate: "2025-11-03", endDate: "2026-01-02" },
      { startDate: "2025-11-03", endDate: null },
      { startDate: "2025-11-03", endDate: null },
    ];
    const stats = dashboardChurnStats(clients, Date.parse("2026-02-10"));
    // Nov + Dec: 0% churn; Jan: 50%. Average across 3 months.
    expect(stats.months).toBe(3);
    expect(stats.churnPct).toBeCloseTo((0 + 0 + 50) / 3, 5);
    expect(stats.retentionPct).toBeCloseTo(100 - (0 + 0 + 50) / 3, 5);
  });
  it("avg week at churn spans all churned clients combined", () => {
    const clients = [
      { startDate: "2026-01-05", endDate: "2026-03-02" }, // 8w
      { startDate: "2026-01-05", endDate: "2026-03-30" }, // 12w
      { startDate: "2026-01-05", endDate: null },
    ];
    const stats = dashboardChurnStats(clients, Date.parse("2026-05-15"));
    expect(stats.avgWeekAtChurn).toBeCloseTo(10, 0);
  });
  it("excludes early dropouts and reports null avg with no churn", () => {
    const clients = [
      { startDate: "2026-01-05", endDate: "2026-01-12" }, // 1w early drop
      { startDate: "2026-01-05", endDate: null },
    ];
    const stats = dashboardChurnStats(clients, Date.parse("2026-03-15"));
    expect(stats.churnPct).toBe(0);
    expect(stats.avgWeekAtChurn).toBeNull();
  });
});
