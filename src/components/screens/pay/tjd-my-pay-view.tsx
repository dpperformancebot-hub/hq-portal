"use client";

// My Pay on TJD. Rate times weeks paid, and nothing else: no bonuses, no
// check-in codes. A coach sees only their own roster.

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Kpi, PageHeader, Panel } from "@/components/ui";
import { datedFilename, exportRowsToCsv } from "@/lib/csv";
import { getMyTjdPayAction, type PayrollCoach, type PayrollMonth } from "@/lib/pay/tjd-payroll-actions";
import { monthOptions } from "@/components/screens/pay/tjd-payroll-view";

const aud = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function TjdMyPayView({ initialMonth }: { initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<PayrollMonth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const months = monthOptions();

  const load = useCallback(async (ym: string) => {
    const r = await getMyTjdPayAction(ym);
    if (r.ok) { setData(r.data); setError(null); } else { setError(r.error); setData(null); }
  }, []);
  useEffect(() => { void load(month); }, [month, load]);

  if (error) return <EmptyState title="My Pay" message={error} />;
  if (!data) return <EmptyState title="My Pay" message="Loading the month." />;

  const coach: PayrollCoach | undefined = data.coaches[0];
  if (!coach) return <EmptyState title="My Pay" message="This login is not linked to a coach record yet." />;

  const lines = coach.invoice.lines;
  const exportCsv = () =>
    exportRowsToCsv(datedFilename(`my-pay-${month}`), lines, [
      { header: "Client", value: (l) => l.clientName },
      { header: "Cadence", value: (l) => l.cadence },
      { header: "Type", value: (l) => l.type },
      { header: "Weeks paid", value: (l) => l.weeksInvoiced },
      { header: "Rate per week", value: (l) => l.ratePerWeek },
      { header: "Amount", value: (l) => l.invoiceable },
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Coach tools"
        title="My Pay"
        subtitle={`${coach.coachName}: your rate times the weeks your clients have paid for.`}
        actions={
          <div className="flex items-center gap-2">
            <select
              aria-label="Month"
              className="rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-fg focus:border-accent focus:outline-none"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <Button size="sm" onClick={() => setShowInvoice(true)}>Invoice</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={coach.ownerNoSplit ? "Revenue" : "This month"} value={aud(coach.ownerNoSplit ? coach.invoice.revenue : coach.invoice.payroll)} hint={data.label} />
        <Kpi label="Weeks paid" value={coach.invoice.weeksPaid} hint={`${data.weeks.length} weeks this month`} />
        <Kpi label="Clients" value={coach.invoice.clients} hint="active on your roster" />
        <Kpi label="Next pay" value={`${BRAND_PAYDAY}`} hint="monthly" />
      </div>

      {coach.ownerNoSplit ? (
        <Panel title="Own roster">
          <p className="text-sm text-fg-dim">These clients are tracked at the client price with no coach split, so they show revenue and no payroll.</p>
        </Panel>
      ) : null}

      {!coach.hasRateCard && !coach.ownerNoSplit ? (
        <div className="rounded-card border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-fg">
          You have no rate card yet, so these figures use the brand default. Ask the owner to set your rates.
        </div>
      ) : null}

      {data.issues.length > 0 ? (
        <Panel title={`Needs setup (${data.issues.length})`} subtitle="These clients cannot be rated yet, so they are not in your total.">
          <ul className="space-y-1 text-sm text-fg-dim">
            {data.issues.map((i) => <li key={i.clientName}><span className="text-fg">{i.clientName}</span>: {i.flags.join(" ")}</li>)}
          </ul>
        </Panel>
      ) : null}

      <Panel title={`By client (${lines.length})`} action={<Button size="sm" variant="ghost" onClick={exportCsv}>Export CSV</Button>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.06em] text-fg-muted">
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Cadence</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Weeks paid</th>
                <th className="px-3 py-2 text-right">Rate / wk</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.clientId} className="border-t border-border">
                  <td className="px-3 py-2 text-fg">{l.clientName}</td>
                  <td className="px-3 py-2 capitalize text-fg-dim">{l.cadence}</td>
                  <td className="px-3 py-2 capitalize text-fg-dim">{l.type}{l.overridden ? <span className="ml-1 text-[11px] text-fg-muted">custom</span> : null}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.weeksInvoiced}
                    {l.cappedFifthWeek ? <span className="ml-1 text-[11px] text-warn" title="Pays monthly: one payment covers four weeks.">capped</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{aud(l.ratePerWeek)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{aud(l.invoiceable)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border font-medium text-fg">
                <td className="px-3 py-2" colSpan={5}>Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{aud(coach.invoice.payroll)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {showInvoice ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-card bg-surface p-6 shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display text-xl text-fg">Coach invoice</div>
                <div className="text-sm text-fg-dim">{coach.coachName} · {data.label}</div>
              </div>
              <div className="font-display text-2xl tabular-nums text-fg">{aud(coach.invoice.payroll)}</div>
            </div>
            <table className="mt-5 w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.06em] text-fg-muted">
                  <th className="px-2 py-2">Client</th>
                  <th className="px-2 py-2">Cadence</th>
                  <th className="px-2 py-2 text-right">Weeks</th>
                  <th className="px-2 py-2 text-right">Rate</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.filter((l) => l.invoiceable > 0).map((l) => (
                  <tr key={l.clientId} className="border-t border-border">
                    <td className="px-2 py-2 text-fg">{l.clientName}</td>
                    <td className="px-2 py-2 capitalize text-fg-dim">{l.cadence}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{l.weeksInvoiced}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{aud(l.ratePerWeek)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{aud(l.invoiceable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex justify-between border-t border-border pt-3 font-medium text-fg">
              <span>Total ({coach.invoice.weeksPaid} weeks paid)</span>
              <span className="tabular-nums">{aud(coach.invoice.payroll)}</span>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowInvoice(false)}>Close</Button>
              <Button size="sm" onClick={() => window.print()}>Print or save PDF</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const BRAND_PAYDAY = "5th";
