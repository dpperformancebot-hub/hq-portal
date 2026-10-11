"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Card,
  EmptyState,
  OnboardingPill,
  PageHeader,
  PlanPill,
  StatusPill,
  useToast,
} from "@/components/ui";
import { CHECKIN_META, ltv, weekNumber, type CheckIn, type Client, type Transformation } from "@/lib/seed";
import { makeCoachNamer } from "@/components/screens/renewals/coach-name";
import { MONTHLY_EQUIV_TOOLTIP } from "@/lib/rate-label";
import { setStartDate } from "@/lib/writeback";
import { assignCoachAction } from "@/lib/coach-assign-actions";
import { setClientRateAction } from "@/lib/client-rate-actions";
import { ClientNotesPanel } from "@/components/client/client-notes-panel";
import { CheckInSummaryNote } from "@/components/client/check-in-summary-note";
import { CheckInCodeEditor } from "@/components/client/check-in-code-editor";
import { NEEDS_START_DATE } from "@/lib/client-start-date";
import { matchSummariesToCheckIns } from "@/lib/checkin-summary-match";
import type { CheckInSummary } from "@/lib/check-in-summaries";
import { LogCheckInForm } from "@/components/client/log-check-in-form";
import type { ClientNote } from "@/lib/client-notes";

const TABS = ["Overview", "Check-ins", "Results", "Billing"] as const;
type Tab = (typeof TABS)[number];

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" });
};

/** Live coach picker. Writes clients.coach_id (HQ-owned) via the server action
 *  and refreshes the route. The GHL mirror stays gated in writeback.assignCoach. */
function CoachPicker({
  clientId,
  current,
  coachNames,
}: {
  clientId: string;
  current: string | null;
  coachNames: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const options = Object.entries(coachNames).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="assign-coach">
        Assign coach
      </label>
      <select
        id="assign-coach"
        value={current ?? ""}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value || null;
          if (next === (current ?? null)) return;
          setError(null);
          startTransition(async () => {
            const res = await assignCoachAction(clientId, next);
            if (res.ok) {
              toast.push("Coach updated");
              router.refresh();
            } else {
              setError(res.error);
              toast.push(res.error, "error");
            }
          });
        }}
        className="rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
        title="Assign coach (writes to the HQ datastore)"
      >
        <option value="">Unassigned</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      {pending ? <span className="text-xs text-fg-muted">Saving…</span> : null}
      {error ? (
        <span className="text-xs text-warn" title={error}>
          Failed
        </span>
      ) : null}
    </div>
  );
}

/** Owner-only weekly rate editor. Writes clients.weekly_rate (HQ-owned) via the
 *  server action and refreshes the route. Rates are pay data, so this renders
 *  for the owner only; a 0 shows a "set rate" affordance so a fresh client (no
 *  price entered yet) reads as blank-to-fill, not a real $0. */
function RateEditor({ clientId, current }: { clientId: string; current: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(current ? String(current) : "");
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const next = value.trim() === "" ? 0 : Number(value);
    if (!Number.isFinite(next) || next < 0) {
      setError("Invalid");
      toast.push("Enter a valid weekly rate", "error");
      return;
    }
    if (next === current) return;
    setError(null);
    startTransition(async () => {
      const res = await setClientRateAction(clientId, next);
      if (res.ok) {
        toast.push("Rate updated");
        router.refresh();
      } else {
        setError("Failed");
        toast.push(res.error, "error");
      }
    });
  };

  return (
    <div className="flex items-center gap-1.5" title="Weekly rate (owner only, writes to the HQ datastore)">
      <span className="text-sm text-fg-muted">$</span>
      <input
        type="number"
        min="0"
        inputMode="decimal"
        aria-label="Weekly rate"
        placeholder="0"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={save}
        className="w-20 rounded-control border border-border bg-surface px-2 py-1.5 text-sm tabular-nums text-fg focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
      />
      <span className="text-xs text-fg-muted">/wk</span>
      {pending ? (
        <span className="text-xs text-fg-muted">Saving…</span>
      ) : error ? (
        <span className="text-xs text-warn">{error}</span>
      ) : current === 0 ? (
        <span className="text-xs text-warn" title="No rate set yet">set rate</span>
      ) : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{label}</div>
      <div className="mt-1 text-sm text-fg">{children}</div>
    </div>
  );
}

export function ClientDetail({
  client,
  checkIns,
  transformations,
  notes = [],
  coachNames,
  canEditRate = false,
  summaries = [],
  canEditCheckIns = false,
  showMoney = true,
}: {
  client: Client;
  checkIns: CheckIn[];
  transformations: Transformation[];
  notes?: ClientNote[];
  coachNames?: Record<string, string>;
  /** Owner only: show the inline weekly-rate editor in the header. */
  canEditRate?: boolean;
  /** R2-4: Loom check-in summaries, attached to their check-in rows. */
  summaries?: CheckInSummary[];
  /** R9-2: inline check-in editing (code correction + summary add/edit). */
  canEditCheckIns?: boolean;
  /** false for a money-blind coach (TJD head coach): the monthly equivalent,
   *  LTV and the Billing tab disappear. The page already zeroed the data. */
  showMoney?: boolean;
}) {
  const coachLabel = makeCoachNamer(coachNames);
  // R2-4: pair each summary with its check-in row (week number, else same week).
  const summaryByCheckIn = matchSummariesToCheckIns(checkIns, summaries);
  const [tab, setTab] = useState<Tab>("Overview");
  const weightDelta = client.weightCurrent - client.weightStart;
  const checkIn = CHECKIN_META[client.checkInCode];

  return (
    <div className="space-y-6">
      <Link href="/client-database" className="text-xs text-fg-muted hover:text-fg-dim">
        ← Client Database
      </Link>

      <PageHeader
        eyebrow="Client"
        title={client.name}
        subtitle={`${coachLabel(client.coachId)} · Week ${client.status === "paused" ? "P" : (weekNumber(client) ?? "?")} · ${client.journeyStage}`}
        actions={
          <div className="flex items-center gap-2">
            <PlanPill variant={client.plan.toLowerCase()} />
            <CoachPicker clientId={client.id} current={client.coachId} coachNames={coachNames ?? {}} />
            {canEditRate ? <RateEditor clientId={client.id} current={client.weeklyRate ?? 0} /> : null}
          </div>
        }
      />

      <Card className="p-0">
        <div className="flex gap-1 border-b border-border px-3 pt-3">
          {TABS.filter((t) => showMoney || t !== "Billing").map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                t === tab ? "border-accent text-fg" : "border-transparent text-fg-dim hover:text-fg"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "Overview" ? (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Avatar name={client.name} size="lg" />
                <div>
                  <div className="font-display text-xl tracking-display text-fg">{client.name}</div>
                  <div className="text-xs text-fg-dim">Source: {client.source}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
                <Fact label="Coach">{coachLabel(client.coachId)}</Fact>
                <Fact label="Plan">{client.plan}</Fact>
                {showMoney ? (
                  <Fact label="Monthly equivalent">
                    <span title={MONTHLY_EQUIV_TOOLTIP}>${client.monthlyRate.toLocaleString()}</span>
                  </Fact>
                ) : null}
                <Fact label="Start date">
                  <span className="flex items-center gap-2">
                    {client.startDate}
                    <button
                      type="button"
                      onClick={() => {
                        // Write-back point (stubbed until M5). Inline date editor
                        // lands with the real handler; this names the point.
                        void setStartDate(client.id, client.startDate ?? "");
                      }}
                      title="Start date writes back to GHL at M5 (stubbed)"
                      className="text-[11px] text-fg-muted underline-offset-2 hover:text-fg-dim hover:underline"
                    >
                      Edit
                    </button>
                  </span>
                </Fact>
                <Fact label="Week number">{client.status === "paused" ? "Paused" : (weekNumber(client) ?? NEEDS_START_DATE)}</Fact>
                {showMoney ? <Fact label="LTV">${ltv(client).toLocaleString()}</Fact> : null}
                <Fact label="Journey stage">{client.journeyStage}</Fact>
                {client.onboardingType ? (
                  <Fact label="Onboarding">
                    <OnboardingPill variant={client.onboardingType} />
                  </Fact>
                ) : null}
                <Fact label="Last check-in">
                  <span className="flex items-center gap-2">
                    <StatusPill variant={checkIn.pill} />
                    <span className="text-fg-dim">{client.lastCheckIn ?? "Never"}</span>
                  </span>
                </Fact>
                <Fact label="Weight">
                  <span className="tabular-nums">
                    {client.weightStart}kg → {client.weightCurrent}kg{" "}
                    <span className={weightDelta < 0 ? "text-positive" : weightDelta > 0 ? "text-warn" : "text-fg-muted"}>
                      ({weightDelta > 0 ? "+" : ""}
                      {weightDelta}kg)
                    </span>
                  </span>
                </Fact>
              </div>
            </div>
          ) : null}

          {tab === "Check-ins" ? (
            <div className="space-y-4">
              <LogCheckInForm clients={[{ id: client.id, name: client.name, coachId: client.coachId }]} />
              {checkIns.length === 0 ? (
              <EmptyState icon="checkins" title="No check-ins yet" message="Weekly check-ins appear here once the coach log or Kahunas feed lands." />
            ) : (
              <div>
                {checkIns.map((ci) => {
                      const rowSummary = summaryByCheckIn.get(ci.id);
                  return (
                    <div key={ci.id} className="border-b border-border-soft last:border-0">
                      <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                          <span className="w-20 text-xs tabular-nums text-fg-muted">{fmtDate(ci.submittedAt)}</span>
                          {ci.weekNumber != null ? <span className="text-xs text-fg-dim">Week {ci.weekNumber}</span> : null}
                        </div>
                        <div className="flex items-center gap-3">
                          {ci.adherence != null ? <span className="text-xs tabular-nums text-fg-dim">{ci.adherence}%</span> : null}
                          {/* R9-2: the pill is the control; click to correct in place. */}
                          <CheckInCodeEditor checkInId={ci.id} code={ci.code} canEdit={canEditCheckIns} />
                        </div>
                      </div>
                      {/* R2-4 + R9-2: the check-in's own summary, add/editable inline. */}
                      <CheckInSummaryNote
                        summary={rowSummary ?? null}
                        clientId={client.id}
                        weekNumber={ci.weekNumber ?? null}
                        canEdit={canEditCheckIns}
                      />
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          ) : null}
          {tab === "Results" ? (
            transformations.length === 0 ? (
              <EmptyState icon="image" title="No transformations yet" message="Before/after milestones appear here." />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {transformations.map((t) => (
                  <Card key={t.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="rounded-pill bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-deep">{t.milestone}</span>
                      <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] capitalize text-fg-dim">{t.status.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex gap-3 text-[11px]">
                      <span className={t.hasBefore ? "text-positive" : "text-fg-muted"}>{t.hasBefore ? "✓ Before" : "Before pending"}</span>
                      <span className={t.hasAfter ? "text-positive" : "text-fg-muted"}>{t.hasAfter ? "✓ After" : "After pending"}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )
          ) : null}
          {tab === "Billing" && showMoney ? (
            client.billingFrequency ? (
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 p-4 text-sm md:grid-cols-3">
                {[
                  ["Billing frequency", client.billingFrequency],
                  ["Weekly rate", client.weeklyRate ? `$${client.weeklyRate}` : "-"],
                  ["Monthly equivalent", `$${client.monthlyRate.toLocaleString()}`],
                  ["Term length", client.termLength ? `${client.termLength} weeks` : "Rolling"],
                  ["Term ends", client.endDate ?? "-"],
                  ["Billed to date (est.)", `$${client.cashCollected.toLocaleString()}`],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <div className="text-xs uppercase tracking-[0.06em] text-fg-muted">{label}</div>
                    <div className="mt-1 tabular-nums text-fg">{value}</div>
                  </div>
                ))}
                <div className="col-span-full text-xs text-fg-muted">
                  Facts from GHL custom fields. Invoices and payment history feed from Stripe at retainer phase.
                </div>
              </div>
            ) : (
              <EmptyState icon="dollar" title="Billing" message="Invoices and payment status feed from Stripe/GHL later." />
            )
          ) : null}
        </div>
      </Card>

      <ClientNotesPanel clientId={client.id} notes={notes} />
    </div>
  );
}
