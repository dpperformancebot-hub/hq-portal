"use client";

// Retention leaderboard by tenure bracket (2026-07-09, Angus's spec;
// board layout 2026-07-11, owner's sketch). Two renderings of the same
// per-coach bracket maths (src/lib/retention-math.ts):
//   Board (default): Tasks-style kanban, one column per bracket + Average,
//     one card per coach ranked best-first for that bracket.
//   Table: the original leaderboard grid, kept behind the toggle.

import { useState } from "react";
import { Card, EmptyState, SegmentedControl } from "@/components/ui";
import type { Client } from "@/lib/seed/types";
import { BRACKETS, computeRetentionRows, type CoachRow } from "@/lib/retention-math";
import { RetentionBracketBoard } from "@/components/screens/coach/retention-bracket-board";

// Re-exported for existing consumers (performance-ranking.tsx).
export { computeRetentionRows } from "@/lib/retention-math";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function RetentionBoard({ clients, coachNames }: { clients: Client[]; coachNames: Record<string, string> }) {
  const [view, setView] = useState("Board");
  const rows = computeRetentionRows(clients, coachNames);

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState icon="scale" title="No retention data yet" message="Fills in as clients and coaches land in the roster." />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <SegmentedControl
          aria-label="Retention view"
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { label: "Board", value: "Board" },
            { label: "Table", value: "Table" },
          ]}
        />
      </div>
      {view === "Board" ? <RetentionBracketBoard rows={rows} /> : <RetentionTable rows={rows} />}
    </div>
  );
}

function RetentionTable({ rows }: { rows: CoachRow[] }) {
  // Combined row across every coach.
  const totals = rows.reduce(
    (t, r) => {
      for (let i = 0; i < 4; i++) {
        t.active[i] += r.activePerBracket[i];
        t.churn[i] += r.churnPerBracket[i];
      }
      t.roster += r.rosterCount;
      t.churned += r.churnedCount;
      t.churnWeeks += (r.avgChurnWeeks ?? 0) * r.churnedCount;
      return t;
    },
    { active: [0, 0, 0, 0], churn: [0, 0, 0, 0], roster: 0, churned: 0, churnWeeks: 0 },
  );
  const totalRetention = totals.roster + totals.churned ? totals.roster / (totals.roster + totals.churned) : 0;

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
            <th className="px-4 py-3">Coach</th>
            {BRACKETS.map((b) => (
              <th key={b.label} className="px-3 py-3 text-right">
                {b.label}
              </th>
            ))}
            <th className="px-3 py-3 text-right" title="Average weeks a churned client lasted">
              Avg wk at churn
            </th>
            <th className="px-4 py-3 text-right">Retention</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.coachId} className="border-b border-border-soft">
              <td className="px-4 py-3">
                <span className="flex items-center gap-2">
                  <span className="w-4 text-right text-xs tabular-nums text-fg-muted">{i + 1}</span>
                  <span className="font-medium text-fg">{r.name}</span>
                  <span className="text-xs text-fg-muted">{r.rosterCount} active</span>
                </span>
              </td>
              {BRACKETS.map((b, bi) => {
                const a = r.activePerBracket[bi];
                const ch = r.churnPerBracket[bi];
                const share = r.rosterCount ? a / r.rosterCount : 0;
                return (
                  <td key={b.label} className="px-3 py-3 text-right align-top">
                    <div className="tabular-nums text-fg">
                      {a}
                      <span className="ml-1 text-xs text-fg-muted">({pct(share)})</span>
                    </div>
                    {ch > 0 ? (
                      <div className="text-xs tabular-nums text-danger" title={`${ch} churned in this bracket`}>
                        -{ch} churned
                      </div>
                    ) : null}
                  </td>
                );
              })}
              <td className="px-3 py-3 text-right tabular-nums text-fg-dim">
                {r.avgChurnWeeks === null ? "-" : r.avgChurnWeeks.toFixed(1)}
              </td>
              <td className="px-4 py-3 text-right">
                <span className={`font-medium tabular-nums ${r.retention >= 0.85 ? "text-positive" : r.retention >= 0.7 ? "text-fg" : "text-danger"}`}>
                  {pct(r.retention)}
                </span>
              </td>
            </tr>
          ))}
          <tr className="bg-surface-2/50">
            <td className="px-4 py-3 font-medium text-fg">All coaches</td>
            {BRACKETS.map((b, bi) => (
              <td key={b.label} className="px-3 py-3 text-right align-top">
                <div className="tabular-nums text-fg">
                  {totals.active[bi]}
                  <span className="ml-1 text-xs text-fg-muted">({pct(totals.roster ? totals.active[bi] / totals.roster : 0)})</span>
                </div>
                {totals.churn[bi] > 0 ? <div className="text-xs tabular-nums text-danger">-{totals.churn[bi]} churned</div> : null}
              </td>
            ))}
            <td className="px-3 py-3 text-right tabular-nums text-fg-dim">
              {totals.churned ? (totals.churnWeeks / totals.churned).toFixed(1) : "-"}
            </td>
            <td className="px-4 py-3 text-right font-medium tabular-nums text-fg">{pct(totalRetention)}</td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}
