"use client";

// Coach "My Clients" (M6): the coach's own roster, active + paused, with
// search, facet filters, and a check-in freshness column. Data arrives
// pre-scoped via getCoachRosterData; this component never sees other
// coaches' clients. Rows link to the coach-facing client detail.

import {
  DataTable,
  EmptyState,
  PageHeader,
  Panel,
  StatusPill,
  type Column,
  type TableFilter,
} from "@/components/ui";
import { NEEDS_START_DATE, clientWeek } from "@/lib/client-start-date";
// Note: the StatusPill variant set is check-in oriented (no "active" key);
// active renders as toned text, paused reuses the existing paused pill.
import { datedFilename } from "@/lib/csv";
import type { CoachRosterData } from "@/lib/data";
import { checkInFreshness, type CheckInFreshness } from "@/lib/seed";
import type { Client } from "@/lib/seed/types";
import { ClientSlideOver, useClientPanel } from "@/components/client/client-slide-over";
import { displayClientName, nameNeedsAttention } from "@/lib/client-name";
import { paymentStructure } from "@/lib/journey-buckets";
import { useState } from "react";

const weeksIn = (c: Client): number | null => clientWeek(c);

/** R13-8: a term end worth showing a coach = PIF client, date still ahead. */
const pifTermEnd = (c: Client): string | null => {
  if (!c.endDate || c.status !== "active" || paymentStructure(c) !== "PIF") return null;
  return Date.parse(c.endDate) >= Date.now() - 86_400_000 ? c.endDate : null;
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

export function MyClientsView({ data }: { data: CoachRosterData }) {
  // R12-1: open the half-screen panel instead of navigating away.
  const panel = useClientPanel();
  // R12-2: cancelled are OFF by default (the roster is a working list), but
  // one click reveals them with counts, so a coach can reconcile the portal
  // against their own sheet instead of wondering where 4 people went.
  const [showCancelled, setShowCancelled] = useState(false);
  const { coach, clients, cancelledClients = [] } = data;

  if (!coach) {
    return (
      <EmptyState
        title="No coach linked"
        message="This login is not linked to a coach yet. The owner links coach accounts in Team settings."
      />
    );
  }

  const filters: TableFilter<Client>[] = [
    {
      key: "status",
      label: "Status",
      // R12-2: cancelled rows can now be in the table, so the facet must name
      // them rather than lumping everything non-paused under "Active".
      getValue: (c) =>
        c.status === "paused" ? "Paused" : c.status === "active" ? "Active" : "Cancelled",
    },
    { key: "stage", label: "Journey", getValue: (c) => c.journeyStage },
    { key: "plan", label: "Plan", getValue: (c) => c.plan },
    { key: "freshness", label: "Check-in", getValue: (c) => FRESH_LABEL[checkInFreshness(c.lastCheckIn)] },
  ];

  const columns: Column<Client>[] = [
    {
      key: "name",
      header: "Client",
      sortValue: (c) => displayClientName(c.name),
      csvValue: (c) => displayClientName(c.name),
      // R12-3: GHL funnel suffixes ("(client)", "(challenge)") are stripped
      // for display only; the stored name still matches GHL for syncing.
      render: (c) => (
        <span className="flex items-center gap-1.5">
          <span className="text-fg">{displayClientName(c.name)}</span>
          {nameNeedsAttention(c.name) ? (
            <span
              className="rounded-pill bg-warn-soft px-1.5 py-0.5 text-[10px] font-medium text-warn"
              title={`Name looks irregular in GHL ("${c.name}") - worth tidying at the source.`}
            >
              check name
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "90px",
      sortValue: (c) => c.status,
      render: (c) =>
        c.status === "paused" ? (
          <StatusPill variant="paused" />
        ) : c.status === "active" ? (
          <span className="text-positive">Active</span>
        ) : (
          <span className="capitalize text-fg-muted">{c.status}</span>
        ),
    },
    {
      // R13-6 (Dan's Loom 2026-09-05): the newest starters are the ones that
      // need to be visible first, so start date is a column and the default
      // sort (newest first). Any header still re-sorts.
      key: "start",
      header: "Start date",
      width: "108px",
      sortValue: (c) => c.startDate,
      csvValue: (c) => c.startDate,
      render: (c) => <span className="tabular-nums text-fg-dim">{c.startDate}</span>,
    },
    {
      key: "week",
      header: "Week",
      align: "right",
      width: "68px",
      sortValue: (c) => weeksIn(c) ?? -1,
      render: (c) => {
        const w = weeksIn(c);
        return w === null ? <span className="text-warn" title={NEEDS_START_DATE}>needs date</span> : <span className="tabular-nums">{w}</span>;
      },
    },
    { key: "plan", header: "Plan", width: "110px", sortValue: (c) => c.plan, render: (c) => c.plan },
    {
      // R12-4: coaches do not action renewals (that is Jameela's job), and
      // "Approaching Renewal" on a perfectly active client reads as a problem.
      // The coach view shows the plain state instead.
      key: "stage",
      header: "Journey",
      sortValue: (c) => c.journeyStage,
      render: (c) => (c.journeyStage === "Approaching Renewal" ? "Active" : c.journeyStage),
    },
    {
      key: "lastCheckIn",
      header: "Last check-in",
      width: "128px",
      sortValue: (c) => c.lastCheckIn ?? "",
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
      // R12-4 / R13-8: this is the PIF term end projected from GHL, not a
      // churn signal. R13-8 audit (DP, 2026-09-05): most active clients with a
      // GHL term end date have one that already PASSED (stale after a renewal)
      // or are not PIF at all, which is what made the column read as noise.
      // The coach view now only shows a term end for a PIF client whose term
      // is still ahead of them; everything else is a dash.
      key: "termEnd",
      header: "PIF term ends",
      width: "120px",
      sortValue: (c) => pifTermEnd(c) ?? "",
      csvValue: (c) => pifTermEnd(c) ?? "",
      render: (c) => {
        const end = pifTermEnd(c);
        return (
          <span
            className="tabular-nums text-fg-dim"
            title={
              end
                ? "End of their paid-in-full term (from GHL). Renewals are handled by admin, not a churn warning."
                : "Only shown for paid-in-full clients with a term still ahead of them."
            }
          >
            {end ?? "-"}
          </span>
        );
      },
    },
  ];

  const rows = showCancelled ? [...clients, ...cancelledClients] : clients;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Clients"
        subtitle={`${coach.name}: ${clients.filter((c) => c.status === "active").length} active, ${clients.filter((c) => c.status === "paused").length} paused, ${cancelledClients.length} cancelled`}
        actions={
          cancelledClients.length > 0 ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-dim">
              <input
                type="checkbox"
                checked={showCancelled}
                onChange={(e) => setShowCancelled(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-accent"
              />
              Show cancelled ({cancelledClients.length})
            </label>
          ) : null
        }
      />
      <Panel title={`Roster (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState title="No clients yet" message="New assignments appear here as soon as they land." />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            getRowKey={(c) => c.id}
            onRowClick={(c) => panel.open(c)}
            exportFilename={datedFilename("my-clients")}
            defaultSort={{ key: "start", dir: "desc" }}
            searchable={{ placeholder: "Search clients", getText: (c) => displayClientName(c.name) }}
            filters={filters}
          />
        )}
      </Panel>
      <ClientSlideOver target={panel.target} onClose={panel.close} />
    </div>
  );
}
