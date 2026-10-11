"use client";

// R19-2c: the Remove coach screen. A deactivation, never a delete.
//
// The order on screen is the order of the real job: see what depends on them,
// move their clients somewhere, deal with their tasks, then confirm. Remove
// stays disabled until their roster is empty, and the server re-checks every
// rule anyway, so this screen is a courtesy rather than the enforcement.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Kpi, PageHeader, Panel, useToast } from "@/components/ui";
import {
  coachRemovalPrecheckAction,
  countGhlContactsNamingCoachAction,
  deactivateCoachAction,
  type RemovalPrecheck,
} from "@/lib/coach-remove-actions";
import { assignJourneyClientAction } from "@/lib/journey-actions";

const selectCls =
  "rounded-control border border-border bg-surface px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none";

export function RemoveCoachView({ coachId }: { coachId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<RemovalPrecheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [done, setDone] = useState<{ name: string; clerk: string } | null>(null);
  const [ghl, setGhl] = useState<{ count: number; total: number } | string | null>(null);
  const [ghlBusy, setGhlBusy] = useState(false);

  // useCallback so the effect can depend on it honestly rather than being
  // silenced with a lint disable.
  const load = useCallback(async () => {
    const res = await coachRemovalPrecheckAction(coachId);
    if (res.ok) { setData(res.data); setError(null); } else setError(res.error);
  }, [coachId]);
  useEffect(() => { void load(); }, [load]);

  const roomLeft = useMemo(
    () => (data?.targets ?? []).filter((t) => !t.full),
    [data],
  );

  async function moveOne(clientId: string, toCoach: string) {
    if (!toCoach) return;
    setMoving(clientId);
    try {
      // The existing assign action on purpose, so the Slack ping, the coach
      // notification and the auto-created onboarding task all behave exactly
      // as they do anywhere else a client changes hands.
      const r = await assignJourneyClientAction(clientId, toCoach);
      if (!r.ok) { toast.push(r.error); return; }
      await load();
    } finally {
      setMoving(null);
    }
  }

  async function moveAll() {
    if (!bulk || !data) return;
    setBusy(true);
    try {
      for (const c of data.clients) {
        const r = await assignJourneyClientAction(c.id, bulk);
        if (!r.ok) { toast.push(`${c.name}: ${r.error}`); break; }
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const r = await deactivateCoachAction(coachId);
      if (!r.ok) { setError(r.error); await load(); return; }
      setDone({ name: r.name, clerk: r.clerk.status });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-6">
        <PageHeader back eyebrow="Team & Settings" title={`${done.name} has been removed`} subtitle="Their history stays. Nothing was deleted." />
        <Panel title="What changed">
          <ul className="space-y-2 text-sm text-fg-dim">
            <li>They no longer appear in assign pickers, capacity bars, the check-in grid or coach lists.</li>
            <li>Their login is revoked{done.clerk === "revoked" ? "" : ` (${done.clerk.replace(/_/g, " ")})`}.</li>
            <li>Their check-ins, pay history, audits and past clients are untouched, and still show their name.</li>
            <li>Their final pay period still calculates.</li>
            <li>The nightly sync will not hand clients back to them, even where GHL still names them.</li>
          </ul>
        </Panel>
        <Panel title="In GoHighLevel">
          <p className="text-sm text-fg-dim">
            Their name is deliberately still an option on the Assigned Coach field, because old contacts reference it.
            Any contact still carrying it shows up as coach drift on the next sync instead of being reassigned, so
            nothing breaks, but the VA should fix them at the source.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="ghost"
              disabled={ghlBusy}
              onClick={async () => {
                setGhlBusy(true);
                try {
                  const r = await countGhlContactsNamingCoachAction(done.name);
                  setGhl(r.ok ? { count: r.count, total: r.total } : r.error);
                } finally {
                  setGhlBusy(false);
                }
              }}
            >
              {ghlBusy ? "Counting..." : "Count contacts still naming them"}
            </Button>
            {typeof ghl === "string" ? (
              <span className="text-xs text-warn">{ghl}</span>
            ) : ghl ? (
              <span className="text-sm text-fg">
                <span className="font-medium tabular-nums">{ghl.count}</span> of {ghl.total} contacts still name{" "}
                {done.name} in GHL.
              </span>
            ) : null}
          </div>
        </Panel>
        <div className="flex gap-2">
          <Link href="/team"><Button variant="ghost">Back to Team</Button></Link>
          <Link href="/coach-overview"><Button variant="ghost">Coach Overview</Button></Link>
        </div>
      </div>
    );
  }

  if (error && !data) return <EmptyState title="Cannot open this" message={error} />;
  if (!data) return <EmptyState title="Loading" message="Checking what depends on this coach." />;

  const rosterClear = data.activeClients === 0 && data.pausedClients === 0;
  const otherBlockers = data.blockers.filter((b) => !/client/i.test(b));
  const canRemove = rosterClear && otherBlockers.length === 0 && confirmName.trim() === data.coach.name;

  return (
    <div className="space-y-6">
      <PageHeader back eyebrow="Team & Settings" title={`Remove ${data.coach.name}`} subtitle="Deactivates them. Nothing is deleted, and their history stays exactly as it is." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Active clients" value={data.activeClients} hint={data.activeClients ? "must be moved" : "clear"} />
        <Kpi label="Paused clients" value={data.pausedClients} hint={data.pausedClients ? "must be moved" : "clear"} />
        <Kpi label="Open tasks" value={data.openTasks} hint="reassign or close" />
        <Kpi label="Check-ins, 7 days" value={data.pendingCheckIns} hint="kept in history" />
        <Kpi label="Unpaid this period" value={data.unpaidPayPeriod} hint="weeks, still payable" />
      </div>

      {otherBlockers.length > 0 ? (
        <div className="rounded-card border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-fg">
          {otherBlockers.map((b) => <div key={b}>{b}</div>)}
        </div>
      ) : null}

      <Panel
        title={`Their clients (${data.clients.length})`}
        subtitle="Every active and paused client has to go somewhere before this coach can be removed."
        action={
          data.clients.length > 0 ? (
            <div className="flex items-center gap-2">
              <select className={selectCls} value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label="Move all to">
                <option value="">Move all to...</option>
                {data.targets.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.full}>
                    {t.name} ({t.clients}/{t.capacity}){t.full ? " full" : ""}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={moveAll} disabled={!bulk || busy || roomLeft.length === 0}>
                {busy ? "Moving..." : "Move all"}
              </Button>
            </div>
          ) : null
        }
      >
        {data.clients.length === 0 ? (
          <EmptyState title="Roster is clear" message="Nobody is assigned to this coach any more." />
        ) : (
          <div className="space-y-1">
            {data.clients.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-control px-2 py-1.5 hover:bg-surface-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-fg">{c.name}</div>
                  <div className="text-[11px] capitalize text-fg-muted">{c.status}</div>
                </div>
                <select
                  className={selectCls}
                  value={pick[c.id] ?? ""}
                  disabled={moving === c.id}
                  onChange={(e) => { setPick({ ...pick, [c.id]: e.target.value }); void moveOne(c.id, e.target.value); }}
                  aria-label={`Move ${c.name} to`}
                >
                  <option value="">Move to...</option>
                  {data.targets.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.full}>
                      {t.name} ({t.clients}/{t.capacity}){t.full ? " full" : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
        {roomLeft.length === 0 && data.clients.length > 0 ? (
          <p className="mt-3 rounded-card bg-warn-soft px-3 py-2 text-xs text-warn">
            Every other coach is at capacity. Raise someone&apos;s capacity, or bring a new coach on, before moving
            this roster.
          </p>
        ) : null}
      </Panel>

      <Panel title={`Open tasks (${data.openTasks})`} subtitle="Tasks are not deleted. Reassign or close them on the taskboard.">
        {data.openTasks === 0 ? (
          <EmptyState title="Nothing open" message="No open tasks are assigned to this coach." />
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-fg-dim">
              {data.openTasks} open task{data.openTasks === 1 ? "" : "s"} still name {data.coach.name}. They stay
              readable after removal, but somebody has to own them.
            </p>
            <Link href="/tasks"><Button size="sm" variant="ghost">Open taskboard</Button></Link>
          </div>
        )}
      </Panel>

      <Panel title="Confirm">
        {error ? <div className="mb-3 rounded-card border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-fg">{error}</div> : null}
        <p className="text-sm text-fg-dim">
          This sets {data.coach.name} to inactive and revokes their login. Their check-ins, pay history, audits and
          past clients stay exactly as they are, and reports keep showing their name. It can be undone from the Team
          screen.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
            placeholder={`Type ${data.coach.name} to confirm`}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            aria-label="Type the coach's name to confirm"
          />
          <Button onClick={remove} disabled={!canRemove || busy}>
            {busy ? "Removing..." : `Remove ${data.coach.name}`}
          </Button>
          <Link href="/team"><Button variant="ghost">Cancel</Button></Link>
        </div>
        {!rosterClear ? (
          <p className="mt-2 text-xs text-fg-muted">Move their {data.activeClients + data.pausedClients} remaining client(s) first.</p>
        ) : null}
      </Panel>
    </div>
  );
}
