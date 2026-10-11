"use client";

// R13-2: approvals for sign-ins that matched no invite. One click grants:
// the row's role select is pre-filled (coach when a coach was suggested by
// name), the coach select is pre-filled with that suggestion, and Approve
// writes the users row + audit entry server-side. The suggestion is only a
// pre-fill: nothing is granted until an approver clicks.

import { useState, useTransition } from "react";
import { Button, EmptyState, PageHeader, Panel, useToast } from "@/components/ui";
import type { AccessRequest } from "@/lib/access-requests";
import { approveAccessRequestAction, rejectAccessRequestAction } from "@/lib/access-request-actions";
import type { Role } from "@/lib/navigation";

type CoachOpt = { id: string; name: string };
const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  ops_manager: "Ops Manager",
  ambassador_mgr: "Ambassador Mgr",
  coach: "Coach",
  sales: "Sales",
  va: "VA",
};
const selectCls =
  "rounded-control border border-border-soft bg-surface-2 px-2 py-1.5 text-sm text-fg outline-none focus:border-accent disabled:opacity-50";

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function PendingRow({ req, coaches, roles }: { req: AccessRequest; coaches: CoachOpt[]; roles: Role[] }) {
  const toast = useToast();
  const defaultRole: Role = req.suggestedCoachId && roles.includes("coach") ? "coach" : roles[0];
  const [role, setRole] = useState<Role>(defaultRole);
  const [coachId, setCoachId] = useState<string>(req.suggestedCoachId ?? "");
  const [pending, start] = useTransition();
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  const approve = () =>
    start(async () => {
      const res = await approveAccessRequestAction({ requestId: req.id, role, linkedCoachId: role === "coach" ? coachId || null : null });
      if (res.ok) {
        setDone("approved");
        toast.push(`${req.name ?? req.email} can now sign in as ${ROLE_LABEL[role]}.`, "success");
      } else toast.push(res.error, "error");
    });
  const reject = () =>
    start(async () => {
      const res = await rejectAccessRequestAction(req.id);
      if (res.ok) setDone("rejected");
      else toast.push(res.error, "error");
    });

  if (done) {
    return (
      <div className="flex items-center justify-between gap-3 py-3 text-sm">
        <span className="text-fg">{req.name ?? req.email}</span>
        <span className={done === "approved" ? "text-positive" : "text-fg-muted"}>{done === "approved" ? `Approved as ${ROLE_LABEL[role]}` : "Rejected"}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-[14rem] flex-1">
        <div className="text-sm font-medium text-fg">{req.name ?? "(no name on sign-up)"}</div>
        <div className="truncate font-mono text-xs text-fg-muted">{req.email}</div>
        <div className="mt-0.5 text-xs text-fg-muted">
          asked {fmt(req.createdAt)}
          {req.suggestedCoachName ? <span className="text-warn"> · name matches coach {req.suggestedCoachName}</span> : null}
        </div>
      </div>
      <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={selectCls} disabled={pending} aria-label="Role">
        {roles.map((r) => (
          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
        ))}
      </select>
      {role === "coach" ? (
        <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={selectCls} disabled={pending} aria-label="Coach record">
          <option value="">Pick coach…</option>
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      ) : null}
      <Button size="sm" onClick={approve} disabled={pending || (role === "coach" && !coachId)}>
        {pending ? "…" : "Approve"}
      </Button>
      <Button size="sm" variant="ghost" onClick={reject} disabled={pending}>
        Reject
      </Button>
    </div>
  );
}

export function AccessRequestsView({
  rows,
  coaches,
  roles,
  migrationPending,
  persistence,
}: {
  rows: AccessRequest[];
  coaches: CoachOpt[];
  roles: Role[];
  migrationPending: boolean;
  persistence: boolean;
}) {
  const pending = rows.filter((r) => r.status === "pending");
  const resolved = rows.filter((r) => r.status !== "pending");
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Team & Settings"
        title="Access requests"
        subtitle="People who signed in but matched no invite. Approving creates their login with the role you pick; every grant is written to the role change history."
      />
      {!persistence ? (
        <p className="rounded-control border border-border-soft bg-surface-2 px-3 py-2 text-xs text-fg-dim">Access requests need the HQ datastore.</p>
      ) : migrationPending ? (
        <p className="rounded-control border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn">
          Migration 20260905000001 is not applied yet, so requests are not being stored. Unmatched sign-ins still see the holding screen; ask Kai to apply the migration.
        </p>
      ) : null}
      <Panel title={`Pending (${pending.length})`}>
        {pending.length === 0 ? (
          <EmptyState compact icon="user" title="Nothing waiting" message="A request appears here the first time an unmatched login lands on the holding screen." />
        ) : (
          <div className="divide-y divide-border-soft">
            {pending.map((r) => (
              <PendingRow key={r.id} req={r} coaches={coaches} roles={roles} />
            ))}
          </div>
        )}
      </Panel>
      {resolved.length > 0 ? (
        <Panel title="Resolved" subtitle="Newest first.">
          <div className="divide-y divide-border-soft">
            {resolved.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="font-medium text-fg">{r.name ?? r.email}</span>
                <span className="font-mono text-xs text-fg-muted">{r.email}</span>
                <span className={r.status === "approved" ? "text-positive" : "text-fg-muted"}>
                  {r.status === "approved" ? `approved as ${r.grantedRole ?? "?"}` : "rejected"}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">by {r.resolvedByName ?? "unknown"}</span>
                {r.resolvedAt ? <span className="shrink-0 text-xs tabular-nums text-fg-muted">{fmt(r.resolvedAt)}</span> : null}
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
