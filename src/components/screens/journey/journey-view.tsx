"use client";

// Client Journey Tracker, R5-1 restructure (supersedes the B1 brackets).
// Columns: Unassigned and Onboarding stay permanent; weeks 1..singleWeekMax
// are ONE COLUMN PER WEEK (compact cards, horizontal scroll); later weeks
// collapse into per-brand buckets (BRAND.journey — Toby has a 52+ bucket for
// year gifts, Dan stops at 24+). Milestone ticks on cards:
//   W4+  "review msg" — clients.feedback_form_sent (testimonial farming)
//   W12+ "review call" — engagement_milestones week 12 (PIF-only when
//        BRAND.journey.w12PifOnly, Dan's rule)
// Search finds a client fast and every card shows its week, so "what week is
// this client in" is one keystroke away.

import { useMemo, useState, useTransition } from "react";
import { Card, EmptyState, OnboardingPill, PageHeader, Panel, SegmentedControl, useToast } from "@/components/ui";
import { weekNumber, type Client } from "@/lib/seed";
import { BRAND } from "@/lib/brand";
import { journeyColumnKey, journeyColumns, paymentStructure } from "@/lib/journey-buckets";
import { assignJourneyClientAction, setClientStartDateAction } from "@/lib/journey-actions";
import { clearMilestoneAction, setFeedbackFormSentAction, setMilestoneAction } from "@/lib/engagement-actions";
import { makeCoachNamer } from "@/components/screens/renewals/coach-name";
import { NEEDS_START_DATE, effectiveStartDate, startDateSource } from "@/lib/client-start-date";

const selectCls =
  "w-full rounded-control border border-border bg-surface px-2 py-1 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent";

function PayPill({ value }: { value: "PIF" | "WBW" | null }) {
  if (!value) {
    return (
      <span
        className="rounded-pill bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg-muted"
        title="No billing-structure signal in the data yet"
      >
        ?
      </span>
    );
  }
  return (
    <span
      className={`rounded-pill px-1.5 py-0.5 text-[10px] font-medium ${
        value === "PIF" ? "bg-status-sent text-status-sent-fg" : "bg-surface-2 text-fg-dim"
      }`}
      title={value === "PIF" ? "Paid in full for a term" : "Week by week"}
    >
      {value}
    </span>
  );
}

/** R5-1 milestone tick: a tiny labelled checkbox on the card. */
function MilestoneTick({
  label,
  title,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  title: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onToggle}
      className={`flex items-center gap-1 rounded-pill border px-1.5 py-0.5 text-[10px] transition-colors ${
        checked ? "border-accent bg-accent-soft text-accent-deep" : "border-warn/50 bg-warn-soft text-warn"
      } ${disabled ? "cursor-default opacity-70" : "hover:border-accent"}`}
    >
      <span>{checked ? "✓" : "○"}</span>
      {label}
    </button>
  );
}

type CoachLoad = Record<string, { active: number; max: number }>;

/** "Perry · 33/70" and whether the coach is full (R16-5b). */
function coachOption(c: { id: string; name: string }, load: CoachLoad, capacityByCoach: Record<string, string>) {
  const l = load[c.id];
  const full = !!l && l.max > 0 && l.active >= l.max;
  const label = `${c.name}${l ? ` · ${l.active}/${l.max}` : ""}${capacityByCoach[c.id] ? ` · ${capacityByCoach[c.id]} this wk` : ""}${full ? " · full" : ""}`;
  return { label, full };
}

function UnassignedCard({
  client,
  coaches,
  canAssign,
  canEditStartDate,
  showPayment,
  capacityByCoach = {},
  coachLoad = {},
  selected = false,
  onSelect,
  onAssigned,
  onStartDate,
}: {
  client: Client;
  coaches: { id: string; name: string }[];
  canAssign: boolean;
  /** R17-1c: editing a start date is an ops power, separate from assigning. */
  canEditStartDate: boolean;
  showPayment: boolean;
  /** E2: this week's capacity answer per coach id, shown in the picker. */
  capacityByCoach?: Record<string, string>;
  /** R16-5b: roster load per coach (n/max); a full coach is not selectable. */
  coachLoad?: CoachLoad;
  /** R16-5b bulk: card selection for "Assign selected to…". */
  selected?: boolean;
  onSelect?: (clientId: string, next: boolean) => void;
  onAssigned: (clientId: string, coachId: string) => void;
  /** R17-1b: null clears the portal override. */
  onStartDate: (clientId: string, startDateOverride: string | null) => void;
}) {
  const [coachId, setCoachId] = useState("");
  const [editingDate, setEditingDate] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const assign = () => {
    if (!coachId) return;
    startTransition(async () => {
      const res = await assignJourneyClientAction(client.id, coachId);
      if (res.ok) {
        onAssigned(client.id, coachId);
        toast.push(`${client.name} assigned.`, "success");
      } else {
        toast.push(res.error, "error");
      }
    });
  };

  // R17-1b: this writes clients.start_date_override, so the nightly sync can
  // no longer undo it. `null` clears the override and hands the client back to
  // whatever GHL says. Confirm names the client and the old -> new value.
  const saveDate = (value: string | null) => {
    setEditingDate(false);
    const current = effectiveStartDate(client);
    if (value === current) return;
    const shown = current ?? NEEDS_START_DATE;
    const next = value ?? `the GHL date (${client.startDate ?? NEEDS_START_DATE})`;
    if (!window.confirm(`Change ${client.name}'s start date?\n\n${shown}  ->  ${next}\n\nThis drives week number, journey stage and renewals.`)) return;
    startTransition(async () => {
      const res = await setClientStartDateAction(client.id, value);
      if (res.ok) {
        onStartDate(client.id, value);
        toast.push(value ? "Start date set in the portal." : "Start date reset to the GHL value.", "success");
      } else {
        toast.push(res.error, "error");
      }
    });
  };

  return (
    <Card className={`p-2.5 ${selected ? "ring-2 ring-accent/60" : ""}`}>
      <div className="flex items-center gap-2">
        {canAssign && onSelect ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(client.id, e.target.checked)}
            className="accent-accent"
            aria-label={`Select ${client.name} for bulk assign`}
          />
        ) : null}
        <div className="truncate text-sm font-medium text-fg">{client.name}</div>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-fg-dim">
        <span className="text-fg-muted">Starts</span>
        {editingDate ? (
          <input
            type="date"
            defaultValue={client.startDate ?? ""}
            autoFocus
            onBlur={(e) => saveDate(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveDate((e.target as HTMLInputElement).value);
              if (e.key === "Escape") setEditingDate(false);
            }}
            className="rounded-control border border-border bg-surface px-1.5 py-0.5 text-xs text-fg"
            aria-label={`Start date for ${client.name}`}
          />
        ) : effectiveStartDate(client) === null ? (
          <span className="rounded-pill bg-warn-soft px-1.5 py-0.5 text-[10px] font-medium text-warn" title="GHL has no Start Date for this client. It is NOT their payment date.">
            {NEEDS_START_DATE}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <span className="tabular-nums">{effectiveStartDate(client)}</span>
            {startDateSource(client) === "portal" ? (
              <span
                className="rounded-pill bg-accent-soft px-1 py-0.5 text-[9px] font-medium text-accent-deep"
                title={`Set in the portal. GHL still says ${client.startDate ?? "nothing"}.`}
              >
                set in portal
              </span>
            ) : null}
          </span>
        )}
        {canEditStartDate && !editingDate ? (
          <button
            type="button"
            onClick={() => setEditingDate(true)}
            className="text-[11px] font-medium text-accent hover:underline"
            title="Clients start Mondays"
          >
            Edit
          </button>
        ) : null}
        {canEditStartDate && !editingDate && startDateSource(client) === "portal" ? (
          <button
            type="button"
            onClick={() => saveDate(null)}
            className="text-[11px] text-fg-muted hover:text-fg"
            title="Clear the portal date and use the GHL value again"
          >
            reset
          </button>
        ) : null}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded-pill bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg-dim">{client.plan}</span>
        {showPayment ? <PayPill value={paymentStructure(client)} /> : null}
      </div>
      {canAssign ? (
        <div className="mt-2 flex items-center gap-1.5">
          <select
            value={coachId}
            onChange={(e) => setCoachId(e.target.value)}
            className={selectCls}
            aria-label={`Coach for ${client.name}`}
          >
            <option value="">Pick a coach…</option>
            {coaches.map((c) => {
              const o = coachOption(c, coachLoad, capacityByCoach);
              return (
                <option key={c.id} value={c.id} disabled={o.full}>
                  {o.label}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            onClick={assign}
            disabled={!coachId || pending}
            className="shrink-0 rounded-control bg-accent px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "…" : "Assign"}
          </button>
        </div>
      ) : null}
    </Card>
  );
}

export function JourneyView({
  clients,
  coachNames,
  canAssign = false,
  canEditStartDate = false,
  showPayment = false,
  capacityByCoach = {},
  coachLoad = {},
  initialFilter = "all",
  feedbackSentIds = [],
  w12ByClient = {},
}: {
  clients: Client[];
  coachNames?: Record<string, string>;
  canAssign?: boolean;
  /** R17-1c: owner, admin, ops_manager. Separate from canAssign on purpose. */
  canEditStartDate?: boolean;
  showPayment?: boolean;
  /** E2: this week's capacity answer per coach id. */
  capacityByCoach?: Record<string, string>;
  /** R16-5b: roster load per coach (n/max) for the assign pickers. */
  coachLoad?: CoachLoad;
  /** R16-5c: "unassigned" shows only the Unassigned column (sidebar entry). */
  initialFilter?: "all" | "unassigned";
  /** R5-1: client ids with clients.feedback_form_sent = true (the W4 tick). */
  feedbackSentIds?: string[];
  /** R5-1: stored W12 review-call state per client id. */
  w12ByClient?: Record<string, "booked" | "done">;
}) {
  const toast = useToast();
  const coachLabel = makeCoachNamer(coachNames);
  const [items, setItems] = useState(clients);
  const [query, setQuery] = useState("");
  const [fbSent, setFbSent] = useState<Set<string>>(new Set(feedbackSentIds));
  const [w12, setW12] = useState<Record<string, "booked" | "done" | undefined>>(w12ByClient);
  const [, startTransition] = useTransition();
  // R16-5: column filter + bulk selection for the Unassigned queue.
  const [colFilter, setColFilter] = useState<"all" | "unassigned">(initialFilter);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCoach, setBulkCoach] = useState("");
  const [bulkPending, setBulkPending] = useState(false);

  const coaches = useMemo(
    () =>
      Object.entries(coachNames ?? {})
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [coachNames],
  );

  const allColumns = useMemo(() => journeyColumns(BRAND.journey), []);
  const columns = useMemo(
    () => (colFilter === "unassigned" ? allColumns.filter((c) => c.key === "unassigned") : allColumns),
    [allColumns, colFilter],
  );

  const bulkAssign = async () => {
    if (!bulkCoach || selected.size === 0 || bulkPending) return;
    setBulkPending(true);
    const ids = [...selected];
    let done = 0;
    const failed: string[] = [];
    // One client at a time through the SAME action the card uses, so each
    // assignment fires its Slack ping, notification and onboarding task.
    for (const id of ids) {
      const res = await assignJourneyClientAction(id, bulkCoach);
      if (res.ok) {
        patch(id, { coachId: bulkCoach });
        done++;
      } else failed.push(items.find((c) => c.id === id)?.name ?? id);
    }
    setBulkPending(false);
    setSelected(new Set(failed.length ? ids.filter((id) => failed.includes(items.find((c) => c.id === id)?.name ?? id)) : []));
    if (done) toast.push(`${done} client${done === 1 ? "" : "s"} assigned to ${coachLabel(bulkCoach)}.`, "success");
    if (failed.length) toast.push(`Not assigned: ${failed.join(", ")}`, "error");
  };

  // Coaching lifecycle covers everyone currently coached (active or paused).
  const q = query.trim().toLowerCase();
  const inJourney = items
    .filter((c) => c.status === "active" || c.status === "paused")
    .filter((c) => !q || c.name.toLowerCase().includes(q));

  const patch = (clientId: string, fields: Partial<Client>) =>
    setItems((prev) => prev.map((c) => (c.id === clientId ? { ...c, ...fields } : c)));

  const toggleFb = (c: Client) => {
    const next = !fbSent.has(c.id);
    setFbSent((prev) => {
      const s = new Set(prev);
      if (next) s.add(c.id);
      else s.delete(c.id);
      return s;
    });
    startTransition(async () => {
      const res = await setFeedbackFormSentAction({ clientId: c.id, sent: next });
      if (!res.ok) {
        setFbSent((prev) => {
          const s = new Set(prev);
          if (next) s.delete(c.id);
          else s.add(c.id);
          return s;
        });
        toast.push(res.error ?? "Could not update.", "error");
      }
    });
  };

  const toggleW12 = (c: Client) => {
    const was = w12[c.id];
    const next = was ? undefined : ("done" as const);
    setW12((prev) => ({ ...prev, [c.id]: next }));
    startTransition(async () => {
      const res = next
        ? await setMilestoneAction({ clientId: c.id, week: 12, state: "done" })
        : await clearMilestoneAction({ clientId: c.id, week: 12 });
      if (!res.ok) {
        setW12((prev) => ({ ...prev, [c.id]: was }));
        toast.push(res.error ?? "Could not update.", "error");
      }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        back
        eyebrow="Operations"
        title="Client Journey Tracker"
        subtitle="New signups land in Unassigned; assign a coach to move them into the journey."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              aria-label="Journey columns"
              size="sm"
              value={colFilter}
              onChange={(v) => setColFilter(v as "all" | "unassigned")}
              options={[
                { label: "All stages", value: "all" },
                { label: "Unassigned", value: "unassigned" },
              ]}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a client…"
              className="rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
              aria-label="Search clients"
            />
          </div>
        }
      />

      {/* R16-5b: bulk assign bar, only while cards are ticked. */}
      {canAssign && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-accent/40 bg-accent-soft px-3 py-2 text-sm">
          <span className="font-medium text-fg">
            {selected.size} selected
          </span>
          <span className="text-fg-dim">Assign selected to</span>
          <select
            value={bulkCoach}
            onChange={(e) => setBulkCoach(e.target.value)}
            className={`${selectCls} w-auto min-w-[14rem]`}
            aria-label="Coach for selected clients"
          >
            <option value="">Pick a coach…</option>
            {coaches.map((c) => {
              const o = coachOption(c, coachLoad, capacityByCoach);
              return (
                <option key={c.id} value={c.id} disabled={o.full}>
                  {o.label}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            onClick={() => void bulkAssign()}
            disabled={!bulkCoach || bulkPending}
            className="rounded-control bg-accent px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulkPending ? "Assigning…" : `Assign ${selected.size}`}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            disabled={bulkPending}
            className="text-xs font-medium text-fg-dim hover:text-fg"
          >
            Clear
          </button>
        </div>
      ) : null}

      {inJourney.length === 0 ? (
        <Panel title="Journey">
          <EmptyState
            compact
            icon="target"
            title={q ? "No clients match" : "No clients in journey"}
            message={q ? "Try a different name." : "Active clients appear here by lifecycle stage."}
          />
        </Panel>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((col) => {
            const inStage = inJourney.filter((c) => journeyColumnKey(c, BRAND.journey) === col.key);
            // Single-week columns with nobody in them stay narrow so the rail
            // scrolls fast; Unassigned/Onboarding/buckets always render full.
            const isWeekCol = "week" in col;
            if (isWeekCol && inStage.length === 0 && !q) {
              return (
                <div key={col.key} className="flex w-10 shrink-0 flex-col items-center">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-muted">{col.label}</span>
                  <div className="mt-2 h-full min-h-[3rem] w-px bg-border-soft" />
                </div>
              );
            }
            return (
              <div key={col.key} className={`flex shrink-0 flex-col ${isWeekCol ? "w-52" : "w-60"}`}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-muted">{col.label}</span>
                  <span className="text-xs tabular-nums text-fg-muted">{inStage.length}</span>
                </div>
                <div className="space-y-1.5">
                  {inStage.map((c) => {
                    if (col.key === "unassigned") {
                      return (
                        <UnassignedCard
                          key={c.id}
                          client={c}
                          coaches={coaches}
                          canAssign={canAssign}
                          canEditStartDate={canEditStartDate}
                          showPayment={showPayment}
                          capacityByCoach={capacityByCoach}
                          coachLoad={coachLoad}
                          selected={selected.has(c.id)}
                          onSelect={(id, next) =>
                            setSelected((prev) => {
                              const s = new Set(prev);
                              if (next) s.add(id);
                              else s.delete(id);
                              return s;
                            })
                          }
                          onAssigned={(id, coachId) => {
                            patch(id, { coachId });
                            setSelected((prev) => {
                              const s = new Set(prev);
                              s.delete(id);
                              return s;
                            });
                          }}
                          onStartDate={(id, startDateOverride) => patch(id, { startDateOverride })}
                        />
                      );
                    }
                    const wk = c.status === "paused" ? null : weekNumber(c);
                    const pay = paymentStructure(c);
                    const showW4 = col.key !== "onboarding" && (wk ?? 0) >= 4;
                    const showW12 =
                      col.key !== "onboarding" && (wk ?? 0) >= 12 && (!BRAND.journey.w12PifOnly || pay === "PIF");
                    return (
                      <Card key={c.id} className="p-2">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="truncate text-xs font-medium text-fg">{c.name}</span>
                          <span className="shrink-0 rounded-pill bg-surface-2 px-1.5 py-0.5 text-[10px] tabular-nums text-fg-dim">
                            {col.key === "onboarding" ? c.startDate : wk == null ? "P" : `Wk ${wk}`}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className="truncate text-[10px] text-fg-muted">{coachLabel(c.coachId)}</span>
                          {showPayment ? <PayPill value={pay} /> : null}
                        </div>
                        {/* R5-1 milestone ticks (admin-facing; this page is owner/VA). */}
                        {(showW4 || showW12) && canAssign ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {showW4 ? (
                              <MilestoneTick
                                label="W4 msg"
                                title="First-month review/feedback message sent (testimonial farming)"
                                checked={fbSent.has(c.id)}
                                disabled={false}
                                onToggle={() => toggleFb(c)}
                              />
                            ) : null}
                            {showW12 ? (
                              <MilestoneTick
                                label="W12 call"
                                title="W12 review call booked/done (next-phase mapping)"
                                checked={!!w12[c.id]}
                                disabled={false}
                                onToggle={() => toggleW12(c)}
                              />
                            ) : null}
                          </div>
                        ) : null}
                        {c.onboardingType && c.onboardingType !== "Standard" && col.key === "onboarding" ? (
                          <div className="mt-1.5">
                            <OnboardingPill variant={c.onboardingType} />
                          </div>
                        ) : null}
                      </Card>
                    );
                  })}
                  {inStage.length === 0 ? (
                    <div className="rounded-card border border-dashed border-border px-3 py-4 text-center text-xs text-fg-muted">
                      Empty
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
