import { describe, expect, it } from "vitest";
import { payrollMonthOf, weeksEndingInMonth, weeksOfMonth } from "@/lib/pay/tjd-pay";

describe("a week belongs to the month its SUNDAY falls in", () => {
  it("gives September 2026 its four weeks", () => {
    const w = weeksOfMonth(2026, 8); // 0-indexed: September
    expect(w).toHaveLength(4);
    expect(weeksEndingInMonth(2026, 8)).toBe(4);
    expect(w[0]).toMatchObject({ start: "2026-08-31", end: "2026-09-06", label: "W1" });
    expect(w[3]).toMatchObject({ start: "2026-09-21", end: "2026-09-27", label: "W4" });
  });

  it("counts a week that STARTS in the previous month", () => {
    // Mon 31 Aug to Sun 6 Sep is September's W1, not August's.
    expect(weeksOfMonth(2026, 8)[0].start.startsWith("2026-08")).toBe(true);
    expect(payrollMonthOf("2026-08-31")).toBe("2026-09");
  });

  it("does NOT give September a week that ends in October", () => {
    const w = weeksOfMonth(2026, 8);
    expect(w.every((x) => x.end.startsWith("2026-09"))).toBe(true);
    // Mon 28 Sep runs to Sun 4 Oct, so it is October's.
    expect(payrollMonthOf("2026-09-28")).toBe("2026-10");
  });

  it("finds the five-week months, which is what unlocks a fifth tick", () => {
    const five = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((m) => weeksEndingInMonth(2026, m) === 5);
    expect(five.length).toBeGreaterThan(0);
    for (const m of five) expect(weeksOfMonth(2026, m)).toHaveLength(5);
  });

  it("labels weeks W1 up, matching the master sheet's columns", () => {
    expect(weeksOfMonth(2026, 10).map((w) => w.label)).toEqual(["W1", "W2", "W3", "W4", "W5"].slice(0, weeksEndingInMonth(2026, 10)));
  });

  it("every week is exactly Monday to Sunday", () => {
    for (const w of weeksOfMonth(2026, 8)) {
      expect(new Date(`${w.start}T00:00:00Z`).getUTCDay()).toBe(1);
      expect(new Date(`${w.end}T00:00:00Z`).getUTCDay()).toBe(0);
    }
  });
});
