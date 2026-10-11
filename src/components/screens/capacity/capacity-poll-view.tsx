"use client";

// R7-1 (Dan's capacity mockup): the coach poll. One question per week, five
// large tappable band cards (coarse buckets get honest answers fast), an
// optional note (often the real signal), and a collapsed confirmation with
// Change once submitted — revisable until the week closes. Below: the
// coach's own history.

import { useState, useTransition } from "react";
import { Button, Card, useToast } from "@/components/ui";
import { CAPACITY_BANDS, bandOf, type CapacityValue } from "@/lib/capacity";
import { submitCapacityAction } from "@/lib/capacity-actions";

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export function BandChip({ band }: { band: string | null | undefined }) {
  const b = bandOf(band);
  if (!b) return <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted">no answer</span>;
  return (
    <span
      className="rounded-pill px-2 py-0.5 text-[11px] font-semibold tabular-nums"
      style={{ background: b.soft, color: b.colour }}
    >
      {b.label} · {b.sub}
    </span>
  );
}

export function CapacityPollView({
  weekLabel,
  current,
  history,
}: {
  /** "Week starting 10 Aug" for the open week. */
  weekLabel: string;
  /** The coach's existing submission for the open week, if any. */
  current: { band: CapacityValue; note: string | null; submittedAt: string } | null;
  /** Own history, newest first. */
  history: { weekStart: string; band: CapacityValue; note: string | null }[];
  /** True when rendered as the head coach's My Submission tab. Layout is the
   *  same either way since 2026-10-08 (full width, no centred max-w column);
   *  kept so existing callers compile unchanged. */
  embedded?: boolean;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(current === null);
  const [band, setBand] = useState<CapacityValue | null>(current?.band ?? null);
  const [note, setNote] = useState(current?.note ?? "");
  const [saved, setSaved] = useState(current);
  const [pending, start] = useTransition();

  const submit = () => {
    if (!band || pending) return;
    start(async () => {
      // The open week is always the COMING Monday's week (due Friday before).
      const res = await submitCapacityAction(band, "next", note);
      if (res.ok) {
        setSaved({ band, note: note.trim() || null, submittedAt: new Date().toISOString() });
        setEditing(false);
        toast.push("Capacity submitted. You can change it until the week closes.", "success");
      } else {
        toast.push(res.error, "error");
      }
    });
  };

  return (
    <div className="space-y-4">
      {!editing && saved ? (
        <Card className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-fg">
            Submitted for <span className="font-medium">{weekLabel}</span>:
          </span>
          <BandChip band={saved.band} />
          {saved.note ? <span className="min-w-0 flex-1 truncate text-xs text-fg-dim">{saved.note}</span> : null}
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Change
          </Button>
        </Card>
      ) : (
        <Card className="space-y-3">
          <div>
            <h2 className="font-display text-lg tracking-display text-fg">
              How many new clients can you take on for the {weekLabel.charAt(0).toLowerCase() + weekLabel.slice(1)}?
            </h2>
            <p className="mt-0.5 text-xs text-fg-dim">Answer fast and honestly; you can revise until the week closes.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {CAPACITY_BANDS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBand(b.id)}
                className={`rounded-card border px-3 py-3 text-center transition-colors ${
                  band === b.id ? "border-transparent ring-2" : "border-border hover:border-accent/40"
                }`}
                style={band === b.id ? { background: b.soft, boxShadow: `0 0 0 2px ${b.colour}` } : undefined}
              >
                <div className="font-display text-2xl tracking-display" style={{ color: b.colour }}>
                  {b.label}
                </div>
                <div className="mt-0.5 text-[11px] text-fg-dim">{b.sub}</div>
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder='Optional note, e.g. "two finishing their block mid-week, so room opens up"'
            className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
            aria-label="Capacity note"
          />
          <div className="flex justify-end gap-2">
            {saved ? (
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
                Cancel
              </Button>
            ) : null}
            <Button size="sm" onClick={submit} disabled={!band || pending}>
              {pending ? "Submitting…" : "Submit capacity"}
            </Button>
          </div>
        </Card>
      )}

      {history.length > 0 ? (
        <Card className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Your history</div>
          {history.map((h) => (
            <div key={h.weekStart} className="flex items-center gap-3 border-b border-border-soft py-1.5 text-sm last:border-0">
              <span className="w-16 shrink-0 tabular-nums text-xs text-fg-muted">{fmtDay(h.weekStart)}</span>
              <BandChip band={h.band} />
              {h.note ? <span className="min-w-0 flex-1 truncate text-xs text-fg-dim">{h.note}</span> : null}
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
