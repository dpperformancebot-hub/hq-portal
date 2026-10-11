import { describe, expect, it } from "vitest";
import {
  clientWeek,
  clientWeekNumber,
  effectiveStartDate,
  needsStartDate,
  startDateSource,
  startsInFuture,
} from "./client-start-date";

const NOW = Date.parse("2026-09-25T00:00:00Z");

describe("effectiveStartDate (R17-1b: the override must win)", () => {
  it("prefers the portal override over the GHL value", () => {
    expect(effectiveStartDate({ startDate: "2026-08-11", startDateOverride: "2026-09-01" })).toBe("2026-09-01");
    expect(startDateSource({ startDate: "2026-08-11", startDateOverride: "2026-09-01" })).toBe("portal");
  });
  it("falls back to the GHL value when no override is set", () => {
    expect(effectiveStartDate({ startDate: "2026-08-11", startDateOverride: null })).toBe("2026-08-11");
    expect(effectiveStartDate({ startDate: "2026-08-11" })).toBe("2026-08-11");
    expect(startDateSource({ startDate: "2026-08-11" })).toBe("ghl");
  });
  it("is null when neither is known, and says so", () => {
    expect(effectiveStartDate({ startDate: null })).toBeNull();
    expect(startDateSource({ startDate: null })).toBe("none");
    expect(needsStartDate({ startDate: null })).toBe(true);
    expect(needsStartDate({ startDate: "2026-08-11" })).toBe(false);
  });
  it("ignores an unparseable date rather than trusting it", () => {
    expect(effectiveStartDate({ startDate: "not a date" })).toBeNull();
    expect(effectiveStartDate({ startDate: "2026-08-11", startDateOverride: "" })).toBe("2026-08-11");
  });
});

describe("clientWeek (R17-1a: unknown is not week 0)", () => {
  it("returns null, never 0, when the start is unknown", () => {
    expect(clientWeek({ startDate: null }, NOW)).toBeNull();
    expect(clientWeekNumber({ startDate: null }, NOW)).toBeNull();
  });
  it("counts whole weeks from the effective start", () => {
    expect(clientWeek({ startDate: "2026-09-25" }, NOW)).toBe(0);
    expect(clientWeek({ startDate: "2026-09-18" }, NOW)).toBe(1);
    expect(clientWeek({ startDate: "2026-09-11" }, NOW)).toBe(2);
    expect(clientWeekNumber({ startDate: "2026-09-25" }, NOW)).toBe(1);
  });
  it("counts from the override when one is set", () => {
    expect(clientWeek({ startDate: "2026-08-11", startDateOverride: "2026-09-18" }, NOW)).toBe(1);
  });
  it("never goes negative for a future start", () => {
    expect(clientWeek({ startDate: "2026-12-01" }, NOW)).toBe(0);
    expect(startsInFuture({ startDate: "2026-12-01" }, NOW)).toBe(true);
    expect(startsInFuture({ startDate: "2026-01-01" }, NOW)).toBe(false);
    expect(startsInFuture({ startDate: null }, NOW)).toBe(false);
  });
});
