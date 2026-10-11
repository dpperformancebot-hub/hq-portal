"use client";

// Ranked coach performance board (2026-07-11, owner spec): the centrepiece of
// /coach-performance. A single-column leaderboard of coach cards in the
// Tasks-board card idiom, best performer at the top, weakest at the bottom.
// Display-only: no links, no actions; the detail lives in the blocks below.

import { Avatar, Card, EmptyState } from "@/components/ui";
import type { CoachScorecard } from "@/lib/seed";
import type { Client } from "@/lib/seed/types";
import { rankCoaches } from "@/lib/coach-ranking";
import { computeRetentionRows } from "@/lib/retention-math";

const CHURN_DANGER = 0.08;

// Ordering logic (rankScore/rankCoaches) lives in src/lib/coach-ranking.ts:
// pure, unit-tested (coach-ranking.test.ts), no UI imports.
export { rankCoaches, rankScore } from "@/lib/coach-ranking";

const pct = (n: number) => `${Math.round(n * 100)}%`;

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[72px]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

export function PerformanceRanking({
  coaches,
  clients = [],
  transformationsByCoach = {},
}: {
  coaches: CoachScorecard[];
  /** Full roster incl. cancelled history; feeds avg weeks at churn. */
  clients?: Client[];
  /** D3: transformation counts per coach id. */
  transformationsByCoach?: Record<string, number>;
}) {
  const ranked = rankCoaches(coaches);

  if (ranked.length === 0) {
    return (
      <Card>
        <EmptyState icon="scale" title="No coaches with active clients yet." />
      </Card>
    );
  }

  // Avg weeks at churn per coach, from the same start/end-date maths as the
  // retention leaderboard (names not needed here, so the map stays empty).
  const avgChurnWeeks = new Map(
    computeRetentionRows(clients, {}).map((r) => [r.coachId, r.avgChurnWeeks]),
  );
  const worstChurn = Math.max(...ranked.map((c) => c.churn));
  const last = ranked[ranked.length - 1];

  return (
    <div className="flex flex-col gap-2">
      {ranked.map((c, i) => {
        const top = i === 0;
        // The danger eyebrow only lands on the bottom card, and only when it
        // is also the worst churn on the board: last place alone is not a flag.
        const needsAttention = ranked.length > 1 && c.id === last.id && c.churn === worstChurn && c.churn > 0;
        const max = c.maxCapacity; // R17-4: from coaches.max_capacity
        const capacity = max === 0 ? 0 : c.activeClients / max;
        const churnWeeks = avgChurnWeeks.get(c.id) ?? null;
        return (
          <Card key={c.id} className={top ? "border-accent/40" : ""}>
            {top ? (
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">
                Top performer
              </div>
            ) : needsAttention ? (
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-danger">
                Needs attention
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <span className="w-9 shrink-0 text-right font-display text-3xl tabular-nums tracking-display text-fg-muted">
                {i + 1}
              </span>
              <Avatar name={c.name} size="md" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-fg">{c.name}</div>
                {c.role === "head_coach" ? (
                  <span className="mt-0.5 inline-flex rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-dim">
                    Head Coach
                  </span>
                ) : null}
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-3">
                <Metric label="Retention">
                  <span className="font-display text-xl tabular-nums tracking-display text-fg">
                    {pct(c.retention)}
                  </span>
                </Metric>
                <Metric label="Capacity">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-24 overflow-hidden rounded-pill bg-surface-2">
                      <span
                        className="block h-full rounded-pill bg-accent"
                        style={{ width: `${Math.min(100, Math.round(capacity * 100))}%` }}
                      />
                    </span>
                    <span className="text-xs tabular-nums text-fg-dim">
                      {c.activeClients}/{max}
                    </span>
                  </span>
                </Metric>
                <Metric label="Churn (mo avg)">
                  <span
                    className={`font-display text-xl tabular-nums tracking-display ${
                      c.churn > CHURN_DANGER ? "text-danger" : "text-fg"
                    }`}
                  >
                    {pct(c.churn)}
                  </span>
                </Metric>
                <Metric label="Avg wk at churn">
                  <span className="text-sm tabular-nums text-fg-dim">
                    {churnWeeks === null ? "-" : churnWeeks.toFixed(1)}
                  </span>
                </Metric>
                <Metric label="Transformations">
                  <span className="text-sm tabular-nums text-fg-dim">
                    {transformationsByCoach[c.id] ?? 0}
                    {c.activeClients > 0
                      ? ` (${Math.round(((transformationsByCoach[c.id] ?? 0) / c.activeClients) * 100)}%)`
                      : ""}
                  </span>
                </Metric>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
