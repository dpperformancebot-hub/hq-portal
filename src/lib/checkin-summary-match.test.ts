import { describe, expect, it } from "vitest";
import { matchSummariesToCheckIns } from "@/lib/checkin-summary-match";
import type { CheckIn } from "@/lib/seed/types";
import type { CheckInSummary } from "@/lib/check-in-summaries";

const ci = (id: string, submittedAt: string, weekNumber: number | null = null): CheckIn =>
  ({ id, clientId: "c1", coachId: "co1", code: "Y", submittedAt, weekNumber, adherence: null, source: "coach_log" }) as CheckIn;

const sum = (id: string, createdAt: string, weekNumber: number | null = null): CheckInSummary => ({
  id,
  clientId: "c1",
  coachId: "co1",
  weekNumber,
  loomUrl: null,
  summary: "s",
  actionItems: "",
  coachNotes: "",
  createdAt,
});

describe("matchSummariesToCheckIns", () => {
  it("pairs by exact week number first", () => {
    const m = matchSummariesToCheckIns(
      [ci("a", "2026-08-03", 12), ci("b", "2026-07-27", 11)],
      [sum("s1", "2026-08-05", 11)],
    );
    expect(m.get("b")?.id).toBe("s1");
    expect(m.has("a")).toBe(false);
  });

  it("falls back to the same Monday-start week of the dates", () => {
    // 2026-08-03 is a Monday; both dates land in that week.
    const m = matchSummariesToCheckIns([ci("a", "2026-08-03")], [sum("s1", "2026-08-06")]);
    expect(m.get("a")?.id).toBe("s1");
  });

  it("attaches a summary to at most one check-in and skips non-matching weeks", () => {
    const m = matchSummariesToCheckIns(
      [ci("a", "2026-08-03"), ci("b", "2026-08-04")],
      [sum("s1", "2026-08-05"), sum("s2", "2026-07-01")],
    );
    // s1 pairs with the first row of its week; s2's week matches nothing.
    expect(m.get("a")?.id).toBe("s1");
    expect(m.has("b")).toBe(false);
  });

  it("handles unparseable dates without matching", () => {
    const m = matchSummariesToCheckIns([ci("a", "not-a-date")], [sum("s1", "2026-08-05")]);
    expect(m.size).toBe(0);
  });
});
