"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Avatar, Button, Card, PageHeader, useToast } from "@/components/ui";
import type { BuildTask } from "@/lib/seed";
import { createBrandBuildTaskAction } from "@/lib/brand-build-actions";

const COLUMNS: { label: string; status: BuildTask["status"] }[] = [
  { label: "To-do", status: "to-do" },
  { label: "In progress", status: "in progress" },
  { label: "Done", status: "done" },
];

const inputCls =
  "rounded-control border border-border-soft bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent disabled:opacity-50";

type Draft = { title: string; status: BuildTask["status"]; assignee: string };

function reduce(state: BuildTask[], task: BuildTask): BuildTask[] {
  return [task, ...state];
}

export function BuildingBrandView({ tasks, live }: { tasks: BuildTask[]; live: boolean }) {
  const toast = useToast();
  const [optimistic, apply] = useOptimistic(tasks, reduce);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const openNew = () => {
    if (!live) return;
    setMsg(null);
    setDraft({ title: "", status: "to-do", assignee: "" });
  };

  const save = () => {
    if (!draft || !draft.title.trim()) return;
    const d = draft;
    setMsg(null);
    start(async () => {
      apply({ id: `temp-${crypto.randomUUID()}`, title: d.title.trim(), status: d.status, assignee: d.assignee.trim() || "Unassigned" });
      const res = await createBrandBuildTaskAction({ title: d.title, status: d.status, assignee: d.assignee });
      if (!res.ok) {
        setMsg(res.error ?? "Could not add the task.");
        toast.push(res.error ?? "Could not add the task.", "error");
        return;
      }
      toast.push("Task created");
      setDraft(null);
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Brand"
        title="Building the Brand"
        subtitle="Assignable brand-building work."
        actions={
          <Button size="sm" onClick={openNew} disabled={!live} title={live ? "" : "Saving goes live with the database"}>
            New task
          </Button>
        }
      />

      {!live && (
        <div className="rounded-control border border-warn/40 bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
          Demo board. Adding tasks goes live with the database (active in production).
        </div>
      )}

      {draft && live && (
        <Card className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <input
              className={inputCls}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Task title"
              disabled={pending}
              autoFocus
            />
            <select
              aria-label="Status"
              className={inputCls}
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as BuildTask["status"] })}
              disabled={pending}
            >
              {COLUMNS.map((c) => (
                <option key={c.status} value={c.status}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              className={inputCls}
              value={draft.assignee}
              onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
              placeholder="Assignee"
              disabled={pending}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={save} disabled={pending || !draft.title.trim()}>
                {pending ? "Saving…" : "Add"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </div>
          {msg ? <span className="block text-sm text-danger">{msg}</span> : null}
        </Card>
      )}

      {msg && !draft && <span className="block text-sm text-danger">{msg}</span>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = optimistic.filter((t) => t.status === col.status);
          return (
            <div key={col.status}>
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-muted">{col.label}</span>
                <span className="text-xs tabular-nums text-fg-muted">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((t) => (
                  <Card key={t.id} className="p-3">
                    <div className="text-sm font-medium text-fg">{t.title}</div>
                    <div className="mt-2 flex items-center gap-2">
                      <Avatar name={t.assignee} size="sm" />
                      <span className="text-xs text-fg-dim">{t.assignee}</span>
                    </div>
                  </Card>
                ))}
                {items.length === 0 ? (
                  <div className="rounded-card border border-dashed border-border px-3 py-6 text-center text-xs text-fg-muted">Nothing here</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
