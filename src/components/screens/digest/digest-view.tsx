import Link from "next/link";
import { Card } from "@/components/ui";
import { BackLink } from "@/components/ui/back-link";
import { Icon } from "@/lib/icons";
import { BRAND } from "@/lib/brand";
import type { DigestData } from "@/lib/data";

function Stat({ label, value, tone = "fg" }: { label: string; value: string; tone?: "fg" | "positive" | "warn" | "danger" }) {
  const cls = tone === "positive" ? "text-positive" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-fg";
  return (
    <div className="rounded-control border border-border-soft bg-surface-2 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{label}</div>
      <div className={`mt-0.5 font-display text-lg tabular-nums tracking-display ${cls}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">{title}</h3>
      {children}
    </div>
  );
}

export function DigestView({ data }: { data: DigestData }) {
  const d = data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink />
      <Card className="space-y-6">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">Daily Digest</div>
            <div className="mt-1 text-xs text-fg-muted">
              {BRAND.name} · To: {BRAND.ownerEmail} · {d.date} 7:00 AM
            </div>
          </div>
          {/* The digest reads like the morning email; this jumps to the live
              dashboard the numbers came from (the old button had no action). */}
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-control border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
          >
            Open dashboard
          </Link>
        </div>

        <div>
          <h1 className="font-display text-2xl tracking-display text-fg">Good morning, {BRAND.ownerFirstName}.</h1>
          <p className="mt-1 text-sm text-fg-dim">
            Net{" "}
            <span className={(d.daily ? d.daily.net : d.netChange) >= 0 ? "text-positive" : "text-danger"}>
              {(d.daily ? d.daily.net : d.netChange) >= 0 ? "+" : ""}
              {d.daily ? d.daily.net : d.netChange}
            </span>{" "}
            clients {d.daily ? "yesterday" : "this month"}. Here is where things stand.
          </p>
        </div>

        {d.daily ? (
          <Section title="Yesterday">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="New clients" value={`+${d.daily.gained}`} tone="positive" />
              <Stat label="Cancelled" value={`${d.daily.lost}`} tone={d.daily.lost > 0 ? "danger" : "fg"} />
              <Stat
                label="Net"
                value={`${d.daily.net >= 0 ? "+" : ""}${d.daily.net}`}
                tone={d.daily.net > 0 ? "positive" : d.daily.net < 0 ? "danger" : "fg"}
              />
            </div>
          </Section>
        ) : null}

        <Section title={d.daily ? "The book at a glance (30 days)" : "The book at a glance"}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="New clients (30d)" value={`+${d.gained}`} tone="positive" />
            <Stat label="Paused" value={`${d.paused}`} tone={d.paused > 0 ? "warn" : "fg"} />
            <Stat label="Cancelled (30d)" value={`${d.lost}`} tone={d.lost > 0 ? "danger" : "fg"} />
            <Stat label="Refunds" value={`$${d.refunds.toLocaleString()}`} tone={d.refunds > 0 ? "warn" : "fg"} />
            <Stat label="MRR" value={`$${d.mrr.toLocaleString()}`} />
            <Stat label="Cash collected" value={`$${d.cashCollected30d.toLocaleString()}`} />
          </div>
        </Section>

        <Section title="Pipeline right now">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Calls booked" value={`${d.callsBooked}`} />
            <Stat label="Closed won" value={`${d.closedWon}`} tone="positive" />
            <Stat label="Closed lost" value={`${d.closedLost}`} tone={d.closedLost > 0 ? "warn" : "fg"} />
          </div>
        </Section>

        {/* E3: this week's team capacity (Sunday prompt) + transformations.
            Capacity stays honest: no answers = say so, never fake a number. */}
        <Section title="Team this week">
          <div className="grid grid-cols-2 gap-3">
            {d.teamCapacity ? (
              <Stat
                label={`Capacity remaining (${d.teamCapacity.answered}/${d.teamCapacity.coaches} answered)`}
                value={`~${d.teamCapacity.slotsRemaining} slots`}
                tone={d.teamCapacity.slotsRemaining === 0 ? "warn" : "positive"}
              />
            ) : (
              <Stat label="Capacity remaining" value="no answers yet" tone="fg" />
            )}
            <Stat
              label="Transformations this week"
              value={`${d.transformationsThisWeek}`}
              tone={d.transformationsThisWeek > 0 ? "positive" : "fg"}
            />
          </div>
          {/* R6-3: year-anniversary clients (gift week). */}
          {d.yearMilestones.length > 0 ? (
            <p className="mt-3 text-sm text-fg-dim">
              <span className="text-positive">{d.yearMilestones.length}</span> client
              {d.yearMilestones.length === 1 ? "" : "s"} hitting a year milestone this week:{" "}
              {d.yearMilestones.map((m) => `${m.name} (${m.years}y)`).join(", ")}
            </p>
          ) : null}
          {/* R4-3: engagement milestone calls currently due. */}
          {d.engagementDue.length > 0 ? (
            <p className="mt-3 text-sm text-fg-dim">
              <span className="text-warn">{d.engagementDue.length}</span> engagement call
              {d.engagementDue.length === 1 ? "" : "s"} due:{" "}
              {d.engagementDue
                .slice(0, 5)
                .map((e) => `${e.clientName} (W${e.week}, ${e.coachName})`)
                .join(", ")}
              {d.engagementDue.length > 5 ? ` +${d.engagementDue.length - 5} more` : ""}{" "}
              <Link href="/engagement" className="text-accent hover:underline">
                Engagement
              </Link>
            </p>
          ) : null}
          {/* R4-1: pauses ending inside the sheet's 4-day alert window. */}
          {d.reactivatingSoon.length > 0 ? (
            <p className="mt-3 text-sm text-fg-dim">
              <span className="text-warn">{d.reactivatingSoon.length}</span> paused client
              {d.reactivatingSoon.length === 1 ? "" : "s"} reactivating soon:{" "}
              {d.reactivatingSoon.map((p) => `${p.name} (${p.days}d)`).join(", ")}{" "}
              <Link href="/pauses" className="text-accent hover:underline">
                Pause board
              </Link>
            </p>
          ) : null}
        </Section>

        <Section title="Renewals">
          <ul className="space-y-1.5 text-sm text-fg-dim">
            <li>
              <span className={d.dueThisWeek > 0 ? "text-warn" : ""}>{d.dueThisWeek}</span> renewal calls due this
              week (overdue included)
            </li>
            <li>
              {d.renewalCallsDue} clients in the re-sign window:{" "}
              <Link href="/renewals" className="text-accent hover:underline">
                open the call list
              </Link>
            </li>
            <li>{d.payoutsCount} coach payouts to approve Friday</li>
          </ul>
        </Section>

        <Section title="Attention needed">
          {d.paused === 0 && d.pastDueCount === 0 && d.handovers === 0 ? (
            <p className="text-sm text-fg-dim">Everything is in good shape. No flags this morning.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {d.pastDueCount > 0 ? (
                <li className="flex items-center gap-2 text-danger">
                  <Icon name="dollar" size={14} /> {d.pastDueCount} payment failures need follow-up
                </li>
              ) : null}
              {d.handovers > 0 ? (
                <li className="flex items-center gap-2 text-warn">
                  <Icon name="image" size={14} /> {d.handovers} transformation handover approvals pending
                </li>
              ) : null}
              {d.paused > 0 ? (
                <li className="flex items-center gap-2 text-fg-dim">
                  <Icon name="user" size={14} /> {d.paused} paused clients to check on
                </li>
              ) : null}
            </ul>
          )}
        </Section>
      </Card>
    </div>
  );
}
