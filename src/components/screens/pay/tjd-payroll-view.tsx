"use client";

// TJD payroll (R19-5). The ticking screen the master workbook's W1-W5 columns
// are, plus the Overview tab's totals. Owner and admin only.

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Kpi, PageHeader, Panel, useToast } from "@/components/ui";
import {
  getTjdPayrollAction,
  setPaidWeekAction,
  tickAllWeeksAction,
  type PayrollMonth,
} from "@/lib/pay/tjd-payroll-actions";

const aud = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function monthOptions(count = 14): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({
      value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }),
    });
  }
  return out;
}

export function TjdPayrollView({ initialMonth }: { initialMonth: string }) {
  const toast = useToast();
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<PayrollMonth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const months = monthOptions();

  const load = useCallback(async (ym: string) => {
    const r = await getTjdPayrollAction(ym);
    if (r.ok) { setData(r.data); setError(null); } else { setError(r.error); setData(null); }
  }, []);
  useEffect(() => { void load(month); }, [month, load]);

  async function toggle(clientId: string, weekStart: string, next: boolean) {
    setBusy(`${clientId}:${weekStart}`);
    try {
      const r = await setPaidWeekAction(clientId, weekStart, next);
      if (!r.ok) { toast.push(r.error); return; }
      await load(month);
    } finally { setBusy(null); }
  }

  async function tickAll(clientId: string, next: boolean) {
    setBusy(clientId);
    try {
      const r = await tickAllWeeksAction(clientId, month, next);
      if (!r.ok) toast.push(r.error);
      await load(month);
    } finally { setBusy(null); }
  }

  async function tickCoach(clientIds: string[], next: boolean) {
    setBusy(clientIds.join(","));
    try {
      for (const id of clientIds) await tickAllWeeksAction(id, month, next);
      await load(month);
    } finally { setBusy(null); }
  }

  if (error) return <EmptyState title="Payroll" message={error} />;
  if (!data) return <EmptyState title="Payroll" message="Loading the month." />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Money"
        title="Payroll"
        subtitle="Pay is rate times weeks paid. Tick a week when that client's payment lands."
        actions={
          <select
            aria-label="Month"
            className="rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-fg focus:border-accent focus:outline-none"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          >
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Total payroll" value={aud(data.totals.payroll)} hint={data.label} />
        <Kpi label="Revenue" value={aud(data.totals.revenue)} hint="what clients paid" />
        <Kpi label="Brand keeps" value={aud(data.totals.brandKeeps)} hint="revenue minus payroll" />
        <Kpi label="Weeks paid" value={data.totals.weeksPaid} hint={`${data.weeks.length} weeks this month`} />
        <Kpi label="Active clients" value={data.totals.clients} hint="across all coaches" />
      </div>

      {data.issues.length > 0 ? (
        <Panel title={`Needs attention (${data.issues.length})`} subtitle="These clients are not being paid correctly yet.">
          <ul className="space-y-1 text-sm text-fg-dim">
            {data.issues.slice(0, 20).map((i) => (
              <li key={`${i.coachName}-${i.clientName}`}>
                <span className="text-fg">{i.clientName}</span> ({i.coachName}): {i.flags.join(" ")}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="Overview" subtitle="Per coach, the way the master sheet's Overview tab reads.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.06em] text-fg-muted">
                <th className="px-3 py-2">Coach</th>
                <th className="px-3 py-2 text-right">Clients</th>
                <th className="px-3 py-2 text-right">Weeks paid</th>
                <th className="px-3 py-2 text-right">Payroll</th>
                <th className="px-3 py-2 text-right">Revenue</th>
                <th className="px-3 py-2 text-right">Brand keeps</th>
              </tr>
            </thead>
            <tbody>
              {data.coaches.map((c) => (
                <tr key={c.coachId} className="border-t border-border">
                  <td className="px-3 py-2 text-fg">
                    {c.coachName}
                    {c.ownerNoSplit ? <span className="ml-2 rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted">no coach split</span> : null}
                    {!c.hasRateCard && !c.ownerNoSplit ? <span className="ml-2 rounded-pill bg-warn-soft px-2 py-0.5 text-[11px] text-warn">no rate card</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.invoice.clients}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.invoice.weeksPaid}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.ownerNoSplit ? "-" : aud(c.invoice.payroll)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{aud(c.invoice.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{aud(c.invoice.brandKeeps)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border font-medium text-fg">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{data.totals.clients}</td>
                <td className="px-3 py-2 text-right tabular-nums">{data.totals.weeksPaid}</td>
                <td className="px-3 py-2 text-right tabular-nums">{aud(data.totals.payroll)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{aud(data.totals.revenue)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{aud(data.totals.brandKeeps)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {data.coaches.map((coach) => (
        <Panel
          key={coach.coachId}
          title={`${coach.coachName} (${coach.clients.length})`}
          subtitle={coach.ownerNoSplit ? "Own roster: revenue only, no coach split." : `${aud(coach.invoice.payroll)} this month`}
          action={
            coach.clients.length > 0 ? (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => tickCoach(coach.clients.map((c) => c.clientId), true)}>Tick all weeks</Button>
                <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => tickCoach(coach.clients.map((c) => c.clientId), false)}>Clear</Button>
              </div>
            ) : null
          }
        >
          {coach.clients.length === 0 ? (
            <EmptyState title="No active clients" message="Nothing to pay for this month." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.06em] text-fg-muted">
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Cadence</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Pays</th>
                    {data.weeks.map((w) => (
                      <th key={w.start} className="px-2 py-2 text-center" title={`${w.start} to ${w.end}`}>{w.label}</th>
                    ))}
                    <th className="px-3 py-2 text-right">Weeks</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {coach.clients.map((c) => {
                    const line = coach.invoice.lines.find((l) => l.clientId === c.clientId);
                    const monthlyCap = c.payer === "monthly";
                    return (
                      <tr key={c.clientId} className="border-t border-border">
                        <td className="px-3 py-2 text-fg">
                          {c.clientName}
                          {c.flags.length ? <span className="ml-2 rounded-pill bg-warn-soft px-2 py-0.5 text-[11px] text-warn" title={c.flags.join(" ")}>needs setup</span> : null}
                        </td>
                        <td className="px-3 py-2 capitalize text-fg-dim">{c.cadence ?? <span className="text-warn">not set</span>}</td>
                        <td className="px-3 py-2 capitalize text-fg-dim">{c.type}</td>
                        <td className="px-3 py-2 capitalize text-fg-dim">{c.payer}</td>
                        {data.weeks.map((w, i) => {
                          const on = c.paidWeeks.includes(w.start);
                          const blocked = monthlyCap && !on && c.paidWeeks.length >= 4 && i >= 4;
                          return (
                            <td key={w.start} className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                className="h-4 w-4 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-40"
                                checked={on}
                                disabled={blocked || busy === `${c.clientId}:${w.start}` || !c.cadence}
                                title={blocked ? "Pays monthly: one payment covers four weeks." : !c.cadence ? "Set a cadence first." : `${w.start} to ${w.end}`}
                                onChange={(e) => toggle(c.clientId, w.start, e.target.checked)}
                                aria-label={`${c.clientName} ${w.label} paid`}
                              />
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right tabular-nums">
                          {line?.weeksInvoiced ?? 0}
                          {line?.cappedFifthWeek ? <span className="ml-1 text-[11px] text-warn" title="Monthly payer: the fifth week is not invoiceable.">capped</span> : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{aud(line?.invoiceable ?? 0)}</td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            className="text-[11px] text-fg-muted hover:text-accent disabled:opacity-50"
                            disabled={!!busy || !c.cadence}
                            onClick={() => tickAll(c.clientId, c.paidWeeks.length < data.weeks.length)}
                          >
                            {c.paidWeeks.length ? "clear" : "all"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ))}
    </div>
  );
}
