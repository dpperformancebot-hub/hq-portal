"use client";

// Coach Check-ins (M6): the weekly working log. Each client's most recent
// check-in status code, synced from the coach weekly logs
// (scripts/import-coach-log.mjs) and Kahunas form submissions (Zapier intake)
// into the check_ins table. Built to be lived out of: search, click a status
// chip to filter, sort any column, click a row through to the client profile,
// and tick clients off as you action them. Pre-scoped via getCoachRosterData.

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  Panel,
  SegmentedControl,
  StatusPill,
  type Column,
} from "@/components/ui";
import { CheckInWeekGrid } from "@/components/screens/coach-tools/check-in-week-grid";
import { ImportCheckInsPanel } from "@/components/screens/coach-tools/import-check-ins-panel";
import { CHECKIN_META } from "@/lib/seed/types";
import { datedFilename } from "@/lib/csv";
import { LogCheckInForm } from "@/components/client/log-check-in-form";
import { setCheckInReviewedAction } from "@/lib/local-state-actions";
import type { CoachRosterData } from "@/lib/data";
import type { CheckIn, CheckInCode, Client } from "@/lib/seed/types";
import { ClientSlideOver, useClientPanel } from "@/components/client/client-slide-over";
import { displayClientName } from "@/lib/client-name";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

// Codes that need the coach to act: drives the "Needs attention" chip and the
// default attention-first sort weighting.
// R16-2c: M now means Missed (attention); MS "message sent" is the coach's
// action already taken, so it ranks with Y as handled.
const ATTENTION: CheckInCode[] = ["M", "F", "G", "N"];
const attentionRank = (code: CheckInCode | null) =>
  !code ? 1 : ATTENTION.includes(code) ? 0 : code === "Y" || code === "MS" ? 2 : 1;

type Filter = CheckInCode | "all" | "attention";

function Chip({
  active,
  label,
  count,
  tone,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  tone?: "warn";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-accent bg-accent-soft text-accent"
          : tone === "warn"
            ? "border-warn/30 bg-warn-soft text-warn hover:border-warn/50"
            : "border-border bg-surface text-fg-dim hover:text-fg",
      ].join(" ")}
    >
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

export function CheckInsView({
  data,
  live,
  reviewedIds = [],
  canEdit = true,
}: {
  data: CoachRosterData;
  live: boolean;
  /** Reviewed client ids from check_in_reviews (DB), empty until the owner
   *  applies migration 20260630000003. Merged with the localStorage fallback. */
  reviewedIds?: string[];
  /** False when CHECKIN_EDITS_ADMIN_ONLY restricts this coach to read-only
   *  (server-decided; the action re-checks regardless). */
  canEdit?: boolean;
}) {
  const { coach, clients, checkIns } = data;
  // R12-1: client clicks open the half-screen panel, not a page nav.
  const panel = useClientPanel();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [showLog, setShowLog] = useState(false);
  // I2 (2026-08-07): the sheet-like week grid IS the flow, matching the
  // coaches' real check-in logs; the list stays as a secondary view.
  const [view, setView] = useState<"list" | "grid">("grid");

  // Latest check-in per client (checkIns arrive latest-first).
  const { latest, hasFeed } = useMemo(() => {
    const m = new Map<string, CheckIn>();
    for (const ci of checkIns) if (!m.has(ci.clientId)) m.set(ci.clientId, ci);
    return { latest: m, hasFeed: checkIns.length > 0 };
  }, [checkIns]);

  const codeFor = useMemo(
    () => (c: Client): CheckInCode | null => latest.get(c.id)?.code ?? (hasFeed ? null : c.checkInCode),
    [latest, hasFeed],
  );

  // Reviewed ticks persist per coach in localStorage. Interim: the audit/review
  // schema is owner-gated, so this keeps a coach's weekly progress on their own
  // browser until that lands. Keyed by coach id so previewing coaches stays clean.
  const storeKey = coach ? `hq-checkins-reviewed:${coach.id}` : "";
  useEffect(() => {
    if (!storeKey) return;
    // Seed from the DB (reviewedIds) merged with the localStorage fallback, so
    // ticks survive across devices once the migration is applied without losing
    // any ticks made locally before then.
    let local: string[] = [];
    try {
      const raw = localStorage.getItem(storeKey);
      local = raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      local = [];
    }
    setReviewed(new Set([...reviewedIds, ...local]));
  }, [storeKey, reviewedIds]);
  const toggleReviewed = (id: string) => {
    setReviewed((prev) => {
      const next = new Set(prev);
      const willReview = !next.has(id);
      if (willReview) next.add(id);
      else next.delete(id);
      try {
        if (storeKey) localStorage.setItem(storeKey, JSON.stringify([...next]));
      } catch {
        /* storage unavailable: keep in-memory only */
      }
      // Best-effort DB persist (no-op until migration 20260630000003 applies).
      if (coach) void setCheckInReviewedAction(coach.id, id, willReview);
      return next;
    });
  };

  // Status counts across the roster, drive the filter chips.
  const counts = useMemo(() => {
    const m = new Map<CheckInCode, number>();
    for (const c of clients) {
      const code = codeFor(c);
      if (code) m.set(code, (m.get(code) ?? 0) + 1);
    }
    return m;
  }, [clients, codeFor]);
  const attentionCount = ATTENTION.reduce((s, code) => s + (counts.get(code) ?? 0), 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (filter === "all") return true;
      const code = codeFor(c);
      if (filter === "attention") return code ? ATTENTION.includes(code) : false;
      return code === filter;
    });
  }, [clients, query, filter, codeFor]);

  if (!coach) {
    return (
      <EmptyState
        title="No coach linked"
        message="This login is not linked to a coach yet. The owner links coach accounts in Team settings."
      />
    );
  }

  const reviewedCount = clients.filter((c) => reviewed.has(c.id)).length;
  const presentCodes = (Object.keys(CHECKIN_META) as CheckInCode[]).filter((code) => (counts.get(code) ?? 0) > 0);

  const columns: Column<Client>[] = [
    {
      key: "reviewed",
      header: "Done",
      align: "center",
      sortValue: (c) => (reviewed.has(c.id) ? 1 : 0),
      csvValue: (c) => (reviewed.has(c.id) ? "Yes" : "No"),
      render: (c) => (
        <input
          type="checkbox"
          checked={reviewed.has(c.id)}
          onChange={() => toggleReviewed(c.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 cursor-pointer accent-accent"
          aria-label={`Mark ${c.name} reviewed`}
        />
      ),
    },
    { key: "name", header: "Client", sortValue: (c) => c.name, render: (c) => <span className="text-fg">{displayClientName(c.name)}</span> },
    { key: "plan", header: "Cadence", sortValue: (c) => c.plan, render: (c) => c.plan },
    {
      key: "code",
      header: "Latest check-in",
      sortValue: (c) => attentionRank(codeFor(c)),
      csvValue: (c) => {
        const code = codeFor(c);
        return code ? CHECKIN_META[code].label : "-";
      },
      render: (c) => {
        const code = codeFor(c);
        const meta = code ? CHECKIN_META[code] : null;
        return meta ? <StatusPill variant={meta.pill} /> : <span className="text-fg-dim">-</span>;
      },
    },
    {
      key: "week",
      header: "Week",
      align: "right",
      sortValue: (c) => latest.get(c.id)?.weekNumber ?? -1,
      csvValue: (c) => latest.get(c.id)?.weekNumber ?? "",
      render: (c) => <span className="tabular-nums text-fg-dim">{latest.get(c.id)?.weekNumber ?? "-"}</span>,
    },
    {
      key: "adherence",
      header: "Adherence",
      align: "right",
      sortValue: (c) => latest.get(c.id)?.adherence ?? -1,
      csvValue: (c) => {
        const a = latest.get(c.id)?.adherence;
        return a === null || a === undefined ? "" : `${a}%`;
      },
      render: (c) => {
        const a = latest.get(c.id)?.adherence;
        return <span className="tabular-nums">{a === null || a === undefined ? "-" : `${a}%`}</span>;
      },
    },
    {
      key: "last",
      header: "Last submitted",
      align: "right",
      sortValue: (c) => latest.get(c.id)?.submittedAt ?? "",
      csvValue: (c) => {
        const ci = latest.get(c.id);
        return ci ? fmtDate(ci.submittedAt) : c.lastCheckIn ?? "";
      },
      render: (c) => {
        const ci = latest.get(c.id);
        return <span className="tabular-nums">{ci ? fmtDate(ci.submittedAt) : c.lastCheckIn ?? "-"}</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Check-ins"
        subtitle={`${coach.name}: ${clients.length} clients on the books`}
        actions={
          <div className="flex items-center gap-3">
            <ImportCheckInsPanel />
            <button
              type="button"
              onClick={() => setShowLog((s) => !s)}
              className="rounded-control border border-border px-2.5 py-1 text-xs font-medium text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {showLog ? "Close" : "Log check-in"}
            </button>
            <div className="text-xs text-fg-dim">
              <span className="font-medium tabular-nums text-fg">{reviewedCount}</span> / {clients.length} reviewed
            </div>
          </div>
        }
      />

      {showLog ? (
        <LogCheckInForm clients={clients.map((c) => ({ id: c.id, name: c.name, coachId: coach.id }))} />
      ) : null}

      {live && !hasFeed ? (
        <Card>
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Awaiting check-in feed</div>
          <p className="mt-1 text-sm text-fg-dim">
            Check-ins flow from the coach logs and Kahunas. Statuses below are placeholders until data lands. Nothing
            here is a real submission yet.
          </p>
        </Card>
      ) : null}

      <Panel
        title={`This week (${filtered.length})`}
        action={
          <div className="flex items-center gap-2">
            <SegmentedControl
              size="sm"
              aria-label="Check-ins view"
              options={[
                { label: "List", value: "list" },
                { label: "Week grid", value: "grid" },
              ]}
              value={view}
              onChange={setView}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients"
              className="rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <Chip active={filter === "all"} label="All" count={clients.length} onClick={() => setFilter("all")} />
          {attentionCount > 0 ? (
            <Chip
              active={filter === "attention"}
              label="Needs attention"
              count={attentionCount}
              tone="warn"
              onClick={() => setFilter("attention")}
            />
          ) : null}
          {presentCodes.map((code) => (
            <Chip
              key={code}
              active={filter === code}
              label={CHECKIN_META[code].label}
              count={counts.get(code) ?? 0}
              onClick={() => setFilter(code)}
            />
          ))}
        </div>

        {clients.length === 0 ? (
          <EmptyState title="No clients yet" message="Your roster's check-ins appear here." />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matches" message="Try a different search or status filter." />
        ) : view === "grid" ? (
          <CheckInWeekGrid
            clients={filtered}
            checkIns={checkIns}
            editable={canEdit}
            onRowClick={(c) => panel.open(c)}
            sortScope={coach?.id ?? "owner"}
          />
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            getRowKey={(c) => c.id}
            onRowClick={(c) => panel.open(c)}
            exportFilename={datedFilename("check-ins")}
          />
        )}
      </Panel>
      <ClientSlideOver target={panel.target} onClose={panel.close} />
    </div>
  );
}
