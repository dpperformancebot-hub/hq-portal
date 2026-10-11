import { describe, expect, it } from "vitest";
import { journeyBucket, paymentStructure } from "./journey-buckets";

// Fixed "now": Wednesday 2026-06-17.
const NOW = new Date(2026, 5, 17).getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 10);

describe("journeyBucket (B1)", () => {
  it("no coach = Unassigned regardless of start date", () => {
    expect(journeyBucket({ coachId: null, startDate: daysAgo(30) }, NOW)).toBe("Unassigned");
    expect(journeyBucket({ coachId: null, startDate: daysAgo(-5) }, NOW)).toBe("Unassigned");
  });

  it("assigned with a future start date = Onboarding", () => {
    expect(journeyBucket({ coachId: "co-1", startDate: daysAgo(-4) }, NOW)).toBe("Onboarding");
  });

  it("week brackets split at 8 / 16 / 24", () => {
    expect(journeyBucket({ coachId: "co-1", startDate: daysAgo(0) }, NOW)).toBe("Active W1-8");
    expect(journeyBucket({ coachId: "co-1", startDate: daysAgo(7 * 8 - 1) }, NOW)).toBe("Active W1-8");
    expect(journeyBucket({ coachId: "co-1", startDate: daysAgo(7 * 8) }, NOW)).toBe("W9-16");
    expect(journeyBucket({ coachId: "co-1", startDate: daysAgo(7 * 16) }, NOW)).toBe("W17-24");
    expect(journeyBucket({ coachId: "co-1", startDate: daysAgo(7 * 24) }, NOW)).toBe("24+");
  });

  it("an unparseable start date falls back to week 1", () => {
    expect(journeyBucket({ coachId: "co-1", startDate: "not-a-date" }, NOW)).toBe("Active W1-8");
  });
});

describe("paymentStructure (B2)", () => {
  it("reads PIF from the billing-frequency text", () => {
    expect(paymentStructure({ billingFrequency: "PIF" })).toBe("PIF");
    expect(paymentStructure({ billingFrequency: "Paid in full" })).toBe("PIF");
    expect(paymentStructure({ billingFrequency: "Upfront 16wk" })).toBe("PIF");
  });

  it("reads WBW from weekly/fortnightly billing text", () => {
    expect(paymentStructure({ billingFrequency: "Weekly" })).toBe("WBW");
    expect(paymentStructure({ billingFrequency: "wbw" })).toBe("WBW");
    expect(paymentStructure({ billingFrequency: "Fortnightly" })).toBe("WBW");
  });

  it("falls back to termLength as the PIF signal", () => {
    expect(paymentStructure({ billingFrequency: null, termLength: 16 })).toBe("PIF");
  });

  it("returns null with no signal (honest unknown)", () => {
    expect(paymentStructure({ billingFrequency: null, termLength: null })).toBeNull();
    expect(paymentStructure({ billingFrequency: "" })).toBeNull();
  });
});

// R5-1 column model.
import { journeyColumnKey, journeyColumns } from "@/lib/journey-buckets";

const SHAPE = {
  ranges: [
    { from: 1, to: 1 },
    { from: 2, to: 2 },
    { from: 3, to: 3 },
    { from: 4, to: 4 },
    { from: 5, to: 24 },
    { from: 25, to: null },
  ],
};
const daysBack = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe("journeyColumns (R5-1)", () => {
  it("builds Unassigned, Onboarding, single weeks, then brand buckets", () => {
    expect(journeyColumns(SHAPE).map((c) => c.label)).toEqual([
      "Unassigned",
      "Onboarding",
      "W1",
      "W2",
      "W3",
      "W4",
      "W5-24",
      "W25+",
    ]);
  });
});

describe("journeyColumnKey (R5-1)", () => {
  it("keeps the unassigned/onboarding rules", () => {
    expect(journeyColumnKey({ coachId: null, startDate: daysBack(10) }, SHAPE)).toBe("unassigned");
    expect(journeyColumnKey({ coachId: "co1", startDate: daysBack(-6) }, SHAPE)).toBe("onboarding");
  });
  it("maps early weeks to their own column and later weeks to buckets", () => {
    expect(journeyColumnKey({ coachId: "co1", startDate: daysBack(1) }, SHAPE)).toBe("w1");
    expect(journeyColumnKey({ coachId: "co1", startDate: daysBack(22) }, SHAPE)).toBe("w4");
    expect(journeyColumnKey({ coachId: "co1", startDate: daysBack(30) }, SHAPE)).toBe("b5");
    expect(journeyColumnKey({ coachId: "co1", startDate: daysBack(200) }, SHAPE)).toBe("b25");
  });
});
