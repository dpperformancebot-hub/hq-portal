"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Avatar, Button, Card, PageHeader } from "@/components/ui";
import { Icon } from "@/lib/icons";
import type { Collaboration } from "@/lib/seed";
import {
  createCollaboration,
  deleteCollaboration,
  updateCollaboration,
} from "@/lib/content-actions";

type Status = Collaboration["status"];

const COLUMNS: { label: string; status: Status }[] = [
  { label: "Planned", status: "planned" },
  { label: "To-do", status: "to-do" },
  { label: "Done", status: "done" },
];

const STATUS_LABEL: Record<Status, string> = { planned: "Planned", "to-do": "To-do", done: "Done" };

const inputCls =
  "rounded-control border border-border-soft bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent disabled:opacity-50";

type Draft = { id?: string; title: string; assignee: string; status: Status };

type OptAction =
  | { kind: "add"; item: Collaboration }
  | { kind: "update"; item: Collaboration }
  | { kind: "delete"; id: string };

function reduce(state: Collaboration[], action: OptAction): Collaboration[] {
  switch (action.kind) {
    case "add":
      return [action.item, ...state];
    case "update":
      return state.map((c) => (c.id === action.item.id ? action.item : c));
    case "delete":
      return state.filter((c) => c.id !== action.id);
  }
}

export function CollaborationsView({
  collaborations,
  live,
}: {
  collaborations: Collaboration[];
  live: boolean;
}) {
  const [optimistic, apply] = useOptimistic(collaborations, reduce);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const openNew = () => {
    if (!live) return;
    setMsg(null);
    setDraft({ title: "", assignee: "", status: "planned" });
  };
  const openEdit = (c: Collaboration) => {
    if (!live) return;
    setMsg(null);
    setDraft({ ...c });
  };

  const save = () => {
    if (!draft || !draft.title.trim()) return;
    const d = draft;
    setMsg(null);
    start(async () => {
      if (d.id) {
        apply({ kind: "update", item: { id: d.id, title: d.title, assignee: d.assignee || "Unassigned", status: d.status } });
        const res = await updateCollaboration(d.id, { title: d.title, assignee: d.assignee, status: d.status });
        if (!res.ok) return setMsg(res.error ?? "Could not save the collaboration.");
      } else {
        const temp: Collaboration = { id: `temp-${crypto.randomUUID()}`, title: d.title, assignee: d.assignee || "Unassigned", status: d.status };
        apply({ kind: "add", item: temp });
        const res = await createCollaboration({ title: d.title, assignee: d.assignee, status: d.status });
        if (!res.ok) return setMsg(res.error ?? "Could not add the collaboration.");
      }
      setDraft(null);
    });
  };

  const remove = () => {
    if (!draft?.id) return;
    const id = draft.id;
    setMsg(null);
    start(async () => {
      apply({ kind: "delete", id });
      const res = await deleteCollaboration(id);
      if (!res.ok) return setMsg(res.error ?? "Could not delete the collaboration.");
      setDraft(null);
    });
  };

  const move = (c: Collaboration, status: Status) => {
    if (status === c.status) return;
    setMsg(null);
    start(async () => {
      apply({ kind: "update", item: { ...c, status } });
      const res = await updateCollaboration(c.id, { status });
      if (!res.ok) setMsg(res.error ?? "Could not move the collaboration.");
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Brand"
        title="Content & Collaborations"
        subtitle="Assign content to ambassadors, team, or yourself."
        actions={
          <Button size="sm" onClick={openNew} disabled={!live} title={live ? "" : "Saving goes live with the database"}>
            <Icon name="plus" size={14} />
            New collaboration
          </Button>
        }
      />

      {!live && (
        <div className="rounded-control border border-warn/40 bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
          Demo board. Creating, editing, and moving collaborations goes live with the database (active in production).
        </div>
      )}

      {draft && (
        <Card className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <input
              className={inputCls}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Collaboration title"
              disabled={pending}
              autoFocus
            />
            <input
              className={inputCls}
              value={draft.assignee}
              onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
              placeholder="Assignee"
              disabled={pending}
            />
            <select
              aria-label="Status"
              className={inputCls}
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}
              disabled={pending}
            >
              {COLUMNS.map((c) => (
                <option key={c.status} value={c.status}>
                  {c.label}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={save} disabled={pending || !draft.title.trim()}>
                {pending ? "Saving…" : draft.id ? "Save" : "Add"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            {msg ? <span className="text-sm text-danger">{msg}</span> : <span />}
            {draft.id && (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
              >
                Delete collaboration
              </button>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = optimistic.filter((c) => c.status === col.status);
          return (
            <div key={col.status}>
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-muted">{col.label}</span>
                <span className="text-xs tabular-nums text-fg-muted">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((c) => (
                  <Card key={c.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        disabled={!live}
                        className={`flex-1 text-left text-sm font-medium text-fg ${live ? "hover:text-accent" : "cursor-default"}`}
                        title={live ? "Edit collaboration" : undefined}
                      >
                        {c.title}
                      </button>
                      {live && (
                        <select
                          aria-label="Move collaboration"
                          value={c.status}
                          onChange={(e) => move(c, e.target.value as Status)}
                          disabled={pending}
                          className="shrink-0 rounded-control border border-border-soft bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-dim outline-none focus:border-accent"
                        >
                          {COLUMNS.map((o) => (
                            <option key={o.status} value={o.status}>
                              {STATUS_LABEL[o.status]}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Avatar name={c.assignee} size="sm" />
                      <span className="text-xs text-fg-dim">{c.assignee}</span>
                    </div>
                  </Card>
                ))}
                {items.length === 0 ? (
                  <div className="rounded-card border border-dashed border-border px-3 py-6 text-center text-xs text-fg-muted">
                    Nothing here
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
