"use client";

import { AreaChart, DataTable, Kpi, PageHeader, Panel, type Column } from "@/components/ui";
import type { AnalyticsData } from "@/lib/data";

type SourceRow = AnalyticsData["sourcePerf"][number];

const SOURCE_COLUMNS: Column<SourceRow>[] = [
  { key: "source", header: "Source", render: (s) => <span className="font-medium text-fg">{s.source}</span> },
  { key: "leads", header: "Leads", align: "right", render: (s) => s.leads },
  { key: "calls", header: "Calls", align: "right", render: (s) => s.calls },
  { key: "closed", header: "Closed", align: "right", render: (s) => s.closed },
  { key: "conv", header: "Conv %", align: "right", sortValue: (s) => s.convPct, render: (s) => `${s.convPct}%` },
  { key: "revenue", header: "Revenue", align: "right", render: (s) => `$${s.revenue.toLocaleString()}` },
];

/** KPI that shows "-" when its source is not connected yet (null), instead of a
 *  misleading 0. Avoids appending the unit suffix to the dash. */
function KpiVal({ label, value, suffix }: { label: string; value: number | null; suffix: string }) {
  return value == null ? (
    <Kpi label={label} value="-" hint="Awaiting source" />
  ) : (
    <Kpi label={label} value={value} suffix={suffix} />
  );
}

export function AnalyticsView({
  analytics,
  showMoney = true,
}: {
  analytics: AnalyticsData;
  /** false for a money-blind coach (TJD head coach by URL): no revenue column.
   *  The page already zeroed the figures server-side. */
  showMoney?: boolean;
}) {
  const a = analytics;
  const funnelMax = Math.max(...a.funnel.map((f) => f.count), 1);

  return (
    <div className="space-y-6">
      <PageHeader back eyebrow="Insights" title="Analytics" subtitle="Funnel, retention, and lead source performance." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiVal label="Conversion" value={a.kpis.conversionPct} suffix="%" />
        <KpiVal label="Avg time to close" value={a.kpis.avgDaysToClose} suffix="d" />
        <KpiVal label="Show-up rate" value={a.kpis.showUpRatePct} suffix="%" />
        <KpiVal label="Avg tenure" value={a.kpis.avgTenureWeeks} suffix="w" />
        {/* R8-3: total across all coaches (D2 tenure formula, early dropouts excluded). */}
        <KpiVal label="Avg week at churn" value={a.kpis.avgWeekAtChurn} suffix="w" />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Panel title="Conversion funnel">
          <div className="space-y-2">
            {a.funnel.map((f) => (
              <div key={f.stage} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-fg-dim">{f.stage}</span>
                <span className="h-6 flex-1 overflow-hidden rounded-control bg-surface-2">
                  <span className="flex h-full items-center justify-end rounded-control bg-accent px-2 text-[11px] font-medium text-white" style={{ width: `${(f.count / funnelMax) * 100}%` }}>
                    {f.count}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Retention curve">
          <AreaChart data={a.retentionCurve} xKey="month" yKey="pct" height={220} />
        </Panel>
      </div>

      <Panel title="Lead source performance" flush>
        <DataTable
          columns={showMoney ? SOURCE_COLUMNS : SOURCE_COLUMNS.filter((c) => c.key !== "revenue")}
          data={a.sourcePerf}
          getRowKey={(s) => s.source}
          emptyMessage="Lead sources appear here once opportunities flow in from GoHighLevel."
        />
      </Panel>
    </div>
  );
}
