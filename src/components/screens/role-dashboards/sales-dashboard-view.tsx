"use client";

// SALES dashboard (M6, BUILD-SPEC spec): leads by source, leads to action,
// consults booked vs completed, close rate, onboarded, follow-ups, top
// sources, plus the DMs section. Pipeline metrics light up automatically
// when opportunities are imported into GHL. Show-up rate and the whole DM
// feed are awaiting-live-source (messaging backend is retainer phase),
// rendered as labelled placeholders, never as fake numbers.

import { Card, EmptyState, Kpi, PageHeader, Panel } from "@/components/ui";
import type { SalesDashboardData } from "@/lib/data";

function AwaitingStat({ label, note }: { label: string; note: string }) {
  return (
    <Card>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">{label}</div>
      <div className="mt-1 text-sm text-fg-dim">{note}</div>
    </Card>
  );
}

export function SalesDashboardView({ data, preview = false }: { data: SalesDashboardData; preview?: boolean }) {
  const d = data;
  const maxSource = Math.max(1, ...d.bySource.map((s) => s.count));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Dashboard"
        subtitle={preview ? "Owner preview of the sales view" : "Your pipeline at a glance."}
      />

      {d.pipelineEmpty ? (
        <Card>
          <EmptyState
            title="No pipeline data yet"
            message="These numbers light up automatically once opportunities are imported into GHL. Stage mapping is already in place."
          />
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="New leads" value={d.newLeads} />
        <Kpi label="Leads to action" value={d.toAction} />
        <Kpi label="Consults booked" value={d.consultsBooked} />
        <Kpi label="Consults completed" value={d.consultsCompleted} />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          label="Close rate"
          value={d.closeRatePct === null ? "-" : Math.round(d.closeRatePct)}
          suffix={d.closeRatePct === null ? "" : "%"}
          hint={d.closeRatePct === null ? "no decided leads yet" : "won vs lost"}
        />
        <Kpi label="Onboarded" value={d.onboarded} hint="processing + submitted" />
        <Kpi label="Follow-ups" value={d.followUps} />
        <Kpi label="Show-up rate" value="-" hint="awaiting call feed" />
      </div>

      <Panel title="Top lead sources">
        {d.bySource.length === 0 ? (
          <EmptyState title="No sources yet" message="Source split appears with the first imported leads." />
        ) : (
          <ul className="space-y-2">
            {d.bySource.slice(0, 6).map((s) => (
              <li key={s.source} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-fg-dim">{s.source}</span>
                <span className="h-2 rounded-pill bg-accent/70" style={{ width: `${(s.count / maxSource) * 100}%` }} />
                <span className="tabular-nums text-fg">{s.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="DMs (outbound and inbound)"
        subtitle={
          d.dm
            ? "Live from the connected WhatsApp / Instagram inbox"
            : "Awaiting live source: the DM feed arrives with the messaging backend"
        }
      >
        {/* BUILD-SPEC line 170: five DM metrics. Inbound/active are LIVE from
            the GHL conversation feed (2026-07-03); outbound targets, sequence
            tracking and conversation->consult need send tracking, still
            honest placeholders. */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {d.dm ? (
            <>
              <Kpi label="Inbound to respond" value={d.dm.inboundToRespond} hint="unread threads" />
              <Kpi label="Conversations active" value={d.dm.conversationsActive} hint="open threads" />
            </>
          ) : (
            <>
              <AwaitingStat label="Inbound to respond" note="Awaiting DM feed" />
              <AwaitingStat label="Conversations active" note="Awaiting DM feed" />
            </>
          )}
          <AwaitingStat label="Outbound sent vs target" note="Arrives with send tracking" />
          <AwaitingStat label="Follow-up sequence" note="Arrives with send tracking" />
          <AwaitingStat label="Conversation to consult" note="Arrives with send tracking" />
        </div>
      </Panel>
    </div>
  );
}
