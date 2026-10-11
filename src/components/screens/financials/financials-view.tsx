"use client";

import { useState } from "react";
import {
  AreaChart,
  DataTable,
  Kpi,
  MovableBlock,
  MovableLayout,
  PageHeader,
  Panel,
  PieChart,
  SegmentedControl,
  type Column,
} from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { DEMO_MODE } from "@/lib/demo";
import { datedFilename } from "@/lib/csv";
import { ExpensesPanel } from "@/components/screens/financials/expenses-panel";
import type { Expense } from "@/lib/expenses-actions";
import type { getFinancials, Transaction, TransactionStatus } from "@/lib/seed";

// Live mode has no Stripe feed yet: ARR/LTV are billing run-rate estimates and
// the transactions list is empty until Stripe lands. Demo mode shows seeded
// cash facts. See src/lib/live/index.ts getFinancials.
const LIVE = !DEMO_MODE;

type Financials = ReturnType<typeof getFinancials>;
type Payout = Financials["payouts"][number];

const TX_STATUS: Record<TransactionStatus, { label: string; chip: string }> = {
  paid: { label: "Paid", chip: "bg-positive-soft text-positive" },
  refunded: { label: "Refunded", chip: "bg-warn-soft text-warn" },
  past_due: { label: "Past due", chip: "bg-danger-soft text-danger" },
};

const money = (n: number) => `$${n.toLocaleString()}`;

// Coach fee is a per-brand setting (Brand.coachFeePct, V2-02), labelled with
// its percentage so the deduction is never a mystery number. At 0% the Fee
// column drops out and Net equals Gross.
const FEE_PCT_LABEL = `${Math.round(BRAND.coachFeePct * 100)}%`;
const ALL_PAYOUT_COLUMNS: Column<Payout>[] = [
  { key: "name", header: "Coach", csvValue: (p) => p.name, render: (p) => <span className="font-medium text-fg">{p.name}</span> },
  { key: "gross", header: "Gross", align: "right", csvValue: (p) => p.gross, render: (p) => money(p.gross) },
  {
    key: "fee",
    header: `Fee (${FEE_PCT_LABEL})`,
    align: "right",
    csvValue: (p) => p.fee,
    render: (p) => (
      <span className="text-fg-dim" title={`Coach fee: ${FEE_PCT_LABEL} of gross, configured per brand. Placeholder pending payroll confirmation.`}>
        -{money(p.fee)}
      </span>
    ),
  },
  { key: "net", header: "Net", align: "right", csvValue: (p) => p.net, render: (p) => <span className="font-medium text-fg">{money(p.net)}</span> },
];
const PAYOUT_COLUMNS = ALL_PAYOUT_COLUMNS.filter((c) => BRAND.coachFeePct > 0 || c.key !== "fee");

const TX_COLUMNS: Column<Transaction>[] = [
  { key: "date", header: "Date", width: "120px", csvValue: (t) => t.date, render: (t) => <span className="text-fg-dim">{t.date}</span> },
  { key: "clientName", header: "Client", csvValue: (t) => t.clientName, render: (t) => <span className="text-fg">{t.clientName}</span> },
  { key: "plan", header: "Plan", width: "110px", csvValue: (t) => t.plan, render: (t) => <span className="text-fg-dim">{t.plan}</span> },
  { key: "amount", header: "Amount", align: "right", width: "110px", csvValue: (t) => t.amount, render: (t) => money(t.amount) },
  { key: "source", header: "Source", width: "100px", csvValue: (t) => t.source, render: (t) => <span className="text-fg-dim">{t.source}</span> },
  {
    key: "status",
    header: "Status",
    width: "110px",
    csvValue: (t) => TX_STATUS[t.status].label,
    render: (t) => (
      <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium ${TX_STATUS[t.status].chip}`}>
        {TX_STATUS[t.status].label}
      </span>
    ),
  },
];

export function FinancialsView({
  financials,
  expenses = [],
  isOwner = false,
}: {
  financials: Financials;
  expenses?: Expense[];
  isOwner?: boolean;
}) {
  const [range, setRange] = useState("6M");
  // H2: MRR split mode (by plan, or PIF vs genuine recurring).
  const [splitMode, setSplitMode] = useState("plan");
  const f = financials;

  // In live mode the cash facts (collected, refunds, past-due, transactions)
  // come from Stripe behind STRIPE_SECRET_KEY. Until the key is set they are
  // honest zeros and we say so; the MRR run-rate estimate carries the screen.
  const notConnected = LIVE && !f.stripeConnected;
  const cashHint = notConnected ? "Stripe not connected" : LIVE ? "last 30 days" : "seeded";
  const refundsHint = notConnected ? "Stripe not connected" : "this period";
  const pastDueHint = notConnected
    ? "Stripe not connected"
    : `${f.pastDueCount} ${f.pastDueCount === 1 ? "account" : "accounts"}`;

  return (
    // flex + gap (not space-y): blocks reorder via CSS order (MovableBlock),
    // and margins would stick to DOM order rather than visual order.
    <div className="flex flex-col gap-6">
      <PageHeader
        back
        eyebrow="Operations"
        title="Financials"
        subtitle={
          notConnected
            ? "Recurring revenue and payouts. Cash, refunds, and past-due read from Stripe once the key is set."
            : "Recurring revenue, payouts, and transactions. Cash, refunds, and past-due read from Stripe."
        }
        actions={
          <SegmentedControl
            aria-label="Range"
            size="sm"
            value={range}
            onChange={setRange}
            options={[
              { label: "1M", value: "1M" },
              { label: "3M", value: "3M" },
              { label: "6M", value: "6M" },
              { label: "1Y", value: "1Y" },
              { label: "Custom", value: "Custom" },
            ]}
          />
        }
      />

      <MovableLayout storageKey="financials">
      <MovableBlock id="kpis">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="MRR" value={f.mrr} prefix="$" hint={`$${f.arr.toLocaleString()} ARR estimate`} />
        <Kpi label="Cash collected" value={f.cashCollected30d} prefix="$" hint={cashHint} />
        <Kpi label="Refunds" value={f.refunds} prefix="$" hint={refundsHint} />
        <Kpi label="Past due" value={f.pastDue} prefix="$" hint={pastDueHint} />
      </div>
      </MovableBlock>

      <MovableBlock id="trend-plan-breakdown">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <Panel title="Revenue trend" className="lg:col-span-2">
          <AreaChart data={f.revenueSeries} xKey="month" yKey="value" valuePrefix="$" height={240} />
        </Panel>
        {/* H2: MRR split pie. By plan, or PIF/bulk vs genuine recurring (WRR)
            derived from billing frequency + term length; unknown shown
            honestly when the data carries no signal. */}
        <Panel
          title="MRR split"
          action={
            <SegmentedControl
              aria-label="MRR split mode"
              size="sm"
              value={splitMode}
              onChange={setSplitMode}
              options={[
                { label: "By plan", value: "plan" },
                { label: "PIF vs WRR", value: "pif" },
              ]}
            />
          }
        >
          {splitMode === "plan" ? (
            <PieChart
              data={f.planBreakdown.map((p) => ({ label: p.plan, value: p.value }))}
              valuePrefix="$"
              height={180}
            />
          ) : (
            <>
              <PieChart
                data={[
                  { label: "Recurring (WRR)", value: f.mrrSplit.recurring },
                  { label: "PIF / bulk", value: f.mrrSplit.pif },
                  { label: "No billing signal", value: f.mrrSplit.unknown },
                ]}
                valuePrefix="$"
                height={180}
              />
              {f.mrrSplit.unknown > 0 ? (
                <p className="mt-2 text-xs text-fg-muted">
                  &quot;No billing signal&quot; means the client&apos;s billing frequency and term length fields are
                  empty in GHL; fill them and this split sharpens.
                </p>
              ) : null}
            </>
          )}
        </Panel>
      </div>
      </MovableBlock>

      {/* Stacked: these tables need more width than half a row affords at common widths. */}
      <MovableBlock id="coach-payouts">
        <Panel
          title="Coach payouts"
          subtitle={
            BRAND.pay.confirmed
              ? `Computed from plan rates. Fee is the coach fee setting (${FEE_PCT_LABEL} of gross, set per brand), pending payroll confirmation.`
              : "ESTIMATES on unconfirmed default rates: this brand's pay rules are not set yet, so treat every figure here as provisional."
          }
          flush
        >
          <DataTable columns={PAYOUT_COLUMNS} data={f.payouts} getRowKey={(p) => p.coachId} exportFilename={datedFilename("coach-payouts")} />
        </Panel>
      </MovableBlock>
      <MovableBlock id="expenses">
        <ExpensesPanel expenses={expenses} isOwner={isOwner} />
      </MovableBlock>
      <MovableBlock id="transactions">
        <Panel
          title="Recent transactions"
          subtitle={
            notConnected
              ? "Stripe not connected. Set STRIPE_SECRET_KEY to read live charges."
              : LIVE
                ? "Live charges from Stripe."
                : "Seeded. Live charges read from Stripe when connected."
          }
          flush
        >
          <DataTable columns={TX_COLUMNS} data={f.transactions} getRowKey={(t) => t.id} exportFilename={datedFilename("transactions")} />
        </Panel>
      </MovableBlock>
      </MovableLayout>
    </div>
  );
}
