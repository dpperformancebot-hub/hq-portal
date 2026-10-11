import { describe, expect, it } from "vitest";
import { DAY, FUTURE_WEEKS, WEEKS_SHOWN, buildWeekWindow, isoDate, sortByStart, startsInFuture, weekStart } from "./check-in-weeks";

const wed = new Date(2026, 8, 23, 15, 0); // Wed 23 Sep 2026 local

describe("buildWeekWindow (R16-2b)", () => {
  it("page 0 = past weeks, this week, exactly one editable future week", () => {
    const w = buildWeekWindow(wed, 0);
    expect(w).toHaveLength(WEEKS_SHOWN);
    expect(w.filter((c) => c.future)).toHaveLength(FUTURE_WEEKS);
    expect(w.at(-1)?.future).toBe(true);
    expect(w.at(-2)?.current).toBe(true);
    expect(w.at(-2)?.start).toBe(weekStart(wed));
    expect(isoDate(w.at(-1)!.start)).toBe("2026-09-28"); // next Monday
    expect(isoDate(w[0].start)).toBe("2026-07-13"); // 10 weeks before this Monday
  });
  it("columns are consecutive Mondays", () => {
    const w = buildWeekWindow(wed, 0);
    for (let i = 1; i < w.length; i++) expect(w[i].start - w[i - 1].start).toBe(7 * DAY);
    for (const c of w) expect(new Date(c.start).getDay()).toBe(1);
  });
  it("paging back never shows a future week and tiles the past without gaps or overlap", () => {
    const p0 = buildWeekWindow(wed, 0), p1 = buildWeekWindow(wed, 1), p2 = buildWeekWindow(wed, 2);
    expect(p1.some((c) => c.future)).toBe(false);
    expect(p2.some((c) => c.future)).toBe(false);
    expect(p1).toHaveLength(WEEKS_SHOWN);
    expect(p1.at(-1)!.start).toBe(p0[0].start - 7 * DAY);
    expect(p2.at(-1)!.start).toBe(p1[0].start - 7 * DAY);
  });
  it("a future-week cell keys to its own Monday (pick() writes that week_start)", () => {
    const future = buildWeekWindow(wed, 0).at(-1)!;
    expect(isoDate(future.start)).toBe("2026-09-28");
    expect(weekStart(new Date(future.start))).toBe(future.start);
  });
});

describe("sortByStart (R16-2a)", () => {
  const rows = [
    { name: "Zed", startDate: "2026-09-21" },
    { name: "Amy", startDate: "2025-03-03" },
    { name: "Bob", startDate: null },
    { name: "Cat", startDate: "2026-01-12" },
  ];
  it("oldest first by default, unknown start last, ties by name", () => {
    expect(sortByStart(rows, "asc").map((r) => r.name)).toEqual(["Amy", "Cat", "Zed", "Bob"]);
  });
  it("desc flips to newest first, unknown still last", () => {
    expect(sortByStart(rows, "desc").map((r) => r.name)).toEqual(["Zed", "Cat", "Amy", "Bob"]);
  });
});

describe("startsInFuture", () => {
  it("flags next week's starter and not today's or past clients", () => {
    expect(startsInFuture("2026-09-28", wed)).toBe(true);
    expect(startsInFuture("2026-09-23", wed)).toBe(false);
    expect(startsInFuture("2026-01-01", wed)).toBe(false);
    expect(startsInFuture(null, wed)).toBe(false);
  });
});
