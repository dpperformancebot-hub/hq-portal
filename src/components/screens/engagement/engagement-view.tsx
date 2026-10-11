"use client";

// R4-3: engagement milestone calls, from the master sheet "Engagement
// tracker". W14 for every client; PIF clients then every 16 weeks. Chips
// cycle due → booked → done (done → booked to undo a mis-click). The
// feedback-form-sent tick follows the sheet rule: due from week 3 (R3-3).
// R12-10 (Dan's mental model): one COLUMN per milestone, one row per client,
// so the grid reads like the sheet: FB form first (the tick coaches live in),
// then W14, then the PIF 16-week ladder. Non-PIF cells past W14 stay blank.

import { useMemo, useState, useTransition } from "react";
import { EmptyState, PageHeader, Panel, SegmentedControl, useToast } from "@/components/ui";
import { displayClientName } from "@/lib/client-name";
import { setFeedbackFormSentAction, setMilestoneAction } from "@/lib/engagement-actions";
import { feedbackFormDue, milestoneState, milestoneWeeks, type MilestoneState } from "@/lib/engagement-math";
import { BRAND } from "@/lib/brand";

export type EngagementClientRow = {
  clientId: string;
  clientName: string;
  coachName: string;
  currentWeek: number;
  isPif: boolean;
  feedbackFormSent: boolean;
  /** week -> stored state */
  stored: Record<number, "booked" | "done">;
  /** R17-3: active in the portal but their term end has already passed. */
  termEnded?: boolean;
};

const CHIP_CLS: Record<MilestoneState, string> = {
  upcoming: "border-border-soft text-fg-muted",
  due: "border-warn/60 bg-warn-soft text-warn font-medium",
  booked: "border-accent/60 bg-accent-soft text-accent-deep",
  done: "border-accent bg-accent text-white",
};

const CHIP_GLYPH: Record<MilestoneState, string> = {
  upcoming: "–",
  due: "due",
  booked: "◷",
  done: "✓",
};

export function EngagementView({
  rows,
  canEdit,
  fbFormEditable = canEdit,
}: {
  rows: EngagementClientRow[];
  canEdit: boolean;
  /** R16-7a: false for the VA when BRAND.engagement.fbFormOwner is "coach":
   *  the column renders read-only as coach-managed. */
  fbFormEditable?: boolean;
}) {
  const CAP = BRAND.engagement.milestoneCallsAfterWeek;
  const toast = useToast();
  const [local, setLocal] = useState(rows);
  const [filter, setFilter] = useState<"due" | "all">("due");
  const [, start] = useTransition();
  // R12-10 (Dan: "clicking rows changes the list"): the Needs-action filter
  // recomputes from live state, so ticking a milestone made that row stop
  // matching and VANISH mid-click. Rows actioned in this session stay pinned
  // until the filter is switched, so the list holds still while you work.
  const [justActioned, setJustActioned] = useState<Set<string>>(new Set());
  const pin = (clientId: string) => setJustActioned((prev) => new Set(prev).add(clientId));

  // Global milestone columns: W14 for everyone, then the PIF ladder out to
  // the furthest horizon any PIF client on screen can accrue.
  const milestoneCols = useMemo(() => {
    const horizons = local.filter((r) => r.isPif).map((r) => Math.max(14, r.currentWeek + 16));
    const maxHorizon = Math.min(horizons.length ? Math.max(...horizons) : 14, CAP ?? Number.POSITIVE_INFINITY);
    const cols = [14];
    for (let w = 30; w <= maxHorizon; w += 16) cols.push(w);
    return cols;
  }, [local, CAP]);

  const visible = useMemo(() => {
    if (filter === "all") return local;
    return local.filter((r) => {
      if (justActioned.has(r.clientId)) return true;
      const weeks = milestoneWeeks(r.isPif, r.currentWeek, 16, CAP);
      return (
        weeks.some((w) => milestoneState(w, r.currentWeek, r.stored[w]) === "due") ||
        feedbackFormDue(r.currentWeek, r.feedbackFormSent)
      );
    });
  }, [local, filter, justActioned, CAP]);

  const cycle = (row: EngagementClientRow, week: number) => {
    if (!canEdit) return;
    pin(row.clientId);
    const current = milestoneState(week, row.currentWeek, row.stored[week]);
    const next: "booked" | "done" = current === "booked" ? "done" : current === "done" ? "booked" : "booked";
    setLocal((prev) =>
      prev.map((r) => (r.clientId === row.clientId ? { ...r, stored: { ...r.stored, [week]: next } } : r)),
    );
    start(async () => {
      const res = await setMilestoneAction({ clientId: row.clientId, week, state: next });
      if (!res.ok) {
        setLocal((prev) =>
          prev.map((r) => (r.clientId === row.clientId ? { ...r, stored: { ...row.stored } } : r)),
        );
        toast.push(res.error ?? "Could not update the milestone.", "error");
      }
    });
  };

  const toggleFeedback = (row: EngagementClientRow) => {
    if (!canEdit || !fbFormEditable) return;
    pin(row.clientId);
    const next = !row.feedbackFormSent;
    setLocal((prev) => prev.map((r) => (r.clientId === row.clientId ? { ...r, feedbackFormSent: next } : r)));
    start(async () => {
      const res = await setFeedbackFormSentAction({ clientId: row.clientId, sent: next });
      if (!res.ok) {
        setLocal((prev) => prev.map((r) => (r.clientId === row.clientId ? { ...r, feedbackFormSent: !next } : r)));
        toast.push(res.error ?? "Could not update.", "error");
      }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Engagement"
        subtitle="Milestone calls: W14 for everyone, then every 16 weeks for PIF clients. The retention engine."
        actions={
          <SegmentedControl
            aria-label="Engagement filter"
            size="sm"
            value={filter}
            onChange={(v) => {
              setJustActioned(new Set());
              setFilter(v as "due" | "all");
            }}
            options={[
              { label: "Needs action", value: "due" },
              { label: "All clients", value: "all" },
            ]}
          />
        }
      />

      <Panel
        title={`Clients (${visible.length})`}
        subtitle="One column per milestone. Click a cell to cycle: due → booked (◷) → done (✓). FB form is due from week 3."
      >
        {visible.length === 0 ? (
          <EmptyState
            compact
            icon="target"
            title={filter === "due" ? "Nothing needs action" : "No clients"}
            message={filter === "due" ? "No due calls or unsent feedback forms right now." : "Active clients appear here."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: "collapse", whiteSpace: "nowrap" }}>
              <thead>
                <tr className="text-fg-muted">
                  <th className="sticky left-0 bg-surface px-2 py-1.5 text-left">Client</th>
                  <th className="px-2 py-1.5 text-center font-medium">
                    <span title={fbFormEditable ? "Feedback form sent? (sheet rule: send at week 3)" : "Coaches tick this in their own portal (R16-7a). Read-only here."}>
                      FB form
                      {!fbFormEditable ? <span className="ml-1 font-normal text-fg-muted">coach-managed</span> : null}
                    </span>
                  </th>
                  {milestoneCols.map((w) => (
                    <th key={w} className="px-2 py-1.5 text-center font-medium tabular-nums">
                      W{w}
                      {w > 14 ? <span className="ml-0.5 font-normal text-fg-muted">PIF</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const fbDue = feedbackFormDue(r.currentWeek, r.feedbackFormSent);
                  return (
                    <tr key={r.clientId} className="border-t border-border-soft">
                      <td className="sticky left-0 bg-surface px-2 py-2">
                        <span className="text-sm font-medium text-fg">{displayClientName(r.clientName)}</span>
                        <span className="ml-2 text-[11px] text-fg-muted">
                          {r.coachName} · wk {r.currentWeek}
                          {r.isPif ? " · PIF" : ""}
                        </span>
                        {r.termEnded ? (
                          <span
                            className="ml-2 rounded-pill bg-warn-soft px-1.5 py-0.5 text-[10px] font-medium text-warn"
                            title="Still Active in GHL, but their term end date has already passed. Check whether they actually cancelled, then fix Status in GHL."
                          >
                            term ended
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          disabled={!canEdit || !fbFormEditable}
                          onClick={() => toggleFeedback(r)}
                          title={`${displayClientName(r.clientName)}: feedback form ${r.feedbackFormSent ? "sent" : fbDue ? "due (send at week 3)" : "not due yet"}`}
                          className={`min-w-[44px] rounded-pill border px-2.5 py-1 text-[11px] transition-colors ${
                            r.feedbackFormSent
                              ? "border-accent bg-accent text-white"
                              : fbDue
                                ? "border-warn/60 bg-warn-soft font-medium text-warn"
                                : "border-border-soft text-fg-muted"
                          } ${canEdit && fbFormEditable ? "hover:border-accent" : "cursor-default"}`}
                        >
                          {r.feedbackFormSent ? "✓" : fbDue ? "due" : "–"}
                        </button>
                      </td>
                      {milestoneCols.map((w) => {
                        const applies = w === 14 || r.isPif;
                        if (!applies)
                          return (
                            <td key={w} className="px-2 py-1.5 text-center text-fg-muted">
                              ·
                            </td>
                          );
                        const state = milestoneState(w, r.currentWeek, r.stored[w]);
                        return (
                          <td key={w} className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => cycle(r, w)}
                              title={`${displayClientName(r.clientName)} W${w}: ${state}`}
                              className={`min-w-[44px] rounded-pill border px-2.5 py-1 text-[11px] tabular-nums transition-colors ${CHIP_CLS[state]} ${
                                canEdit ? "hover:border-accent" : "cursor-default"
                              }`}
                            >
                              {CHIP_GLYPH[state]}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
