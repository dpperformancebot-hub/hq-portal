"use client";

import { useState, useTransition } from "react";
import { Avatar, Button, Card, EmptyState, PageHeader, useToast } from "@/components/ui";
import { auditDueState, type AuditCadence, type AuditStatus, type DueState } from "@/lib/seed";
import type { AuditCard } from "@/lib/data";
import { setAuditDetails, setAuditResolved, setAuditStatus, setOwnerReview } from "@/lib/audit-actions";
import { createTicketAction } from "@/lib/tasks-actions";
import { datedFilename, exportRowsToCsv } from "@/lib/csv";

const CADENCES: AuditCadence[] = ["W4", "W8", "W12", "W16"];

// Cap cards rendered per cadence column so the owner's full roster (hundreds of
// active clients) does not render as one endless scroll. "Show more" expands a
// single column on demand; the coach filter narrows the whole board.
const COLUMN_CAP = 10;

/** Card grid per cadence section (2026-10-08): full width, 1 col on phones,
 *  2 from md, 3 from xl. Replaces the four fixed cadence columns, which left a
 *  coach with one narrow column and most of the screen empty. Exported so the
 *  layout test pins it. */
export const AUDIT_GRID_CLASS = "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3";

const STATUSES: AuditStatus[] = ["submitted", "sent", "messaged", "ghosted"];
const STATUS_LABEL: Record<AuditStatus, string> = {
  submitted: "Submitted",
  sent: "Sent",
  messaged: "Messaged",
  ghosted: "Ghosted",
};
// Literal class strings (Tailwind JIT, do not build dynamically).
const STATUS_CLASS: Record<AuditStatus, string> = {
  submitted: "bg-status-submitted text-status-submitted-fg",
  sent: "bg-status-sent text-status-sent-fg",
  messaged: "bg-status-messaged text-status-messaged-fg",
  ghosted: "bg-status-ghosted text-status-ghosted-fg",
};

const DUE_CHIP: Record<DueState, string> = {
  due: "bg-warn-soft text-warn",
  overdue: "bg-danger-soft text-danger",
  completed: "bg-positive-soft text-positive",
};

const TABS: { label: string; value: DueState | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Due", value: "due" },
  { label: "Overdue", value: "overdue" },
  { label: "Completed", value: "completed" },
];

// R4-5: owner spot-review block (sheet "Daniel Reviews"): 1-3 rating pills +
// notes, saved via the owner-only setOwnerReview action.
function OwnerReview({
  audit,
  onSaved,
}: {
  audit: AuditCard;
  onSaved: (rating: number | null, notes: string | null) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(audit.ownerRating ?? null);
  const [notes, setNotes] = useState(audit.ownerNotes ?? "");
  const [pending, start] = useTransition();

  const save = () => {
    start(async () => {
      const res = await setOwnerReview(audit.clientId, audit.cadenceWeek, audit.coachId || null, {
        rating,
        notes: notes || null,
      });
      if (res.ok) {
        onSaved(rating, notes.trim() || null);
        setOpen(false);
        toast.push(`${audit.clientName}: review saved.`);
      } else {
        toast.push(res.error ?? "Could not save the review.", "error");
      }
    });
  };

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-medium text-accent hover:underline"
      >
        {audit.ownerRating != null ? `Review: ${"★".repeat(audit.ownerRating)}` : "Owner review"}
      </button>
      {open ? (
        <div className="mt-1.5 space-y-1.5">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating((r) => (r === n ? null : n))}
                className={`rounded-pill border px-2.5 py-0.5 text-[11px] tabular-nums transition-colors ${
                  rating != null && rating >= n
                    ? "border-accent bg-accent-soft text-accent-deep"
                    : "border-border text-fg-dim hover:border-accent/40"
                }`}
                aria-label={`Rate ${n} of 3`}
              >
                {n}
              </button>
            ))}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Review notes"
            className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
            aria-label={`Owner review notes for ${audit.clientName}`}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save review"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AuditsView({
  audits,
  canRequestAudit = false,
  canOwnerReview = false,
}: {
  audits: AuditCard[];
  /** C5: coaches get a Request audit button that files a ticket to the head
   *  coach's board (routing handled server-side in createTicketAction). */
  canRequestAudit?: boolean;
  /** R4-5: owner-only spot-review (1-3 rating + notes) per audit. */
  canOwnerReview?: boolean;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<DueState | "all">("all");
  const [collapsed, setCollapsed] = useState(false);
  const [coachFilter, setCoachFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // C5: per-card feedback/Loom editor + the audit-request composer.
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const [detailsDraft, setDetailsDraft] = useState<{ feedback: string; loom: string }>({ feedback: "", loom: "" });
  const [requestText, setRequestText] = useState<string | null>(null);
  // Local mirror so status/resolve edits reflect optimistically (the due chip
  // and tab filters both derive from status + resolved). The server action
  // persists to client_audits and revalidates /client-audits; on failure we
  // roll back and show the reason on the card.
  const [items, setItems] = useState(audits);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const patch = (id: string, next: Partial<AuditCard>) =>
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, ...next } : a)));
  const clearError = (id: string) =>
    setErrors((e) => {
      const rest = { ...e };
      delete rest[id];
      return rest;
    });
  const endPending = (id: string) =>
    setPending((p) => {
      const rest = { ...p };
      delete rest[id];
      return rest;
    });

  const changeStatus = (audit: AuditCard, status: AuditStatus) => {
    if (status === audit.status) return;
    const prev = audit.status;
    clearError(audit.id);
    setPending((p) => ({ ...p, [audit.id]: true }));
    patch(audit.id, { status }); // optimistic
    startTransition(async () => {
      const res = await setAuditStatus(audit.clientId, audit.cadenceWeek, audit.coachId, status);
      if (res.ok) {
        toast.push("Audit status updated");
      } else {
        patch(audit.id, { status: prev }); // roll back
        setErrors((e) => ({ ...e, [audit.id]: res.error }));
        toast.push(res.error, "error");
      }
      endPending(audit.id);
    });
  };

  // C5: save feedback + Loom link for one audit.
  const saveDetails = (audit: AuditCard) => {
    const draft = detailsDraft;
    clearError(audit.id);
    setPending((p) => ({ ...p, [audit.id]: true }));
    startTransition(async () => {
      const res = await setAuditDetails(audit.clientId, audit.cadenceWeek, audit.coachId, {
        feedback: draft.feedback,
        loomUrl: draft.loom,
      });
      if (res.ok) {
        patch(audit.id, { feedback: draft.feedback.trim() || null, loomUrl: draft.loom.trim() || null });
        setDetailsFor(null);
        toast.push("Audit feedback saved");
      } else {
        setErrors((e) => ({ ...e, [audit.id]: res.error }));
        toast.push(res.error, "error");
      }
      endPending(audit.id);
    });
  };

  // C5: file an audit-request ticket (routes to the head coach server-side).
  const sendRequest = () => {
    const text = (requestText ?? "").trim();
    if (!text) return;
    startTransition(async () => {
      const res = await createTicketAction({ title: `Audit request: ${text}` });
      if (res.ok && res.data) {
        toast.push(`Audit request sent to ${res.data.routedTo}`, "success");
        setRequestText(null);
      } else {
        toast.push(res.error ?? "Could not send the request.", "error");
      }
    });
  };

  const toggle = (audit: AuditCard) => {
    const prev = audit.resolved;
    const next = !prev;
    clearError(audit.id);
    setPending((p) => ({ ...p, [audit.id]: true }));
    patch(audit.id, { resolved: next }); // optimistic
    startTransition(async () => {
      const res = await setAuditResolved(audit.clientId, audit.cadenceWeek, audit.coachId, next);
      if (res.ok) {
        patch(audit.id, { resolved: res.resolved }); // reconcile
        toast.push(res.resolved ? "Marked resolved" : "Reopened");
      } else {
        patch(audit.id, { resolved: prev }); // roll back
        setErrors((e) => ({ ...e, [audit.id]: res.error }));
        toast.push(res.error, "error");
      }
      endPending(audit.id);
    });
  };

  // Owner/VA see every coach's audits, which is what makes the board endless.
  // The coach filter (and per-column cap below) keep it navigable; a coach's
  // own view only ever has their clients so the select stays hidden for them.
  const coachNames = Array.from(new Set(items.map((a) => a.coachName))).sort();
  const filtered = items.filter(
    (a) =>
      (tab === "all" ? true : auditDueState(a) === tab) &&
      (coachFilter === "all" || a.coachName === coachFilter),
  );
  const upThisWeek = items.filter((a) => auditDueState(a) !== "completed").length;

  const exportCsv = () =>
    exportRowsToCsv(datedFilename(`client-audits-${tab}`), filtered, [
      { header: "Client", value: (a) => a.clientName },
      { header: "Coach", value: (a) => a.coachName },
      { header: "Cadence", value: (a) => a.cadenceWeek },
      { header: "Status", value: (a) => STATUS_LABEL[a.status] },
      { header: "Due", value: (a) => auditDueState(a) },
      { header: "Resolved", value: (a) => (a.resolved ? "Yes" : "No") },
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        back
        eyebrow="Operations"
        title="Client Audits"
        subtitle={`QA Review · 4-week cadence · ${upThisWeek} clients up for audit this week`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canRequestAudit ? (
              <Button size="sm" onClick={() => setRequestText((v) => (v === null ? "" : null))}>
                Request audit
              </Button>
            ) : null}
            {coachNames.length > 1 ? (
              <select
                aria-label="Filter by coach"
                value={coachFilter}
                onChange={(e) => {
                  setCoachFilter(e.target.value);
                  setExpanded({});
                }}
                className="rounded-control border border-border bg-surface-2 px-2 py-1 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="all">All coaches</option>
                {coachNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            ) : null}
            <Button variant="ghost" size="sm" onClick={exportCsv} disabled={filtered.length === 0} title="Download these audits as a CSV">
              Export CSV
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCollapsed((c) => !c)}>
              {collapsed ? "Expand all" : "Collapse all"}
            </Button>
          </div>
        }
      />

      {requestText !== null ? (
        <Card
          className="space-y-2"
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === "Enter" && (requestText ?? "").trim()) {
              e.preventDefault();
              sendRequest();
            } else if (e.key === "Escape") {
              setRequestText(null);
            }
          }}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Request an audit</div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              placeholder="Which client, and what should the reviewer look at?"
              autoFocus
              className="flex-1 rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
              aria-label="Audit request details"
            />
            <Button size="sm" onClick={sendRequest} disabled={!(requestText ?? "").trim()}>
              Send request
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRequestText(null)}>
              Cancel
            </Button>
          </div>
          <p className="text-xs text-fg-muted">Files a ticket on your reviewer&apos;s taskboard.</p>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const count = t.value === "all" ? items.length : items.filter((a) => auditDueState(a) === t.value).length;
          const on = t.value === tab;
          return (
            <button
              key={t.label}
              type="button"
              onClick={() => setTab(t.value)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                on ? "border-accent text-fg" : "border-transparent text-fg-dim hover:text-fg"
              }`}
            >
              {t.label}
              <span className="text-xs tabular-nums text-fg-muted">{count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon="audits" title="Nothing to audit" message="No audits match this filter." />
        </Card>
      ) : (
        <div className="space-y-6">
          {CADENCES.map((cad) => {
            const cadItems = filtered.filter((a) => a.cadenceWeek === cad);
            // Empty cadences are skipped: a coach whose roster sits in one
            // cadence used to get one narrow column and three "None" columns.
            if (cadItems.length === 0) return null;
            const isExpanded = expanded[cad] ?? false;
            const visibleItems = isExpanded ? cadItems : cadItems.slice(0, COLUMN_CAP);
            return (
              <section key={cad} aria-label={`${cad} audits`}>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-muted">{cad}</span>
                  <span className="text-xs tabular-nums text-fg-muted">{cadItems.length}</span>
                </div>
                {!collapsed && (
                  <div className={AUDIT_GRID_CLASS}>
                    {visibleItems.map((a) => {
                      const due = auditDueState(a);
                      const busy = !!pending[a.id];
                      return (
                        <Card key={a.id} className="relative p-3">
                          <div className="flex items-center gap-2">
                            <Avatar name={a.clientName} size="sm" />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-fg">{a.clientName}</div>
                              <div className="truncate text-xs text-fg-dim">{a.coachName}</div>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <label className="sr-only" htmlFor={`status-${a.id}`}>
                              Audit status for {a.clientName}
                            </label>
                            <select
                              id={`status-${a.id}`}
                              value={a.status}
                              disabled={busy}
                              onChange={(e) => changeStatus(a, e.target.value as AuditStatus)}
                              className={`rounded-pill px-2.5 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 ${STATUS_CLASS[a.status]}`}
                            >
                              {STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABEL[s]}
                                </option>
                              ))}
                            </select>
                            <span className={`rounded-pill px-2 py-0.5 text-[11px] font-medium capitalize ${DUE_CHIP[due]}`}>{due}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => toggle(a)}
                              disabled={busy}
                              aria-pressed={a.resolved}
                              className={`rounded-control border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-60 ${
                                a.resolved
                                  ? "border-positive/40 bg-positive-soft text-positive"
                                  : "border-border text-fg-dim hover:text-fg"
                              }`}
                            >
                              {a.resolved ? "Resolved" : "Mark resolved"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (detailsFor === a.id) {
                                  setDetailsFor(null);
                                } else {
                                  setDetailsFor(a.id);
                                  setDetailsDraft({ feedback: a.feedback ?? "", loom: a.loomUrl ?? "" });
                                }
                              }}
                              disabled={busy}
                              className="text-[11px] font-medium text-accent hover:underline disabled:opacity-60"
                            >
                              {a.feedback || a.loomUrl ? "Feedback" : "Add feedback"}
                            </button>
                            {busy ? <span className="text-[11px] text-fg-muted">Saving…</span> : null}
                          </div>
                          {/* C5: stored feedback + Loom link, visible on the card. */}
                          {detailsFor !== a.id && (a.feedback || a.loomUrl) ? (
                            <div className="mt-2 space-y-1 rounded-control bg-surface-2 px-2.5 py-2">
                              {a.feedback ? <p className="text-xs text-fg-dim">{a.feedback}</p> : null}
                              {a.loomUrl ? (
                                <a
                                  href={a.loomUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] font-medium text-accent hover:underline"
                                >
                                  Watch Loom →
                                </a>
                              ) : null}
                            </div>
                          ) : null}
                          {detailsFor === a.id ? (
                            <div className="mt-2 space-y-2">
                              <textarea
                                value={detailsDraft.feedback}
                                onChange={(e) => setDetailsDraft((d) => ({ ...d, feedback: e.target.value }))}
                                rows={2}
                                maxLength={2000}
                                placeholder="Feedback for the coach"
                                className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
                              />
                              <input
                                value={detailsDraft.loom}
                                onChange={(e) => setDetailsDraft((d) => ({ ...d, loom: e.target.value }))}
                                placeholder="Loom link (https://…)"
                                className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
                                aria-label={`Loom link for ${a.clientName}`}
                              />
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={() => setDetailsFor(null)} disabled={busy}>
                                  Cancel
                                </Button>
                                <Button size="sm" onClick={() => saveDetails(a)} disabled={busy}>
                                  Save
                                </Button>
                              </div>
                            </div>
                          ) : null}
                          {errors[a.id] ? (
                            <p className="mt-1.5 text-[11px] text-danger" role="alert">
                              {errors[a.id]}
                            </p>
                          ) : null}
                          {/* R4-5: owner spot-review (sheet "Daniel Reviews"), owner-only. */}
                          {canOwnerReview ? (
                            <OwnerReview
                              audit={a}
                              onSaved={(rating, notes) => patch(a.id, { ownerRating: rating, ownerNotes: notes })}
                            />
                          ) : null}
                        </Card>
                      );
                    })}
                    {cadItems.length > COLUMN_CAP ? (
                      <button
                        type="button"
                        onClick={() => setExpanded((e) => ({ ...e, [cad]: !isExpanded }))}
                        className="col-span-full w-full rounded-control border border-border-soft px-3 py-2 text-xs font-medium text-fg-dim transition-colors hover:border-accent/40 hover:text-fg"
                      >
                        {isExpanded ? "Show less" : `Show ${cadItems.length - COLUMN_CAP} more`}
                      </button>
                    ) : null}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
