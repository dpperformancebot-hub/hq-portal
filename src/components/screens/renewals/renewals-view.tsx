"use client";

// Re-sign call list (D4/D5, FEEDBACK-V2): tabs All / Next 30 days / Overdue
// (the dashboard Expiring card deep-links to Next 30 days), the old monthly
// rate column is replaced by the client's PROGRAM (plan + term + PIF/WBW),
// and each row carries an owner/VA-editable note (call booked / thinking...).

import { useState, useTransition } from "react";
import Link from "next/link";
import { DataTable, EmptyState, PageHeader, Panel, useToast, type Column } from "@/components/ui";
import { datedFilename } from "@/lib/csv";
import { paymentStructure } from "@/lib/journey-buckets";
import { setRenewalNoteAction, setTermEndOverrideAction } from "@/lib/renewal-actions";
import { makeCoachNamer } from "./coach-name";
import type { RenewalRow } from "@/lib/data";

// R16-6b (Jameela: "what should I write?"): a fixed vocabulary as chips. A
// chip prepends "[Chip] " to the note; the filter pills parse that prefix.
// No new table, the note column stays free text.
export const NOTE_TAGS = ["Renewed", "Renew pending", "Call booked", "Call taken", "Cancelling", "Chasing", "PIF"] as const;
export type NoteTag = (typeof NOTE_TAGS)[number];
const TAG_RE = /^\[([^\]]+)\]/;
export function noteTag(note: string | null | undefined): NoteTag | null {
  const m = (note ?? "").trim().match(TAG_RE);
  if (!m) return null;
  const hit = NOTE_TAGS.find((t) => t.toLowerCase() === m[1].trim().toLowerCase());
  return hit ?? null;
}
/** Swap or add the leading tag, keeping the free text after it. */
export function withTag(note: string, tag: NoteTag): string {
  const rest = note.replace(TAG_RE, "").trim();
  return rest ? `[${tag}] ${rest}` : `[${tag}] `;
}

const fmtIso = (iso: string) => iso;

function dueLabel(days: number): { text: string; cls: string } {
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, cls: "text-danger font-medium" };
  if (days === 0) return { text: "today", cls: "text-danger font-medium" };
  if (days <= 7) return { text: `in ${days}d`, cls: "text-warn font-medium" };
  return { text: `in ${days}d`, cls: "text-fg-dim" };
}

/** D5: the program label, e.g. "16wk PIF" or "Weekly (WBW)". */
function programLabel(r: RenewalRow): string {
  const pay = paymentStructure(r.client);
  if (r.client.termLength) return `${r.client.termLength}wk ${pay ?? "term"}`;
  return `${r.client.plan}${pay ? ` (${pay})` : ""}`;
}

export type RenewalsTab = "all" | "next30" | "overdue";

const TABS: { value: RenewalsTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "next30", label: "Next 30 days" },
  { value: "overdue", label: "Overdue" },
];

function NoteCell({
  row,
  canEdit,
  note,
  onSaved,
}: {
  row: RenewalRow;
  canEdit: boolean;
  note: string;
  onSaved: (clientId: string, note: string) => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const [, start] = useTransition();

  const save = (value: string) => {
    setEditing(false);
    if (value.trim() === note.trim()) return;
    start(async () => {
      const res = await setRenewalNoteAction(row.client.id, value);
      if (res.ok) {
        onSaved(row.client.id, value.trim());
        setDraft(value.trim());
        toast.push("Renewal note saved");
      } else {
        toast.push(res.error, "error");
      }
    });
  };


  if (editing) {
    const current = noteTag(draft);
    return (
      <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap gap-1">
          {NOTE_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onMouseDown={(e) => e.preventDefault() /* keep the input focused */}
              onClick={() => setDraft((d) => withTag(d, t))}
              className={`rounded-pill border px-1.5 py-0.5 text-[10px] transition-colors ${
                current === t ? "border-accent bg-accent text-white" : "border-border text-fg-dim hover:border-accent"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          value={draft}
          autoFocus
          maxLength={300}
          placeholder="Pick a chip, then add detail…"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => save(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save(draft);
            if (e.key === "Escape") {
              setDraft(note);
              setEditing(false);
            }
          }}
          className="w-full rounded-control border border-border bg-surface px-2 py-1 text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
          aria-label={`Renewal note for ${row.client.name}`}
        />
      </div>
    );
  }
  const tag = noteTag(note);
  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={`flex w-full items-center gap-1.5 truncate rounded-control px-1 py-0.5 text-left text-xs ${
        note ? "text-fg" : "text-fg-muted italic"
      } ${canEdit ? "hover:bg-surface-2" : "cursor-default"}`}
      title={canEdit ? "Edit renewal note" : note}
    >
      {tag ? <span className="shrink-0 rounded-pill bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium not-italic text-accent-deep">{tag}</span> : null}
      <span className="truncate">{tag ? note.replace(TAG_RE, "").trim() || "" : note || (canEdit ? "Add note…" : "-")}</span>
    </button>
  );
}

// R16-6a: pencil on Term end. Writes clients.term_end_override (never GHL,
// see setTermEndOverrideAction). Confirm names the client and old -> new.
function TermEndCell({
  row,
  canEdit,
  value,
  overridden,
  onSaved,
}: {
  row: RenewalRow;
  canEdit: boolean;
  value: string;
  overridden: boolean;
  onSaved: (clientId: string, iso: string | null) => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const commit = (iso: string | null) => {
    setPendingValue(null);
    setEditing(false);
    start(async () => {
      const res = await setTermEndOverrideAction(row.client.id, iso);
      if (res.ok) {
        onSaved(row.client.id, iso);
        toast.push(iso ? `Term end for ${row.client.name} set to ${iso}.` : `Term end for ${row.client.name} back to the GHL date.`);
      } else {
        toast.push(res.error, "error");
      }
    });
  };

  if (pendingValue !== null) {
    return (
      <div className="space-y-1 text-xs" onClick={(e) => e.stopPropagation()}>
        <div className="text-fg">
          {row.client.name}: {value} <span className="text-fg-muted">to</span> <span className="font-medium">{pendingValue}</span>?
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => commit(pendingValue)} className="rounded-control bg-accent px-2 py-0.5 font-medium text-white hover:bg-accent-deep">
            Save
          </button>
          <button type="button" onClick={() => setPendingValue(null)} className="rounded-control border border-border px-2 py-0.5 text-fg-dim hover:text-fg">
            Cancel
          </button>
        </div>
      </div>
    );
  }
  if (editing) {
    return (
      <input
        type="date"
        defaultValue={value}
        autoFocus
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => {
          const v = e.target.value;
          if (!v || v === value) setEditing(false);
          else setPendingValue(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
        className="rounded-control border border-border bg-surface px-1.5 py-0.5 text-xs tabular-nums text-fg focus:outline-none focus:ring-1 focus:ring-accent"
        aria-label={`Term end for ${row.client.name}`}
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular-nums" title={overridden ? "Set manually in the portal (overrides the GHL term end)" : "From GHL (Term End Date)"}>
        {fmtIso(value)}
      </span>
      {overridden ? <span className="rounded-pill bg-accent-soft px-1 py-0.5 text-[9px] font-medium text-accent-deep">manual</span> : null}
      {canEdit ? (
        <button
          type="button"
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="text-fg-muted hover:text-fg"
          title="Edit term end"
          aria-label={`Edit term end for ${row.client.name}`}
        >
          ✎
        </button>
      ) : null}
      {canEdit && overridden ? (
        <button
          type="button"
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation();
            commit(null);
          }}
          className="text-[10px] text-fg-muted hover:text-fg"
          title="Clear the manual date and use the GHL term end again"
        >
          reset
        </button>
      ) : null}
    </span>
  );
}

export function RenewalsView({
  rows,
  coachNames,
  initialTab = "all",
  canEditNotes = false,
}: {
  rows: RenewalRow[];
  coachNames?: Record<string, string>;
  /** Deep-linkable tab (?tab=next30 from the dashboard Expiring card, D4). */
  initialTab?: RenewalsTab;
  /** Owner/VA only (enforced again server-side in setRenewalNoteAction). */
  canEditNotes?: boolean;
}) {
  const coachLabel = makeCoachNamer(coachNames);
  const [tab, setTab] = useState<RenewalsTab>(initialTab);
  // Local note overlay so an edit shows without waiting for revalidation.
  const [notes, setNotes] = useState<Record<string, string>>({});
  const noteOf = (r: RenewalRow) => notes[r.client.id] ?? r.client.renewalNote ?? "";
  // R16-6a: local term-end overlay (null = cleared back to GHL).
  const [termEnds, setTermEnds] = useState<Record<string, string | null>>({});
  const termEndOf = (r: RenewalRow) => (r.client.id in termEnds ? (termEnds[r.client.id] ?? r.client.endDate ?? r.renewalDate) : r.renewalDate);
  const overriddenOf = (r: RenewalRow) => (r.client.id in termEnds ? termEnds[r.client.id] !== null : !!r.overridden);
  // R16-6b: filter by note tag.
  const [tagFilter, setTagFilter] = useState<NoteTag | "all">("all");

  const overdue = rows.filter((r) => r.daysToRenewal <= 0).length;
  const thisWeek = rows.filter((r) => r.daysToRenewal > 0 && r.daysToRenewal <= 7).length;

  const visible = rows.filter((r) => {
    if (tagFilter !== "all" && noteTag(noteOf(r)) !== tagFilter) return false;
    if (tab === "next30") return r.daysToRenewal > 0 && r.daysToRenewal <= 30;
    if (tab === "overdue") return r.daysToRenewal <= 0;
    return true;
  });
  const tagCounts = new Map<NoteTag, number>();
  for (const r of rows) {
    const t = noteTag(noteOf(r));
    if (t) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }

  const columns: Column<RenewalRow>[] = [
    {
      key: "client",
      header: "Client",
      csvValue: (r) => r.client.name,
      render: (r) => (
        <Link href={`/client-database/${r.client.id}`} className="text-fg hover:underline">
          {r.client.name}
        </Link>
      ),
    },
    { key: "coach", header: "Coach", csvValue: (r) => coachLabel(r.client.coachId), render: (r) => coachLabel(r.client.coachId) },
    { key: "weeksIn", header: "Week", csvValue: (r) => r.weeksIn, render: (r) => <span className="tabular-nums">{r.weeksIn}</span> },
    {
      key: "program",
      header: "Program",
      csvValue: (r) => programLabel(r),
      render: (r) => <span className="text-fg-dim">{programLabel(r)}</span>,
    },
    {
      key: "renewalDate",
      header: "Term ends",
      csvValue: (r) => termEndOf(r),
      render: (r) => (
        <TermEndCell
          row={r}
          canEdit={canEditNotes}
          value={termEndOf(r)}
          overridden={overriddenOf(r)}
          onSaved={(clientId, iso) => setTermEnds((prev) => ({ ...prev, [clientId]: iso }))}
        />
      ),
    },
    {
      key: "due",
      header: "Due",
      csvValue: (r) => dueLabel(r.daysToRenewal).text,
      render: (r) => {
        const d = dueLabel(r.daysToRenewal);
        return <span className={`tabular-nums ${d.cls}`}>{d.text}</span>;
      },
    },
    {
      key: "note",
      header: "Notes",
      width: "220px",
      csvValue: (r) => noteOf(r),
      render: (r) => (
        <NoteCell
          row={r}
          canEdit={canEditNotes}
          note={noteOf(r)}
          onSaved={(clientId, note) => setNotes((prev) => ({ ...prev, [clientId]: note }))}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        back
        eyebrow="Operations"
        title="Renewals"
        subtitle={`${rows.length} clients in the re-sign window: ${overdue} overdue, ${thisWeek} due this week. Book the call before the term ends.`}
      />

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const count =
            t.value === "all"
              ? rows.length
              : t.value === "next30"
                ? rows.filter((r) => r.daysToRenewal > 0 && r.daysToRenewal <= 30).length
                : overdue;
          const on = t.value === tab;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                on ? "border-accent text-fg" : "border-transparent text-fg-dim hover:text-fg"
              }`}
            >
              {t.label}
              <span className="text-xs tabular-nums text-fg-muted">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-fg-muted">Notes:</span>
        {(["all", ...NOTE_TAGS] as (NoteTag | "all")[]).map((t) => {
          const on = tagFilter === t;
          const n = t === "all" ? rows.length : (tagCounts.get(t) ?? 0);
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTagFilter(t)}
              className={`rounded-pill border px-2 py-0.5 transition-colors ${
                on ? "border-accent bg-accent text-white" : "border-border text-fg-dim hover:border-accent hover:text-fg"
              }`}
            >
              {t === "all" ? "All" : t} <span className="tabular-nums opacity-80">{n}</span>
            </button>
          );
        })}
      </div>

      <Panel
        title="Re-sign call list"
        subtitle="Book the re-sign call manually in GHL or the calendar. The HQ never contacts clients automatically (NO-CONTACT)."
      >
        {visible.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No renewals in window"
            message={tagFilter === "all" ? "No client matches this tab right now." : `No client on this tab carries the [${tagFilter}] note.`}
          />
        ) : (
          <DataTable columns={columns} data={visible} getRowKey={(r) => r.client.id} exportFilename={datedFilename(`renewals-${tab}`)} />
        )}
      </Panel>
    </div>
  );
}
