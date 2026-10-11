import { describe, expect, it } from "vitest";
import { rankCoaches, rankScore } from "./coach-ranking";
import type { CoachScorecard } from "@/lib/seed";

// Minimal scorecard factory: only the fields the ranking reads get real
// values; the rest are neutral fillers.
function mk(over: Partial<CoachScorecard> & Pick<CoachScorecard, "id" | "name">): CoachScorecard {
  return {
    role: "coach",
    maxCapacity: 70,
    weeklyRate: 25,
    fortnightlyRate: 15,
    adherence: 0,
    avgResponseHours: 0,
    retention: 0.8,
    churn: 0.05,
    activeClients: 30,
    pendingAudits: 0,
    capacityPct: 0,
    slotsOpen: 0,
    avgClientWeeks: 0,
    ...over,
  };
}

const cap70 = () => 70;

describe("rankScore", () => {
  it("is 1 for a perfect coach and weights retention 3, capacity 1, inverted churn 2", () => {
    expect(rankScore({ retention: 1, churn: 0, capacityPct: 1 })).toBe(1);
    // Only retention: 3/6. Only capacity: 1/6. Churn 0 alone contributes 2/6.
    expect(rankScore({ retention: 1, churn: 1, capacityPct: 0 })).toBeCloseTo(3 / 6);
    expect(rankScore({ retention: 0, churn: 1, capacityPct: 1 })).toBeCloseTo(1 / 6);
    expect(rankScore({ retention: 0, churn: 0, capacityPct: 0 })).toBeCloseTo(2 / 6);
  });

  it("clamps out-of-range inputs so bad feed values cannot distort the board", () => {
    expect(rankScore({ retention: 1.4, churn: -0.2, capacityPct: 1.6 })).toBe(1);
    expect(rankScore({ retention: -1, churn: 2, capacityPct: -1 })).toBe(0);
  });
});

describe("rankCoaches", () => {
  it("ranks high retention + low churn above low retention (acceptance spot-check)", () => {
    const strong = mk({ id: "a", name: "Strong", retention: 0.95, churn: 0.02 });
    const weak = mk({ id: "b", name: "Weak", retention: 0.7, churn: 0.12 });
    expect(rankCoaches([weak, strong], cap70).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("excludes coaches with zero active clients", () => {
    const idle = mk({ id: "a", name: "Idle", activeClients: 0, retention: 1, churn: 0 });
    const busy = mk({ id: "b", name: "Busy" });
    expect(rankCoaches([idle, busy], cap70).map((c) => c.id)).toEqual(["b"]);
  });

  it("capacity utilisation breaks a retention/churn tie", () => {
    const fuller = mk({ id: "a", name: "Fuller", activeClients: 60 });
    const emptier = mk({ id: "b", name: "Emptier", activeClients: 10 });
    expect(rankCoaches([emptier, fuller], cap70).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("full ties fall back to name so the order is stable", () => {
    const zed = mk({ id: "z", name: "Zed" });
    const amy = mk({ id: "y", name: "Amy" });
    expect(rankCoaches([zed, amy], cap70).map((c) => c.name)).toEqual(["Amy", "Zed"]);
  });
});
