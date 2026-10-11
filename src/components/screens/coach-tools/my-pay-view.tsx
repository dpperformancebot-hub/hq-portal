"use client";

// My Pay (M6): earnings computed from the coach's REAL weekly check-ins via
// PAY_RULES (Dan's model: full rate on a completed week, ghosted = 50% for the
// first 2 consecutive weeks then $0), plus an onboarding bonus per client and a
// retention bonus per full 10 weeks retained. Every rate and bonus figure comes
// from the brand config; none of them are written into the copy.
//
// R19 (owner 2026-09-30): on a brand with no bonuses, TJD being the case, every
// bonus and retention element is ABSENT rather than zero. A $0 "Bonuses" tile
// tells a coach a bonus exists and happened to be nothing this month, which is
// a lie on a brand whose SOP is rate x weeks paid and nothing else. The rule
// lives in src/lib/pay/pay-display.ts so both brands are unit-testable.
//
// Generate Invoice opens a printable invoice; the Pay Log is the week-by-week
// grid. The code -> pay mapping lives in coach-config.ts (PAY_RULES).

import { useMemo, useState } from "react";
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  Kpi,
  MovableBlock,
  MovableLayout,
  PageHeader,
  Panel,
  SegmentedControl,
  type Column,
} from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { payDisplayFor } from "@/lib/pay/pay-display";
import { datedFilename, exportRowsToCsv, type CsvColumn } from "@/lib/csv";
import type { MyPayData } from "@/lib/data";

const aud = (n: number) => `$${Math.round(n).toLocaleString()}`;
const wkLabel = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

type Line = MyPayData["lines"][number];

// Resolved once at module scope: the brand does not change at runtime.
const PAY_DISPLAY = payDisplayFor(BRAND.pay);

export function MyPayView({
  data,
  payConfigured = true,
  showBonusTracker = true,
}: {
  data: MyPayData;
  /** R10: false when this brand's pay rules are unconfirmed (Brand.pay).
   *  Money KPIs render "rates not set" instead of confident wrong numbers. */
  payConfigured?: boolean;
  /** R12-14: the per-client bonus tracker is owner/admin detail. Plain
   *  coaches want the KPIs + the per-week grid, not the milestone ledger. */
  showBonusTracker?: boolean;
}) {
  const {
    coach,
    lines,
    gross,
    weeklyCount,
    fortnightlyCount,
    onboardingBonus,
    retentionBonus,
    bonusesTotal,
    total,
    nextPayDate,
    cycle,
    payLog,
  } = data;

  // Invoice preview modal: review the line items + totals in-app, then print
  // or save to PDF. Pay Log period: scope the week grid (and its subtotal) to
  // an N-week window, computed client-side from the cells we already have.
  // R12-14: pageBack steps the window into earlier ranges (payLog now carries
  // the full history), so old cycles stay reconcilable.
  const [showInvoice, setShowInvoice] = useState(false);
  const [weeksBack, setWeeksBack] = useState(16);
  const [pageBack, setPageBack] = useState(0);

  const period = useMemo(() => {
    const end = Math.max(0, payLog.weeks.length - pageBack * weeksBack);
    const startIdx = Math.max(0, end - weeksBack);
    const weeks = payLog.weeks.slice(startIdx, end);
    const rows = payLog.rows.map((r) => {
      const cells = r.cells.slice(startIdx, end);
      const total = cells.reduce((s, c) => s + (c?.amount ?? 0), 0);
      return { clientName: r.clientName, ratePerWeek: r.ratePerWeek, cells, total };
    });
    const grand = rows.reduce((s, r) => s + r.total, 0);
    // Totals row: the weekly sum across all clients per column (Dan's Pay Log
    // has this pinned at the top; we render it as the grid footer).
    const weekTotals = weeks.map((_, i) => rows.reduce((s, r) => s + (r.cells[i]?.amount ?? 0), 0));
    return { weeks, rows, grand, weekTotals, hasOlder: startIdx > 0 };
  }, [payLog, weeksBack, pageBack]);

  // Bonus tracker: every client's progress toward their next retention
  // milestone (every full 10 active weeks), sorted by closest-first so the
  // money about to land reads at a glance, dashboard-style.
  const milestones = useMemo(() => {
    return lines
      .filter((l) => l.weeks > 0)
      .map((l) => {
        const into = l.weeks % 10;
        const toNext = into === 0 ? 10 : 10 - into;
        return {
          clientName: l.clientName,
          weeks: l.weeks,
          earnedRetention: l.retentionBonus,
          into,
          toNext,
          nextAt: (Math.floor(l.weeks / 10) + 1) * 10,
        };
      })
      .sort((a, b) => a.toNext - b.toNext || a.clientName.localeCompare(b.clientName));
  }, [lines]);

  const pendingBonuses = useMemo(() => {
    const near = milestones.filter((m) => m.toNext <= 4);
    return { count: near.length, value: near.length * PAY_DISPLAY.retentionPer10Weeks };
  }, [milestones]);

  if (!coach) {
    return (
      <EmptyState
        title="No coach linked"
        message="This login is not linked to a coach yet. The owner links coach accounts in Team settings."
      />
    );
  }

  function generateInvoice() {
    const w = window.open("", "_blank");
    if (!w || !coach) return;
    const today = new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    const rows = lines
      .map(
        (l) =>
          `<tr><td>${l.clientName}</td><td>${l.plan}</td><td class="r">${l.paidWeeks}</td><td class="r">${aud(
            l.earned,
          )}</td></tr>`,
      )
      .join("");
    w.document.write(
      `<!doctype html><html><head><title>Invoice: ${coach.name}</title><meta charset="utf-8"><style>` +
        `body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;max-width:720px;margin:40px auto;padding:0 24px}` +
        `h1{font-size:22px;margin:0 0 2px}.muted{color:#666;font-size:13px}` +
        `table{width:100%;border-collapse:collapse;margin-top:24px;font-size:13px}` +
        `th,td{padding:8px 10px;border-bottom:1px solid #e5e5e5;text-align:left}` +
        `th{color:#666;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.05em}` +
        `.r{text-align:right}.sub{display:flex;justify-content:space-between;font-size:13px;padding:4px 10px}` +
        `.tot{font-size:18px;font-weight:600;text-align:right;margin-top:16px;border-top:2px solid #111;padding-top:10px}` +
        `</style></head><body>` +
        `<h1>Coach Invoice</h1><div class="muted">${coach.name} &middot; ${today}</div>` +
        `<table><thead><tr><th>Client</th><th>Plan</th><th class="r">Paid weeks</th><th class="r">Earned</th></tr></thead><tbody>${rows}</tbody></table>` +
        `<div class="sub"><span>Weekly pay</span><span>${aud(gross)}</span></div>` +
        (PAY_DISPLAY.hasBonuses
          ? `<div class="sub"><span>Onboarding bonus</span><span>${aud(onboardingBonus)}</span></div>` +
            `<div class="sub"><span>Retention bonus</span><span>${aud(retentionBonus)}</span></div>`
          : "") +
        `<div class="tot">Total: ${aud(total)}</div>` +
        `<script>window.onload=function(){window.print()}<\/script></body></html>`,
    );
    w.document.close();
  }

  const columns: Column<Line>[] = [
    { key: "client", header: "Client", csvValue: (l) => l.clientName, render: (l) => <span className="text-fg">{l.clientName}</span> },
    { key: "plan", header: "Plan", csvValue: (l) => l.plan, render: (l) => l.plan },
    { key: "rate", header: "Rate / wk", align: "right", csvValue: (l) => l.ratePerWeek, render: (l) => <span className="tabular-nums">{aud(l.ratePerWeek)}</span> },
    {
      key: "paid",
      header: "Paid weeks",
      align: "right",
      csvValue: (l) => l.paidWeeks,
      render: (l) => (
        <span className="tabular-nums">
          {l.paidWeeks}
          {l.ghostedWeeks ? <span className="text-fg-muted"> (+{l.ghostedWeeks} G)</span> : null}
        </span>
      ),
    },
    { key: "earned", header: "Earned", align: "right", csvValue: (l) => l.earned, render: (l) => <span className="tabular-nums">{aud(l.earned)}</span> },
    // csvValue rides on the column, so dropping it here drops it from the CSV
    // export too. That is the intent: no empty Retention column in the file.
    ...(PAY_DISPLAY.hasBonuses
      ? ([{
          key: "retention",
          header: "Retention",
          align: "right",
          csvValue: (l: Line) => l.retentionBonus,
          render: (l: Line) => <span className="tabular-nums">{l.retentionBonus ? aud(l.retentionBonus) : "-"}</span>,
        }] as Column<Line>[])
      : []),
  ];

  // Pay Log CSV: the period grid as columns (Client, $/wk, one per week showing
  // the status code, Total) so payroll can reconcile week by week.
  const exportPayLog = () => {
    const cols: CsvColumn<(typeof period.rows)[number]>[] = [
      { header: "Client", value: (r) => r.clientName },
      { header: "$/wk", value: (r) => r.ratePerWeek },
      ...period.weeks.map((wk, i) => ({ header: wkLabel(wk), value: (r: (typeof period.rows)[number]) => r.cells[i]?.code || "" })),
      { header: "Total", value: (r) => Math.round(r.total) },
    ];
    exportRowsToCsv(
      datedFilename(`pay-log-${weeksBack}wk${pageBack ? `-${pageBack * weeksBack}back` : ""}`),
      period.rows,
      cols,
    );
  };

  // Dan's Pay Log color rules: green = full pay, yellow = reduced pay (the
  // first two ghosted weeks at 50%), red = a payable code that earned $0
  // (ghosted 3+ / missed), paused stays neutral, blank = no week logged.
  const cellClass = (c: { code: string; amount: number } | null, ratePerWeek: number) => {
    if (!c || !c.code) return "text-fg-muted";
    const code = c.code.toUpperCase();
    if (code === "P") return "text-fg-muted";
    if (c.amount >= ratePerWeek) return "bg-positive-soft text-positive";
    if (c.amount > 0) return "bg-warn-soft text-warn";
    if (code === "C") return "text-fg-muted";
    return "bg-danger-soft text-danger";
  };

  return (
    // flex + gap (not space-y): blocks reorder via CSS order (MovableBlock),
    // and margins would stick to DOM order rather than visual order.
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Coach tools"
        title="My Pay"
        subtitle={`${coach.name}: pay from your logged check-ins`}
        actions={
          <Button size="sm" onClick={() => setShowInvoice(true)}>
            Generate invoice
          </Button>
        }
      />

      <MovableLayout storageKey="my-pay">
      <MovableBlock id="kpis">
      {/* A6 (owner rule): no all-time "total earned" here; the headline is the
          coming pay cycle. History stays reconcilable via the Pay Log below. */}
      {!payConfigured ? (
        <div className="mb-4 rounded-card border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-fg">
          <span className="font-medium">Pay rules not set for this brand yet.</span> Rates{PAY_DISPLAY.hasBonuses ? ", bonuses" : ""} and payday
          need the owner&apos;s numbers before figures show here. Your check-in log below is real and already counts.
        </div>
      ) : null}
      {/* The column count follows the number of tiles actually rendered, so a
          no-bonus brand gets two full-width tiles rather than two empty holes. */}
      <div className={`grid grid-cols-2 gap-4 ${PAY_DISPLAY.hasBonuses ? "lg:grid-cols-4" : "lg:grid-cols-2"}`}>
        <Kpi label="This pay cycle" value={payConfigured ? aud(cycle.gross) : "-"} hint={payConfigured ? `check-in pay, ${cycle.label}` : "rates not set"} />
        {PAY_DISPLAY.hasBonuses ? (
          <>
            <Kpi label="Bonuses" value={payConfigured ? aud(bonusesTotal) : "-"} hint={payConfigured ? "onboarding + retention" : "rates not set"} />
            <Kpi
              label="Pending bonuses"
              value={payConfigured ? aud(pendingBonuses.value) : "-"}
              hint={
                !payConfigured
                  ? "rates not set"
                  : pendingBonuses.count
                    ? `${pendingBonuses.count} client${pendingBonuses.count === 1 ? "" : "s"} within 4 wks of a milestone`
                    : "no milestones within 4 wks"
              }
            />
          </>
        ) : null}
        <Kpi label="Next pay" value={payConfigured ? nextPayDate : "-"} hint={payConfigured ? undefined : "payday not set"} />
      </div>
      </MovableBlock>

      <MovableBlock id="how-calculated">
      <Card>
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">How this is calculated</div>
        {payConfigured ? (
          <p className="mt-1 text-sm text-fg-dim">
            From your real weekly check-ins: {aud(coach.weeklyRate)}/wk Weekly, {aud(coach.fortnightlyRate)}/wk
            Fortnightly, full pay on a completed week, ghosted weeks at half for the first two then nothing.
            {PAY_DISPLAY.hasBonuses ? (
              <>
                {" "}
                Plus {aud(onboardingBonus)} onboarding and {aud(retentionBonus)} retention (
                {aud(PAY_DISPLAY.retentionPer10Weeks)} per full 10 weeks).
              </>
            ) : (
              <> Your rate times the weeks you are paid for, and nothing else.</>
            )}{" "}
            Exact per-code rules live in one config and are easy to adjust.
          </p>
        ) : (
          <p className="mt-1 text-sm text-fg-dim">
            Pay will be computed from your real weekly check-ins once this brand&apos;s rates, bonuses and payday are
            configured. Nothing shown here yet is a promise; your check-in history below is the real input.
          </p>
        )}
      </Card>
      </MovableBlock>

      {/* Wrapped too (not in the original block list): an unwrapped sibling
          would default to CSS order 0 and jump above every ordered block. */}
      {showBonusTracker && PAY_DISPLAY.hasBonuses ? (
      <MovableBlock id="bonus-tracker">
      <Panel
        title="Bonus tracker"
        action={
          <span className="text-xs text-fg-dim">
            <span className="font-medium tabular-nums text-fg">{aud(retentionBonus)}</span> retention earned ·{" "}
            <span className="font-medium tabular-nums text-fg">{aud(onboardingBonus)}</span> onboarding ·{" "}
            <span className="font-medium tabular-nums text-warn">{aud(pendingBonuses.value)}</span> landing within 4 wks
          </span>
        }
      >
        {milestones.length === 0 ? (
          <EmptyState
            title="No milestones yet"
            message={`Each client earns you ${aud(PAY_DISPLAY.retentionPer10Weeks)} for every full 10 weeks retained. Progress appears as weeks accrue.`}
          />
        ) : (
          <div className="space-y-1">
            {milestones.map((m) => {
              const close = m.toNext <= 4;
              return (
                <div
                  key={m.clientName}
                  className="grid grid-cols-[minmax(0,1.2fr)_minmax(120px,2fr)_auto] items-center gap-3 rounded-control px-2 py-1.5 transition-colors hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-fg">{m.clientName}</div>
                    <div className="text-[11px] tabular-nums text-fg-muted">
                      wk {m.weeks}
                      {m.earnedRetention ? ` · ${aud(m.earnedRetention)} earned` : ""}
                    </div>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-pill bg-surface-2"
                    role="progressbar"
                    aria-valuenow={m.into}
                    aria-valuemin={0}
                    aria-valuemax={10}
                    aria-label={`${m.clientName}: ${m.into} of 10 weeks to the next retention bonus`}
                  >
                    <div
                      className={`h-full rounded-pill ${close ? "bg-warn" : "bg-accent"}`}
                      style={{ width: `${(m.into / 10) * 100}%` }}
                    />
                  </div>
                  <div className={`text-right text-xs tabular-nums ${close ? "font-medium text-warn" : "text-fg-dim"}`}>
                    {m.toNext} wk{m.toNext === 1 ? "" : "s"} to {aud(PAY_DISPLAY.retentionPer10Weeks)}
                    <span className="text-fg-muted"> (wk {m.nextAt})</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
      </MovableBlock>
      ) : null}

      <MovableBlock id="by-client">
      <Panel title={`By client (${lines.length})`}>
        {lines.length === 0 ? (
          <EmptyState title="No clients yet" message="Pay lines appear as clients and their check-ins land." />
        ) : (
          <DataTable
            columns={columns}
            data={lines}
            getRowKey={(l) => l.clientName}
            exportFilename={datedFilename("my-pay")}
            defaultSort={{ key: "earned", dir: "desc" }}
            searchable={{ placeholder: "Search clients", getText: (l) => l.clientName }}
          />
        )}
      </Panel>
      </MovableBlock>

      <MovableBlock id="pay-log">
      <Panel
        title="Pay Log"
        subtitle="Derived from your logged check-ins. Code corrections happen in the Check-ins grid."
        action={
          <div className="flex items-center gap-3">
            <span className="text-xs text-fg-dim">
              Period: <span className="font-medium tabular-nums text-fg">{aud(period.grand)}</span>
            </span>
            <div className="flex items-center gap-1.5 text-xs text-fg-dim">
              <button
                type="button"
                onClick={() => setPageBack((p) => p + 1)}
                disabled={!period.hasOlder}
                className="rounded-control border border-border px-2.5 py-1 font-medium transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                title="Show earlier weeks"
              >
                ← Older
              </button>
              <button
                type="button"
                onClick={() => setPageBack((p) => Math.max(0, p - 1))}
                disabled={pageBack === 0}
                className="rounded-control border border-border px-2.5 py-1 font-medium transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                title="Show later weeks"
              >
                Newer →
              </button>
              {pageBack > 0 ? (
                <span className="tabular-nums">{pageBack * weeksBack} wks back</span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={exportPayLog}
              disabled={period.rows.length === 0}
              className="rounded-control border border-border px-2.5 py-1 text-xs font-medium text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
              title="Download the pay log grid as a CSV"
            >
              Export CSV
            </button>
            <SegmentedControl
              aria-label="Pay log period"
              size="sm"
              value={String(weeksBack)}
              onChange={(v) => {
                setWeeksBack(Number(v));
                setPageBack(0);
              }}
              options={[
                { label: "4 wks", value: "4" },
                { label: "8 wks", value: "8" },
                { label: "12 wks", value: "12" },
                { label: "16 wks", value: "16" },
              ]}
            />
          </div>
        }
      >
        {period.rows.length === 0 ? (
          <EmptyState title="No check-ins yet" message="The week-by-week pay grid fills as check-ins land." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: "collapse", whiteSpace: "nowrap" }}>
              <thead>
                <tr className="text-fg-muted">
                  <th className="sticky left-0 bg-surface px-2 py-1.5 text-left">Client</th>
                  <th className="px-2 py-1.5 text-right">$/wk</th>
                  {period.weeks.map((wk) => (
                    <th key={wk} className="px-2 py-1.5 text-center font-medium">
                      {wkLabel(wk)}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {period.rows.map((r) => (
                  <tr key={r.clientName} className="border-t border-border-soft">
                    <td className="sticky left-0 bg-surface px-2 py-1.5 font-medium text-fg">{r.clientName}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-fg-dim">{aud(r.ratePerWeek)}</td>
                    {r.cells.map((c, i) => (
                      <td key={i} className={`px-2 py-1.5 text-center ${cellClass(c, r.ratePerWeek)}`}>
                        {c?.code || "·"}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums text-fg">{aud(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-medium text-fg">
                  <td className="sticky left-0 bg-surface px-2 py-1.5">Weekly total</td>
                  <td />
                  {period.weekTotals.map((t, i) => (
                    <td key={i} className="px-2 py-1.5 text-center tabular-nums">
                      {t > 0 ? aud(t) : "·"}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums">{aud(period.grand)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
      </MovableBlock>
      </MovableLayout>

      {/* Invoice modal: fixed overlay, stays outside the movable layout. */}
      {showInvoice ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Invoice preview"
          onClick={() => setShowInvoice(false)}
        >
          <Card className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display text-lg tracking-display text-fg">Coach invoice</div>
                <div className="text-xs text-fg-dim">
                  {coach.name} ·{" "}
                  {new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                </div>
              </div>
              <span className="font-display text-2xl tabular-nums tracking-display text-fg">{aud(total)}</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-control border border-border-soft">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-fg-muted">
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.05em]">Client</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.05em]">Plan</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.05em]">Weeks</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.05em]">Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.clientName} className="border-t border-border-soft">
                      <td className="px-3 py-2 text-fg">{l.clientName}</td>
                      <td className="px-3 py-2 text-fg-dim">{l.plan}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.paidWeeks}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{aud(l.earned)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-fg-dim">
                <span>Weekly pay ({weeklyCount} weekly, {fortnightlyCount} fortnightly)</span>
                <span className="tabular-nums">{aud(gross)}</span>
              </div>
              {PAY_DISPLAY.hasBonuses ? (
                <>
                  <div className="flex justify-between text-fg-dim">
                    <span>Onboarding bonus</span>
                    <span className="tabular-nums">{aud(onboardingBonus)}</span>
                  </div>
                  <div className="flex justify-between text-fg-dim">
                    <span>Retention bonus</span>
                    <span className="tabular-nums">{aud(retentionBonus)}</span>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between border-t border-border pt-2 font-medium text-fg">
                <span>Total</span>
                <span className="tabular-nums">{aud(total)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowInvoice(false)}>
                Close
              </Button>
              <Button size="sm" onClick={generateInvoice}>
                Print or save PDF
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
