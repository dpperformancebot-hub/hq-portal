import { Card, DownloadCsvButton, EmptyState, PageHeader, Panel } from "@/components/ui";
import { datedFilename, rowsToCsv } from "@/lib/csv";
import { getSalesPerformanceData, type SalesRepRow } from "@/lib/data";

const ROLE_LABEL: Record<NonNullable<SalesRepRow["role"]>, string> = {
  setter: "Setter",
  closer: "Closer",
};

export function SalesPerformanceView({ reps }: { reps: SalesRepRow[] }) {
  // "Lit up" once any rep has owned a single opportunity. Until GHL has
  // opportunities every rep is all-zero, so we show the honest empty state.
  const hasActivity = reps.some((r) => r.leads > 0);

  // CSV is built server-side (rowsToCsv is pure) and handed to a client button,
  // since this is a server component and value accessors are not serializable.
  const csv = rowsToCsv(reps, [
    { header: "Rep", value: (r) => r.name },
    { header: "Role", value: (r) => (r.role ? ROLE_LABEL[r.role] : "") },
    { header: "Opportunities", value: (r) => r.leads },
    { header: "Calls booked", value: (r) => r.callsBooked },
    { header: "Calls taken", value: (r) => r.callsTaken },
    { header: "Closed", value: (r) => r.closed },
    { header: "Close rate %", value: (r) => (r.closeRatePct == null ? "" : r.closeRatePct) },
    { header: "Revenue closed", value: (r) => r.revenueClosed },
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        back
        eyebrow="Insights"
        title="Sales Performance"
        subtitle="Setter and closer metrics per rep, projected from GoHighLevel opportunities."
        actions={<DownloadCsvButton filename={datedFilename("sales-performance")} csv={csv} disabled={!hasActivity} />}
      />

      {!hasActivity ? (
        <Panel title="Sales Performance">
          <EmptyState
            icon="trending_up"
            title="No sales activity yet"
            message="Setter and closer metrics light up here once opportunities with an assigned rep flow in from GoHighLevel."
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {reps.map((r) => (
            <Card key={r.name} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-medium text-fg">{r.name}</div>
                {r.role ? (
                  <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-dim">
                    {ROLE_LABEL[r.role]}
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {r.role === "setter" ? (
                  <>
                    <Metric label="Opportunities" value={`${r.leads}`} />
                    <Metric label="Calls booked" value={`${r.callsBooked}`} />
                    <Metric label="Calls taken" value={`${r.callsTaken}`} />
                    <Metric label="Onboarded" value={`${r.closed}`} />
                  </>
                ) : (
                  <>
                    <Metric label="Calls taken" value={`${r.callsTaken}`} />
                    <Metric label="Closed" value={`${r.closed}`} />
                    <Metric
                      label="Close rate"
                      value={r.closeRatePct == null ? "-" : `${r.closeRatePct}%`}
                    />
                    <Metric label="Revenue closed" value={`$${r.revenueClosed.toLocaleString()}`} />
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control border border-border-soft bg-surface-2 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{label}</div>
      <div className="mt-0.5 font-display text-lg tabular-nums tracking-display text-fg">{value}</div>
    </div>
  );
}

export async function SalesPerformanceScreen() {
  return <SalesPerformanceView reps={await getSalesPerformanceData()} />;
}
