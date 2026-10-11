"use client";

// Bracket board (2026-07-11, owner's sketch): the retention view in the
// Tasks-board layout. One vertical column per tenure bracket plus an Average
// column; inside each column, one card per coach, best first FOR THAT
// BRACKET. Clicking a card expands its INFO detail inline; nothing navigates
// away. Maths in src/lib/retention-math.ts (bracketStats), unit-tested.

import { useState } from "react";
import { Avatar } from "@/components/ui";
import { BRACKETS, bracketStats, type CoachRow } from "@/lib/retention-math";

const pct = (n: number) => `${Math.round(n * 100)}%`;

// Big-number colour thresholds (spec): >= 85% positive, 70-85% default,
// < 70% danger. Applied to the retention figure only.
const retentionColor = (r: number) => (r >= 0.85 ? "text-positive" : r >= 0.7 ? "text-fg" : "text-danger");

type CardData = {
  row: CoachRow;
  /** Retention shown big on the card: the bracket's for bracket columns,
   *  lifetime for the Average column. */
  retention: number;
  subline: string;
  info: { label: string; value: string }[];
};

function CoachCard({ card, expanded, onToggle }: { card: CardData; expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      title={expanded ? "Hide details" : "Show details"}
      className="rounded-control border border-border bg-surface p-3 text-left shadow-sm transition-colors hover:border-accent/40"
    >
      <div className="flex items-center gap-2.5">
        <Avatar name={card.row.name} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{card.row.name}</span>
        <span className={`font-display text-2xl tabular-nums tracking-display ${retentionColor(card.retention)}`}>
          {pct(card.retention)}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] tabular-nums text-fg-muted">{card.subline}</span>
        <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
          Info
        </span>
      </div>
      {expanded ? (
        <dl className="mt-2 space-y-1 border-t border-border-soft pt-2">
          {card.info.map((d) => (
            <div key={d.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-[11px] text-fg-muted">{d.label}</dt>
              <dd className="text-xs font-medium tabular-nums text-fg">{d.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </button>
  );
}

export function RetentionBracketBoard({ rows }: { rows: CoachRow[] }) {
  // One expanded card at a time, keyed column:coach so the same coach can be
  // inspected independently per column.
  const [expanded, setExpanded] = useState<string | null>(null);

  const coachInfo = (row: CoachRow, s: { activeIn: number; churnedIn: number }) => [
    { label: "Active in bracket", value: String(s.activeIn) },
    { label: "Churned in bracket", value: String(s.churnedIn) },
    { label: "Avg weeks at churn", value: row.avgChurnWeeks === null ? "-" : row.avgChurnWeeks.toFixed(1) },
    { label: "Lifetime retention", value: pct(row.retention) },
  ];

  const columns: { key: string; label: string; cards: CardData[] }[] = [
    ...BRACKETS.map((b, i) => ({
      key: b.label,
      label: `${b.label.replace(" wk", "")} weeks`,
      cards: rows
        .flatMap((row) => {
          const s = bracketStats(row, i);
          // No entrants = no card in this column (guarded divide-by-zero).
          if (s.retention === null) return [];
          return [
            {
              row,
              retention: s.retention,
              subline: `${s.entered} clients · -${s.churnedIn} churned`,
              info: coachInfo(row, s),
            },
          ];
        })
        .sort((a, b) => b.retention - a.retention || a.row.name.localeCompare(b.row.name)),
    })),
    {
      key: "average",
      label: "Average",
      cards: rows
        .map((row) => ({
          row,
          retention: row.retention,
          subline: `avg across all brackets · ${row.rosterCount} active`,
          info: [
            { label: "Active roster", value: String(row.rosterCount) },
            { label: "Churned lifetime", value: String(row.churnedCount) },
            { label: "Avg weeks at churn", value: row.avgChurnWeeks === null ? "-" : row.avgChurnWeeks.toFixed(1) },
            { label: "Lifetime retention", value: pct(row.retention) },
          ],
        }))
        .sort((a, b) => b.retention - a.retention || a.row.name.localeCompare(b.row.name)),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
      {columns.map((col) => (
        <div key={col.key} className="flex flex-col rounded-card border border-border bg-surface-2/50 p-2">
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
              {col.label} <span className="ml-1 tabular-nums">{col.cards.length}</span>
            </span>
          </div>
          <div className="flex min-h-[3rem] flex-col gap-2">
            {col.cards.map((card) => {
              const key = `${col.key}:${card.row.coachId}`;
              return (
                <CoachCard
                  key={key}
                  card={card}
                  expanded={expanded === key}
                  onToggle={() => setExpanded((v) => (v === key ? null : key))}
                />
              );
            })}
            {col.cards.length === 0 ? (
              <div className="rounded-control border border-dashed border-border-soft px-3 py-4 text-center text-xs text-fg-muted">
                No coaches in this bracket yet
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
