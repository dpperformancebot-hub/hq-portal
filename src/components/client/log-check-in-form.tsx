"use client";

// Log a weekly check-in in-portal (source 'manual'), from the client profile
// (one fixed client) or the Check-ins screen (pick a client from the roster).
// Internal data only, NO outbound path. Persists via check-in-entry-actions,
// gated server-side on persistenceEnabled() with an honest message until the
// owner applies the migration. Re-logging the same client + date edits in place.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import { CHECKIN_META } from "@/lib/seed/types";
import type { CheckInCode } from "@/lib/seed/types";
import { logCheckInAction } from "@/lib/check-in-entry-actions";

type RosterClient = { id: string; name: string; coachId: string | null };
const CODES = Object.entries(CHECKIN_META) as [CheckInCode, { label: string }][];
const today = () => new Date().toISOString().slice(0, 10);

export function LogCheckInForm({ clients }: { clients: RosterClient[] }) {
  const router = useRouter();
  const toast = useToast();
  const single = clients.length === 1 ? clients[0] : null;
  const [clientId, setClientId] = useState(single?.id ?? "");
  const [code, setCode] = useState<CheckInCode>("Y");
  const [date, setDate] = useState(today());
  const [loomUrl, setLoomUrl] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = clients.find((c) => c.id === clientId);
  const noCoach = !!selected && !selected.coachId;

  const submit = () => {
    setMsg(null);
    const target = clients.find((c) => c.id === clientId);
    if (!target) {
      setMsg({ ok: false, text: "Pick a client." });
      return;
    }
    if (!target.coachId) {
      setMsg({ ok: false, text: "This client has no coach assigned, so a check-in can't be attributed yet." });
      return;
    }
    startTransition(async () => {
      const res = await logCheckInAction({
        clientId: target.id,
        coachId: target.coachId!,
        code,
        submittedAt: date,
        loomUrl: loomUrl || null,
      });
      if (res.ok) {
        toast.push(`Check-in logged for ${target.name}`);
        setMsg({ ok: true, text: "Check-in logged." });
        setLoomUrl("");
        if (!single) setClientId("");
        router.refresh();
      } else {
        toast.push(res.error ?? "Could not log check-in.", "error");
        setMsg({ ok: false, text: res.error ?? "Could not log check-in." });
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-control border border-border-soft bg-surface-2 p-3">
      <div className="flex flex-wrap items-end gap-3">
        {single ? (
          <div className="text-sm text-fg">
            <span className="text-fg-muted">Client:</span> <span className="font-medium">{single.name}</span>
          </div>
        ) : (
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Client
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="min-w-[180px] rounded-control border border-border bg-surface px-2 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">Select a client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          Status
          <select
            value={code}
            onChange={(e) => setCode(e.target.value as CheckInCode)}
            className="rounded-control border border-border bg-surface px-2 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {CODES.map(([c, meta]) => (
              <option key={c} value={c}>
                {meta.label} ({c})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          Week of
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-control border border-border bg-surface px-2 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        {/* R12-7: optional Loom link stored on the check-in row. */}
        <label className="flex items-center gap-2 text-xs text-fg-dim">
          Loom
          <input
            type="url"
            value={loomUrl}
            onChange={(e) => setLoomUrl(e.target.value)}
            placeholder="https://loom.com/share/… (optional)"
            className="w-56 rounded-control border border-border bg-surface px-2 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>

        <button
          type="button"
          onClick={submit}
          disabled={pending || !clientId || noCoach}
          className="rounded-control bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Logging…" : "Log check-in"}
        </button>
      </div>
      {msg ? (
        <p className={`text-[11px] ${msg.ok ? "text-positive" : "text-danger"}`} role="status">
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
