"use client";

// Coach Results (M6): the coach's own transformations moving through the
// approval state machine. The coach owns the FIRST step only, draft ->
// coach_approved; the later admin stages (admin_approved, scheduled, posted)
// belong to the owner Results Tracker, so here they render read-only. The
// coach-approve write persists to transformations.status via the shared
// advanceTransformationAction (HQ-owned, revalidates /results + /results-tracker).
// Pre-scoped via getCoachResultsData. Live mode is empty until activation:
// HQ-native transformations have no rows yet, and that empty state says so.

import { useState, useTransition } from "react";
import { Button, DataTable, EmptyState, PageHeader, Panel, type Column } from "@/components/ui";
import type { CoachResultsData } from "@/lib/data";
import type { TransformationStatus } from "@/lib/seed/types";
import { advanceTransformationAction } from "@/lib/transformations-actions";
import { ClientSlideOver, useClientPanel } from "@/components/client/client-slide-over";

const STATUS_META: Record<TransformationStatus, { label: string; chip: string; order: number }> = {
  draft: { label: "Draft", chip: "bg-surface-2 text-fg-muted", order: 0 },
  coach_approved: { label: "Head Coach Approved", chip: "bg-status-messaged text-status-messaged-fg", order: 1 },
  admin_approved: { label: "Admin approved", chip: "bg-status-sent text-status-sent-fg", order: 2 },
  scheduled: { label: "Scheduled", chip: "bg-status-due text-status-due-fg", order: 3 },
  posted: { label: "Posted", chip: "bg-status-submitted text-status-submitted-fg", order: 4 },
};

type Row = CoachResultsData["transformations"][number];

export function ResultsView({ data, live }: { data: CoachResultsData; live: boolean }) {
  const panel = useClientPanel();
  const { coach, transformations } = data;

  // Optimistic status overrides keyed by transformation id, plus per-row
  // pending/error state for the coach-approve write.
  const [status, setStatusMap] = useState<Record<string, TransformationStatus>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const statusOf = (r: Row): TransformationStatus => status[r.t.id] ?? r.t.status;

  const coachApprove = (id: string) => {
    setErrors((e) => {
      const rest = { ...e };
      delete rest[id];
      return rest;
    });
    setPending((p) => ({ ...p, [id]: true }));
    setStatusMap((s) => ({ ...s, [id]: "coach_approved" })); // optimistic
    startTransition(async () => {
      const res = await advanceTransformationAction(id, "draft");
      if (!res.ok) {
        setStatusMap((s) => ({ ...s, [id]: "draft" })); // roll back
        setErrors((e) => ({ ...e, [id]: res.error }));
      } else {
        setStatusMap((s) => ({ ...s, [id]: res.status })); // reconcile
      }
      setPending((p) => {
        const rest = { ...p };
        delete rest[id];
        return rest;
      });
    });
  };

  if (!coach) {
    return (
      <EmptyState
        title="No coach linked"
        message="This login is not linked to a coach yet. The owner links coach accounts in Team settings."
      />
    );
  }

  const columns: Column<Row>[] = [
    {
      key: "client",
      header: "Client",
      sortValue: (r) => r.clientName,
      render: (r) => <span className="text-fg">{r.clientName}</span>,
    },
    {
      key: "milestone",
      header: "Milestone",
      align: "right",
      sortValue: (r) => r.t.milestone,
      render: (r) => <span className="tabular-nums">{r.t.milestone}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => STATUS_META[statusOf(r)].order,
      render: (r) => {
        const m = STATUS_META[statusOf(r)];
        return (
          <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-medium ${m.chip}`}>
            {m.label}
          </span>
        );
      },
    },
    {
      key: "assets",
      header: "Assets",
      render: (r) => (
        <span className="text-fg-dim">
          {r.t.hasBefore ? "Before" : ""}
          {r.t.hasBefore && r.t.hasAfter ? " + " : ""}
          {r.t.hasAfter ? "After" : ""}
          {!r.t.hasBefore && !r.t.hasAfter ? "-" : ""}
        </span>
      ),
    },
    {
      key: "posted",
      header: "Posted",
      align: "right",
      sortValue: (r) => r.t.postedAt ?? "",
      render: (r) => <span className="tabular-nums">{r.t.postedAt ?? "-"}</span>,
    },
    {
      // Coach owns the draft -> coach_approved step only; later stages are the
      // owner's, so they show no action here.
      key: "action",
      header: "",
      render: (r) => {
        if (statusOf(r) !== "draft") return <span className="text-xs text-fg-muted">-</span>;
        return (
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending[r.t.id]}
              onClick={(e) => {
                e.stopPropagation();
                coachApprove(r.t.id);
              }}
            >
              {pending[r.t.id] ? "Saving..." : "Coach approve"}
            </Button>
            {errors[r.t.id] ? (
              <span className="text-xs text-danger" role="alert">
                {errors[r.t.id]}
              </span>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Results" subtitle={`${coach.name}: transformations from your roster`} />
      <Panel title={`Transformations (${transformations.length})`}>
        {transformations.length === 0 ? (
          <EmptyState
            title="No transformations yet"
            message={
              live
                ? "Transformations are tracked in the HQ and start empty on live data. They appear here as the team logs them."
                : "Transformations from your clients appear here."
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={transformations}
            getRowKey={(r) => r.t.id}
            onRowClick={(r) => panel.open({ id: r.t.clientId, name: r.clientName ?? "Client" })}
          />
        )}
      </Panel>
      <ClientSlideOver target={panel.target} onClose={panel.close} />
    </div>
  );
}
