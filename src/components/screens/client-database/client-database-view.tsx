"use client";

import { makeCoachNamer } from "@/components/screens/renewals/coach-name";
import { NEEDS_START_DATE, effectiveStartDate } from "@/lib/client-start-date";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Card,
  DataTable,
  PageHeader,
  PlanPill,
  type Column,
  type TableFilter,
} from "@/components/ui";
import { datedFilename } from "@/lib/csv";
import { MONTHLY_EQUIV_HEADER, MONTHLY_EQUIV_TOOLTIP } from "@/lib/rate-label";
import {
  checkInFreshness,
  weekNumber,
  type CheckInFreshness,
  type Client,
  type ClientStatus,
} from "@/lib/seed";

const STATUS_CHIP: Record<ClientStatus, string> = {
  active: "bg-positive-soft text-positive",
  paused: "bg-status-paused text-status-paused-fg",
  cancelled: "bg-status-cancelled text-status-cancelled-fg",
  past: "bg-surface-2 text-fg-muted",
};

const FRESH_CLASS: Record<CheckInFreshness, string> = {
  recent: "text-positive",
  due: "text-warn",
  overdue: "text-danger",
  none: "text-fg-muted",
};

const FRESH_LABEL: Record<CheckInFreshness, string> = {
  recent: "Recent",
  due: "Due",
  overdue: "Overdue",
  none: "Never",
};

// A10 (owner default, Dan can override): ONE "Past clients" tab covers both
// cancelled and past rows; the per-row status badge still distinguishes
// Cancelled from Past.
const TABS: { key: string; label: string; statuses: ClientStatus[] }[] = [
  { key: "active", label: "Active", statuses: ["active"] },
  { key: "paused", label: "Paused", statuses: ["paused"] },
  { key: "past", label: "Past clients", statuses: ["cancelled", "past"] },
];

export function ClientDatabaseView({
  clients,
  coachNames,
  showMoney = true,
}: {
  clients: Client[];
  coachNames?: Record<string, string>;
  /** false for a money-blind coach (TJD head coach): the $ column, its CSV
   *  export and the price-derived "Missing billing" segment disappear. The
   *  page has already zeroed the prices server-side. */
  showMoney?: boolean;
}) {
  const router = useRouter();
  const coachLabel = makeCoachNamer(coachNames);
  // Active-only by default.
  const [tabKey, setTabKey] = useState("active");
  const [query, setQuery] = useState("");
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];

  const q = query.trim().toLowerCase();
  const matchesQuery = (c: Client) =>
    c.name.toLowerCase().includes(q) || coachLabel(c.coachId).toLowerCase().includes(q);
  // A search spans every status tab; without a query we show the selected tab.
  const rows = q ? clients.filter(matchesQuery) : clients.filter((c) => tab.statuses.includes(c.status));

  // Selecting a tab is always live: clear any active search so the tab takes
  // effect immediately rather than staying hidden behind the cross-tab results.
  const selectTab = (next: string) => {
    setTabKey(next);
    setQuery("");
  };

  // Segment facet (2026-07-03): mirrors the GHL smart lists so the owner/VA
  // work the same buckets in both tools. Priority order when a client
  // qualifies for several: No coach > Missing billing > Expiring 30d.
  const DAY = 86_400_000;
  const segment = (c: Client): string => {
    if (c.status === "active" || c.status === "paused") {
      if (!c.coachId) return "No coach";
      if (showMoney && !c.weeklyRate && !c.monthlyRate) return "Missing billing";
    }
    if (c.status === "active" && c.termLength) {
      const iso = effectiveStartDate(c);
      const end = (iso ? Date.parse(iso) : Number.NaN) + c.termLength * 7 * DAY;
      if (!Number.isNaN(end) && end >= Date.now() && end <= Date.now() + 30 * DAY) return "Expiring 30d";
    }
    return "OK";
  };

  // Facets narrow whichever row set is showing (the tab, or a cross-status
  // search); options + counts derive from the data inside DataTable.
  const filters: TableFilter<Client>[] = [
    { key: "coach", label: "Coach", getValue: (c) => coachLabel(c.coachId) },
    { key: "plan", label: "Plan", getValue: (c) => c.plan },
    { key: "freshness", label: "Check-in", getValue: (c) => FRESH_LABEL[checkInFreshness(c.lastCheckIn)] },
    { key: "segment", label: "Segment", getValue: segment },
  ];

  const allColumns: Column<Client>[] = [
    {
      key: "name",
      header: "Client",
      csvValue: (c) => c.name,
      render: (c) => (
        <span className="flex items-center gap-2">
          <Avatar name={c.name} size="sm" />
          <span className="font-medium text-fg">{c.name}</span>
        </span>
      ),
    },
    { key: "coach", header: "Coach", csvValue: (c) => coachLabel(c.coachId), render: (c) => <span className="text-fg-dim">{coachLabel(c.coachId)}</span> },
    { key: "plan", header: "Plan", csvValue: (c) => c.plan, render: (c) => <PlanPill variant={c.plan.toLowerCase()} /> },
    {
      key: "rate",
      header: MONTHLY_EQUIV_HEADER,
      align: "right",
      width: "108px",
      csvValue: (c) => c.monthlyRate,
      render: (c) => <span title={MONTHLY_EQUIV_TOOLTIP}>{`$${c.monthlyRate.toLocaleString()}`}</span>,
    },
    // R13-6: newest starters first by default (Dan/Jameela want next week's
    // starts visible on login). Column headers still re-sort.
    { key: "start", header: "Start Date", width: "108px", sortValue: (c) => c.startDate, csvValue: (c) => c.startDate, render: (c) => <span className="tabular-nums text-fg-dim">{c.startDate}</span> },
    {
      key: "week",
      header: "Week",
      align: "right",
      width: "68px",
      csvValue: (c) => (c.status === "paused" ? "P" : (weekNumber(c) ?? NEEDS_START_DATE)),
      render: (c) =>
        c.status === "paused" ? "P" : (weekNumber(c) ?? <span className="text-warn" title={NEEDS_START_DATE}>needs date</span>),
    },
    {
      key: "lastCheckIn",
      header: "Last Check-in",
      width: "120px",
      csvValue: (c) => c.lastCheckIn ?? "Never",
      render: (c) => {
        const fresh = checkInFreshness(c.lastCheckIn);
        return (
          <span className={`flex items-center gap-2 ${FRESH_CLASS[fresh]}`}>
            <span className="h-2 w-2 rounded-pill bg-current" />
            {c.lastCheckIn ?? "Never"}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      width: "110px",
      csvValue: (c) => c.status,
      render: (c) => (
        <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_CHIP[c.status]}`}>
          {c.status}
        </span>
      ),
    },
  ];
  // Money-blind viewer: no price column, so none in the CSV export either.
  const columns = showMoney ? allColumns : allColumns.filter((c) => c.key !== "rate");

  return (
    <div className="space-y-6">
      <PageHeader
        back
        eyebrow="Operations"
        title="Client Database"
        subtitle="Every client projected from GHL. Coach assignment is owned by the HQ."
      />

      <Card className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 pt-3">
          <div className="flex flex-1 flex-wrap gap-1">
            {TABS.map((t) => {
              const count = clients.filter((c) => t.statuses.includes(c.status)).length;
              // The selected tab stays highlighted even while searching: it is
              // the tab a click would drop back to once the query is cleared.
              const isActive = t.key === tabKey;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => selectTab(t.key)}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "border-accent text-fg" : "border-transparent text-fg-dim hover:text-fg"
                  }`}
                >
                  {t.label}
                  <span className="text-xs tabular-nums text-fg-muted">{count}</span>
                </button>
              );
            })}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search client or coach"
            aria-label="Search clients"
            className="mb-2 w-full rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent sm:w-56"
          />
        </div>
        {q && (
          <div className="px-4 pt-2 text-xs text-fg-muted">
            {rows.length} {rows.length === 1 ? "match" : "matches"} across all statuses for &ldquo;{query.trim()}&rdquo;
          </div>
        )}
        <div className="p-2">
          <DataTable
            columns={columns}
            data={rows}
            getRowKey={(c) => c.id}
            onRowClick={(c) => router.push(`/client-database/${c.id}`)}
            emptyMessage={
              q
                ? `No clients match "${query.trim()}".`
                : tab.key === "past"
                  ? "No past clients."
                  : `No ${tab.key} clients.`
            }
            exportFilename={datedFilename(`clients-${q ? "search" : tab.key}`)}
            defaultSort={{ key: "start", dir: "desc" }}
            filters={filters}
          />
        </div>
      </Card>
    </div>
  );
}
