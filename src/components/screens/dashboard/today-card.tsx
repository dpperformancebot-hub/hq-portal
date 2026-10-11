"use client";

// "Today I will" (C4, FEEDBACK-V2): 3-4 free-typed daily tasks, tickable,
// living in the revenue-row space. Items are ordinary tasks rows (type
// "Today", due today, assigned to the viewer), so admins/ops can add to
// someone's list from the Tasks screen by creating a "Today" task for them.
// Auto-suggest surfaces the top not-done taskboard items; ticking a
// suggestion completes the REAL task, no duplicate rows.

import { useState, useTransition } from "react";
import Link from "next/link";
import { Panel, useToast } from "@/components/ui";
import type { Task } from "@/lib/seed";
import { createTaskAction, setTaskStatusAction } from "@/lib/tasks-actions";
import { selectTodayItems, selectTodaySuggestions, type ViewerKeys } from "@/lib/task-assignees";

const MAX_ITEMS = 4;

const isDone = (t: Task) => t.status === "done" || t.status === "approved";

export function TodayCard({
  tasks,
  viewer,
  viewerNames = [],
  viewerUserId = null,
  live,
  includeUnassigned = false,
}: {
  /** The full task list; the card derives its own slices. */
  tasks: Task[];
  /** Whose list this is (assignee name, normally the owner). */
  viewer: string;
  /** Other names the viewer goes by (login / invite name), matched with
   *  `viewer` the same way as the Tasks board's "My tasks". */
  viewerNames?: string[];
  /** The viewer's users.id (tasks.assigned_to match). */
  viewerUserId?: string | null;
  live: boolean;
  /** Also suggest tasks nobody owns. TRUE only for the owner and VA boards,
   *  which are entitled to the whole task list anyway. The coach dashboard
   *  leaves it false: its task list is already server-scoped to the coach
   *  (dashboard/page.tsx), and an unassigned row must never become a
   *  suggestion on a coach's card if that scoping is ever loosened. */
  includeUnassigned?: boolean;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  // Optimistic overlays: ids ticked/added this render pass.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [added, setAdded] = useState<Task[]>([]);
  const [pending, start] = useTransition();

  const today = new Date().toISOString().slice(0, 10);
  const withOverlay = (t: Task): Task => (ticked[t.id] !== undefined ? { ...t, status: ticked[t.id] ? "done" : "todo" } : t);

  // Same matcher as the Tasks board (users.id or any name, normalised).
  const me: ViewerKeys = { userId: viewerUserId, names: [viewer, ...viewerNames] };
  const todayItems = [...selectTodayItems(tasks, me, today), ...added].map(withOverlay);
  const activeCount = todayItems.filter((t) => !isDone(t)).length;

  // Top not-done taskboard items for this person (their board, newest urgency
  // first), excluding today-list rows.
  const suggestions = selectTodaySuggestions(tasks, me, {
    includeUnassigned,
    limit: 3,
    isDone: (t) => isDone(withOverlay(t)),
  });

  const add = () => {
    const title = text.trim();
    if (!title || !live || activeCount >= MAX_ITEMS) return;
    setText("");
    start(async () => {
      const temp: Task = {
        id: `temp-${crypto.randomUUID()}`,
        title,
        type: "Today",
        dueDate: today,
        status: "todo",
        assigneeName: viewer,
        assignedTo: null,
        openedBy: viewer,
        createdAt: today,
      };
      setAdded((prev) => [...prev, temp]);
      const res = await createTaskAction({ title, type: "Today", dueDate: today, assigneeName: viewer });
      if (!res.ok) {
        setAdded((prev) => prev.filter((t) => t.id !== temp.id));
        toast.push(res.error ?? "Could not add the item.", "error");
      }
    });
  };

  const tick = (t: Task) => {
    if (!live || t.id.startsWith("temp-")) return;
    const next = !isDone(withOverlay(t));
    setTicked((prev) => ({ ...prev, [t.id]: next }));
    start(async () => {
      const res = await setTaskStatusAction(t.id, next ? "done" : "todo");
      if (!res.ok) {
        setTicked((prev) => ({ ...prev, [t.id]: !next }));
        toast.push(res.error ?? "Could not update the item.", "error");
      }
    });
  };

  const row = (t: Task, muted = false) => {
    const done = isDone(withOverlay(t));
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => tick(t)}
        disabled={!live || pending}
        className="flex w-full items-center gap-2 rounded-control px-1.5 py-1.5 text-left transition-colors hover:bg-surface-2 disabled:cursor-default"
      >
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px] ${
            done ? "border-accent bg-accent text-white" : "border-border"
          }`}
        >
          {done ? "✓" : ""}
        </span>
        <span className={`flex-1 truncate text-sm ${done ? "text-fg-muted line-through" : muted ? "text-fg-dim" : "text-fg"}`}>
          {t.title}
        </span>
        {muted && t.dueDate ? <span className="shrink-0 text-[11px] tabular-nums text-fg-muted">{t.dueDate}</span> : null}
      </button>
    );
  };

  return (
    <Panel
      title="Today I will"
      subtitle={live ? undefined : "Goes live with the database"}
      action={
        <Link href="/tasks" className="text-xs font-medium text-accent hover:underline">
          Taskboard →
        </Link>
      }
    >
      <div className="space-y-1">
        {todayItems.length === 0 ? (
          <p className="px-1.5 py-1 text-sm text-fg-dim">Type 3-4 things you will get done today.</p>
        ) : (
          todayItems.map((t) => row(t))
        )}
        {live ? (
          <div className="flex items-center gap-2 pt-1">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              placeholder={activeCount >= MAX_ITEMS ? "List is full for today" : "Add an item…"}
              disabled={pending || activeCount >= MAX_ITEMS}
              className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              aria-label="Add a daily task"
            />
          </div>
        ) : null}
        {suggestions.length > 0 ? (
          <div className="pt-2">
            <div className="px-1.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              From your board
            </div>
            {suggestions.map((t) => row(t, true))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
