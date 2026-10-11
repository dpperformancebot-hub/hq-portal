"use client";

// R7-1 (Dan's capacity mockup): manager views. Results (week dropdown, stat
// cards, per-coach rows with notes inline — scanning the notes is the whole
// job of this screen — amber outstanding rows with Nudge, band-spread bars)
// and the Capacity log (coach × week grid coloured by band, per-coach
// average, CSV export, green dot on the open week, note on hover). The head
// coach also gets a My submission tab (dual-role pattern). A chase banner
// lists outstanding coaches with Send reminder.

import { useMemo, useState, useTransition } from "react";
import { Avatar, Button, Card, EmptyState, PageHeader, SegmentedControl, useToast } from "@/components/ui";
import { CAPACITY_BANDS, bandOf, type CapacitySubmission, type CapacityValue } from "@/lib/capacity";
import { nudgeCapacityAction } from "@/lib/capacity-actions";
import { exportRowsToCsv, datedFilename } from "@/lib/csv";
import { BandChip, CapacityPollView } from "@/components/screens/capacity/capacity-poll-view";

export type CapacityCoach = { id: string; name: string; clients: number };

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};
const fmtStamp = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

export function CapacityManageView({
  coaches,
  weeks,
  openWeek,
  submissions,
  notesAvailable,
  mySubmission = null,
}: {
  coaches: CapacityCoach[];
  /** Monday ISO dates, newest first (includes the open week). */
  weeks: string[];
  openWeek: string;
  submissions: CapacitySubmission[];
  notesAvailable: boolean;
  /** Head coach dual role: their own poll data enables the My submission tab. */
  mySubmission?: {
    weekLabel: string;
    current: { band: CapacityValue; note: string | null; submittedAt: string } | null;
    history: { weekStart: string; band: CapacityValue; note: string | null }[];
  } | null;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<"results" | "log" | "mine">("results");
  const [week, setWeek] = useState(openWeek);
  const [nudged, setNudged] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const byKey = useMemo(() => {
    const m = new Map<string, CapacitySubmission>();
    for (const s of submissions) m.set(`${s.weekStart}|${s.coachId}`, s);
    return m;
  }, [submissions]);

  const weekRows = coaches.map((c) => ({ coach: c, sub: byKey.get(`${week}|${c.id}`) ?? null }));
  const answered = weekRows.filter((r) => r.sub);
  const openOutstanding = coaches.filter((c) => !byKey.get(`${openWeek}|${c.id}`));
  const totalCapacity = Math.round(answered.reduce((s, r) => s + (bandOf(r.sub?.band)?.mid ?? 0), 0));
  const atCapacity = answered.filter((r) => r.sub?.band === "0").length;

  const nudge = (ids: string[]) => {
    if (ids.length === 0 || pending) return;
    start(async () => {
      const res = await nudgeCapacityAction(ids);
      if (res.ok) {
        setNudged((prev) => new Set([...prev, ...ids]));
        // R8-2: honest delivery status. The nudge always lands in the portal
        // bell; the toast says whether a Slack ping actually went out.
        toast.push(
          res.slack
            ? ids.length === 1
              ? "Nudge sent to Slack."
              : `Slack reminder sent to ${ids.length} coaches.`
            : "Reminder saved to the portal bell. Slack is not configured (SLACK_WEBHOOK_URL), so no ping went out.",
          res.slack ? "success" : "error",
        );
      } else {
        toast.push(res.error, "error");
      }
    });
  };

  const exportLog = () => {
    exportRowsToCsv(
      datedFilename("capacity-log"),
      coaches,
      [
        { header: "Coach", value: (c: CapacityCoach) => c.name },
        ...weeks.map((w) => ({
          header: fmtDay(w),
          value: (c: CapacityCoach) => byKey.get(`${w}|${c.id}`)?.band ?? "",
        })),
        {
          header: "Average",
          value: (c: CapacityCoach) => {
            const mids = weeks
              .map((w) => bandOf(byKey.get(`${w}|${c.id}`)?.band)?.mid)
              .filter((m): m is number => m !== undefined);
            return mids.length ? (mids.reduce((s, m) => s + m, 0) / mids.length).toFixed(1) : "";
          },
        },
      ],
    );
  };

  const tabs = [
    { label: "Results", value: "results" },
    { label: "Capacity log", value: "log" },
    ...(mySubmission ? [{ label: "My submission", value: "mine" }] : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Weekly Capacity"
        subtitle="How many new clients each coach can take. Notes are where the real signal lives."
        actions={<SegmentedControl aria-label="Capacity view" size="sm" value={tab} onChange={(v) => setTab(v as typeof tab)} options={tabs} />}
      />

      {/* Chase banner: who is outstanding for the OPEN week. */}
      {openOutstanding.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-warn/40 bg-warn-soft px-4 py-2.5">
          <span className="flex -space-x-1.5">
            {openOutstanding.slice(0, 5).map((c) => (
              <Avatar key={c.id} name={c.name} size="sm" className="ring-2 ring-warn-soft" />
            ))}
          </span>
          <span className="text-sm font-semibold text-warn">
            {openOutstanding.length} coach{openOutstanding.length === 1 ? "" : "es"} yet to submit
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-fg-dim">
            {openOutstanding.map((c) => c.name).join(" · ")}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => nudge(openOutstanding.filter((c) => !nudged.has(c.id)).map((c) => c.id))}
            disabled={pending || openOutstanding.every((c) => nudged.has(c.id))}
          >
            {openOutstanding.every((c) => nudged.has(c.id)) ? "Reminded" : "Send reminder"}
          </Button>
        </div>
      ) : null}

      {!notesAvailable ? (
        <p className="text-xs text-warn">
          Notes need migration 20260808000004 (proposed, awaiting owner approval); answers show without them.
        </p>
      ) : null}

      {tab === "mine" && mySubmission ? (
        <CapacityPollView
          weekLabel={mySubmission.weekLabel}
          current={mySubmission.current}
          history={mySubmission.history}
          embedded
        />
      ) : tab === "log" ? (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
              Coach × week · green dot marks the open week
            </span>
            <Button size="sm" variant="ghost" onClick={exportLog}>
              Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                  <th className="px-2 py-2">Coach</th>
                  {weeks.map((w) => (
                    <th key={w} className="px-2 py-2 text-center tabular-nums">
                      {fmtDay(w)}
                      {w === openWeek ? <span className="ml-1 inline-block h-1.5 w-1.5 rounded-pill bg-accent" /> : null}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right">Avg</th>
                </tr>
              </thead>
              <tbody>
                {coaches.map((c) => {
                  const mids = weeks
                    .map((w) => bandOf(byKey.get(`${w}|${c.id}`)?.band)?.mid)
                    .filter((m): m is number => m !== undefined);
                  return (
                    <tr key={c.id} className="border-b border-border-soft last:border-0">
                      <td className="px-2 py-1.5 font-medium text-fg">{c.name}</td>
                      {weeks.map((w) => {
                        const sub = byKey.get(`${w}|${c.id}`);
                        const b = bandOf(sub?.band);
                        return (
                          <td key={w} className="px-1 py-1.5 text-center">
                            {b ? (
                              <span
                                className="inline-block min-w-[2.6rem] rounded-sm px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                                style={{ background: b.soft, color: b.colour }}
                                title={sub?.note ?? undefined}
                              >
                                {b.label}
                              </span>
                            ) : (
                              <span className="text-fg-muted">·</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-right tabular-nums text-fg-dim">
                        {mids.length ? (mids.reduce((s, m) => s + m, 0) / mids.length).toFixed(1) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-muted">Week</span>
            <select
              value={week}
              onChange={(e) => setWeek(e.target.value)}
              className="rounded-control border border-border bg-surface px-2 py-1 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent"
              aria-label="Week"
            >
              {weeks.map((w) => (
                <option key={w} value={w}>
                  Week starting {fmtDay(w)}
                  {w === openWeek ? " (open)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Responses</div>
              <div className="mt-1 [container-type:inline-size]"><div className="kpi text-fg">{answered.length}/{coaches.length}</div></div>
            </Card>
            <Card>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Total team capacity</div>
              <div className="mt-1 [container-type:inline-size]"><div className="kpi kpi-long text-fg">~{totalCapacity} new clients</div></div>
            </Card>
            <Card>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">At capacity</div>
              <div className={`kpi mt-1 ${atCapacity > 0 ? "text-danger" : "text-fg"}`}>{atCapacity}</div>
            </Card>
          </div>

          <Card className="space-y-1">
            {weekRows.length === 0 ? (
              <EmptyState compact icon="user" title="No coaches" />
            ) : (
              weekRows.map(({ coach, sub }) =>
                sub ? (
                  <div key={coach.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-soft py-2 last:border-0">
                    <Avatar name={coach.name} size="sm" />
                    <span className="w-40 shrink-0 truncate text-sm font-medium text-fg">
                      {coach.name}
                      <span className="ml-1.5 text-[11px] font-normal tabular-nums text-fg-muted">{coach.clients} active</span>
                    </span>
                    <BandChip band={sub.band} />
                    <span className="min-w-0 flex-1 truncate text-xs text-fg-dim">{sub.note ?? ""}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-fg-muted">
                      {fmtStamp(sub.updatedAt && sub.updatedAt !== sub.submittedAt ? sub.updatedAt : sub.submittedAt)}
                      {sub.updatedAt && sub.updatedAt !== sub.submittedAt ? " (revised)" : ""}
                    </span>
                  </div>
                ) : (
                  <div key={coach.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-warn/30 bg-warn-soft px-2 py-2">
                    <Avatar name={coach.name} size="sm" />
                    <span className="w-40 shrink-0 truncate text-sm font-medium text-fg">
                      {coach.name}
                      <span className="ml-1.5 text-[11px] font-normal tabular-nums text-fg-muted">{coach.clients} active</span>
                    </span>
                    <span className="min-w-0 flex-1 text-xs text-warn">No answer yet</span>
                    {week === openWeek ? (
                      <Button size="sm" variant="ghost" onClick={() => nudge([coach.id])} disabled={pending || nudged.has(coach.id)}>
                        {nudged.has(coach.id) ? "Nudged" : "Nudge"}
                      </Button>
                    ) : null}
                  </div>
                ),
              )
            )}
          </Card>

          {/* Band spread. */}
          <Card className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Spread</div>
            {CAPACITY_BANDS.map((b) => {
              const count = answered.filter((r) => r.sub?.band === b.id).length;
              const max = Math.max(1, answered.length);
              return (
                <div key={b.id} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs tabular-nums text-fg-dim">
                    {b.label} · {b.sub}
                  </span>
                  <span className="h-3 flex-1 overflow-hidden rounded-pill bg-surface-2">
                    <span className="block h-full rounded-pill" style={{ width: `${(count / max) * 100}%`, background: b.colour }} />
                  </span>
                  <span className="w-5 text-right text-xs tabular-nums text-fg">{count}</span>
                </div>
              );
            })}
          </Card>
        </div>
      )}
    </div>
  );
}
