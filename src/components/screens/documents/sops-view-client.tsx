"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Card, EmptyState, PageHeader, useToast } from "@/components/ui";
import { Icon } from "@/lib/icons";
import type { Sop } from "@/lib/seed";
import {
  createSopAction,
  deleteSopAction,
  updateSopAction,
  type SopInput,
} from "@/lib/sops-brief-actions";

// Category options for the form. The column is free text (default "General"),
// so reads may surface others; the list groups dynamically below.
const CATEGORIES = ["Operations", "Coaching", "Sales", "Marketing", "General"];

const EMPTY_FORM: SopInput = { title: "", category: "Operations", version: "v1" };

function SopForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  busy,
}: {
  initial: SopInput;
  submitLabel: string;
  onSubmit: (v: SopInput) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [form, setForm] = useState<SopInput>(initial);
  const input =
    "rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-accent disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-fg-muted">Title</span>
        <input
          className={`${input} w-56`}
          value={form.title}
          disabled={busy}
          placeholder="SOP title"
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-fg-muted">Category</span>
        <select
          className={`${input} w-40`}
          value={form.category}
          disabled={busy}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-fg-muted">Version</span>
        <input
          className={`${input} w-20`}
          value={form.version}
          disabled={busy}
          placeholder="v1"
          onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
        />
      </label>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => onSubmit(form)}>
          {busy ? "Saving..." : submitLabel}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function SopsView({ sops }: { sops: Sop[] }) {
  // Server data is the source of truth; mirror locally for optimistic edits and
  // re-sync whenever a write revalidates /sops and sends fresh props.
  const toast = useToast();
  const [items, setItems] = useState<Sop[]>(sops);
  useEffect(() => setItems(sops), [sops]);

  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const fail = (msg: string) => setError(msg);

  const create = (form: SopInput) => {
    setError(null);
    const title = form.title.trim();
    if (!title) return fail("Title is required.");
    const temp: Sop = {
      id: `temp-${Date.now()}`,
      title,
      category: form.category.trim() || "General",
      version: form.version.trim() || "v1",
      updated: "saving...",
    };
    setItems((prev) => [temp, ...prev]); // optimistic
    setCreating(false);
    start(async () => {
      const res = await createSopAction(form);
      // On success the revalidate refreshes props and the effect replaces temp.
      if (res.ok) {
        toast.push("Saved");
      } else {
        setItems((prev) => prev.filter((s) => s.id !== temp.id));
        fail(res.error);
        toast.push(res.error, "error");
      }
    });
  };

  const saveEdit = (id: string, form: SopInput) => {
    setError(null);
    const title = form.title.trim();
    if (!title) return fail("Title is required.");
    const before = items.find((s) => s.id === id);
    setItems((list) =>
      list.map((s) =>
        s.id === id
          ? { ...s, title, category: form.category.trim() || "General", version: form.version.trim() || "v1" }
          : s,
      ),
    );
    setEditingId(null);
    start(async () => {
      const res = await updateSopAction(id, form);
      if (res.ok) {
        toast.push("Saved");
      } else {
        if (before) setItems((list) => list.map((s) => (s.id === id ? before : s)));
        fail(res.error);
        toast.push(res.error, "error");
      }
    });
  };

  const remove = (id: string) => {
    setError(null);
    const snapshot = items;
    setItems((list) => list.filter((s) => s.id !== id)); // optimistic
    start(async () => {
      const res = await deleteSopAction(id);
      if (res.ok) {
        toast.push("Deleted");
      } else {
        setItems(snapshot);
        fail(res.error);
        toast.push(res.error, "error");
      }
    });
  };

  const matches = items.filter((s) => s.title.toLowerCase().includes(query.trim().toLowerCase()));
  // Group by category, preferred order first then any extras alphabetically.
  const present = [...new Set(matches.map((s) => s.category))];
  const cats = [
    ...CATEGORIES.filter((c) => present.includes(c)),
    ...present.filter((c) => !CATEGORIES.includes(c)).sort(),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Documents"
        title="SOPs"
        subtitle="Standard operating procedures by category."
        actions={
          <Button size="sm" onClick={() => { setCreating((c) => !c); setEditingId(null); }}>
            <Icon name="plus" size={14} />
            New SOP
          </Button>
        }
      />

      {error ? (
        <div className="rounded-control border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">
          {error}
        </div>
      ) : null}

      {creating ? (
        <Card className="space-y-2">
          <SopForm initial={EMPTY_FORM} submitLabel="Add SOP" busy={false} onSubmit={create} onCancel={() => setCreating(false)} />
          <p className="text-[11px] text-fg-muted">
            Attaching the SOP document (file upload) is deferred to Phase 2; title, category, and version save now.
          </p>
        </Card>
      ) : null}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search SOPs"
        className="w-72 rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none"
      />

      {matches.length === 0 ? (
        <Card>
          <EmptyState icon="book" title="No SOPs" message="Add one with New SOP, or adjust your search." />
        </Card>
      ) : (
        <div className="space-y-6">
          {cats.map((cat) => {
            const rows = matches.filter((s) => s.category === cat);
            if (rows.length === 0) return null;
            return (
              <div key={cat}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">{cat}</div>
                <Card className="p-0">
                  {rows.map((s, i) => {
                    const isTemp = s.id.startsWith("temp-");
                    return (
                      <div key={s.id} className={i > 0 ? "border-t border-border-soft" : ""}>
                        {editingId === s.id ? (
                          <div className="px-4 py-3">
                            <SopForm
                              initial={{ title: s.title, category: s.category, version: s.version }}
                              submitLabel="Save"
                              busy={false}
                              onSubmit={(v) => saveEdit(s.id, v)}
                              onCancel={() => setEditingId(null)}
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 px-4 py-3">
                            <span className="text-fg-muted">
                              <Icon name="book" size={16} />
                            </span>
                            <span className="flex-1 text-sm text-fg">{s.title}</span>
                            <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] text-fg-dim">{s.version}</span>
                            <span className="w-24 text-right text-xs text-fg-muted">{s.updated}</span>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={isTemp}
                                onClick={() => { setEditingId(s.id); setCreating(false); }}
                              >
                                Edit
                              </Button>
                              <Button size="sm" variant="ghost" disabled={isTemp} onClick={() => remove(s.id)}>
                                Delete
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
