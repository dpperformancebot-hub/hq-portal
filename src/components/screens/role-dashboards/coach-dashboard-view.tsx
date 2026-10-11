"use client";

// COACH dashboard (M6). The coach's morning cockpit: KPIs, what needs action
// (ghosted clients), audits to review, the pay snapshot, and the roster. Data
// arrives PRE-SCOPED via getCoachDashboardData (own clients, or every coach's
// for a head coach); this component never decides scope itself. Everything is
// a jumping-off point: KPI cards, at-risk rows, and roster rows all click
// through to the matching screen or client profile.

import Link from "next/link";
import {
  AreaChart,
  DataTable,
  EmptyState,
  Kpi,
  MovableBlock,
  MovableLayout,
  PageHeader,
  Panel,
  type Column,
} from "@/components/ui";
import { NEEDS_START_DATE } from "@/lib/client-start-date";
import type { CoachDashboardData } from "@/lib/data";
import type { Client, Task } from "@/lib/seed/types";
import { BRAND } from "@/lib/brand";
import { CapacityFridayBanner } from "@/components/screens/capacity/capacity-friday-banner";
import { TodayCard } from "@/components/screens/dashboard/today-card";
import { ClientSlideOver, useClientPanel } from "@/components/client/client-slide-over";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const aud = (n: number) => `$${n.toLocaleString()}`;
const weeksSince = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / (7 * 86_400_000))) : null);

const kpiLink = "rounded-card transition hover:border-accent/40 [&>*]:h-full";

const weekLabel = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.getDate()}/${d.getMonth() + 1}`;
};

/** "Your business" trend panel (2026-07-02): the coach's own 12-week arc. */
function TrendPanel({
  title,
  hint,
  weeks,
  values,
  prefix = "",
}: {
  title: string;
  hint: string;
  weeks: string[];
  values: number[];
  prefix?: string;
}) {
  const data = weeks.map((w, i) => ({ week: weekLabel(w), value: values[i] ?? 0 }));
  const hasSignal = values.some((v) => v > 0);
  // R2-9: h-full + bottom-pinned hint so a row of trend cards sits level with
  // no dead pool of space under the shortest chart.
  return (
    <Panel title={title} className="h-full">
      {hasSignal ? (
        <div className="flex h-full flex-col justify-between gap-2">
          <AreaChart data={data} xKey="week" yKey="value" height={140} valuePrefix={prefix} />
          <p className="text-xs text-fg-dim">{hint}</p>
        </div>
      ) : (
        <EmptyState compact icon="bar_chart" title="Building your history" message="This trend fills in as your weeks land." />
      )}
    </Panel>
  );
}

/** Head-coach oversight counts, computed server-side on /dashboard. Null for
 *  every plain coach, so their dashboard is byte-for-byte unchanged. */
export type OversightCounts = {
  auditsOpen: number;
  onboardingToReview: number;
};

export function CoachDashboardView({
  data,
  oversight = null,
  preview = false,
  hidePay = false,
  today = null,
  capacity = null,
  formResponses = [],
}: {
  data: CoachDashboardData;
  oversight?: OversightCounts | null;
  preview?: boolean;
  /** Head coach reviewing another coach's portal: performance only, no pay. */
  hidePay?: boolean;
  /** C4: the coach's own "Today I will" list; null hides the card (previews). */
  today?: { tasks: Task[]; viewer: string; viewerNames?: string[]; viewerUserId?: string | null; live: boolean } | null;
  /** R7-1: open-week capacity state for the Friday banner (client-side day
   *  check in the coach's timezone). Null hides it (previews/impersonation). */
  capacity?: { submitted: boolean; weekLabel: string } | null;
  /** R5-3: this coach's client feedback-form responses (Typeform webhook). */
  formResponses?: { id: string; clientName: string; answers: { question: string; answer: string }[]; submittedAt: string | null }[];
}) {
  const { coach, roster, checkInsThisWeek, atRisk, auditsToReview, pay, trends } = data;
  const panel = useClientPanel();

  if (!coach) {
    return (
      <EmptyState
        title="No coach linked"
        message="This login is not linked to a coach yet. The owner links coach accounts in Team settings."
      />
    );
  }

  const columns: Column<Client>[] = [
    { key: "name", header: "Client", sortValue: (c) => c.name, render: (c) => <span className="text-fg">{c.name}</span> },
    {
      key: "week",
      header: "Week",
      align: "right",
      sortValue: (c) => weeksSince(c.startDate) ?? -1,
      render: (c) => {
        const w = weeksSince(c.startDate);
        return w === null ? <span className="text-warn" title={NEEDS_START_DATE}>needs date</span> : <span className="tabular-nums">{w}</span>;
      },
    },
    { key: "plan", header: "Plan", sortValue: (c) => c.plan, render: (c) => c.plan },
    { key: "stage", header: "Journey", sortValue: (c) => c.journeyStage, render: (c) => c.journeyStage },
    {
      key: "renewal",
      header: "Term end",
      align: "right",
      sortValue: (c) => c.endDate ?? "",
      render: (c) => <span className="tabular-nums">{c.endDate ?? "-"}</span>,
    },
  ];

  return (
    // flex + gap (not space-y): blocks reorder via CSS order (MovableBlock),
    // and margins would stick to DOM order rather than visual order.
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Coach Dashboard: ${coach.name}`}
        subtitle={preview ? "Owner preview of the coach view" : "Your clients, your numbers. Scoped to you."}
      />

      {/* R7-1: Friday reminder, day-checked client-side in the coach's own
          timezone; dismiss lasts the day, submission suppresses it. */}
      {capacity ? <CapacityFridayBanner submitted={capacity.submitted} weekLabel={capacity.weekLabel} /> : null}

      {/* A1: dashboards are locked, no hover grip. Saved arrangements still apply. */}
      <MovableLayout storageKey="coach-dashboard" locked>
      {oversight ? (
        <MovableBlock id="oversight">
          <Panel
            title="Oversight"
            subtitle="Across all coaches. Your own numbers stay below."
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                {
                  href: "/client-audits",
                  label: "Client audits",
                  count: oversight.auditsOpen,
                  hint: "needing action",
                },
                {
                  href: "/onboarding",
                  label: "Onboarding",
                  count: oversight.onboardingToReview,
                  hint: "awaiting your review",
                },
                { href: "/coach-performance", label: "Coach performance", count: null, hint: "scorecard and retention" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center justify-between rounded-control border border-border-soft px-3 py-2 transition-colors hover:border-accent/40 hover:bg-surface-2"
                >
                  <div>
                    <div className="text-sm font-medium text-fg">{item.label}</div>
                    <div className="text-xs text-fg-muted">{item.hint}</div>
                  </div>
                  {item.count != null ? (
                    <span
                      className={`font-display text-xl tabular-nums tracking-display ${
                        item.count > 0 ? "text-warn" : "text-fg"
                      }`}
                    >
                      {item.count}
                    </span>
                  ) : (
                    <span className="text-xs text-accent">Open</span>
                  )}
                </Link>
              ))}
            </div>
          </Panel>
        </MovableBlock>
      ) : null}
      <MovableBlock id="kpis">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link href="/my-clients" className={kpiLink} aria-label="View my clients">
          <Kpi label="Active clients" value={roster.length} hint="open your roster" />
        </Link>
        <Link href="/check-ins" className={kpiLink} aria-label="View check-ins">
          <Kpi label="Check-ins this week" value={checkInsThisWeek} hint="on record, last 7 days" />
        </Link>
        <Link href="/client-audits" className={kpiLink} aria-label="View audits to review">
          <Kpi label="Audits to review" value={auditsToReview} hint="open QA audits" />
        </Link>
        <Link href="/results" className={kpiLink} aria-label="View results">
          <Kpi label="My retention" value={pct(coach.retention)} hint="avg month to month" />
        </Link>
      </div>
      </MovableBlock>

      {/* C4: the coach's own "Today I will" list; ops can add to it from /tasks. */}
      {today ? (
        <MovableBlock id="today">
          <TodayCard
            tasks={today.tasks}
            viewer={today.viewer}
            viewerNames={today.viewerNames}
            viewerUserId={today.viewerUserId}
            live={today.live}
          />
        </MovableBlock>
      ) : null}

      {/* R5-3: client feedback-form responses (Typeform webhook), replacing
          the per-coach Zapier Slack DMs. Renders only once responses exist. */}
      {formResponses.length > 0 ? (
        <MovableBlock id="feedback-forms">
          <Panel
            title={`Feedback forms (${formResponses.length})`}
            subtitle="Client feedback-form submissions for your roster, newest first."
          >
            <div className="space-y-2">
              {formResponses.map((r) => (
                <details key={r.id} className="rounded-control border border-border-soft px-3 py-2">
                  <summary className="cursor-pointer text-sm text-fg">
                    <span className="font-medium">{r.clientName}</span>
                    {r.submittedAt ? (
                      <span className="ml-2 text-xs tabular-nums text-fg-muted">{r.submittedAt.slice(0, 10)}</span>
                    ) : null}
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {r.answers.map((a, i) => (
                      <div key={i} className="text-xs">
                        <div className="font-medium text-fg-dim">{a.question}</div>
                        <div className="whitespace-pre-wrap text-fg">{a.answer || "-"}</div>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </Panel>
        </MovableBlock>
      ) : null}

      {/* Your business: the coach's own 12-week trends. Feels like running
          their own book, not filling in someone else's spreadsheet. */}
      <MovableBlock id="trends">
      {/* R2-9: chart rows stretch equal-height; the cards fill internally. */}
      <div className={`grid grid-cols-1 gap-4 ${hidePay ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
        {!hidePay ? (
          <TrendPanel
            title="Pay per week"
            hint="From your logged check-ins at house rates."
            weeks={trends.weeks}
            values={trends.pay}
            prefix="$"
          />
        ) : null}
        <TrendPanel
          title="Check-ins per week"
          hint="Submissions across your roster, last 12 weeks."
          weeks={trends.weeks}
          values={trends.checkIns}
        />
        <TrendPanel
          title="Roster growth"
          hint="Clients on your books over time."
          weeks={trends.weeks}
          values={trends.roster}
        />
      </div>
      </MovableBlock>

      <MovableBlock id="attention-pay">
      <div className={`grid items-start gap-4 ${hidePay ? "" : "lg:grid-cols-2"}`}>
        <Panel
          title={`Needs attention (${atRisk.length})`}
          action={
            atRisk.length > 0 ? (
              <Link href="/check-ins" className="text-xs text-accent hover:underline">
                All check-ins
              </Link>
            ) : null
          }
        >
          {atRisk.length === 0 ? (
            <EmptyState icon="checkins" title="All clear" message="No ghosted clients right now." />
          ) : (
            <div className="space-y-2">
              {atRisk.map((c) => (
                <Link
                  key={c.id}
                  href={`/my-clients/${c.id}`}
                  className="flex items-center justify-between rounded-control border border-border-soft px-3 py-2 transition-colors hover:border-accent/40 hover:bg-surface-2"
                >
                  <div>
                    <div className="text-sm font-medium text-fg">{c.name}</div>
                    <div className="text-xs text-fg-muted">{weeksSince(c.startDate) === null ? NEEDS_START_DATE : `week ${weeksSince(c.startDate)}`}</div>
                  </div>
                  <span className="rounded-pill bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
                    Ghosted
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        {hidePay ? null : (
        <Link
          href="/my-pay"
          className="group block rounded-card border border-border bg-surface p-5 transition-colors hover:border-accent/40"
          aria-label="View my pay"
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Pay this month</div>
            {BRAND.pay.confirmed ? <span className="text-xs text-fg-muted">next pay {pay.nextPayDate}</span> : null}
          </div>
          {/* R10: unconfirmed brand pay rules render honestly, never a
              confident wrong number. */}
          <div className="mt-2 font-display text-3xl tabular-nums tracking-display text-fg">
            {BRAND.pay.confirmed ? aud(pay.gross) : "-"}
          </div>
          <p className="mt-2 text-xs text-fg-dim">
            {BRAND.pay.confirmed
              ? "Run-rate from your active roster at house rates. Full per-check-in pay lands with the live feed."
              : "Pay rules not set for this brand yet. Figures show once the owner confirms rates and payday."}
          </p>
          <span className="mt-3 inline-block text-xs text-accent group-hover:underline">Open My Pay, invoice and pay log</span>
        </Link>
        )}
      </div>
      </MovableBlock>

      <MovableBlock id="roster">
      <Panel title={`My roster (${roster.length})`}>
        {roster.length === 0 ? (
          <EmptyState title="No active clients" message="New assignments appear here as soon as they land." />
        ) : (
          <DataTable
            columns={columns}
            data={roster}
            getRowKey={(c) => c.id}
            onRowClick={(c) => panel.open(c)}
          />
        )}
      </Panel>
      </MovableBlock>
      </MovableLayout>
      <ClientSlideOver target={panel.target} onClose={panel.close} />
    </div>
  );
}
