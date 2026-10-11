"use client";

// Week-grid check-in view (port of the original coach portal's core
// spreadsheet, 2026-07-02; editable cells 2026-07-03). Frozen client column
// on the left, one column per ISO week (Monday-start), each cell the client's
// status code for that week. Left-click opens the status picker and logs a
// manual check-in (optimistic, toast-confirmed). Right-click opens a note.
//
// R16-2 (Dan's Loom 2026-09-17 + Kai's notes): Start column and default sort
// by start (oldest first, header toggles direction, remembered per coach);
// one editable FUTURE week on the right; the new code set (Y, MS, M, F, G, P,
// C, N) with whole-cell colour fills; row + name hover; right-click notes.
// Week maths and sorting live in src/lib/check-in-weeks.ts (tested).

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui";
import { clearCheckInWeekAction, logCheckInAction, setCheckInNoteAction } from "@/lib/check-in-entry-actions";
import { setCheckInDayAction, setClientPlanAction } from "@/lib/client-flags-actions";
import { CHECKIN_META } from "@/lib/seed/types";
import type { CheckIn, CheckInCode, Client } from "@/lib/seed/types";
import { displayClientName } from "@/lib/client-name";
import {
  DEFAULT_SORT,
  buildWeekWindow,
  fmtWeek,
  gridSortStorageKey,
  isoDate,
  sortByStart,
  startsInFuture,
  weekStart,
  type SortDir,
  type SortKey,
} from "@/lib/check-in-weeks";

// Whole-cell fills (R16-2d). Tokens only; the classes are spelled out so
// Tailwind's JIT sees them. Y / MS / F are three clearly different hues.
const CODE_CLS: Record<CheckInCode, string> = {
  Y: "bg-status-submitted text-status-submitted-fg",
  MS: "bg-status-message-sent text-status-message-sent-fg",
  M: "bg-status-missed-check-in text-status-missed-check-in-fg",
  F: "bg-status-follow-up text-status-follow-up-fg",
  G: "bg-status-ghosted text-status-ghosted-fg",
  P: "bg-status-paused text-status-paused-fg",
  C: "bg-status-missed text-status-missed-fg",
  // N = no check-in: empty cell with a faint dot, letter kept for the eye.
  N: "bg-transparent text-fg-muted",
};

const CODES = Object.keys(CHECKIN_META) as CheckInCode[];
const NOTE_MAX = 280;

/** Small badge for menus and the list view; the grid cell fills itself. */
function CodeBadge({ code }: { code: CheckInCode }) {
  return (
    <span
      title={CHECKIN_META[code].label}
      className={`inline-flex min-w-[2rem] items-center justify-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${CODE_CLS[code]}`}
    >
      {code === "N" ? <span className="mr-1 inline-block h-1 w-1 rounded-full bg-status-ghosted-dot/60" aria-hidden /> : null}
      {code}
    </span>
  );
}

type OpenCell = { clientId: string; clientName: string; coachId: string | null; week: number; x: number; y: number };
type NoteCell = OpenCell & { draft: string };

const fmtStart = (iso: string | null | undefined) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function CheckInWeekGrid({
  clients,
  checkIns,
  onRowClick,
  editable = false,
  sortScope = "default",
}: {
  clients: Client[];
  checkIns: CheckIn[];
  onRowClick?: (client: Client) => void;
  /** Coach portal: cells open the status picker and log manual check-ins. */
  editable?: boolean;
  /** localStorage scope for the remembered sort (coach id, or "owner"). */
  sortScope?: string;
}) {
  const toast = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [openCell, setOpenCell] = useState<OpenCell | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [noteCell, setNoteCell] = useState<NoteCell | null>(null);
  // Optimistic overrides: (clientId|weekMs) -> code, applied over server data.
  // null = cleared (R13-4), which must win over the server value.
  const [overrides, setOverrides] = useState<Map<string, CheckInCode | null>>(new Map());
  const [noteOverrides, setNoteOverrides] = useState<Map<string, string | null>>(new Map());
  const [pageBack, setPageBack] = useState(0);
  const [sort, setSort] = useState<{ by: SortKey; dir: SortDir }>(DEFAULT_SORT);
  const [sortLoaded, setSortLoaded] = useState(false);
  const [dayOverride, setDayOverride] = useState<Map<string, number | null>>(new Map());
  const [planOverride, setPlanOverride] = useState<Map<string, "Weekly" | "Fortnightly">>(new Map());

  // Remembered sort per coach (R16-2a). Read after mount so SSR and the first
  // client render agree; write on every change.
  const storageKey = gridSortStorageKey(sortScope);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { by?: SortKey; dir?: SortDir };
        if (parsed.by && parsed.dir) setSort({ by: parsed.by, dir: parsed.dir });
      }
    } catch {
      /* storage unavailable: keep the default */
    }
    setSortLoaded(true);
  }, [storageKey]);
  useEffect(() => {
    if (!sortLoaded) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(sort));
    } catch {
      /* best-effort */
    }
  }, [sort, sortLoaded, storageKey]);

  const weeks = useMemo(() => buildWeekWindow(new Date(), pageBack), [pageBack]);
  const lastPastWeek = useMemo(() => {
    const cols = weeks.filter((w) => !w.future);
    return cols[cols.length - 1]?.start ?? weekStart(new Date());
  }, [weeks]);

  // clientId -> weekStart -> latest code that week. checkIns arrive
  // latest-first, so first write per (client, week) wins. Notes are read from
  // any row in the week (a note may sit on a code-less row).
  const { grid, notes } = useMemo(() => {
    const g = new Map<string, Map<number, CheckInCode>>();
    const n = new Map<string, string>();
    for (const ci of checkIns) {
      const d = new Date(ci.submittedAt);
      if (Number.isNaN(d.getTime())) continue;
      const w = weekStart(d);
      if (ci.note && !n.has(`${ci.clientId}|${w}`)) n.set(`${ci.clientId}|${w}`, ci.note);
      if (!ci.code) continue;
      let row = g.get(ci.clientId);
      if (!row) {
        row = new Map();
        g.set(ci.clientId, row);
      }
      if (!row.has(w)) row.set(w, ci.code);
    }
    return { grid: g, notes: n };
  }, [checkIns]);

  // Open on the current week (right side), like the original portal.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  // Popovers close on Escape and any OUTSIDE mousedown. Containment check, not
  // stopPropagation: Next mounts React's event root on `document`, the same
  // node as this listener, so stopPropagation cannot stop it.
  useEffect(() => {
    if (!openCell && !noteCell) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenCell(null);
        setConfirmClear(false);
        setNoteCell(null);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setOpenCell(null);
      setConfirmClear(false);
      setNoteCell(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [openCell, noteCell]);

  const codeAt = (clientId: string, w: number): CheckInCode | undefined => {
    const key = `${clientId}|${w}`;
    if (overrides.has(key)) return overrides.get(key) ?? undefined;
    return grid.get(clientId)?.get(w);
  };
  const noteAt = (clientId: string, w: number): string | null => {
    const key = `${clientId}|${w}`;
    if (noteOverrides.has(key)) return noteOverrides.get(key) ?? null;
    return notes.get(key) ?? null;
  };

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayOf = (c: Client): number | null =>
    dayOverride.has(c.id) ? (dayOverride.get(c.id) ?? null) : (c.checkInDay ?? null);
  const planOf = (c: Client) => planOverride.get(c.id) ?? c.plan;

  const setDay = (c: Client, day: number | null) => {
    const prev = dayOf(c);
    setDayOverride((m) => new Map(m).set(c.id, day));
    void setCheckInDayAction(c.id, day).then((res) => {
      if (!res.ok) {
        setDayOverride((m) => new Map(m).set(c.id, prev));
        toast.push(res.error, "error");
      }
    });
  };
  const setPlan = (c: Client, plan: "Weekly" | "Fortnightly") => {
    const prev = planOf(c);
    setPlanOverride((m) => new Map(m).set(c.id, plan));
    void setClientPlanAction(c.id, plan).then((res) => {
      if (!res.ok) {
        setPlanOverride((m) => new Map(m).set(c.id, prev === "Monthly" ? "Weekly" : prev));
        toast.push(res.error, "error");
      }
    });
  };

  // Sort (R12-6 + R16-2a). "status" ranks by the latest PAST week's code
  // (attention first); "start" is the default, oldest at the top.
  const sorted = useMemo(() => {
    const rank = (c: Client) => {
      const code = codeAt(c.id, lastPastWeek);
      return !code ? 0 : ["G", "N", "F", "M"].includes(code) ? 1 : 2;
    };
    if (sort.by === "start") return sortByStart(clients, sort.dir);
    const arr = [...clients];
    if (sort.by === "day") arr.sort((a, b) => (dayOf(a) ?? 7) - (dayOf(b) ?? 7) || a.name.localeCompare(b.name));
    else if (sort.by === "plan") arr.sort((a, b) => planOf(a).localeCompare(planOf(b)) || a.name.localeCompare(b.name));
    else if (sort.by === "status") arr.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    else arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, sort, dayOverride, planOverride, overrides, lastPastWeek]);

  const toggleStartSort = () =>
    setSort((s) => (s.by === "start" ? { by: "start", dir: s.dir === "asc" ? "desc" : "asc" } : { by: "start", dir: "asc" }));

  const pick = (cell: OpenCell, code: CheckInCode) => {
    setOpenCell(null);
    setConfirmClear(false);
    if (!cell.coachId) {
      toast.push("This client has no coach assigned, so a check-in can't be attributed.", "error");
      return;
    }
    const key = `${cell.clientId}|${cell.week}`;
    const previous = overrides.get(key);
    setOverrides((m) => new Map(m).set(key, code));
    void logCheckInAction({
      clientId: cell.clientId,
      coachId: cell.coachId,
      code,
      submittedAt: isoDate(cell.week), // the cell's own Monday, future weeks included
    }).then((res) => {
      if (res.ok) {
        toast.push(`${cell.clientName}: ${CHECKIN_META[code].label} (wk of ${fmtWeek(cell.week)})`);
      } else {
        // Roll back the optimistic cell so the grid never lies.
        setOverrides((m) => {
          const next = new Map(m);
          if (previous !== undefined) next.set(key, previous);
          else next.delete(key);
          return next;
        });
        toast.push(res.error ?? "Could not log the check-in.", "error");
      }
    });
  };

  // R13-4: clear the cell entirely (Dan: "have it completely deleted"). A cell
  // with a note asks first (R16-2f): clearing removes the note too.
  const clear = (cell: OpenCell) => {
    setOpenCell(null);
    setConfirmClear(false);
    const key = `${cell.clientId}|${cell.week}`;
    const hadOverride = overrides.has(key);
    const previous = overrides.get(key);
    const previousNote = noteAt(cell.clientId, cell.week);
    setOverrides((m) => new Map(m).set(key, null));
    setNoteOverrides((m) => new Map(m).set(key, null));
    void clearCheckInWeekAction({ clientId: cell.clientId, weekStart: isoDate(cell.week) }).then((res) => {
      if (res.ok) {
        toast.push(`${cell.clientName}: check-in cleared (wk of ${fmtWeek(cell.week)})`);
      } else {
        setOverrides((m) => {
          const next = new Map(m);
          if (hadOverride) next.set(key, previous ?? null);
          else next.delete(key);
          return next;
        });
        setNoteOverrides((m) => {
          const next = new Map(m);
          if (previousNote) next.set(key, previousNote);
          else next.delete(key);
          return next;
        });
        toast.push(res.error ?? "Could not clear the check-in.", "error");
      }
    });
  };

  const saveNote = (cell: NoteCell) => {
    const note = cell.draft.trim().slice(0, NOTE_MAX);
    setNoteCell(null);
    const key = `${cell.clientId}|${cell.week}`;
    const previous = noteAt(cell.clientId, cell.week);
    setNoteOverrides((m) => new Map(m).set(key, note || null));
    void setCheckInNoteAction({ clientId: cell.clientId, coachId: cell.coachId, weekStart: isoDate(cell.week), note }).then((res) => {
      if (res.ok) {
        toast.push(`${cell.clientName}: note ${note ? "saved" : "removed"} (wk of ${fmtWeek(cell.week)})`);
      } else {
        setNoteOverrides((m) => {
          const next = new Map(m);
          if (previous) next.set(key, previous);
          else next.delete(key);
          return next;
        });
        toast.push(res.error ?? "Could not save the note.", "error");
      }
    });
  };

  const popoverStyle = (x: number, y: number, w: number, h: number) => ({
    position: "fixed" as const,
    left: Math.min(x, typeof window !== "undefined" ? window.innerWidth - w : x),
    top: Math.min(y + 8, typeof window !== "undefined" ? window.innerHeight - h : y),
  });

  const hasFutureCol = weeks.some((w) => w.future);

  return (
    <div className="space-y-2">
      {/* Window paging + sort. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-fg-dim">
          <button
            type="button"
            onClick={() => setPageBack((n) => n + 1)}
            className="rounded-control border border-border px-2 py-1 font-medium transition-colors hover:bg-surface-2 hover:text-fg"
          >
            ← Older
          </button>
          <button
            type="button"
            onClick={() => setPageBack((n) => Math.max(0, n - 1))}
            disabled={pageBack === 0}
            className="rounded-control border border-border px-2 py-1 font-medium transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
          >
            Newer →
          </button>
          {pageBack > 0 ? (
            <span className="tabular-nums">{fmtWeek(weeks[0].start)} to {fmtWeek(weeks[weeks.length - 1].start)}</span>
          ) : (
            <span>this week{hasFutureCol ? " + next" : ""}</span>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-fg-dim">
          Sort
          <select
            value={sort.by}
            onChange={(e) => setSort((s) => ({ by: e.target.value as SortKey, dir: e.target.value === "start" ? s.dir : "asc" }))}
            className="rounded-control border border-border bg-surface px-2 py-1 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent"
            aria-label="Sort grid"
          >
            <option value="start">Start date</option>
            <option value="name">Name</option>
            <option value="day">Check-in day</option>
            <option value="plan">Cadence</option>
            <option value="status">Needs attention</option>
          </select>
        </label>
      </div>
      <div ref={scrollRef} className="overflow-x-auto rounded-card border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              <th className="sticky left-0 z-10 min-w-[11rem] bg-surface-2 px-3 py-2">Client</th>
              <th className="min-w-[5.5rem] px-2 py-2">Cadence</th>
              <th className="min-w-[4.5rem] px-2 py-2">
                <button
                  type="button"
                  onClick={toggleStartSort}
                  className={`inline-flex items-center gap-1 uppercase tracking-[0.08em] transition-colors hover:text-fg ${sort.by === "start" ? "text-fg" : ""}`}
                  title={sort.by === "start" && sort.dir === "asc" ? "Oldest first. Click for newest first." : "Click to sort by start date, oldest first."}
                  aria-label="Sort by start date"
                >
                  Start
                  <span aria-hidden className="text-[9px]">{sort.by === "start" ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                </button>
              </th>
              <th className="min-w-[5.5rem] px-2 py-2">Check-in day</th>
              {weeks.map((w) => (
                <th
                  key={w.start}
                  className={`min-w-[3.25rem] px-1 py-2 text-center tabular-nums ${
                    w.current ? "bg-accent-soft text-accent" : ""
                  } ${w.future ? "border-l border-dashed border-border text-fg-muted/70" : ""}`}
                  title={w.future ? "Next week: pre-mark clients you know will be away or paused." : undefined}
                >
                  {fmtWeek(w.start)}
                  {w.future ? <span className="block text-[8px] font-medium normal-case tracking-normal">next</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const future = startsInFuture(c.startDate);
              return (
                <tr
                  key={c.id}
                  onClick={onRowClick ? () => onRowClick(c) : undefined}
                  className={`group border-b border-border last:border-b-0 ${onRowClick ? "cursor-pointer" : ""}`}
                >
                  <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium text-fg transition-colors group-hover:bg-accent-soft">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {displayClientName(c.name)}
                      {future ? (
                        <span
                          className="rounded-sm bg-status-follow-up px-1 py-0.5 text-[10px] font-medium text-status-follow-up-fg"
                          title={`Starts ${fmtStart(c.startDate)}`}
                        >
                          starts {fmtStart(c.startDate)}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-fg-dim transition-colors group-hover:bg-surface-2" onClick={(e) => e.stopPropagation()}>
                    {editable && c.plan !== "Monthly" ? (
                      <select
                        value={planOf(c)}
                        onChange={(e) => setPlan(c, e.target.value as "Weekly" | "Fortnightly")}
                        className="rounded-control border border-transparent bg-transparent py-1 text-sm text-fg-dim transition-colors hover:border-border focus:outline-none"
                        aria-label={`${c.name} cadence`}
                        title="Cadence. On DP this also lives in GHL: update it there too or a future sync may revert it."
                      >
                        <option value="Weekly">Weekly</option>
                        <option value="Fortnightly">Fortnightly</option>
                      </select>
                    ) : (
                      planOf(c)
                    )}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-fg-dim transition-colors group-hover:bg-surface-2" title={c.startDate ?? undefined}>
                    {fmtStart(c.startDate)}
                  </td>
                  <td className="px-2 py-2 text-fg-dim transition-colors group-hover:bg-surface-2" onClick={(e) => e.stopPropagation()}>
                    {editable ? (
                      <select
                        value={dayOf(c) ?? ""}
                        onChange={(e) => setDay(c, e.target.value === "" ? null : Number(e.target.value))}
                        className="rounded-control border border-transparent bg-transparent py-1 text-sm text-fg-dim transition-colors hover:border-border focus:outline-none"
                        aria-label={`${c.name} check-in day`}
                      >
                        <option value="">not set</option>
                        {DAYS.map((d, i) => (
                          <option key={d} value={i}>{d}</option>
                        ))}
                      </select>
                    ) : dayOf(c) !== null ? (
                      DAYS[dayOf(c) as number]
                    ) : (
                      "-"
                    )}
                  </td>
                  {weeks.map((w) => {
                    const code = codeAt(c.id, w.start);
                    const note = noteAt(c.id, w.start);
                    const fill = code ? CODE_CLS[code] : "";
                    const inner = code ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-medium tabular-nums">
                        {code === "N" ? <span className="inline-block h-1 w-1 rounded-full bg-status-ghosted-dot/60" aria-hidden /> : null}
                        {code}
                      </span>
                    ) : (
                      <span className="text-fg-muted">·</span>
                    );
                    const noteDot = note ? (
                      <span className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                    ) : null;
                    return (
                      <td
                        key={w.start}
                        className={`p-0.5 text-center transition-colors group-hover:bg-surface-2 ${w.current ? "bg-accent-soft/40" : ""} ${
                          w.future ? "border-l border-dashed border-border" : ""
                        }`}
                      >
                        {editable ? (
                          <button
                            type="button"
                            aria-label={`Set ${c.name}'s status for week of ${fmtWeek(w.start)}${note ? ". Has a note" : ""}`}
                            title={note ?? (code ? CHECKIN_META[code].label : undefined)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmClear(false);
                              setNoteCell(null);
                              setOpenCell({ clientId: c.id, clientName: c.name, coachId: c.coachId, week: w.start, x: e.clientX, y: e.clientY });
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setOpenCell(null);
                              setConfirmClear(false);
                              setNoteCell({ clientId: c.id, clientName: c.name, coachId: c.coachId, week: w.start, x: e.clientX, y: e.clientY, draft: note ?? "" });
                            }}
                            className={`relative flex h-9 w-full min-w-[3rem] items-center justify-center rounded-control transition-colors hover:ring-2 hover:ring-accent/50 ${fill || "hover:bg-surface-2"} ${
                              w.future && !code ? "bg-surface-2/40" : ""
                            }`}
                          >
                            {inner}
                            {noteDot}
                          </button>
                        ) : (
                          <span
                            title={note ?? (code ? CHECKIN_META[code].label : undefined)}
                            className={`relative flex h-9 w-full min-w-[3rem] items-center justify-center rounded-control ${fill}`}
                          >
                            {inner}
                            {noteDot}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Status picker: fixed-position so the scrolling grid never clips it. */}
        {openCell ? (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Set weekly status"
            style={popoverStyle(openCell.x, openCell.y, 190, 400)}
            className="z-50 w-44 overflow-hidden rounded-card border border-border bg-surface py-1 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              {openCell.clientName} · {fmtWeek(openCell.week)}
            </div>
            {confirmClear ? (
              <div className="space-y-2 px-3 py-2 text-sm text-fg">
                <p>This cell has a note. Clearing removes the note too.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => clear(openCell)}
                    className="rounded-control bg-danger px-2 py-1 text-xs font-medium text-white transition-colors hover:opacity-90"
                  >
                    Clear anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="rounded-control border border-border px-2 py-1 text-xs font-medium text-fg transition-colors hover:bg-surface-2"
                  >
                    Keep
                  </button>
                </div>
              </div>
            ) : (
              <>
                {CODES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    role="menuitem"
                    onClick={() => pick(openCell, code)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg transition-colors hover:bg-surface-2"
                  >
                    <CodeBadge code={code} />
                    {CHECKIN_META[code].label}
                  </button>
                ))}
                {codeAt(openCell.clientId, openCell.week) || noteAt(openCell.clientId, openCell.week) ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => (noteAt(openCell.clientId, openCell.week) ? setConfirmClear(true) : clear(openCell))}
                    className="mt-1 flex w-full items-center gap-2 border-t border-border px-3 py-1.5 text-left text-sm text-danger transition-colors hover:bg-surface-2"
                  >
                    <span className="inline-flex min-w-[2rem] items-center justify-center rounded-sm px-1.5 py-0.5 text-[11px] font-semibold text-fg-muted">·</span>
                    Clear entry
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {/* Cell note (R16-2f): right-click / two-finger click. */}
        {noteCell ? (
          <div
            ref={menuRef}
            role="dialog"
            aria-label="Cell note"
            style={popoverStyle(noteCell.x, noteCell.y, 300, 220)}
            className="z-50 w-72 rounded-card border border-border bg-surface p-3 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              Note · {noteCell.clientName} · {fmtWeek(noteCell.week)}
            </div>
            <textarea
              autoFocus
              value={noteCell.draft}
              maxLength={NOTE_MAX}
              rows={3}
              onChange={(e) => setNoteCell({ ...noteCell, draft: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveNote(noteCell);
              }}
              placeholder="Away this week, chasing on Thursday…"
              className="w-full resize-none rounded-control border border-border bg-surface px-2 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-fg-dim">
              <span className="tabular-nums">{noteCell.draft.length}/{NOTE_MAX}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNoteCell(null)}
                  className="rounded-control border border-border px-2 py-1 font-medium text-fg transition-colors hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveNote(noteCell)}
                  className="rounded-control bg-accent px-2 py-1 font-medium text-white transition-colors hover:opacity-90"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
