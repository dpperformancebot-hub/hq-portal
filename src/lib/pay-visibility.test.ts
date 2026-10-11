import { describe, expect, it } from "vitest";
import { stripPayRates, stripPayRatesAll } from "./pay-visibility";

// V2-01: a coach login must never receive another coach's pay rates. These
// helpers are the page-boundary strip used by /coach-performance,
// /coach-overview and /coach-overview/[coachId].

const card = {
  id: "co-1",
  name: "Angus",
  weeklyRate: 25,
  fortnightlyRate: 15,
  retention: 0.9,
  churn: 0.05,
  activeClients: 60,
};

describe("stripPayRates", () => {
  it("zeroes both pay-rate fields", () => {
    const out = stripPayRates(card);
    expect(out.weeklyRate).toBe(0);
    expect(out.fortnightlyRate).toBe(0);
  });

  it("leaves every non-pay field intact", () => {
    const out = stripPayRates(card);
    expect(out.id).toBe("co-1");
    expect(out.name).toBe("Angus");
    expect(out.retention).toBe(0.9);
    expect(out.churn).toBe(0.05);
    expect(out.activeClients).toBe(60);
  });

  it("does not mutate the input card", () => {
    stripPayRates(card);
    expect(card.weeklyRate).toBe(25);
    expect(card.fortnightlyRate).toBe(15);
  });
});

describe("stripPayRatesAll", () => {
  it("strips every card in the list", () => {
    const out = stripPayRatesAll([card, { ...card, id: "co-2", weeklyRate: 40 }]);
    expect(out).toHaveLength(2);
    for (const c of out) {
      expect(c.weeklyRate).toBe(0);
      expect(c.fortnightlyRate).toBe(0);
    }
  });

  it("handles an empty list", () => {
    expect(stripPayRatesAll([])).toEqual([]);
  });
});
