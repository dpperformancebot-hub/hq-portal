"use client";

// Monthly retention panel (D1/D2, FEEDBACK-V2): replaces the roster-growth
// graph on the per-coach overview. Bars = month-to-month retention %; the
// compare row puts any two months side by side (e.g. Angus Jan vs Mar) with
// churn counts and D2's average weeks-at-churn for each.

import { useState } from "react";
import { BarChart, EmptyState, Panel } from "@/components/ui";
import type { MonthlyRetentionPoint } from "@/lib/churn-math";
import { CHURN_EXCLUSION_NOTE } from "@/lib/churn-math";

const pct = (v: number) => `${Math.round(v * 100)}%`;

function MonthFacts({ point }: { point: MonthlyRetentionPoint }) {
  return (
    <div className="rounded-control bg-surface-2 px-3 py-2">
      <div className="text-xs font-semibold text-fg">{point.label}</div>
      <div className="mt-1 space-y-0.5 text-xs text-fg-dim">
        <div>
          Retention <span className="font-medium tabular-nums text-fg">{pct(point.retention)}</span>
        </div>
        <div>
          Churned <span className="tabular-nums">{point.churned}</span> of{" "}
          <span className="tabular-nums">{point.denom}</span>
        </div>
        <div>
          Avg wk at churn{" "}
          <span className="tabular-nums">{point.avgChurnWeeks === null ? "-" : point.avgChurnWeeks.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

export function MonthlyRetentionPanel({ months }: { months: MonthlyRetentionPoint[] }) {
  // Show the last 12 complete months on the chart; compare defaults to the
  // two most recent.
  const visible = months.slice(-12);
  const [monthA, setMonthA] = useState(visible.length >= 2 ? visible[visible.length - 2].month : "");
  const [monthB, setMonthB] = useState(visible.length >= 1 ? visible[visible.length - 1].month : "");

  if (visible.length === 0) {
    return (
      <Panel title="Monthly retention">
        <EmptyState
          icon="bar_chart"
          title="No complete months yet"
          message="Month-to-month retention appears after this coach's first full calendar month."
        />
      </Panel>
    );
  }

  const a = months.find((m) => m.month === monthA) ?? null;
  const b = months.find((m) => m.month === monthB) ?? null;
  const delta = a && b ? b.retention - a.retention : null;

  const rows = visible.map((m) => ({ month: m.label, value: Math.round(m.retention * 100) }));
  const selectCls =
    "rounded-control border border-border bg-surface-2 px-2 py-1 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent";

  return (
    <Panel title="Monthly retention" subtitle={`Month-to-month, own roster. Pick two months to compare. ${CHURN_EXCLUSION_NOTE}`} className="h-full">
      <BarChart data={rows} xKey="month" yKey="value" valuePrefix="" height={140} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select aria-label="Compare month A" value={monthA} onChange={(e) => setMonthA(e.target.value)} className={selectCls}>
          {months.map((m) => (
            <option key={m.month} value={m.month}>
              {m.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-fg-muted">vs</span>
        <select aria-label="Compare month B" value={monthB} onChange={(e) => setMonthB(e.target.value)} className={selectCls}>
          {months.map((m) => (
            <option key={m.month} value={m.month}>
              {m.label}
            </option>
          ))}
        </select>
        {delta !== null ? (
          <span className={`text-xs font-medium tabular-nums ${delta >= 0 ? "text-positive" : "text-danger"}`}>
            {delta >= 0 ? "+" : ""}
            {Math.round(delta * 100)} pts
          </span>
        ) : null}
      </div>
      {a && b ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <MonthFacts point={a} />
          <MonthFacts point={b} />
        </div>
      ) : null}
    </Panel>
  );
}
