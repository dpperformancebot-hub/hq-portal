"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Delta,
  EmptyState,
  Kpi,
  MovableBlock,
  MovableLayout,
  PageHeader,
  Panel,
  SegmentedControl,
  Sensitive,
  SlideOver,
} from "@/components/ui";
import { BlurFinancialsToggle } from "@/components/shell/blur-financials-toggle";
import { useSensitive } from "@/components/sensitive-provider";
import { RevenueTrendPanel } from "@/components/screens/dashboard/revenue-trend-panel";
import { DashboardLeaderboards } from "@/components/screens/dashboard/leaderboards";
import { TodayCard } from "@/components/screens/dashboard/today-card";
import { BRAND } from "@/lib/brand";
import { DEMO_MODE } from "@/lib/demo";
import type { DashboardClient, ExpensesSummary } from "@/lib/data";
import type { CoachLeaderboardRow, getDashboardMetrics, SalesLeaderboardRow, Task } from "@/lib/seed";

type Metrics = ReturnType<typeof getDashboardMetrics>;

// Drill-in drawers (2026-07-02): every countable KPI opens a slide-over with
// the records behind the number; every rate/currency KPI navigates to the
// screen that owns it. Click out via backdrop, Esc, or the X.
type Drawer =
  | { kind: "active" }
  | { kind: "net" }
  | { kind: "paused" }
  | { kind: "coach"; coachId: string; name: string }
  | { kind: "expenses" }
  | null;

const DAY = 86_400_000;

function ClientList({ clients, coachNames, onNavigate }: {
  clients: DashboardClient[];
  coachNames: Record<string, string>;
  onNavigate: () => void;
}) {
  if (clients.length === 0) {
    return <EmptyState icon="clients" title="Nothing here" message="No clients match this metric right now." />;
  }
  return (
    <div className="divide-y divide-border-soft">
      {clients.map((c) => (
        <Link
          key={c.id}
          href={`/client-database/${c.id}`}
          onClick={onNavigate}
          className="flex items-center justify-between gap-3 px-1 py-2.5 transition-colors hover:bg-surface-2"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-fg">{c.name}</div>
            <div className="text-xs text-fg-dim">
              {c.coachId ? coachNames[c.coachId] ?? "Unassigned" : "Unassigned"} · {c.plan}
            </div>
          </div>
          <span className="shrink-0 text-xs capitalize tabular-nums text-fg-muted">{c.status}</span>
        </Link>
      ))}
    </div>
  );
}

// In live mode (no Stripe yet) cash facts fall back to the billing run-rate,
// so "Cash collected" is an estimate, not settled Stripe cash. Demo mode keeps
// real seeded transaction totals. See src/lib/live/index.ts cashCollected30d.
const LIVE = !DEMO_MODE;

const round = (n: number) => Math.round(n);

export function DashboardView({
  metrics,
  empty,
  coachLeaderboard,
  salesLeaderboard,
  clientIndex = [],
  coachNames = {},
  expenses,
  tasks = [],
  tasksLive = false,
  reactivatingSoon = [],
  capacityWeek = null,
}: {
  metrics: Metrics;
  empty: boolean;
  coachLeaderboard: CoachLeaderboardRow[];
  salesLeaderboard: SalesLeaderboardRow[];
  clientIndex?: DashboardClient[];
  coachNames?: Record<string, string>;
  expenses?: ExpensesSummary;
  /** Task list feeding the "Today I will" card (C4). */
  tasks?: Task[];
  tasksLive?: boolean;
  /** R4-1: pauses ending within 4 days, for the callout. */
  reactivatingSoon?: { name: string; days: number }[];
  /** R8-1: this week's self-reported capacity (band midpoints). Null until
   *  anyone has submitted. */
  capacityWeek?: { total: number; answered: number; rows: { coachId: string; band: string; slots: number }[] } | null;
}) {
  const router = useRouter();
  const { blurred } = useSensitive();
  const [period, setPeriod] = useState("Monthly");
  const [drawer, setDrawer] = useState<Drawer>(null);
  // A2: Active-clients drill-in sort. New to old is the default; the toggle
  // lives in the drawer and resets on reopen.
  const [activeSort, setActiveSort] = useState<"newest" | "alpha">("newest");

  const m = metrics;
  const chart = m.revenueByPeriod[period as keyof typeof m.revenueByPeriod] ?? m.revenueByPeriod.Monthly;

  const drawerData = useMemo(() => {
    if (!drawer || drawer.kind === "expenses") return null;
    const now = Date.now();
    const byName = (a: DashboardClient, b: DashboardClient) => a.name.localeCompare(b.name);
    const ts = (d: string | null) => (d ? Date.parse(d) : 0);
    const byNewest = (a: DashboardClient, b: DashboardClient) => ts(b.startDate) - ts(a.startDate);
    switch (drawer.kind) {
      case "active":
        return {
          title: "Active clients",
          subtitle: "Everyone currently on the books",
          clients: clientIndex
            .filter((c) => c.status === "active")
            .sort(activeSort === "newest" ? byNewest : byName),
        };
      case "net": {
        // A3: mirror the live metric windows exactly (gained = active started
        // within 30d; lost = cancelled with an end date within 30d).
        const gainedList = clientIndex
          .filter((c) => c.status === "active" && c.startDate !== null && now - Date.parse(c.startDate) <= 30 * DAY)
          .sort(byNewest);
        const lostList = clientIndex
          .filter((c) => {
            if (c.status !== "cancelled" || !c.endDate) return false;
            const since = now - Date.parse(c.endDate);
            return since >= 0 && since <= 30 * DAY;
          })
          .sort((a, b) => Date.parse(b.endDate ?? "") - Date.parse(a.endDate ?? ""));
        return {
          title: "Net change",
          subtitle: `+${gainedList.length} gained, -${lostList.length} lost in the last 30 days`,
          clients: [] as DashboardClient[],
          sections: [
            { label: `New this period (${gainedList.length})`, clients: gainedList },
            { label: `Cancelled this period (${lostList.length})`, clients: lostList },
          ],
        };
      }
      case "paused":
        return {
          title: "Paused clients",
          subtitle: "On hold, still on the roster",
          clients: clientIndex.filter((c) => c.status === "paused").sort(byName),
        };
      case "coach":
        return {
          title: drawer.name,
          subtitle: "Active roster",
          clients: clientIndex.filter((c) => c.coachId === drawer.coachId && c.status === "active").sort(byName),
        };
    }
  }, [drawer, clientIndex, activeSort]);

  return (
    // flex + gap (not space-y): blocks reorder via CSS order (MovableBlock),
    // and margins would stick to DOM order rather than visual order.
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operations"
        title="Dashboard"
        subtitle="Operating overview across revenue, clients, and check-in health."
        actions={
          <div className="flex items-center gap-2">
            {/* H1: the Monday weekly report. */}
            <Link
              href="/weekly-report"
              className="rounded-control border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
            >
              Weekly report
            </Link>
            {/* Privacy: hide every dollar figure for screen-sharing in public. */}
            <BlurFinancialsToggle />
            {/* Period control: switches the revenue trend sampling (live data). */}
            <SegmentedControl
              aria-label="Period"
              size="sm"
              value={period}
              onChange={setPeriod}
              options={[
                { label: "Weekly", value: "Weekly" },
                { label: "Monthly", value: "Monthly" },
                { label: "Quarterly", value: "Quarterly" },
                { label: "Yearly", value: "Yearly" },
              ]}
            />
          </div>
        }
      />

      {/* B5: unassigned-clients callout, deliberately OUTSIDE the movable
          layout and above the KPIs so an unassigned signup is never missed.
          Renders only when there is something to action. */}
      {(() => {
        const unassigned = clientIndex
          .filter((c) => (c.status === "active" || c.status === "paused") && !c.coachId)
          .sort((a, b) => (b.startDate ? Date.parse(b.startDate) : 0) - (a.startDate ? Date.parse(a.startDate) : 0));
        if (unassigned.length === 0) return null;
        // R16-5a (Dan could not find the assign flow): a named card with the
        // count and a button straight to the Unassigned queue. Owner + ops
        // roles render this dashboard; hidden when nobody is waiting.
        return (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-warn/30 bg-warn-soft px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-warn">Clients waiting for a coach</div>
              <div className="font-display text-2xl tabular-nums tracking-display text-fg">{unassigned.length}</div>
              <div className="truncate text-xs text-fg-dim">
                {unassigned
                  .slice(0, 4)
                  .map((c) => `${c.name} (starts ${c.startDate})`)
                  .join(" · ")}
                {unassigned.length > 4 ? ` · +${unassigned.length - 4} more` : ""}
              </div>
            </div>
            <Link
              href="/client-journey?filter=unassigned"
              className="shrink-0 rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-deep"
            >
              Assign clients
            </Link>
          </div>
        );
      })()}

      {/* R17-1a: clients with no known program start. Same treatment as the
          unassigned callout: outside the movable layout, only when actionable. */}
      {(() => {
        const missing = clientIndex.filter(
          (c) => (c.status === "active" || c.status === "paused") && !c.startDateOverride && !c.startDate,
        );
        if (missing.length === 0) return null;
        return (
          <Link
            href="/client-journey"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-warn/30 bg-warn-soft px-4 py-3 transition-colors hover:border-warn/60"
          >
            <span className="text-sm font-semibold text-warn">
              {missing.length} client{missing.length === 1 ? "" : "s"} with no start date
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-fg-dim">
              {missing.slice(0, 4).map((c) => c.name).join(" · ")}
              {missing.length > 4 ? ` · +${missing.length - 4} more` : ""}
            </span>
            <span className="text-xs font-medium text-warn">Set them in the Journey Tracker</span>
          </Link>
        );
      })()}

      {/* R4-1: reactivating-soon callout (sheet "next 4 days" alert). Same
          treatment as unassigned: outside the layout, only when actionable. */}
      {reactivatingSoon.length > 0 ? (
        <Link
          href="/pauses"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-warn/30 bg-warn-soft px-4 py-3 transition-colors hover:border-warn/60"
        >
          <span className="text-sm font-semibold text-warn">
            {reactivatingSoon.length} pause{reactivatingSoon.length === 1 ? "" : "s"} ending soon
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-fg-dim">
            {reactivatingSoon
              .slice(0, 4)
              .map((p) => `${p.name} (${p.days}d)`)
              .join(" · ")}
            {reactivatingSoon.length > 4 ? ` · +${reactivatingSoon.length - 4} more` : ""}
          </span>
          <span className="text-xs font-medium text-warn">Open the pause board →</span>
        </Link>
      ) : null}

      {/* A1: dashboard layout is locked, the hover grip ("grab action") is gone.
          Saved arrangements still apply; other screens keep their grips. */}
      <MovableLayout storageKey="owner-dashboard" locked>
      {/* KPI row 1 */}
      <MovableBlock id="kpis-core">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Recurring revenue"
          value={empty ? 0 : m.recurringRevenue}
          prefix="$"
          sensitive
          delta={empty ? undefined : Number(m.recurringRevenueDeltaPct.toFixed(1))}
          deltaSuffix="%"
          hint="month on month"
          onClick={() => router.push("/financials")}
        />
        <Kpi
          label="Active clients"
          value={empty ? 0 : m.activeClients}
          hint={empty ? "none yet" : `+${m.activeClientsThisMonth} this month`}
          onClick={() => setDrawer({ kind: "active" })}
        />
        <Kpi
          label="Net change"
          value={empty ? "0" : `${m.netChange > 0 ? "+" : ""}${m.netChange}`}
          hint={empty ? "no movement" : `+${m.gained} gained, -${m.lost} lost`}
          onClick={() => setDrawer({ kind: "net" })}
        />
        <Kpi
          label="Retention"
          value={empty ? 0 : round(m.retentionPct)}
          suffix="%"
          // R8-3 (Dan's formula): monthly-average churn on the total roster,
          // with the total Average Week at Churn alongside.
          hint={
            empty
              ? "no data"
              : `${m.churnPct.toFixed(1)}% churn (mo avg)${m.avgWeekAtChurn !== null ? ` · avg week at churn ${m.avgWeekAtChurn}` : ""}`
          }
          // D4: retention drills into the coach retention view.
          onClick={() => router.push("/coach-performance")}
        />
      </div>
      </MovableBlock>

      {/* KPI row 2: owner priority metrics */}
      <MovableBlock id="kpis-detail">
      <div className={`grid grid-cols-2 gap-4 md:grid-cols-4 ${capacityWeek ? "xl:grid-cols-9" : "xl:grid-cols-8"}`}>
        <Kpi
          label="Cash collected"
          value={empty ? 0 : m.cashCollected30d}
          prefix="$"
          sensitive
          hint={LIVE ? "est. run-rate" : "30 days"}
          onClick={() => router.push("/financials")}
        />
        <Kpi label="Paused" value={empty ? 0 : m.paused} onClick={() => setDrawer({ kind: "paused" })} />
        <Kpi
          label="Expiring"
          value={empty ? 0 : m.expiring30d}
          hint="30 days"
          // D4: straight to the Renewals next-30-days tab.
          onClick={() => router.push("/renewals?tab=next30")}
        />
        <Kpi label="New leads" value={empty ? 0 : m.newLeads} onClick={() => router.push("/pipeline")} />
        <Kpi
          label="Close rate"
          value={empty ? 0 : round(m.closeRatePct)}
          suffix="%"
          onClick={() => router.push("/sales-performance")}
        />
        <Kpi label="MRR" value={empty ? 0 : m.mrr} prefix="$" sensitive onClick={() => router.push("/financials")} />
        <Kpi
          label="Coach capacity"
          value={empty ? 0 : round(m.coachCapacityPct)}
          suffix="%"
          onClick={() => router.push("/coach-overview")}
        />
        {capacityWeek ? (
          // R8-1: total team capacity this week from coach submissions
          // (band midpoints summed).
          <Kpi
            label="Capacity this week"
            value={empty ? 0 : capacityWeek.total}
            hint={`${capacityWeek.answered} answered`}
            onClick={() => router.push("/capacity")}
          />
        ) : null}
        {expenses ? (
          <Kpi
            label="Expenses"
            value={empty ? 0 : expenses.totalMonthly}
            prefix="$"
            sensitive
            hint="per month"
            onClick={() => setDrawer({ kind: "expenses" })}
          />
        ) : null}
      </div>
      </MovableBlock>

      {/* Middle: two independent column stacks (left: revenue, pipeline,
          social; right: today, capacity, focus) so panels pack upward and a
          tall neighbour never leaves a dead gap in the other column. */}
      <MovableBlock id="trend-capacity">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
        <RevenueTrendPanel
          series={chart.series}
          lastYear={chart.lastYear}
          prevPeriod={chart.prevPeriod}
          weeklySeries={m.revenueByPeriod.Weekly.series}
          empty={empty}
        />

        {/* Pipeline + social pack directly under the revenue chart. */}
        <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2">
        <Panel
          title="Pipeline"
          action={
            <Link href="/pipeline" className="text-xs text-accent hover:underline">
              Open CRM
            </Link>
          }
        >
          {empty ? (
            <EmptyState compact icon="filter" title="No leads" message="New leads from GHL appear here." />
          ) : (
            <div className="space-y-2">
              {m.pipeline.map((p) => {
                const max = Math.max(...m.pipeline.map((x) => x.count), 1);
                return (
                  <Link
                    key={p.stage}
                    href="/pipeline"
                    className="flex items-center gap-3 rounded-control px-1 py-1 transition-colors hover:bg-surface-2"
                  >
                    <span className="w-36 shrink-0 truncate text-xs text-fg-dim">{p.stage}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-2">
                      <span
                        className="block h-full rounded-pill bg-accent"
                        style={{ width: `${(p.count / max) * 100}%` }}
                      />
                    </span>
                    <span className="w-6 text-right text-xs tabular-nums text-fg">{p.count}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Social">
          {empty ? (
            <EmptyState compact icon="share2" title="Not connected" message="Channel stats arrive with the social integration." />
          ) : (
            <div className="space-y-3">
              {m.social.map((s) => (
                <div key={s.channel} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-fg">{s.channel}</div>
                    <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">Coming soon</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-sm text-fg-dim">
                      {s.followers.toLocaleString()}
                    </span>
                    <Delta value={s.deltaPct} suffix="%" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
        </div>

        <Panel
          title="Today's focus"
          action={
            <Link href="/tasks" className="text-xs text-accent hover:underline">
              View all
            </Link>
          }
        >
          {empty || m.todaysFocus.length === 0 ? (
            <EmptyState compact icon="checkins" title="All clear" message="No tasks due today." />
          ) : (
            <ul className="space-y-2">
              {m.todaysFocus.map((t) => (
                <li key={t.id} className="flex items-start gap-2 text-sm">
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                      t.status === "done" ? "border-accent bg-accent text-white" : "border-border"
                    }`}
                  >
                    {t.status === "done" ? "✓" : ""}
                  </span>
                  <span className={t.status === "done" ? "text-fg-muted line-through" : "text-fg"}>
                    {t.title}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        </div>

        {/* C4/E: right stack: today list, coach capacity. */}
        <div className="flex min-w-0 flex-col gap-6">
        <TodayCard tasks={tasks} viewer={BRAND.ownerName} live={tasksLive} includeUnassigned />
        <Panel title="Coach capacity">
          {empty ? (
            <EmptyState compact icon="user" title="No coaches" message="Capacity shows once coaches have clients." />
          ) : (
            <div className="space-y-1">
              {m.coachCapacity.map((c) => {
                // R8-1: this week's self-reported capacity (amber bar) under
                // the roster-utilisation bar. Scale: 8 = the 7+ band midpoint.
                const sub = capacityWeek?.rows.find((r) => r.coachId === c.coachId);
                return (
                  <button
                    key={c.coachId}
                    type="button"
                    onClick={() => setDrawer({ kind: "coach", coachId: c.coachId, name: c.name })}
                    className="block w-full rounded-control px-2 py-2 text-left transition-colors hover:bg-surface-2"
                  >
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-fg">{c.name}</span>
                      <span className="tabular-nums text-fg-dim">
                        {c.active}/{c.max}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-pill bg-surface-2">
                      {/* Clamp the fill to 100%; over-capacity coaches show warn. */}
                      <div
                        className={`h-full rounded-pill ${c.pct > 1 ? "bg-warn" : "bg-accent"}`}
                        style={{ width: `${Math.min(100, Math.round(c.pct * 100))}%` }}
                      />
                    </div>
                    {sub ? (
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-2">
                          <div
                            className="h-full rounded-pill bg-warn"
                            style={{ width: `${Math.min(100, Math.round((sub.slots / 8) * 100))}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-[11px] tabular-nums text-fg-muted">
                          can take {sub.band} this week
                        </span>
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
        </div>
      </div>
      </MovableBlock>

      {/* Leaderboards */}
      <MovableBlock id="leaderboards">
        <DashboardLeaderboards coaches={coachLeaderboard} reps={salesLeaderboard} />
      </MovableBlock>
      </MovableLayout>

      {/* Drill-in drawer: the records behind whichever metric was clicked. */}
      <SlideOver
        open={drawer !== null}
        onClose={() => {
          setDrawer(null);
          setActiveSort("newest");
        }}
        title={drawer?.kind === "expenses" ? "Monthly expenses" : drawerData?.title ?? ""}
        subtitle={
          drawer?.kind === "expenses"
            ? expenses
              ? blurred
                ? "coach pay + recurring costs"
                : `$${expenses.totalMonthly.toLocaleString()} per month · coach pay + recurring costs`
              : undefined
            : drawerData
              ? "sections" in drawerData
                ? drawerData.subtitle
                : `${drawerData.clients.length} client${drawerData.clients.length === 1 ? "" : "s"} · ${drawerData.subtitle}`
              : undefined
        }
      >
        {drawer?.kind === "expenses" && expenses ? (
          <div className="space-y-5">
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Coach pay</span>
                <span className="text-sm font-medium tabular-nums text-fg">
                  <Sensitive>${expenses.coachPayMonthly.toLocaleString()}/mo</Sensitive>
                </span>
              </div>
              <div className="divide-y divide-border-soft">
                {expenses.coachLines.map((l) => (
                  <div key={l.name} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-fg">{l.name}</span>
                    <span className="tabular-nums text-fg-dim"><Sensitive>${l.amount.toLocaleString()}</Sensitive></span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Recurring costs</span>
                <span className="text-sm font-medium tabular-nums text-fg">
                  <Sensitive>${expenses.recurringMonthly.toLocaleString()}/mo</Sensitive>
                </span>
              </div>
              {expenses.recurring.length === 0 ? (
                <p className="py-2 text-sm text-fg-dim">
                  None entered yet. Add rent, software and other costs on Financials.
                </p>
              ) : (
                <div className="divide-y divide-border-soft">
                  {expenses.recurring.map((r) => (
                    <div key={r.name} className="flex items-center justify-between py-2 text-sm">
                      <span className={r.active ? "text-fg" : "text-fg-muted line-through"}>
                        {r.name} <span className="text-xs text-fg-muted">· {r.cadence}</span>
                      </span>
                      <span className="tabular-nums text-fg-dim">
                        <Sensitive>{r.amountMonthly > 0 ? `$${r.amountMonthly.toLocaleString()}` : "one-off"}</Sensitive>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Link
              href="/financials"
              onClick={() => setDrawer(null)}
              className="inline-block text-xs font-medium text-accent hover:underline"
            >
              Manage expenses on Financials →
            </Link>
          </div>
        ) : drawerData ? (
          <div className="space-y-3">
            {drawer?.kind === "active" ? (
              <SegmentedControl
                aria-label="Sort active clients"
                size="sm"
                value={activeSort}
                onChange={setActiveSort}
                options={[
                  { label: "New to old", value: "newest" },
                  { label: "A to Z", value: "alpha" },
                ]}
              />
            ) : null}
            {"sections" in drawerData ? (
              // A3: net change splits into who came in and who left.
              <div className="space-y-5">
                {(drawerData.sections ?? []).map((s) => (
                  <div key={s.label}>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
                      {s.label}
                    </div>
                    <ClientList clients={s.clients} coachNames={coachNames} onNavigate={() => setDrawer(null)} />
                  </div>
                ))}
              </div>
            ) : (
              <ClientList clients={drawerData.clients} coachNames={coachNames} onNavigate={() => setDrawer(null)} />
            )}
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
}
