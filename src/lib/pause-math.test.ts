import { describe, expect, it } from "vitest";
import { daysUntilReactivation, pauseWeeks, reactivatesSoon } from "@/lib/pause-math";

// UTC anchor so the maths line up with date-only ISO strings (also UTC).
const NOW = Date.parse("2026-08-07T00:00:00Z");

describe("pauseWeeks", () => {
  it("derives weeks to one decimal", () => {
    expect(pauseWeeks("2026-08-03", "2026-08-24")).toBe(3);
    expect(pauseWeeks("2026-08-03", "2026-08-13")).toBe(1.4);
  });
  it("is null without both dates or when end precedes start", () => {
    expect(pauseWeeks("2026-08-03", null)).toBeNull();
    expect(pauseWeeks(null, "2026-08-24")).toBeNull();
    expect(pauseWeeks("2026-08-24", "2026-08-03")).toBeNull();
  });
});

describe("daysUntilReactivation", () => {
  it("counts days to the end date, clamped at zero", () => {
    expect(daysUntilReactivation("2026-08-10", NOW)).toBe(3);
    expect(daysUntilReactivation("2026-08-01", NOW)).toBe(0);
  });
  it("is null without an end date", () => {
    expect(daysUntilReactivation(null, NOW)).toBeNull();
  });
});

describe("reactivatesSoon", () => {
  it("flags an end within the next 4 days", () => {
    expect(reactivatesSoon("2026-08-10", NOW)).toBe(true);
    expect(reactivatesSoon("2026-08-11", NOW)).toBe(true);
    expect(reactivatesSoon("2026-08-12", NOW)).toBe(false);
  });
  it("does not flag long-past ends or missing dates", () => {
    expect(reactivatesSoon("2026-07-01", NOW)).toBe(false);
    expect(reactivatesSoon(null, NOW)).toBe(false);
  });
});
