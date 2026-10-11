"use client";

// R17-4: the "Add coach" form for the Team screen.
//
// NOT REACHABLE YET, by instruction: this component is built and tested but
// deliberately not imported by the Team page. It creates a login and a coach
// record in one go, which touches invites and roles, so the owner reviews the
// diff before it appears in the UI.
//
// The whole point is that the four-step dance becomes one form, and that a
// near-miss spelling cannot create a second coach: the action refuses a name
// within Dice 0.8 of an existing one until the owner confirms.

import { useEffect, useState } from "react";
import { Button, Panel, useToast } from "@/components/ui";
import {
  addCoachAction,
  listExistingCoachesAction,
  type AddCoachResult,
  type ExistingCoach,
} from "@/lib/add-coach-actions";
import { DEFAULT_COACH_CAPACITY } from "@/lib/coach-config";

const field =
  "w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent";

type Done = Extract<AddCoachResult, { ok: true }>;

export function AddCoachForm({ onDone }: { onDone?: () => void }) {
  const toast = useToast();
  const [existing, setExisting] = useState<ExistingCoach[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [headCoach, setHeadCoach] = useState(false);
  const [capacity, setCapacity] = useState(String(DEFAULT_COACH_CAPACITY));
  const [startDate, setStartDate] = useState("");
  const [nearMatch, setNearMatch] = useState<{ name: string; score: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    let live = true;
    listExistingCoachesAction()
      .then((rows) => {
        if (live) setExisting(rows);
      })
      .catch(() => {
        if (live) setExisting([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const submit = async (confirmNearMatch: boolean) => {
    setBusy(true);
    setError(null);
    const res = await addCoachAction(
      {
        name,
        email,
        headCoach,
        capacity: Number(capacity),
        startDate: startDate || null,
      },
      confirmNearMatch,
    );
    setBusy(false);
    if (res.ok) {
      setDone(res);
      setNearMatch(null);
      toast.push(res.linkedExisting ? `Linked to the existing ${name} record.` : `${name} added.`, "success");
      onDone?.();
    } else {
      setError(res.error);
      setNearMatch(res.nearMatch ?? null);
    }
  };

  if (done) {
    return (
      <Panel title="Coach added" subtitle="Two things left, both outside the portal.">
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              Send this to the coach
            </div>
            <pre className="whitespace-pre-wrap rounded-card border border-border bg-surface-2 p-3 text-xs text-fg">
              {done.message}
            </pre>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard?.writeText(done.message);
                toast.push("Message copied.");
              }}
            >
              Copy message
            </Button>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              Your checklist
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-fg-dim">
              {done.checklist.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <Button size="sm" onClick={() => setDone(null)}>
            Add another
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Add coach"
      subtitle="Creates their coach record and their login together. Spell the name exactly as GHL has it."
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs text-fg-dim">Display name (must match GHL Assigned Coach exactly)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Perry" />
        </label>

        {existing && existing.length > 0 ? (
          <div className="rounded-card border border-border-soft bg-surface-2 p-2 text-xs text-fg-dim">
            <div className="mb-1 font-medium text-fg">Names GHL already uses</div>
            <div className="flex flex-wrap gap-1.5">
              {existing.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setName(c.name)}
                  title={`${c.clients} client${c.clients === 1 ? "" : "s"}${c.hasLogin ? ", has a login" : ", no login yet"}${c.isActive ? "" : ", inactive"}`}
                  className="rounded-pill border border-border px-1.5 py-0.5 hover:border-accent hover:text-fg"
                >
                  {c.name}
                  {!c.hasLogin ? <span className="ml-1 text-accent">no login</span> : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="block">
          <span className="text-xs text-fg-dim">Login email (they must sign in with exactly this)</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="coach@example.com" />
        </label>

        <div className="flex flex-wrap gap-3">
          <label className="block">
            <span className="text-xs text-fg-dim">Capacity</span>
            <input value={capacity} onChange={(e) => setCapacity(e.target.value)} inputMode="numeric" className={`${field} w-24 tabular-nums`} />
          </label>
          <label className="block">
            <span className="text-xs text-fg-dim">Start date</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${field} w-44`} />
          </label>
          <label className="flex items-end gap-2 pb-1.5 text-sm text-fg">
            <input type="checkbox" checked={headCoach} onChange={(e) => setHeadCoach(e.target.checked)} className="accent-accent" />
            Head coach
          </label>
        </div>

        {error ? (
          <div className="rounded-card border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn">
            {error}
            {nearMatch ? (
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setName(nearMatch.name)}>
                  Use &quot;{nearMatch.name}&quot;
                </Button>
                <Button size="sm" onClick={() => void submit(true)} disabled={busy}>
                  No, add as &quot;{name}&quot;
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <Button size="sm" onClick={() => void submit(false)} disabled={busy || !name || !email}>
          {busy ? "Adding…" : "Add coach"}
        </Button>
      </div>
    </Panel>
  );
}
