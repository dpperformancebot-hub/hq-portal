"use client";

// R6-1 companions for the taskboard, rebuilt to Dan's mockup
// (reference/taskboard-mockup — design reference, our stack/primitives):
// the New-task MODAL (typed request skeletons + keyboard client picker), the
// action strip (blocked rows with Open/Unblock + the grouped "you assigned
// were completed" row with Review/Clear all), the inline task detail
// (labelled Summary, flagged-to banner, completed note, status dropdown with
// the blocked textarea prompt, escalation), and the full archive view.
// Deviations from the mockup are deliberate and flagged in FEEDBACK-V2:
// escalation keeps a REQUIRED note (R6-1 transcript overrides the mockup).

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, Card, useToast } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import type { Task, TaskStatus } from "@/lib/seed/types";
import {
  TASK_TEMPLATES,
  templateById,
  templateSummary,
  type TaskRole,
  type TaskTemplate,
  type TemplateId,
} from "@/lib/task-templates";
import {
  ackTaskAction,
  createTemplateTaskAction,
  escalateTaskAction,
  markTaskSeenAction,
  setBlockedAction,
  setTaskStatusAction,
  unblockAction,
} from "@/lib/tasks-actions";
import { assignJourneyClientAction } from "@/lib/journey-actions";

const inputCls =
  "w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent";

// Per-template chip colours from the mockup's design tokens (same palette as
// the portal design language; chips derive from the template, per handoff).
export const TEMPLATE_CHIP: Record<TemplateId, string> = {
  general: "bg-[#e8effd] text-[#2563eb]",
  pause: "bg-[#fdf3dd] text-[#d97706]",
  cancel: "bg-[#fdeaea] text-[#dc2626]",
  admin: "bg-[#f1ebfe] text-[#7c3aed]",
  onboard: "bg-[#e4f4f9] text-[#0891b2]",
  // R19-2d: a handover reads as its own thing on the board, so a coach can see
  // at a glance that this is an existing client moving across, not a new one.
  handover: "bg-[#eaf6ec] text-[#15803d]",
};

const TEMPLATE_FG: Record<TemplateId, string> = {
  general: "text-[#2563eb]",
  pause: "text-[#d97706]",
  cancel: "text-[#dc2626]",
  admin: "text-[#7c3aed]",
  onboard: "text-[#0891b2]",
  handover: "text-[#15803d]",
};

const firstName = (name: string | null | undefined) => (name ?? "").split(" ")[0] || "the raiser";
const shortId = (id: string) => (id.includes("-") ? id.slice(0, 8) : id);

// --------------------------------------------------------------- client picker
/** Type-ahead against the real client list. No free text; exact match goes
 *  green. Keyboard: up/down to move, Enter to select, Esc to close; a clear
 *  button resets the pick (mockup behaviour). */
export type PickerClient = {
  id: string;
  name: string;
  coachName?: string;
  plan?: string;
  status?: string;
};

function ClientPicker({
  clients,
  value,
  onChange,
  placeholder,
}: {
  clients: PickerClient[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return clients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [clients, value]);
  const exact = clients.some((c) => c.name === value);

  const key = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[hi]) {
        onChange(matches[hi].name);
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setHi(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={key}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className={`${inputCls} ${exact ? "border-accent pr-7 ring-1 ring-accent/40" : ""}`}
          aria-label="Client name"
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear client"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange("");
              setOpen(true);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
          >
            ✕
          </button>
        ) : null}
      </div>
      {open && matches.length > 0 && !exact ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-card border border-border bg-surface shadow-xl">
          {matches.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={() => {
                onChange(c.name);
                setOpen(false);
              }}
              className={`block w-full px-3 py-1.5 text-left ${i === hi ? "bg-surface-2" : "hover:bg-surface-2"}`}
            >
              <span className="block text-sm text-fg">{c.name}</span>
              {/* Mockup: each match shows coach, plan and status. */}
              {(c.coachName || c.plan || c.status) ? (
                <span className="block text-[11px] text-fg-muted">
                  {[c.coachName, c.plan, c.status].filter(Boolean).join(" · ")}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      {value && !exact ? (
        <p className="mt-1 text-[11px] text-warn">
          Pick an existing client (no free text; add them in the Client Database first).
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------- new task modal
export function TemplateComposer({
  viewerRole,
  clients,
  assignees,
  onCreated,
  onClose,
}: {
  viewerRole: TaskRole;
  clients: PickerClient[];
  assignees: { id: string; name: string; detail?: string }[];
  onCreated: (task: Task) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const creatable = TASK_TEMPLATES.filter((t) => t.creatableBy.includes(viewerRole));
  const [tplId, setTplId] = useState(creatable[0]?.id ?? "general");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [assignee, setAssignee] = useState("");
  const [pending, start] = useTransition();
  const tpl = templateById(tplId) as TaskTemplate;

  // Mockup: the composer is a MODAL. Esc closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (k: string, v: string) => setFields((f) => ({ ...f, [k]: v }));
  const clientOk = !tpl.fields.some((f) => f.type === "client") || clients.some((c) => c.name === fields.client);
  const requiredOk = tpl.fields.every((f) => !f.required || (fields[f.k] ?? "").trim());
  const needsAssignee = tpl.routing === "picked";

  const submit = () => {
    if (pending || !clientOk || !requiredOk || (needsAssignee && !assignee)) return;
    start(async () => {
      const res = await createTemplateTaskAction({ template: tpl.id, fields, assigneeName: assignee || undefined });
      if (res.ok && res.data) {
        toast.push(`${tpl.label} sent to ${res.data.assignedTo}.`, "success");
        onCreated({
          id: res.data.id,
          title: fields.brief ?? `${tpl.short}: ${fields.client ?? ""}`,
          type: tpl.short,
          dueDate: fields.timeline ?? fields.start ?? fields.effective ?? null,
          status: "todo",
          assigneeName: res.data.assignedTo,
          assignedTo: null,
          openedBy: "You",
          createdAt: null,
          template: tpl.id,
          fields,
        });
        onClose();
      } else {
        toast.push(res.error ?? "Could not raise the request.", "error");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-16"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-label="New task"
    >
      {/* R12-12: pause/cancel requests read as a form, not a grid - narrower
          column, fields stacked, bigger targets. Other templates keep the
          compact two-column layout. */}
      <Card className={`w-full space-y-3 ${tpl.id === "pause" || tpl.id === "cancel" ? "max-w-md" : "max-w-xl"}`}>
        <div className="flex items-start justify-between">
          <h2 className="font-display text-xl tracking-display text-fg">New task</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-fg-muted hover:text-fg">
            ✕
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {creatable.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTplId(t.id);
                setFields({});
              }}
              className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors ${
                tplId === t.id ? "bg-accent text-white" : `${TEMPLATE_CHIP[t.id]} opacity-80 hover:opacity-100`
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={tpl.id === "pause" || tpl.id === "cancel" ? "grid gap-3" : "grid gap-2 sm:grid-cols-2"}>
          {tpl.fields.map((f) => (
            <label key={f.k} className={`space-y-1 ${f.type === "textarea" && !(tpl.id === "pause" || tpl.id === "cancel") ? "sm:col-span-2" : ""}`}>
              <span className="text-xs font-medium text-fg-dim">
                {f.label}
                {f.required ? " *" : ""}
                {f.hint ? <span className="ml-1 text-fg-muted">({f.hint})</span> : null}
              </span>
              {f.type === "client" ? (
                <ClientPicker clients={clients} value={fields[f.k] ?? ""} onChange={(v) => set(f.k, v)} placeholder={f.placeholder} />
              ) : f.type === "textarea" ? (
                <textarea rows={2} value={fields[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} placeholder={f.placeholder} className={inputCls} />
              ) : f.type === "select" ? (
                <select value={fields[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} className={inputCls}>
                  <option value="">Select…</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input type={f.type === "date" ? "date" : "text"} value={fields[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} placeholder={f.placeholder} className={inputCls} />
              )}
            </label>
          ))}
          {needsAssignee ? (
            <label className="space-y-1">
              <span className="text-xs font-medium text-fg-dim">Assign to *</span>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputCls} aria-label="Assign to">
                <option value="">Select…</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.detail ? `${a.name} (${a.detail})` : a.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="self-end text-[11px] text-fg-muted">Routes to ops automatically.</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={pending || !clientOk || !requiredOk || (needsAssignee && !assignee)}>
            {pending ? "Sending…" : "Create task"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- action strip
/** Blocked rows (reason inline, Open + Unblock) and the grouped completions
 *  row ("N tasks you assigned were completed", Review + Clear all). Follows
 *  the viewer across scope tabs. */
export function ActionStrip({
  tasks,
  viewer,
  onOpen,
  mutate,
  pending = false,
}: {
  tasks: Task[];
  viewer: string;
  /** Jump to a task: switch scope if needed and expand its card. */
  onOpen: (id: string) => void;
  mutate: TaskMutate;
  pending?: boolean;
}) {
  const mineRaised = tasks.filter((t) => t.openedBy === viewer && t.assigneeName !== viewer);
  const blocked = mineRaised.filter((t) => t.status === "blocked");
  const completed = mineRaised.filter((t) => t.status === "done");
  if (blocked.length === 0 && completed.length === 0) return null;

  const unblock = (t: Task) =>
    mutate(t.id, { status: "in_progress", blockedReason: null }, () => unblockAction(t.id));

  const clearAll = () => {
    for (const t of completed) {
      mutate(t.id, { status: "approved" }, () => ackTaskAction(t.id), "Completions cleared.");
    }
  };

  return (
    <div className="space-y-1.5">
      {blocked.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-danger/30 bg-danger-soft px-3 py-2">
          <span className="text-sm font-medium text-danger">{firstName(t.assigneeName)} is blocked</span>
          <span className="min-w-0 flex-1 truncate text-xs text-fg-dim">
            {t.title}
            {t.blockedReason ? `: ${t.blockedReason}` : ""}
          </span>
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => onOpen(t.id)} disabled={pending}>
              Open
            </Button>
            <Button size="sm" onClick={() => unblock(t)} disabled={pending}>
              Unblock
            </Button>
          </div>
        </div>
      ))}
      {completed.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-positive/30 bg-positive-soft px-3 py-2">
          <span className="text-sm font-medium text-positive">
            {completed.length} task{completed.length === 1 ? "" : "s"} you assigned {completed.length === 1 ? "was" : "were"} completed
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-fg-dim">
            {completed.slice(0, 2).map((t) => t.title).join(" · ")}
            {completed.length > 2 ? ` · +${completed.length - 2} more` : ""}
          </span>
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => onOpen(completed[0].id)} disabled={pending}>
              Review
            </Button>
            <Button size="sm" variant="ghost" onClick={clearAll} disabled={pending}>
              Clear all
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------- task detail
/** Inline expansion per the mockup: labelled Summary in the template colour,
 *  flagged-to banner when blocked, completed note, fields, status dropdown
 *  (blocked opens the "why are you blocked" textarea), escalation, activity,
 *  mono task id. */
export type TaskMutate = (
  id: string,
  patch: Partial<Task>,
  action: () => Promise<{ ok: boolean; error?: string }>,
  successMsg?: string,
) => void;

export function TaskDetail({
  task,
  viewerRole,
  readOnly = false,
  mutate,
  pending = false,
}: {
  task: Task;
  viewerRole: TaskRole;
  /** Archive entries are read-only. */
  readOnly?: boolean;
  /** THE persistence fix: optimistic apply + server action + router refresh
   *  run in ONE view-owned transition, so nothing snaps back or goes stale. */
  mutate: TaskMutate;
  pending?: boolean;
}) {
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [escNote, setEscNote] = useState<string | null>(null);
  const tpl = templateById(task.template);
  const fields = task.fields ?? {};

  const setStatus = (status: TaskStatus) => {
    if (status === "blocked") {
      setBlockReason("");
      return;
    }
    mutate(task.id, { status }, () => setTaskStatusAction(task.id, status));
  };

  const confirmBlock = () => {
    const reason = (blockReason ?? "").trim();
    if (!reason) return;
    setBlockReason(null);
    mutate(task.id, { status: "blocked", blockedReason: reason }, () => setBlockedAction(task.id, reason));
  };

  const confirmEscalate = () => {
    const note = (escNote ?? "").trim();
    if (!note) return;
    setEscNote(null);
    mutate(
      task.id,
      { status: "todo", assigneeName: BRAND.ownerName },
      () => escalateTaskAction(task.id, note),
      `Escalated to ${BRAND.ownerFirstName}.`,
    );
  };

  const canEscalate =
    !readOnly && (viewerRole === "va" || viewerRole === "owner") && (task.template === "pause" || task.template === "cancel");

  return (
    <div className="mt-2 space-y-2.5 border-t border-border-soft pt-2">
      {tpl ? (
        <div>
          <div className={`text-[10px] font-bold uppercase tracking-[0.1em] ${TEMPLATE_FG[tpl.id]}`}>Summary</div>
          <p className="mt-0.5 text-xs leading-relaxed text-fg">{templateSummary(tpl, fields)}</p>
        </div>
      ) : null}

      {task.status === "blocked" && task.blockedReason ? (
        <div className="rounded-control border border-danger/30 bg-danger-soft px-2.5 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-danger">
            Flagged to {firstName(task.openedBy)}
          </div>
          <p className="mt-0.5 text-xs text-fg-dim">{task.blockedReason}</p>
        </div>
      ) : null}

      {(task.status === "done" || task.status === "approved") && task.completedAt ? (
        <p className="text-xs text-accent-deep">
          Completed {task.completedAt.slice(0, 10)} · {firstName(task.openedBy)} notified
        </p>
      ) : null}

      {tpl && Object.keys(fields).length > 0 ? (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {tpl.fields
            .filter((f) => fields[f.k])
            .map((f) => (
              <div key={f.k} className="text-[11px]">
                <span className="font-semibold uppercase tracking-[0.07em] text-fg-muted">{f.label}</span>
                <div className="whitespace-pre-wrap text-fg">{fields[f.k]}</div>
              </div>
            ))}
        </div>
      ) : null}

      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={task.status === "approved" ? "done" : task.status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            disabled={pending}
            className="rounded-control border border-border bg-surface px-2 py-1 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent"
            aria-label="Task status"
          >
            <option value="todo">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="blocked">Blocked</option>
            <option value="done">{tpl?.resolvable ? "Processed as done" : "Complete"}</option>
          </select>
          {canEscalate ? (
            <button type="button" onClick={() => setEscNote("")} className="text-[11px] font-medium text-warn hover:underline">
              Escalate to {BRAND.ownerFirstName}
            </button>
          ) : null}
          <span className="ml-auto font-mono text-[10px] tabular-nums text-fg-muted">#{shortId(task.id)}</span>
        </div>
      ) : (
        <div className="flex items-center justify-between border-t border-border-soft pt-2 text-[11px] text-fg-muted">
          <span>Archived: read only</span>
          <span className="font-mono tabular-nums">#{shortId(task.id)}</span>
        </div>
      )}

      {blockReason !== null ? (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-fg">
            Why are you blocked? This flags back to {firstName(task.openedBy)}.
          </div>
          <textarea
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            rows={2}
            placeholder="What do you need to unblock this?"
            autoFocus
            className={inputCls}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={confirmBlock} disabled={!(blockReason ?? "").trim() || pending}>
              Mark blocked
            </Button>
          </div>
        </div>
      ) : null}
      {escNote !== null ? (
        <div className="flex items-center gap-2">
          <input
            value={escNote}
            onChange={(e) => setEscNote(e.target.value)}
            placeholder='Escalation note, e.g. "16-wk minimum: waive?"'
            autoFocus
            className={inputCls}
          />
          <Button size="sm" onClick={confirmEscalate} disabled={!(escNote ?? "").trim() || pending}>
            Escalate
          </Button>
        </div>
      ) : null}

      {(task.activity ?? []).length > 0 ? (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-fg-muted">Activity</div>
          <ul className="mt-1 space-y-0.5 text-[11px] text-fg-muted">
            {(task.activity ?? []).map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-fg-dim">{firstName(a.who)}</span> {a.what}
                </span>
                <span className="shrink-0 tabular-nums">{a.when.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// --------------------------------------------------------------------- archive
const ARCHIVE_DAYS = 7;

export function isArchived(t: Task, now = Date.now()): boolean {
  if (t.status !== "done" && t.status !== "approved") return false;
  if (!t.completedAt) return false;
  return now - Date.parse(t.completedAt) > ARCHIVE_DAYS * 86_400_000;
}

/** Full archive view (mockup: replaces the board, back button, expandable
 *  read-only entries, search across every field). */
export function ArchivePanel({
  tasks,
  viewerRole,
  onBack,
}: {
  tasks: Task[];
  viewerRole: TaskRole;
  onBack: () => void;
}) {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const archived = tasks.filter((t) => isArchived(t));
    if (!query) return archived;
    return archived.filter((t) =>
      [t.title, t.type, t.id, t.assigneeName, t.openedBy ?? "", ...Object.values(t.fields ?? {})]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [tasks, q]);

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="text-sm font-medium text-accent hover:underline">
            ← Board
          </button>
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
            Archive · completed more than {ARCHIVE_DAYS} days ago · {rows.length} task{rows.length === 1 ? "" : "s"}
          </span>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search task, person, field…"
          className="rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
          aria-label="Search archive"
        />
      </div>
      {rows.length === 0 ? (
        <p className="py-2 text-sm text-fg-dim">Nothing archived{q ? " matches" : ""} yet. Tasks land here 7 days after completion.</p>
      ) : (
        <div className="divide-y divide-border-soft">
          {rows.map((t) => (
            <div key={t.id} className="py-2">
              <button
                type="button"
                onClick={() => setOpenId((cur) => (cur === t.id ? null : t.id))}
                className="flex w-full items-center justify-between gap-3 text-left text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-fg">{t.title}</span>
                <span className="shrink-0 text-[11px] text-fg-muted">
                  {t.type} · {t.assigneeName}
                  {t.completedAt ? ` · ${t.completedAt.slice(0, 10)}` : ""}
                </span>
              </button>
              {openId === t.id ? (
                <TaskDetail task={t} viewerRole={viewerRole} readOnly mutate={() => {}} />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------- unassigned queue (§5)
export function UnassignedQueue({
  queue,
  coaches,
  capacityByCoach = {},
}: {
  queue: { id: string; name: string; startDate: string | null; plan: string }[];
  coaches: { id: string; name: string }[];
  /** E2: this week's capacity per coach id, shown in the dropdown. */
  capacityByCoach?: Record<string, string>;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState(queue);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  if (local.length === 0) return null;

  const assign = (clientId: string) => {
    const coachId = picks[clientId];
    if (!coachId || pending) return;
    start(async () => {
      const res = await assignJourneyClientAction(clientId, coachId);
      if (res.ok) {
        const name = local.find((c) => c.id === clientId)?.name ?? "Client";
        setLocal((prev) => prev.filter((c) => c.id !== clientId));
        toast.push(`${name} assigned. Onboarding handover created.`, "success");
      } else {
        toast.push(res.error ?? "Could not assign.", "error");
      }
    });
  };

  return (
    <div className="rounded-card border border-warn/40 bg-warn-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left"
      >
        <span className="text-sm font-semibold text-warn">
          {local.length} unassigned client{local.length === 1 ? "" : "s"}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-fg-dim">
          {local.map((c) => `${c.name} (starts ${c.startDate})`).join(" · ")}
        </span>
        <span className="text-xs font-medium text-warn">{open ? "Hide" : "Assign"}</span>
      </button>
      {open ? (
        <div className="divide-y divide-border-soft border-t border-warn/30 px-4">
          {local.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-fg">{c.name}</div>
                <div className="text-[11px] text-fg-muted">
                  starts {c.startDate} · {c.plan}
                </div>
              </div>
              <select
                value={picks[c.id] ?? ""}
                onChange={(e) => setPicks((p) => ({ ...p, [c.id]: e.target.value }))}
                className="rounded-control border border-border bg-surface px-2 py-1 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                aria-label={`Coach for ${c.name}`}
              >
                <option value="">Pick a coach…</option>
                {coaches.map((co) => (
                  <option key={co.id} value={co.id}>
                    {co.name}
                    {capacityByCoach[co.id] ? ` · ${capacityByCoach[co.id]} this wk` : ""}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={() => assign(c.id)} disabled={pending || !picks[c.id]}>
                {pending ? "…" : "Assign"}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Mark the New badge seen (fire-and-forget from the card open). */
export function seeTask(id: string): void {
  void markTaskSeenAction(id);
}
