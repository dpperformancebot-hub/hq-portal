"use client";

// VA dashboard (G1, FEEDBACK-V2): Jameela's job list. Renewals at the top
// (the re-sign call list is her first job of the day), then a tick-off task
// list. The active-clients block is gone by owner request. Ops scope only:
// no financials, no brand/marketing.
//
// The standing daily checklist from Dan (open question 5) slots into the
// task list as tasks once he shares it; nothing here is faked meanwhile.

import { useState, useTransition } from "react";
import Link from "next/link";
import { EmptyState, Kpi, PageHeader, Panel, useToast } from "@/components/ui";
import { setTaskStatusAction } from "@/lib/tasks-actions";
import { TodayCard } from "@/components/screens/dashboard/today-card";
import { paymentStructure } from "@/lib/journey-buckets";
import { makeCoachNamer } from "@/components/screens/renewals/coach-name";
import type { VaDashboardData } from "@/lib/data";
import type { Task } from "@/lib/seed/types";

const isDone = (t: Task) => t.status === "done" || t.status === "approved";

function dueText(days: number): { text: string; cls: string } {
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, cls: "text-danger font-medium" };
  if (days === 0) return { text: "today", cls: "text-danger font-medium" };
  if (days <= 7) return { text: `in ${days}d`, cls: "text-warn font-medium" };
  return { text: `in ${days}d`, cls: "text-fg-dim" };
}

export function VaDashboardView({
  data,
  preview = false,
  viewerName = null,
}: {
  data: VaDashboardData;
  preview?: boolean;
  /** C4: the signed-in VA's name; null (previews, nameless users) hides the Today card. */
  viewerName?: string | null;
}) {
  const d = data;
  const toast = useToast();
  // Optimistic tick overlay (task id -> done?).
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [, start] = useTransition();
  const coachLabel = makeCoachNamer(d.coachNames);

  const doneOf = (t: Task) => ticked[t.id] ?? isDone(t);
  const open = d.tasks.filter((t) => !doneOf(t));

  const tick = (t: Task) => {
    if (!d.tasksLive) return;
    const next = !doneOf(t);
    setTicked((prev) => ({ ...prev, [t.id]: next }));
    start(async () => {
      const res = await setTaskStatusAction(t.id, next ? "done" : "todo");
      if (!res.ok) {
        setTicked((prev) => ({ ...prev, [t.id]: !next }));
        toast.push(res.error ?? "Could not update the task.", "error");
      }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="VA Dashboard"
        subtitle={preview ? "Owner preview of the VA view" : "Renewals first, then tick off the list."}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Kpi label="Renewal calls this week" value={d.renewalCallsThisWeek} />
        <Kpi label="Open tasks" value={open.length} />
        <Kpi label="Paused to check" value={d.paused} />
      </div>

      {/* R17-1a: clients whose program start nobody knows. GHL's Start Date is
          blank for them and the portal no longer guesses it from the signup
          date, so this is a real job: get the date and set it on the card. */}
      {d.needStartDate.length > 0 ? (
        <Panel
          title={`Start date needed (${d.needStartDate.length})`}
          subtitle="GHL has no start date for these clients. Their signup date is NOT their program start, so the portal will not guess. Set the real date on the Journey Tracker card."
          action={
            <Link href="/client-journey" className="text-xs font-medium text-accent hover:underline">
              Open Journey Tracker
            </Link>
          }
        >
          <ul className="divide-y divide-border-soft text-sm">
            {d.needStartDate.slice(0, 12).map((c) => (
              <li key={c.clientId} className="flex items-center justify-between gap-3 py-1.5">
                <span className="truncate text-fg">{c.clientName}</span>
                <span className="shrink-0 text-xs text-fg-muted">{c.coachName}</span>
              </li>
            ))}
          </ul>
          {d.needStartDate.length > 12 ? (
            <p className="pt-2 text-xs text-fg-muted">and {d.needStartDate.length - 12} more.</p>
          ) : null}
        </Panel>
      ) : null}

      {/* G1: renewals at the top. */}
      <Panel
        title="Renewals to work"
        subtitle="Soonest due first. Book the call, note the outcome."
        action={
          <Link href="/renewals" className="text-xs font-medium text-accent hover:underline">
            Open full list →
          </Link>
        }
      >
        {d.renewals.length === 0 ? (
          <EmptyState icon="calendar" title="No renewals in window" message="Nothing due in the next 45 days." />
        ) : (
          <div className="divide-y divide-border-soft">
            {d.renewals.slice(0, 8).map((r) => {
              const due = dueText(r.daysToRenewal);
              const pay = paymentStructure(r.client);
              return (
                <div key={r.client.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <Link href={`/client-database/${r.client.id}`} className="truncate text-sm font-medium text-fg hover:underline">
                      {r.client.name}
                    </Link>
                    <div className="truncate text-xs text-fg-dim">
                      {coachLabel(r.client.coachId)} ·{" "}
                      {r.client.termLength ? `${r.client.termLength}wk ${pay ?? "term"}` : r.client.plan}
                      {r.client.renewalNote ? ` · ${r.client.renewalNote}` : ""}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-fg-dim">{r.renewalDate}</span>
                  <span className={`shrink-0 text-xs tabular-nums ${due.cls}`}>{due.text}</span>
                </div>
              );
            })}
            {d.renewals.length > 8 ? (
              <div className="pt-2 text-xs text-fg-muted">
                +{d.renewals.length - 8} more on the full list
              </div>
            ) : null}
          </div>
        )}
      </Panel>

      {/* R4-3: engagement calls to book (W14 + PIF 16-week milestones). */}
      {d.engagementDue.length > 0 ? (
        <Panel
          title={`Engagement calls due (${d.engagementDue.length})`}
          subtitle="Book the milestone call, then mark it on the Engagement screen."
          action={
            <Link href="/engagement" className="text-xs font-medium text-accent hover:underline">
              Engagement →
            </Link>
          }
        >
          <div className="space-y-1">
            {d.engagementDue.slice(0, 8).map((e, i) => (
              <div key={`${e.clientName}-${e.week}-${i}`} className="flex items-center justify-between border-b border-border-soft py-1.5 text-sm last:border-0">
                <span className="text-fg">{e.clientName}</span>
                <span className="text-xs tabular-nums text-fg-muted">W{e.week} · {e.coachName}</span>
              </div>
            ))}
            {d.engagementDue.length > 8 ? (
              <div className="pt-1 text-xs text-fg-muted">+{d.engagementDue.length - 8} more on the Engagement screen</div>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {/* C4: the VA's own "Today I will" list; ops can add to it from /tasks. */}
      {viewerName ? <TodayCard tasks={d.tasks} viewer={viewerName} live={d.tasksLive} includeUnassigned /> : null}

      {/* G1: tick-off job list. Dan's standing checklist for Jameela slots in
          here as tasks once he shares it (FEEDBACK-V2 open question 5). */}
      <Panel
        title="Job list"
        subtitle={d.tasksLive ? "Tick things off as you go." : "Ticking off goes live with the database."}
        action={
          <Link href="/tasks" className="text-xs font-medium text-accent hover:underline">
            Taskboard →
          </Link>
        }
      >
        {d.tasks.length === 0 ? (
          <EmptyState
            title="No tasks yet"
            message="Tasks land here from the taskboard. Dan's standing checklist for Jameela is still to come."
          />
        ) : (
          <div className="divide-y divide-border-soft">
            {[...d.tasks]
              .sort((a, b) => Number(doneOf(a)) - Number(doneOf(b)) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
              .map((t) => {
                const done = doneOf(t);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => tick(t)}
                    disabled={!d.tasksLive}
                    className="flex w-full items-center gap-3 py-2 text-left disabled:cursor-default"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px] ${
                        done ? "border-accent bg-accent text-white" : "border-border"
                      }`}
                    >
                      {done ? "✓" : ""}
                    </span>
                    <span className={`min-w-0 flex-1 truncate text-sm ${done ? "text-fg-muted line-through" : "text-fg"}`}>
                      {t.title}
                    </span>
                    <span className="shrink-0 rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] text-fg-dim">{t.type}</span>
                    <span className="shrink-0 text-xs tabular-nums text-fg-muted">{t.dueDate ?? ""}</span>
                  </button>
                );
              })}
          </div>
        )}
      </Panel>

      <Panel title="Quick links">
        <ul className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-3">
          {[
            { label: "Client Database", href: "/client-database" },
            { label: "Pipeline", href: "/pipeline" },
            { label: "Client Audits", href: "/client-audits" },
            { label: "Renewals", href: "/renewals" },
            { label: "Calendar", href: "/calendar" },
            { label: "Tasks", href: "/tasks" },
          ].map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="text-accent hover:underline">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
