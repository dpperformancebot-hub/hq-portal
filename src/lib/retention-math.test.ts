import { describe, expect, it } from "vitest";
import { bracketStats, computeRetentionRows } from "./retention-math";
import type { Client } from "@/lib/seed/types";

describe("bracketStats", () => {
  // Roster shape: 3 active in 0-8, 2 active in 8-16, 1 active in 32+;
  // churn: 2 fell off in 0-8, 1 in 16-32.
  const row = { activePerBracket: [3, 2, 0, 1], churnPerBracket: [2, 0, 1, 0] };

  it("counts entrants as everyone whose tenure reached the bracket", () => {
    // Bracket 0: every client ever seen (6 active-path + 3 churned-path... = all 9).
    expect(bracketStats(row, 0).entered).toBe(9);
    // Bracket 1 (8-16): everyone except the 2 who churned in 0-8 and the 3 still in 0-8.
    expect(bracketStats(row, 1).entered).toBe(4);
    // Bracket 3 (32+): just the one long-tenure client.
    expect(bracketStats(row, 3).entered).toBe(1);
  });

  it("computes bracket retention as survivors of the entrants", () => {
    // Bracket 0: 9 entered, 2 churned inside -> 7/9.
    expect(bracketStats(row, 0).retention).toBeCloseTo(1 - 2 / 9);
    // Bracket 2 (16-32): 2 entered (1 churned there + 1 who made 32+), 1 churned -> 50%.
    expect(bracketStats(row, 2)).toMatchObject({ entered: 2, churnedIn: 1, retention: 0.5 });
    // Bracket 3: sole entrant survived -> 100%.
    expect(bracketStats(row, 3).retention).toBe(1);
  });

  it("returns null retention when no one entered the bracket (no card rendered)", () => {
    const fresh = { activePerBracket: [2, 0, 0, 0], churnPerBracket: [0, 0, 0, 0] };
    expect(bracketStats(fresh, 1).retention).toBeNull();
    expect(bracketStats(fresh, 1).entered).toBe(0);
  });
});

describe("computeRetentionRows", () => {
  const mk = (
    id: string,
    coachId: string,
    status: Client["status"],
    startWeeksAgo: number,
    endWeeksAgo?: number,
  ): Client => {
    const week = 7 * 86_400_000;
    return {
      id,
      coachId,
      status,
      startDate: new Date(Date.now() - startWeeksAgo * week).toISOString().slice(0, 10),
      endDate: endWeeksAgo === undefined ? null : new Date(Date.now() - endWeeksAgo * week).toISOString().slice(0, 10),
    } as Client;
  };

  it("buckets active tenure and churn tenure per coach", () => {
    const rows = computeRetentionRows(
      [
        mk("1", "co1", "active", 4), // 0-8
        mk("2", "co1", "active", 20), // 16-32
        mk("3", "co1", "cancelled", 30, 20), // churned at 10 wk -> 8-16
        mk("4", "co2", "active", 40), // other coach, 32+
      ],
      { co1: "Amy" },
    );
    const amy = rows.find((r) => r.coachId === "co1");
    expect(amy).toMatchObject({
      name: "Amy",
      activePerBracket: [1, 0, 1, 0],
      churnPerBracket: [0, 1, 0, 0],
      rosterCount: 2,
      churnedCount: 1,
    });
    expect(amy?.retention).toBeCloseTo(2 / 3);
    expect(rows.find((r) => r.coachId === "co2")?.name).toBe("Unknown");
  });
});
