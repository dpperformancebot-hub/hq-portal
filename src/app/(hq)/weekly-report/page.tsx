import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, EmptyState } from "@/components/ui";
import { BackLink } from "@/components/ui/back-link";
import { BRAND } from "@/lib/brand";
import { getDefaultRoute } from "@/lib/navigation";
import { getServerIdentity } from "@/lib/role-server";
import { getWeeklyReportData } from "@/lib/weekly-report";

export const dynamic = "force-dynamic";

// H1 (FEEDBACK-V2): the Monday-morning weekly report, computed live so it is
// always current. The Monday cron snapshots the same numbers into the Reports
// store for history. Styled to screenshot for stories: one clean card.
// Owner-side screen: coaches and sales are redirected.

function Stat({ label, value, tone = "fg" }: { label: string; value: string; tone?: "fg" | "positive" | "danger" | "warn" }) {
  const cls = { fg: "text-fg", positive: "text-positive", danger: "text-danger", warn: "text-warn" }[tone];
  return (
    <div className="rounded-control border border-border-soft bg-surface-2 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{label}</div>
      <div className={`mt-0.5 font-display text-2xl tabular-nums tracking-display ${cls}`}>{value}</div>
    </div>
  );
}

export default async function WeeklyReportPage() {
  const identity = await getServerIdentity();
  if (identity.role === "coach" || identity.role === "sales") {
    redirect(getDefaultRoute(identity.role));
  }
  const d = await getWeeklyReportData();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink />
      <Card className="space-y-6">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">Weekly report</div>
            <h1 className="mt-1 font-display text-2xl tracking-display text-fg">
              {BRAND.name} · week of {d.weekStart}
            </h1>
            <p className="mt-1 text-xs text-fg-muted">
              {d.weekStart} to {d.weekEnd} · generated fresh on load, snapshotted to Reports every Monday
            </p>
          </div>
          <Link
            href="/reports"
            className="inline-flex items-center rounded-control border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
          >
            Past reports
          </Link>
        </div>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Last week</h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Active clients" value={`${d.activeClients}`} />
            <Stat label="MRR" value={`$${d.mrr.toLocaleString()}`} />
            <Stat
              label="Net change"
              value={`${d.net >= 0 ? "+" : ""}${d.net}`}
              tone={d.net > 0 ? "positive" : d.net < 0 ? "danger" : "fg"}
            />
            <Stat
              label="Transformations"
              value={`${d.transformationsLastWeek}`}
              tone={d.transformationsLastWeek > 0 ? "positive" : "fg"}
            />
          </div>
          <p className="mt-2 text-xs text-fg-dim">
            {d.gained} new, {d.lost} cancelled between {d.weekStart} and {d.weekEnd}.
          </p>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Week ahead</h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Team capacity"
              value={d.capacity ? `~${d.capacity.slots}` : "no answers"}
              tone={d.capacity && d.capacity.slots === 0 ? "warn" : "fg"}
            />
            <Stat label="Renewal calls due" value={`${d.renewalsDue7}`} tone={d.renewalsDue7 > 0 ? "warn" : "fg"} />
            <Stat label="Overdue renewals" value={`${d.renewalsOverdue}`} tone={d.renewalsOverdue > 0 ? "danger" : "fg"} />
            <Stat label="Unassigned" value={`${d.unassigned}`} tone={d.unassigned > 0 ? "warn" : "fg"} />
          </div>
          {d.capacity ? (
            <p className="mt-2 text-xs text-fg-dim">
              Capacity from {d.capacity.answered} of {d.capacity.coaches} coaches (Sunday prompt).
            </p>
          ) : null}
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Consultant review</h2>
          {d.review.length === 0 ? (
            <EmptyState title="Nothing flagged" message="No leaks spotted in the numbers this week." />
          ) : (
            <ul className="mt-2 space-y-2">
              {d.review.map((r) => (
                <li key={r} className="flex gap-2 text-sm text-fg-dim">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-pill bg-accent" />
                  {r}
                </li>
              ))}
            </ul>
          )}
        </section>
      </Card>
    </div>
  );
}
