"use client";

import {
  Button,
  Card,
  DataTable,
  EmptyState,
  MovableBlock,
  MovableLayout,
  PageHeader,
  Panel,
  type Column,
} from "@/components/ui";
import type { CoachScorecard } from "@/lib/seed";
import type { Client } from "@/lib/seed/types";
import { datedFilename, exportRowsToCsv } from "@/lib/csv";
import { PerformanceRanking } from "@/components/screens/coach/performance-ranking";
import { RetentionBoard } from "@/components/screens/coach/retention-board";
import { AcademyTracker } from "@/components/screens/coach/academy-tracker";
import type { CoachAcademyRow } from "@/lib/academy-actions";
import { CHURN_EXCLUSION_NOTE } from "@/lib/churn-math";

const pct = (n: number) => `${Math.round(n * 100)}%`;

// Capacity denominator is owner-configured (coach-config.ts), the documented
// source of truth (baseline 70). The data layer already resolves it by name on
// the live path; resolving here too keeps the column, slots, average and CSV
// consistent in every mode (and corrects stale seed values in demo).
// R17-4: capacity comes from the coach row now, not a name lookup in code.
const maxCapacity = (c: CoachScorecard) => c.maxCapacity;
const capacityPct = (c: CoachScorecard) => {
  const max = maxCapacity(c);
  return max === 0 ? 0 : c.activeClients / max;
};

// Scorecard CSV via the shared helper (src/lib/csv.ts).
function downloadScorecardCsv(rows: CoachScorecard[]) {
  exportRowsToCsv(datedFilename("coach-performance"), rows, [
    { header: "Coach", value: (c) => c.name },
    { header: "Capacity", value: (c) => `${c.activeClients}/${maxCapacity(c)}` },
    { header: "Adherence", value: (c) => (c.adherence === 0 ? "awaiting feed" : pct(c.adherence)) },
    { header: "Retention", value: (c) => pct(c.retention) },
    { header: "Churn (mo avg)", value: (c) => pct(c.churn) },
    { header: "Active clients", value: (c) => c.activeClients },
  ]);
}

const COLUMNS: Column<CoachScorecard>[] = [
  {
    key: "name",
    header: "Coach",
    render: (c) => (
      <span className="flex flex-col">
        <span className="font-medium text-fg">{c.name}</span>
        <span className="text-[11px] text-fg-muted">{c.role === "head_coach" ? "Head Coach" : "Coach"}</span>
      </span>
    ),
  },
  {
    key: "capacity",
    header: "Capacity",
    width: "180px",
    sortValue: (c) => capacityPct(c),
    render: (c) => (
      <span className="flex w-full items-center gap-2">
        <span className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-2">
          <span className="block h-full rounded-pill bg-accent" style={{ width: `${Math.min(100, Math.round(capacityPct(c) * 100))}%` }} />
        </span>
        <span className="w-12 text-right text-xs tabular-nums text-fg-dim">
          {c.activeClients}/{maxCapacity(c)}
        </span>
      </span>
    ),
  },
  { key: "adherence", header: "Adherence", align: "right", width: "100px", render: (c) => (c.adherence === 0 ? <span className="text-fg-muted" title="Awaiting check-in feed (Kahunas)">awaiting feed</span> : pct(c.adherence)) },
  { key: "response", header: "Avg response", align: "right", width: "120px", sortValue: (c) => c.avgResponseHours, render: (c) => (c.avgResponseHours === 0 ? <span className="text-fg-muted" title="Awaiting check-in feed (Kahunas)">awaiting feed</span> : `${c.avgResponseHours.toFixed(1)}h`) },
  { key: "retention", header: "Retention", align: "right", width: "100px", render: (c) => pct(c.retention) },
  {
    key: "churn",
    header: "Churn (mo avg)",
    align: "right",
    width: "90px",
    render: (c) => <span className={c.churn > 0.08 ? "text-danger" : "text-fg"}>{pct(c.churn)}</span>,
  },
  { key: "slots", header: "Slots open", align: "right", width: "100px", sortValue: (c) => Math.max(0, maxCapacity(c) - c.activeClients), render: (c) => Math.max(0, maxCapacity(c) - c.activeClients) },
];

export function CoachPerformanceView({
  coaches,
  clients = [],
  coachNames = {},
  academyRows = [],
  academyModuleSizes = [],
  transformationsByCoach = {},
}: {
  coaches: CoachScorecard[];
  clients?: Client[];
  coachNames?: Record<string, string>;
  academyRows?: CoachAcademyRow[];
  academyModuleSizes?: number[];
  /** D3: transformation counts per coach id. */
  transformationsByCoach?: Record<string, number>;
}) {
  const active = coaches.filter((c) => c.activeClients > 0);
  // D3: transformations column (count + share of active clients).
  const transformCol: Column<CoachScorecard> = {
    key: "transformations",
    header: "Transf.",
    align: "right",
    width: "90px",
    sortValue: (c) => transformationsByCoach[c.id] ?? 0,
    render: (c) => {
      const n = transformationsByCoach[c.id] ?? 0;
      const share = c.activeClients > 0 ? ` (${Math.round((n / c.activeClients) * 100)}%)` : "";
      return <span className="tabular-nums">{`${n}${share}`}</span>;
    },
  };
  const columns = [...COLUMNS.slice(0, -1), transformCol, COLUMNS[COLUMNS.length - 1]];
  const avgCapacity =
    active.length === 0 ? 0 : active.reduce((s, c) => s + capacityPct(c), 0) / active.length;

  return (
    // flex + gap (not space-y): blocks reorder via CSS order (MovableBlock).
    <div className="flex flex-col gap-6">
      <PageHeader
        back
        eyebrow="Operations"
        title="Coach Performance"
        subtitle={`${active.length} coaches · ${pct(avgCapacity)} avg capacity`}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => downloadScorecardCsv(active)}
            disabled={active.length === 0}
            title="Download the scorecard as a CSV"
          >
            Export
          </Button>
        }
      />

      <MovableLayout storageKey="coach-performance">
        {/* The centrepiece: ranked coach cards, best first. First in DOM so it
            renders on top by default; saved block orders still apply. */}
        <MovableBlock id="ranking">
          <Panel
            title="Coach ranking"
            subtitle={`Composite of retention, capacity, and churn. Best performer first. ${CHURN_EXCLUSION_NOTE}`}
            flush
          >
            <PerformanceRanking coaches={coaches} clients={clients} transformationsByCoach={transformationsByCoach} />
          </Panel>
        </MovableBlock>

        <MovableBlock id="retention-brackets">
          <Panel
            title="Retention leaderboard"
            subtitle="Roster by tenure bracket, where churn happens, and lifetime retention. Best first."
            flush
          >
            <RetentionBoard clients={clients} coachNames={coachNames} />
          </Panel>
        </MovableBlock>

        <MovableBlock id="scorecard">
          <Card className="p-2">
            {active.length === 0 ? (
              <EmptyState icon="scale" title="No coaches with active clients yet." />
            ) : (
              <DataTable columns={columns} data={active} getRowKey={(c) => c.id} />
            )}
          </Card>
        </MovableBlock>

        <MovableBlock id="academy-progress">
          <Panel
            title="Academy tracker"
            subtitle="Where each coach is in the gated course. Green = module complete, amber = in progress."
            flush
          >
            <AcademyTracker rows={academyRows} moduleSizes={academyModuleSizes} />
          </Panel>
        </MovableBlock>
      </MovableLayout>
    </div>
  );
}
