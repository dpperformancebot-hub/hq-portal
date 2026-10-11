"use client";

// R18: the customisable coach pay section. TJD FIT ONLY (Settings renders it
// on a weeks-paid brand and nowhere else).
//
// Every TJD coach is on different money and it changes, so it belongs
// somewhere the owner can edit it rather than in a spreadsheet or in code.
// Entry is in MONTHLY dollars, because that is how the SOP and the coaches
// talk about it ("$220/mo per weekly client"), and the weekly figure payroll
// actually invoices on is shown live under each box so the divide-by-four is
// never a surprise.

import { useEffect, useState } from "react";
import { Button, EmptyState, Panel, useToast } from "@/components/ui";
import { listCoachRatesAction, setCoachRatesAction, type CoachRateRow } from "@/lib/pay/coach-rates-actions";
import type { TjdRateCard } from "@/lib/pay/tjd-pay";

const cell =
  "w-24 rounded-control border border-border bg-surface px-2 py-1 text-sm tabular-nums text-fg focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50";

const FIELDS: { key: keyof TjdRateCard; label: string; hint: string }[] = [
  { key: "brandWeekly", label: "Brand, weekly", hint: "A brand lead who checks in weekly." },
  { key: "brandFortnightly", label: "Brand, fortnightly", hint: "A brand lead who checks in fortnightly." },
  { key: "referralWeekly", label: "Referral, weekly", hint: "A client this coach personally brought in." },
  { key: "referralFortnightly", label: "Referral, fortnightly", hint: "Referred client, fortnightly check-ins." },
  { key: "clientWeekly", label: "Client pays, weekly", hint: "What the CLIENT pays. Drives revenue, not coach pay." },
  { key: "clientFortnightly", label: "Client pays, fortnightly", hint: "What the client pays on fortnightly." },
];

const money = (n: number) => (Number.isFinite(n) ? `$${Math.round(n * 100) / 100}` : "-");

function CoachRow({ row, onSaved }: { row: CoachRateRow; onSaved: () => void }) {
  const toast = useToast();
  // Held as MONTHLY strings while editing; converted to weekly on save.
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, String(Math.round(row[f.key] * 4 * 100) / 100)])),
  );
  const [ownerNoSplit, setOwnerNoSplit] = useState(row.ownerNoSplit);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const set = (k: string, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };

  const save = async () => {
    const rates = Object.fromEntries(FIELDS.map((f) => [f.key, Number(draft[f.key]) / 4])) as unknown as TjdRateCard;
    if (Object.values(rates).some((v) => !Number.isFinite(v))) {
      toast.push("Every rate needs to be a number.", "error");
      return;
    }
    setBusy(true);
    const res = await setCoachRatesAction({ coachId: row.coachId, rates, ownerNoSplit });
    setBusy(false);
    if (res.ok) {
      setDirty(false);
      toast.push(`${row.coachName}'s rates saved.`);
      onSaved();
    } else {
      toast.push(res.error, "error");
    }
  };

  return (
    <div className="border-b border-border-soft py-3 last:border-0">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-medium text-fg">{row.coachName}</span>
        {!row.isActive ? (
          <span className="rounded-pill bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg-muted">inactive</span>
        ) : null}
        {!row.stored ? (
          <span
            className="rounded-pill bg-warn-soft px-1.5 py-0.5 text-[10px] font-medium text-warn"
            title="No rates set for this coach yet, so they are showing the brand default. Save to make them theirs."
          >
            using the default
          </span>
        ) : null}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-fg-dim">
          <input
            type="checkbox"
            checked={ownerNoSplit}
            onChange={(e) => {
              setOwnerNoSplit(e.target.checked);
              setDirty(true);
            }}
            className="accent-accent"
          />
          <span title="The owner's own clients are tracked at the client price with no coach split.">
            Owner roster, no split
          </span>
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        {FIELDS.map((f) => {
          const monthly = Number(draft[f.key]);
          const isClientPrice = String(f.key).startsWith("client");
          return (
            <label key={String(f.key)} className="block" title={f.hint}>
              <span className="block text-[11px] text-fg-dim">{f.label}</span>
              <span className="flex items-baseline gap-1">
                <span className="text-xs text-fg-muted">$</span>
                <input
                  value={draft[f.key]}
                  onChange={(e) => set(String(f.key), e.target.value)}
                  inputMode="decimal"
                  className={cell}
                  aria-label={`${row.coachName} ${f.label} monthly`}
                  disabled={ownerNoSplit && !isClientPrice}
                />
                <span className="text-[11px] text-fg-muted">/mo</span>
              </span>
              <span className="block text-[10px] tabular-nums text-fg-muted">= {money(monthly / 4)}/wk</span>
            </label>
          );
        })}
      </div>
      <div className="mt-2">
        <Button size="sm" onClick={() => void save()} disabled={busy || !dirty}>
          {busy ? "Saving…" : dirty ? `Save ${row.coachName}` : "Saved"}
        </Button>
      </div>
    </div>
  );
}

export function CoachPayRates() {
  const [rows, setRows] = useState<CoachRateRow[] | null>(null);
  const load = () => {
    listCoachRatesAction()
      .then(setRows)
      .catch(() => setRows([]));
  };
  useEffect(load, []);

  return (
    <Panel
      title="Coach pay rates"
      subtitle="Per client, per month. Coaches are invoiced on weeks paid, so the weekly figure under each box is what payroll uses. Referral clients pay the coach more, for as long as that client stays."
    >
      {rows === null ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          icon="dollar"
          title="No coach rates yet"
          message="Rates appear here once coaches exist and the payroll migration has been applied."
        />
      ) : (
        <div>
          {rows.map((r) => (
            <CoachRow key={r.coachId} row={r} onSaved={load} />
          ))}
        </div>
      )}
    </Panel>
  );
}
