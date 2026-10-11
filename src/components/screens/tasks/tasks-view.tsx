"use client";

// Taskboard, rebuilt to Dan's mockup (R6-1 + fidelity pass 2026-08-08).
// Four columns (Not started / In progress / Blocked / Complete; acknowledged
// completions render inside Complete). Status changes ONLY via the dropdown
// in the expanded card: the mockup dropped drag-and-drop deliberately (audit
// trail + touch). Scopes: My tasks / Assigned by me / All. The action strip,
// New-task modal, archive view and template chips live in taskboard-extras.

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, EmptyState, PageHeader, SegmentedControl, useToast } from "@/components/ui";
import { TODAY, type Task, type TaskStatus } from "@/lib/seed";
import type { TaskAssignee } from "@/lib/tasks";
import { isTaskAssignedTo, isTaskOpenedBy, type ViewerKeys } from "@/lib/task-assignees";
import { BRAND } from "@/lib/brand";
import type { TaskRole, TemplateId } from "@/lib/task-templates";
import {
  ActionStrip,
  ArchivePanel,
  TEMPLATE_CHIP,
  TaskDetail,
  TemplateComposer,
  UnassignedQueue,
  isArchived,
  seeTask,
  type TaskMutate,
} from "@/components/screens/tasks/taskboard-extras";

// Brand owner as an assignee (must match the owner row in lib/tasks.ts).
const OWNER = BRAND.ownerName;
const DAY = 86_400_000;
const diff = (iso: string) => Math.round((new Date(iso).getTime() - TODAY.getTime()) / DAY);

/** Board grid (2026-10-08): the four status columns share the full width
 *  (1 col phones, 2 from md, 4 from xl) instead of fixed 288px columns in a
 *  horizontal scroller, which clipped "Complete" off the right edge. */
export const TASK_BOARD_CLASS = "grid grid-cols-1 gap-4 pb-2 md:grid-cols-2 xl:grid-cols-4";

// R6-1 fidelity: the mockup board has FOUR columns; acknowledged completions
// (our 'approved' status) render inside Complete rather than a fifth column.
const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "Not started" },
  { status: "in_progress", label: "In progress" },
  { status: "blocked", label: "Blocked" },
  { status: "done", label: "Complete" },
];

type OptAction =
  | { kind: "add"; task: Task }
  | { kind: "update"; task: Task }
  | { kind: "status"; id: string; status: TaskStatus }
  | { kind: "patch"; id: string; patch: Partial<Task> }
  | { kind: "delete"; id: string };

function reduce(state: Task[], a: OptAction): Task[] {
  switch (a.kind) {
    case "add":
      return [...state, a.task];
    case "update":
      return state.map((t) => (t.id === a.task.id ? a.task : t));
    case "status":
      return state.map((t) => (t.id === a.id ? { ...t, status: a.status } : t));
    case "patch":
      return state.map((t) => (t.id === a.id ? { ...t, ...a.patch } : t));
    case "delete":
      return state.filter((t) => t.id !== a.id);
  }
}

export function TasksView({
  tasks,
  assignees = [],
  live = false,
  viewer = OWNER,
  viewerNames = [],
  viewerUserId = null,
  allowTeamScope = true,
  pauseClients = [],
  viewerRole = "owner",
  unassignedQueue = [],
  queueCoaches = [],
  capacityByCoach = {},
}: {
  tasks: Task[];
  assignees?: TaskAssignee[];
  live?: boolean;
  /** Whose board "Assigned to me" / "Opened by me" refer to. */
  viewer?: string;
  /** Other names the viewer goes by (linked coach, users/invite name).
   *  Matched normalised together with `viewer`. */
  viewerNames?: string[];
  /** The viewer's users.id, matching tasks assigned by id (assigned_to). */
  viewerUserId?: string | null;
  /** When false (coach view), the All scope is hidden; the data is already
   *  scoped server-side to this coach's assigned + opened tasks. */
  allowTeamScope?: boolean;
  /** R5-2/R6-1: clients pickable in request templates (coach = own roster). */
  pauseClients?: { id: string; name: string; coachName?: string; plan?: string; status?: string }[];
  /** README §5: unassigned clients, rendered as the head coach's queue. */
  unassignedQueue?: { id: string; name: string; startDate: string | null; plan: string }[];
  queueCoaches?: { id: string; name: string }[];
  capacityByCoach?: Record<string, string>;
  /** R6-1: role gates which templates the composer offers (server re-checks). */
  viewerRole?: TaskRole;
}) {
  const toast = useToast();
  const router = useRouter();
  const [optimistic, apply] = useOptimistic(tasks, reduce);
  const [scope, setScope] = useState(allowTeamScope && live ? "all" : "assigned");
  // R6-1: template composer, inline card expansion, archive toggle.
  const [composerOpen, setComposerOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [pending, start] = useTransition();

  // Persistence-visibility fix: optimistic apply + the server action + a
  // router refresh run in ONE transition. Splitting them across components'
  // transitions made React revert the optimistic patch instantly (the board
  // "not updating"), and a failed action could leave stale state behind.
  const mutate: TaskMutate = (id, patch, action, successMsg) => {
    start(async () => {
      apply({ kind: "patch", id, patch });
      const res = await action();
      if (!res.ok) {
        toast.push(res.error ?? "Could not update the task.", "error");
      } else if (successMsg) {
        toast.push(successMsg);
      }
      // Pull fresh server truth either way: confirms the write on success,
      // rolls the optimistic patch back on failure.
      router.refresh();
    });
  };

  // "Mine" = assigned by users.id OR any of the viewer's names, normalised.
  const me: ViewerKeys = { userId: viewerUserId, names: [viewer, ...viewerNames] };

  // C2 scopes: assigned to me / opened by me / all (owner side only).
  // R6-1: archived tasks (complete >7 days) leave the board for the archive.
  const filtered = optimistic.filter((t) => {
    if (isArchived(t)) return false;
    if (scope === "assigned") return isTaskAssignedTo(t, me);
    if (scope === "opened") return isTaskOpenedBy(t, me);
    return true;
  });

  // Urgency inside a column: overdue first, then soonest due, undated last.
  const urgency = (t: Task) => (t.dueDate ? diff(t.dueDate) : 9_999);

  const dueBadge = (t: Task) => {
    if (!t.dueDate) return null;
    const d = diff(t.dueDate);
    const label = d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Today" : d === 1 ? "Tomorrow" : t.dueDate;
    const cls =
      d < 0
        ? "bg-danger-soft text-danger"
        : d === 0
          ? "bg-warn-soft text-warn"
          : "bg-surface-2 text-fg-dim";
    return <span className={`rounded-pill px-2 py-0.5 text-[11px] font-medium tabular-nums ${cls}`}>{label}</span>;
  };

  const dueToday = filtered.filter(
    (t) => t.status !== "done" && t.status !== "approved" && t.dueDate && diff(t.dueDate) === 0,
  ).length;

  const scopeOptions = [
    { label: "My tasks", value: "assigned" },
    { label: "Assigned by me", value: "opened" },
    ...(allowTeamScope ? [{ label: "All", value: "all" }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        back
        eyebrow="Operations"
        title="Tasks"
        subtitle={`${dueToday} due today`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              aria-label="Scope"
              size="sm"
              value={scope}
              onChange={setScope}
              options={scopeOptions}
            />
            <Button size="sm" variant="ghost" onClick={() => setArchiveOpen((v) => !v)}>
              Archive
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setArchiveOpen(false);
                setComposerOpen(true);
              }}
              disabled={!live}
              title={live ? "Typed request templates per role" : "Available once the database is live"}
            >
              New task
            </Button>
          </div>
        }
      />

      {!live && (
        <div className="rounded-control border border-warn/40 bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
          Demo tasks. Creating, completing, editing, and deleting tasks goes live with the database (active in production).
        </div>
      )}

      {/* README §5: the head coach's unassigned-client queue. */}
      {unassignedQueue.length > 0 ? (
        <UnassignedQueue queue={unassignedQueue} coaches={queueCoaches} capacityByCoach={capacityByCoach} />
      ) : null}

      {/* R6-1: action strip — blocked rows + grouped completions for work the
          viewer raised. Follows the viewer across scope tabs. */}
      <ActionStrip
        tasks={optimistic}
        viewer={viewer}
        onOpen={(id) => {
          setArchiveOpen(false);
          if (allowTeamScope) setScope("all");
          setExpandedId(id);
        }}
        mutate={mutate}
        pending={pending}
      />

      {/* R6-1: template composer (typed request skeletons, client picker). */}
      {composerOpen && live && (
        <TemplateComposer
          viewerRole={viewerRole}
          clients={pauseClients}
          assignees={assignees}
          onCreated={(task) => start(() => apply({ kind: "add", task }))}
          onClose={() => setComposerOpen(false)}
        />
      )}

      {/* R6-1: archive replaces the board (mockup view swap). */}
      {archiveOpen ? <ArchivePanel tasks={optimistic} viewerRole={viewerRole} onBack={() => setArchiveOpen(false)} /> : null}

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon="checkins"
            title="All clear"
            message={live ? "No tasks in this view. Add one with “New task”." : "No tasks assigned to you."}
          />
        </Card>
      ) : (
        <div className={TASK_BOARD_CLASS}>
          {COLUMNS.map((col) => {
            const items = filtered
              .filter((t) => (col.status === "done" ? t.status === "done" || t.status === "approved" : t.status === col.status))
              .sort((a, b) => urgency(a) - urgency(b));
            return (
              <div
                key={col.status}
                className="flex min-w-0 flex-col rounded-card border border-border bg-surface-2/50 p-2"
              >
                <div className="flex items-center justify-between px-2 pb-2 pt-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
                    {col.label} <span className="ml-1 tabular-nums">{items.length}</span>
                  </span>
                  {live && col.status === "todo" ? (
                    <button
                      type="button"
                      aria-label="Add task"
                      onClick={() => setComposerOpen(true)}
                      className="rounded-control px-1.5 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                    >
                      +
                    </button>
                  ) : null}
                </div>
                <div className="flex min-h-[3rem] flex-col gap-2">
                  {items.map((t) => (
                    <div
                      key={t.id}
                      className={`group rounded-control border bg-surface p-3 shadow-sm ${
                        t.isNew && isTaskAssignedTo(t, me) ? "border-accent" : "border-border"
                      } ${t.status === "done" || t.status === "approved" ? "opacity-75" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        {live ? (
                          <button
                            type="button"
                            onClick={() => {
                              // R6-1: card click = inline detail (one open at
                              // a time); opening clears the New badge.
                              setExpandedId((cur) => (cur === t.id ? null : t.id));
                              if (t.isNew) {
                                start(() => apply({ kind: "patch", id: t.id, patch: { isNew: false } }));
                                seeTask(t.id);
                              }
                            }}
                            className={`flex-1 text-left text-sm font-medium text-fg hover:underline ${
                              t.status === "done" || t.status === "approved" ? "line-through" : ""
                            }`}
                            title="Open task"
                          >
                            {t.title}
                          </button>
                        ) : (
                          <span className="flex-1 text-sm font-medium text-fg">{t.title}</span>
                        )}
                        {t.isNew ? (
                          <span className="shrink-0 rounded-pill bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-deep">
                            New
                          </span>
                        ) : null}
                        <span
                          className={`shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-medium ${
                            t.template && TEMPLATE_CHIP[t.template as TemplateId]
                              ? TEMPLATE_CHIP[t.template as TemplateId]
                              : t.type === "Ticket"
                                ? "bg-status-sent text-status-sent-fg"
                                : "bg-surface-2 text-fg-dim"
                          }`}
                        >
                          {t.type}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        {dueBadge(t) ?? <span />}
                        <span className="truncate text-[11px] text-fg-muted">
                          {t.assigneeName !== "Unassigned" ? t.assigneeName : ""}
                        </span>
                      </div>
                      {/* C2: provenance line. */}
                      {t.openedBy || t.createdAt ? (
                        <div className="mt-1 truncate text-[11px] text-fg-muted">
                          {t.openedBy ? `by ${t.openedBy}` : ""}
                          {t.openedBy && t.createdAt ? " · " : ""}
                          {t.createdAt ?? ""}
                        </div>
                      ) : null}
                      {/* R6-1: inline expansion. */}
                      {expandedId === t.id && live ? (
                        <>
                          <TaskDetail task={t} viewerRole={viewerRole} mutate={mutate} pending={pending} />

                        </>
                      ) : null}
                    </div>
                  ))}
                  {items.length === 0 ? (
                    <div className="rounded-control border border-dashed border-border-soft px-3 py-4 text-center text-xs text-fg-muted">
                      Nothing here
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
