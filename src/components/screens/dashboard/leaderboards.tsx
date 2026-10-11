"use client";

import { useState } from "react";
import Link from "next/link";
import { DataTable, EmptyState, Panel, SegmentedControl, type Column } from "@/components/ui";
import type { CoachLeaderboardRow, SalesLeaderboardRow } from "@/lib/seed";
import { CHURN_EXCLUSION_NOTE } from "@/lib/churn-math";

function Movement({ value }: { value: number }) {
  if (value > 0) return <span className="text-[11px] text-positive">▲{value}</span>;
  if (value < 0) return <span className="text-[11px] text-warn">▼{Math.abs(value)}</span>;
  return <span className="text-[11px] text-fg-muted">–</span>;
}

const pct = (n: number) => `${Math.round(n)}%`;
const pct01 = (n: number) => `${Math.round(n * 100)}%`;

const COACH_COLUMNS: Column<CoachLeaderboardRow>[] = [
  {
    key: "rank",
    header: "#",
    width: "56px",
    render: (c) => (
      <span className="flex items-center gap-1.5 tabular-nums">
        <span className="font-medium text-fg">{c.rank}</span>
        <Movement value={c.movement} />
      </span>
    ),
  },
  { key: "name", header: "Coach", render: (c) => <span className="font-medium text-fg">{c.name}</span> },
  { key: "retention", header: "Retention", align: "right", width: "90px", render: (c) => pct01(c.retention) },
  { key: "avg", header: "Avg length", align: "right", width: "100px", sortValue: (c) => c.avgClientWeeks, render: (c) => `${c.avgClientWeeks}w` },
  { key: "churn", header: "Churn (mo avg)", align: "right", width: "110px", render: (c) => pct01(c.churn) },
  { key: "active", header: "Active", align: "right", width: "80px", sortValue: (c) => c.activeClients, render: (c) => c.activeClients },
  { key: "capacity", header: "Capacity", align: "right", width: "90px", sortValue: (c) => c.capacityPct, render: (c) => pct(c.capacityPct * 100) },
];

function CoachLeaderboard({ coaches }: { coaches: CoachLeaderboardRow[] }) {
  return (
    <Panel
      title="Coach Leaderboard"
      subtitle={`Ranked by retention. ${CHURN_EXCLUSION_NOTE}`}
      flush
      action={
        <Link href="/coach-performance" className="text-xs text-accent hover:underline">
          Coach Performance
        </Link>
      }
    >
      {coaches.length === 0 ? (
        <EmptyState icon="user" title="No coaches with active clients" />
      ) : (
        <DataTable columns={COACH_COLUMNS} data={coaches} getRowKey={(c) => c.id} />
      )}
    </Panel>
  );
}

type SalesSort = "closeRate" | "cashCollected";

function SalesLeaderboard({ reps }: { reps: SalesLeaderboardRow[] }) {
  const [sort, setSort] = useState<SalesSort>("cashCollected");
  const sorted = [...reps].sort((a, b) => b[sort] - a[sort]);
  const rankById = new Map(sorted.map((r, i) => [r.id, i + 1]));

  const columns: Column<SalesLeaderboardRow>[] = [
    {
      key: "rank",
      header: "#",
      width: "56px",
      render: (r) => (
        <span className="flex items-center gap-1.5 tabular-nums">
          <span className="font-medium text-fg">{rankById.get(r.id)}</span>
          <Movement value={r.movement} />
        </span>
      ),
    },
    { key: "name", header: "Name", render: (r) => <span className="font-medium text-fg">{r.name}</span> },
    {
      key: "role",
      header: "Role",
      width: "90px",
      render: (r) => (
        <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium capitalize ${r.role === "closer" ? "bg-accent-soft text-accent-deep" : "bg-surface-2 text-fg-dim"}`}>
          {r.role}
        </span>
      ),
    },
    { key: "callsTaken", header: "Calls", align: "right", width: "70px", render: (r) => r.callsTaken },
    { key: "closes", header: "Closes", align: "right", width: "80px", render: (r) => r.closes },
    { key: "closeRate", header: "Close rate", align: "right", width: "100px", render: (r) => `${r.closeRate}%` },
    { key: "cashCollected", header: "Cash", align: "right", width: "100px", render: (r) => `$${r.cashCollected.toLocaleString()}` },
  ];

  return (
    <Panel
      title="Sales Leaderboard"
      subtitle="Setters and closers"
      flush
      action={
        <SegmentedControl
          aria-label="Sort sales leaderboard"
          size="sm"
          value={sort}
          onChange={(v) => setSort(v as SalesSort)}
          options={[
            { label: "Cash", value: "cashCollected" },
            { label: "Close rate", value: "closeRate" },
          ]}
        />
      }
    >
      {reps.length === 0 ? (
        <EmptyState icon="trending_up" title="No sales reps yet" />
      ) : (
        <DataTable columns={columns} data={sorted} getRowKey={(r) => r.id} />
      )}
    </Panel>
  );
}

export function DashboardLeaderboards({
  coaches,
  reps,
}: {
  coaches: CoachLeaderboardRow[];
  reps: SalesLeaderboardRow[];
}) {
  return (
    // Stacked (full width) until a wide viewport so all columns fit; side by
    // side only at 2xl, where each half is still wide enough for every column.
    <div className="grid grid-cols-1 items-start gap-6 2xl:grid-cols-2">
      <CoachLeaderboard coaches={coaches} />
      <SalesLeaderboard reps={reps} />
    </div>
  );
}
