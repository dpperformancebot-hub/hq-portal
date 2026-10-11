"use client";

// R4-1: the pause board, columns straight from the master sheet "Pause List":
// client, coach, pause start, pause end, weeks (derived), days until
// reactivation (derived), reactivates-next-4-days highlight, and the two
// manual Kahunas checkboxes (no integration, tracking only). Owner/VA/head
// coach edit; a plain coach sees their own clients read-only.
//
// R16-3 (Jameela: "enter Pause end, it shows, refresh, gone"): the board now
// never shows a value that is not saved. Inputs are controlled from row state,
// a change is applied only after the action succeeds (and reverted on
// failure), a derived row (Paused in GHL, no record yet) takes its START date
// first and its end date is locked with an inline "set start first" until the
// record exists, the real id returned by create replaces the placeholder, and
// every row shows Saving / Saved / Not saved so the VA can tell.

import { Fragment, useState } from "react";
import { Button, EmptyState, PageHeader, Panel, useToast } from "@/components/ui";
import { createPauseAction, deletePauseAction, endPauseAction, updatePauseAction, type PauseRow } from "@/lib/pause-actions";
import { daysUntilReactivation, pauseWeeks, reactivatesSoon } from "@/lib/pause-math";

const dateInput =
  "rounded-control border border-border bg-surface px-2 py-1 text-xs tabular-nums text-fg focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60";

type SortKey = "reactivation" | "client" | "coach" | "start" | "end";

type RowStatus = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: number } | { kind: "error"; message: string };

function KahunasBox({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: string;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-5 w-5 items-center justify-center rounded-sm border text-[11px] ${
        checked ? "border-accent bg-accent text-white" : "border-border"
      } ${disabled ? "cursor-default opacity-60" : "hover:border-accent"}`}
    >
      {checked ? "✓" : ""}
    </button>
  );
}

function SortHeader({
  label,
  k,
  sort,
  onClick,
}: {
  label: string;
  k: SortKey;
  sort: { by: SortKey; dir: "asc" | "desc" };
  onClick: (k: SortKey) => void;
}) {
  const on = sort.by === k;
  return (
    <button
      type="button"
      onClick={() => onClick(k)}
      className={`inline-flex items-center gap-1 uppercase tracking-[0.08em] transition-colors hover:text-fg ${on ? "text-fg" : ""}`}
    >
      {label}
      <span aria-hidden className="text-[9px]">{on ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
    </button>
  );
}

function SaveState({ status }: { status: RowStatus }) {
  if (status.kind === "saving") return <span className="text-[11px] text-fg-muted">Saving…</span>;
  if (status.kind === "saved") return <span className="text-[11px] font-medium text-accent">✓ Saved</span>;
  if (status.kind === "error")
    return (
      <span className="text-[11px] font-medium text-danger" title={status.message}>
        Not saved
      </span>
    );
  return null;
}

export function PausesView({
  rows,
  clients,
  canEdit,
}: {
  rows: PauseRow[];
  /** Pickable clients for a new pause (active + paused roster). */
  clients: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const toast = useToast();
  const [local, setLocal] = useState(rows);
  const [status, setStatus] = useState<Map<string, RowStatus>>(new Map());
  // Unsaved keystrokes per row. The row itself only changes after a save.
  const [drafts, setDrafts] = useState<Map<string, { pauseStart?: string; pauseEnd?: string }>>(new Map());
  // R17-2c: the board is a "who comes back next" list, so it sorts by days to
  // reactivation by default: overdue first, then the 0-4 day amber window,
  // then everyone else, then rows with no end date under their own divider.
  const [sort, setSort] = useState<{ by: SortKey; dir: "asc" | "desc" }>({ by: "reactivation", dir: "asc" });
  const [newClient, setNewClient] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [adding, setAdding] = useState(false);

  const setRowStatus = (id: string, s: RowStatus) => setStatus((m) => new Map(m).set(id, s));
  const patchRow = (id: string, patch: Partial<PauseRow>) =>
    setLocal((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const replaceRowId = (from: string, to: string) => {
    setLocal((prev) => prev.map((r) => (r.id === from ? { ...r, id: to, derived: false } : r)));
    setStatus((m) => {
      const next = new Map(m);
      const s = next.get(from);
      next.delete(from);
      if (s) next.set(to, s);
      return next;
    });
    setDrafts((m) => {
      const next = new Map(m);
      next.delete(from);
      return next;
    });
  };
  const setDraft = (id: string, patch: { pauseStart?: string; pauseEnd?: string }) =>
    setDrafts((m) => new Map(m).set(id, { ...(m.get(id) ?? {}), ...patch }));
  const clearDraft = (id: string, field: "pauseStart" | "pauseEnd") =>
    setDrafts((m) => {
      const next = new Map(m);
      const cur = { ...(next.get(id) ?? {}) };
      delete cur[field];
      if (Object.keys(cur).length) next.set(id, cur);
      else next.delete(id);
      return next;
    });

  /** Persist one field. The row only changes when the action says ok. */
  const save = async (id: string, patch: Partial<Pick<PauseRow, "pauseStart" | "pauseEnd" | "cancelledInKahunas" | "reactivatedInKahunas">>) => {
    const row = local.find((r) => r.id === id);
    if (!row) return;
    setRowStatus(id, { kind: "saving" });

    if (row.derived) {
      // First save on a derived row CREATES the record. Start is mandatory;
      // the end input is locked in the UI until then, but guard here too.
      const pauseStart = patch.pauseStart ?? row.pauseStart;
      if (!pauseStart) {
        setRowStatus(id, { kind: "error", message: "Set the pause start first." });
        toast.push("Set the pause start date first.", "error");
        return;
      }
      const pauseEnd = patch.pauseEnd !== undefined ? patch.pauseEnd : row.pauseEnd;
      const res = await createPauseAction({ clientId: row.clientId, pauseStart, pauseEnd });
      if (res.ok && res.id) {
        patchRow(id, { pauseStart, pauseEnd, ...patch });
        replaceRowId(id, res.id);
        setRowStatus(res.id, { kind: "saved", at: Date.now() });
        toast.push(`Pause dates recorded for ${row.clientName}.`);
      } else if (res.ok) {
        // Saved, but no id came back: the next edit would target nothing.
        setRowStatus(id, { kind: "error", message: "Saved, but the row id was not returned. Refresh to keep editing." });
        toast.push("Saved. Refresh the page before editing this row again.", "error");
      } else {
        setRowStatus(id, { kind: "error", message: res.error ?? "Could not save." });
        toast.push(res.error ?? "Could not save.", "error");
      }
      return;
    }

    const res = await updatePauseAction({ ...patch, id });
    if (res.ok) {
      patchRow(id, patch);
      setRowStatus(id, { kind: "saved", at: Date.now() });
    } else {
      setRowStatus(id, { kind: "error", message: res.error ?? "Could not save." });
      toast.push(res.error ?? "Could not save.", "error");
    }
  };

  const commitDate = (r: PauseRow, field: "pauseStart" | "pauseEnd", value: string) => {
    const current = field === "pauseStart" ? r.pauseStart : (r.pauseEnd ?? "");
    clearDraft(r.id, field);
    if (value === current) return;
    if (field === "pauseStart" && !value) {
      setRowStatus(r.id, { kind: "error", message: "Pause start cannot be empty." });
      return;
    }
    void save(r.id, field === "pauseStart" ? { pauseStart: value } : { pauseEnd: value || null });
  };

  const add = async () => {
    if (!newClient || !newStart || adding) return;
    setAdding(true);
    const res = await createPauseAction({ clientId: newClient, pauseStart: newStart, pauseEnd: newEnd || null });
    setAdding(false);
    if (res.ok && res.id) {
      const name = clients.find((c) => c.id === newClient)?.name ?? "Client";
      const id = res.id;
      setLocal((prev) => [
        {
          id,
          clientId: newClient,
          clientName: name,
          coachName: prev.find((r) => r.clientId === newClient)?.coachName ?? "…",
          pauseStart: newStart,
          pauseEnd: newEnd || null,
          cancelledInKahunas: false,
          reactivatedInKahunas: false,
        },
        ...prev.filter((r) => !(r.derived && r.clientId === newClient)),
      ]);
      setRowStatus(id, { kind: "saved", at: Date.now() });
      setNewClient("");
      setNewStart("");
      setNewEnd("");
      toast.push(`Pause added for ${name}.`);
    } else {
      toast.push(res.error ?? "Could not add the pause.", "error");
    }
  };

  const endPause = async (r: PauseRow) => {
    if (!window.confirm(`End ${r.clientName}'s pause today?\n\nThe record stays, with today as the end date. Use this when they are coming back.`)) return;
    setRowStatus(r.id, { kind: "saving" });
    const res = await endPauseAction(r.id);
    if (res.ok) {
      patchRow(r.id, { pauseEnd: new Date().toISOString().slice(0, 10) });
      setRowStatus(r.id, { kind: "saved", at: Date.now() });
      toast.push(`${r.clientName}: pause ended today.`);
    } else {
      setRowStatus(r.id, { kind: "error", message: res.error ?? "Could not end the pause." });
      toast.push(res.error ?? "Could not end the pause.", "error");
    }
  };

  const deleteRecord = async (r: PauseRow) => {
    if (
      !window.confirm(
        `Delete ${r.clientName}'s pause record?\n\nThis removes it entirely and is for entries made in error. If the pause really happened, use "End pause" instead so the history is kept.\n\nA copy is written to the audit log.`,
      )
    )
      return;
    setRowStatus(r.id, { kind: "saving" });
    const res = await deletePauseAction(r.id);
    if (res.ok) {
      setLocal((prev) => prev.filter((x) => x.id !== r.id));
      toast.push(`${r.clientName}: pause record deleted.`);
    } else {
      setRowStatus(r.id, { kind: "error", message: res.error ?? "Could not delete." });
      toast.push(res.error ?? "Could not delete.", "error");
    }
  };

  const toggleSort = (by: SortKey) =>
    setSort((s2) => ({ by, dir: s2.by === by && s2.dir === "asc" ? "desc" : "asc" }));

  const cmp = (a: PauseRow, b: PauseRow): number => {
    const dir = sort.dir === "asc" ? 1 : -1;
    switch (sort.by) {
      case "client":
        return a.clientName.localeCompare(b.clientName) * dir;
      case "coach":
        return (a.coachName.localeCompare(b.coachName) || a.clientName.localeCompare(b.clientName)) * dir;
      case "start":
        return ((a.pauseStart || "").localeCompare(b.pauseStart || "") || a.clientName.localeCompare(b.clientName)) * dir;
      case "end":
        return ((a.pauseEnd || "").localeCompare(b.pauseEnd || "") || a.clientName.localeCompare(b.clientName)) * dir;
      default: {
        const da = daysUntilReactivation(a.pauseEnd);
        const db = daysUntilReactivation(b.pauseEnd);
        if (da === null || db === null) return a.clientName.localeCompare(b.clientName);
        return (da - db) * dir || a.clientName.localeCompare(b.clientName);
      }
    }
  };

  // Rows with no end date cannot be ordered by reactivation, so they sit in
  // their own group under a divider instead of silently leading the list.
  const dated = local.filter((r) => daysUntilReactivation(r.pauseEnd) !== null).sort(cmp);
  const undated = local.filter((r) => daysUntilReactivation(r.pauseEnd) === null).sort(cmp);

  const soonCount = local.filter((r) => reactivatesSoon(r.pauseEnd)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Pauses"
        subtitle="Paused clients, reactivation countdowns, and the Kahunas double-entry checklist."
      />

      {canEdit ? (
        <Panel title="Add a pause">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={newClient}
              onChange={(e) => setNewClient(e.target.value)}
              className={`${dateInput} min-w-[14rem]`}
              aria-label="Client to pause"
            >
              <option value="">Pick a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-fg-muted">from</span>
            <input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} className={dateInput} aria-label="Pause start" />
            <span className="text-xs text-fg-muted">to</span>
            <input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className={dateInput} aria-label="Pause end" />
            <Button size="sm" onClick={() => void add()} disabled={adding || !newClient || !newStart}>
              Add pause
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel
        title={`Pause list (${local.length})`}
        subtitle={soonCount > 0 ? `${soonCount} reactivating in the next 4 days.` : "Newest first."}
      >
        {local.length === 0 ? (
          <EmptyState compact icon="calendar" title="No pauses" message="Paused clients land here with their reactivation countdown." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                  <th className="px-2 py-2"><SortHeader label="Client" k="client" sort={sort} onClick={toggleSort} /></th>
                  <th className="px-2 py-2"><SortHeader label="Coach" k="coach" sort={sort} onClick={toggleSort} /></th>
                  <th className="px-2 py-2"><SortHeader label="Pause start" k="start" sort={sort} onClick={toggleSort} /></th>
                  <th className="px-2 py-2"><SortHeader label="Pause end" k="end" sort={sort} onClick={toggleSort} /></th>
                  <th className="px-2 py-2 text-right">Weeks</th>
                  <th className="px-2 py-2 text-right"><SortHeader label="Reactivates in" k="reactivation" sort={sort} onClick={toggleSort} /></th>
                  <th className="px-2 py-2 text-center">Cancelled in Kahunas</th>
                  <th className="px-2 py-2 text-center">Reactivated in Kahunas</th>
                  <th className="px-2 py-2 text-right">State</th>
                  <th className="px-2 py-2 text-right">Remove</th>
                </tr>
              </thead>
              <tbody>
                {[...dated, ...undated].map((r, idx) => {
                  const firstUndated = idx === dated.length && undated.length > 0;
                  const weeks = pauseWeeks(r.pauseStart, r.pauseEnd);
                  const days = daysUntilReactivation(r.pauseEnd);
                  const soon = reactivatesSoon(r.pauseEnd);
                  const needsDates = !!r.derived;
                  const st = status.get(r.id) ?? { kind: "idle" as const };
                  const draft = drafts.get(r.id) ?? {};
                  const busy = st.kind === "saving";
                  const endLocked = needsDates && !r.pauseStart;
                  return (
                    <Fragment key={r.id}>
                    {firstUndated ? (
                      <tr>
                        <td colSpan={10} className="bg-surface-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                          Needs an end date
                        </td>
                      </tr>
                    ) : null}
                    <tr className={`border-b border-border-soft last:border-0 ${soon ? "bg-warn-soft/50" : ""}`}>
                      <td className="px-2 py-2 font-medium text-fg">
                        {r.clientName}
                        {needsDates ? (
                          <span
                            className="ml-2 rounded-pill bg-warn-soft px-2 py-0.5 text-[10px] font-medium text-warn"
                            title="Paused in GHL with no pause dates recorded. Add the start date to track reactivation."
                          >
                            dates needed
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-fg-dim">{r.coachName}</td>
                      <td className="px-2 py-2">
                        <input
                          type="date"
                          value={draft.pauseStart ?? r.pauseStart}
                          disabled={!canEdit || busy}
                          onChange={(e) => setDraft(r.id, { pauseStart: e.target.value })}
                          onBlur={(e) => commitDate(r, "pauseStart", e.target.value)}
                          className={dateInput}
                          aria-label={`${r.clientName} pause start`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col gap-0.5">
                          <input
                            type="date"
                            value={draft.pauseEnd ?? (r.pauseEnd ?? "")}
                            disabled={!canEdit || busy || endLocked}
                            onChange={(e) => setDraft(r.id, { pauseEnd: e.target.value })}
                            onBlur={(e) => commitDate(r, "pauseEnd", e.target.value)}
                            className={dateInput}
                            aria-label={`${r.clientName} pause end`}
                            title={endLocked ? "Set the pause start first." : undefined}
                          />
                          {endLocked ? <span className="text-[10px] text-fg-muted">set start first</span> : null}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-fg-dim">{weeks ?? "-"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {days == null ? (
                          <span className="text-fg-muted">-</span>
                        ) : soon ? (
                          <span className="font-medium text-warn">{days}d</span>
                        ) : (
                          <span className="text-fg-dim">{days}d</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex justify-center">
                          <KahunasBox
                            checked={r.cancelledInKahunas}
                            label={`${r.clientName} cancelled in Kahunas`}
                            disabled={!canEdit || busy || needsDates}
                            onChange={(next) => void save(r.id, { cancelledInKahunas: next })}
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex justify-center">
                          <KahunasBox
                            checked={r.reactivatedInKahunas}
                            label={`${r.clientName} reactivated in Kahunas`}
                            disabled={!canEdit || busy || needsDates}
                            onChange={(next) => void save(r.id, { reactivatedInKahunas: next })}
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <SaveState status={st} />
                      </td>
                      <td className="px-2 py-2 text-right">
                        {needsDates ? (
                          // R17-2b: a derived row is not a record, so there is
                          // nothing here to delete. Say where it actually lives.
                          <span className="text-[11px] text-fg-muted" title="This client is Paused in GHL with no pause record in the portal. The board follows GHL, so the fix is in GHL.">
                            Paused in GHL, change Status in GHL to remove
                          </span>
                        ) : canEdit ? (
                          <span className="inline-flex gap-2">
                            {!r.pauseEnd ? (
                              <button type="button" disabled={busy} onClick={() => void endPause(r)} className="text-[11px] font-medium text-accent hover:underline">
                                End pause
                              </button>
                            ) : null}
                            <button type="button" disabled={busy} onClick={() => void deleteRecord(r)} className="text-[11px] text-danger hover:underline" title="For an entry made in error. Keeps an audit copy.">
                              Delete record
                            </button>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
