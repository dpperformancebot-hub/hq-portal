"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Card, EmptyState, PageHeader, useToast } from "@/components/ui";
import { Icon } from "@/lib/icons";
import type { BriefItem } from "@/lib/seed";
import {
  createBriefItemAction,
  deleteBriefItemAction,
  updateBriefItemAction,
  type BriefInput,
} from "@/lib/sops-brief-actions";

const EMPTY_FORM: BriefInput = { title: "", note: "" };

function BriefForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: BriefInput;
  submitLabel: string;
  onSubmit: (v: BriefInput) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<BriefInput>(initial);
  const input =
    "rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-accent";
  return (
    <div className="space-y-2">
      <input
        className={`${input} w-full`}
        value={form.title}
        placeholder="Title (e.g. North star)"
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
      />
      <textarea
        className={`${input} w-full`}
        rows={2}
        value={form.note}
        placeholder="Note"
        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSubmit(form)}>
          {submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function BriefView({ items: serverItems }: { items: BriefItem[] }) {
  // Server data is the source of truth; mirror locally for optimistic edits and
  // re-sync whenever a write revalidates /brief and sends fresh props.
  const toast = useToast();
  const [items, setItems] = useState<BriefItem[]>(serverItems);
  useEffect(() => setItems(serverItems), [serverItems]);

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const fail = (msg: string) => setError(msg);

  const create = (form: BriefInput) => {
    setError(null);
    const title = form.title.trim();
    if (!title) return fail("Title is required.");
    const temp: BriefItem = { id: `temp-${Date.now()}`, title, note: form.note.trim() };
    setItems((prev) => [temp, ...prev]); // optimistic
    setCreating(false);
    start(async () => {
      const res = await createBriefItemAction(form);
      if (res.ok) {
        toast.push("Saved");
      } else {
        setItems((prev) => prev.filter((b) => b.id !== temp.id));
        fail(res.error);
        toast.push(res.error, "error");
      }
    });
  };

  const saveEdit = (id: string, form: BriefInput) => {
    setError(null);
    const title = form.title.trim();
    if (!title) return fail("Title is required.");
    const before = items.find((b) => b.id === id);
    setItems((list) => list.map((b) => (b.id === id ? { ...b, title, note: form.note.trim() } : b)));
    setEditingId(null);
    start(async () => {
      const res = await updateBriefItemAction(id, form);
      if (res.ok) {
        toast.push("Saved");
      } else {
        if (before) setItems((list) => list.map((b) => (b.id === id ? before : b)));
        fail(res.error);
        toast.push(res.error, "error");
      }
    });
  };

  const remove = (id: string) => {
    setError(null);
    const snapshot = items;
    setItems((list) => list.filter((b) => b.id !== id)); // optimistic
    start(async () => {
      const res = await deleteBriefItemAction(id);
      if (res.ok) {
        toast.push("Deleted");
      } else {
        setItems(snapshot);
        fail(res.error);
        toast.push(res.error, "error");
      }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Documents"
        title="Brief"
        subtitle="The reference brief: who we are and where we are going."
        actions={
          <Button size="sm" onClick={() => { setCreating((c) => !c); setEditingId(null); }}>
            <Icon name="plus" size={14} />
            Add brief item
          </Button>
        }
      />

      {error ? (
        <div className="rounded-control border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">
          {error}
        </div>
      ) : null}

      {creating ? (
        <Card>
          <BriefForm initial={EMPTY_FORM} submitLabel="Add item" onSubmit={create} onCancel={() => setCreating(false)} />
        </Card>
      ) : null}

      {items.length === 0 ? (
        <Card>
          <EmptyState icon="file" title="No brief items" message="Add one with Add brief item." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {items.map((b) => {
            const isTemp = b.id.startsWith("temp-");
            return (
              <Card key={b.id}>
                {editingId === b.id ? (
                  <BriefForm
                    initial={{ title: b.title, note: b.note }}
                    submitLabel="Save"
                    onSubmit={(v) => saveEdit(b.id, v)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">{b.title}</div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isTemp}
                          onClick={() => { setEditingId(b.id); setCreating(false); }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" disabled={isTemp} onClick={() => remove(b.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-fg-dim">{b.note}</p>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
