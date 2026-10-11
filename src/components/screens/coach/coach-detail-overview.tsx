"use client";

// Per-coach overview (2026-07-11, owner decision): the head coach reviews a
// coach HERE, read-only, instead of entering their portal. Performance only:
// KPIs, check-in + roster trends, ghosted clients, roster. NO pay anywhere
// (no pay trend, no pay panel). Client rows link to the shared client
// profile (/client-database/[id]), which is already in the oversight nav —
// never into the coach's own screens.

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AreaChart,
  DataTable,
  EmptyState,
  Kpi,
  PageHeader,
  Panel,
  type Column,
} from "@/components/ui";
import { NEEDS_START_DATE } from "@/lib/client-start-date";
import { MonthlyRetentionPanel } from "@/components/screens/coach/monthly-retention-panel";
import type { CoachDashboardData } from "@/lib/data";
import type { Client } from "@/lib/seed/types";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const weeksSince = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / (7 * 86_400_000))) : null);

const weekLabel = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.getDate()}/${d.getMonth() + 1}`;
};

function TrendPanel({ title, hint, weeks, values }: { title: string; hint: string; weeks: string[]; values: number[] }) {
  const data = weeks.map((w, i) => ({ week: weekLabel(w), value: values[i] ?? 0 }));
  const hasSignal = values.some((v) => v > 0);
  // R2-9: fill the card, hint pinned to the bottom, so the pair sits level.
  return (
    <Panel title={title} className="h-full">
      {hasSignal ? (
        <div className="flex h-full flex-col justify-between gap-2">
          <AreaChart data={data} xKey="week" yKey="value" height={140} />
          <p className="text-xs text-fg-dim">{hint}</p>
        </div>
      ) : (
        <EmptyState compact icon="bar_chart" title="No history yet" message="Fills in as this coach's weeks land." />
      )}
    </Panel>
  );
}

export function CoachDetailOverview({
  data,
  coaches = [],
}: {
  data: CoachDashboardData;
  /** All coaches, for the switcher dropdown (jump between overviews). */
  coaches?: { id: string; name: string }[];
}) {
  const { coach, roster, checkInsThisWeek, atRisk, auditsToReview, trends, retentionMonths } = data;
  const router = useRouter();

  if (!coach) {
    return <EmptyState title="Coach not found" message="This coach does not exist or has no data yet." />;
  }

  const columns: Column<Client>[] = [
    { key: "name", header: "Client", sortValue: (c) => c.name, render: (c) => <span className="text-fg">{c.name}</span> },
    {
      key: "week",
      header: "Week",
      align: "right",
      sortValue: (c) => weeksSince(c.startDate) ?? -1,
      render: (c) => {
        const w = weeksSince(c.startDate);
        return w === null ? <span className="text-warn" title={NEEDS_START_DATE}>needs date</span> : <span className="tabular-nums">{w}</span>;
      },
    },
    { key: "plan", header: "Plan", sortValue: (c) => c.plan, render: (c) => c.plan },
    { key: "stage", header: "Journey", sortValue: (c) => c.journeyStage, render: (c) => c.journeyStage },
    {
      key: "renewal",
      header: "Term end",
      align: "right",
      sortValue: (c) => c.endDate ?? "",
      render: (c) => <span className="tabular-nums">{c.endDate ?? "-"}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        back
        eyebrow="Coach oversight"
        title={coach.name}
        subtitle="Read-only performance overview. Pay is not shown here."
        actions={
          coaches.length > 1 ? (
            <select
              aria-label="Switch coach"
              value={coach.id}
              onChange={(e) => router.push(`/coach-overview/${e.target.value}`)}
              className="rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Active clients" value={roster.length} hint="current roster" />
        <Kpi label="Check-ins this week" value={checkInsThisWeek} hint="on record, last 7 days" />
        <Kpi label="Open audits" value={auditsToReview} hint="QA audits pending" />
        <Kpi label="Retention" value={pct(coach.retention)} hint="avg month to month" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrendPanel
          title="Check-ins per week"
          hint="Submissions across their roster, last 12 weeks."
          weeks={trends.weeks}
          values={trends.checkIns}
        />
        {/* D1: monthly retention compare replaces the roster-growth graph. */}
        <MonthlyRetentionPanel months={retentionMonths} />
      </div>

      <Panel title={`Needs attention (${atRisk.length})`}>
        {atRisk.length === 0 ? (
          <EmptyState icon="checkins" title="All clear" message="No ghosted clients right now." />
        ) : (
          <div className="space-y-2">
            {atRisk.map((c) => (
              <Link
                key={c.id}
                href={`/client-database/${c.id}`}
                className="flex items-center justify-between rounded-control border border-border-soft px-3 py-2 transition-colors hover:border-accent/40 hover:bg-surface-2"
              >
                <div>
                  <div className="text-sm font-medium text-fg">{c.name}</div>
                  <div className="text-xs text-fg-muted">{weeksSince(c.startDate) === null ? NEEDS_START_DATE : `week ${weeksSince(c.startDate)}`}</div>
                </div>
                <span className="rounded-pill bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
                  Ghosted
                </span>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`Roster (${roster.length})`}>
        {roster.length === 0 ? (
          <EmptyState title="No active clients" message="Assignments appear here as they land." />
        ) : (
          <DataTable
            columns={columns}
            data={roster}
            getRowKey={(c) => c.id}
            onRowClick={(c) => router.push(`/client-database/${c.id}`)}
          />
        )}
      </Panel>
    </div>
  );
}
