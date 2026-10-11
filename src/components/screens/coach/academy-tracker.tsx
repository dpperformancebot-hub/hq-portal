"use client";

// Live Academy tracker (owner + head coach): where every coach is in the
// gated course. Stage = first incomplete module; segments show per-module
// lesson completion. Data from getAcademyTracker (academy_progress table).

import { Card, EmptyState } from "@/components/ui";
import type { CoachAcademyRow } from "@/lib/academy-actions";

const STAGE_LABELS = ["Foundations", "2", "3", "4", "5", "6"]; // stage number is what matters

export function AcademyTracker({ rows, moduleSizes }: { rows: CoachAcademyRow[]; moduleSizes: number[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="book"
          title="No Academy activity yet"
          message="Coach progress appears here as lessons are completed (needs migration 20260710000002)."
        />
      </Card>
    );
  }
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
            <th className="px-4 py-3">Coach</th>
            <th className="px-3 py-3">Modules</th>
            <th className="px-3 py-3 text-right">Stage</th>
            <th className="px-3 py-3 text-right">Lessons</th>
            <th className="px-4 py-3 text-right">Last activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const finished = r.currentStage > moduleSizes.length;
            return (
              <tr key={r.coachId} className="border-b border-border-soft">
                <td className="px-4 py-3 font-medium text-fg whitespace-nowrap">{r.coachName}</td>
                <td className="px-3 py-3">
                  <span className="flex items-center gap-1">
                    {moduleSizes.map((size, i) => {
                      const done = r.perModule[i] ?? 0;
                      const complete = done >= size;
                      const started = done > 0 && !complete;
                      return (
                        <span
                          key={i}
                          title={`Module ${i + 1}: ${done}/${size} lessons`}
                          className={`h-2.5 w-8 rounded-pill ${
                            complete ? "bg-accent" : started ? "bg-warn" : "bg-surface-2"
                          }`}
                        />
                      );
                    })}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  <span
                    className={`rounded-pill px-2 py-0.5 text-[11px] font-medium ${
                      finished ? "bg-positive-soft text-positive" : "bg-surface-2 text-fg-dim"
                    }`}
                  >
                    {finished ? "Complete" : `Module ${r.currentStage}${r.currentStage === 1 ? ` · ${STAGE_LABELS[0]}` : ""}`}
                  </span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-fg-dim">
                  {r.lessonsDone}/{r.lessonsTotal}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums text-fg-muted">
                  {r.lastActivity ? r.lastActivity.slice(0, 10) : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
