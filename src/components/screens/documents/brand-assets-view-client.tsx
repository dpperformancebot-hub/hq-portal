"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Button, Card, EmptyState, PageHeader, useToast } from "@/components/ui";
import { Icon } from "@/lib/icons";
import type { BrandAsset } from "@/lib/seed";
import { createBrandAsset, deleteBrandAsset, updateBrandAsset } from "@/lib/brand-assets-actions";

type Kind = BrandAsset["kind"];

const KINDS: Kind[] = ["Logo", "Photo", "Video", "Guideline"];

const TABS: { label: string; kind: Kind | "all" }[] = [
  { label: "All", kind: "all" },
  { label: "Logos", kind: "Logo" },
  { label: "Photos", kind: "Photo" },
  { label: "Video", kind: "Video" },
  { label: "Guidelines", kind: "Guideline" },
];

const KIND_ICON: Record<Kind, string> = {
  Logo: "star",
  Photo: "image",
  Video: "video",
  Guideline: "book",
};

const inputCls =
  "rounded-control border border-border-soft bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent disabled:opacity-50";

const today = () => new Date().toISOString().slice(0, 10);

type Draft = { id?: string; name: string; kind: Kind };

type OptAction =
  | { kind: "add"; asset: BrandAsset }
  | { kind: "update"; asset: BrandAsset }
  | { kind: "delete"; id: string };

function reduce(state: BrandAsset[], action: OptAction): BrandAsset[] {
  switch (action.kind) {
    case "add":
      return [action.asset, ...state];
    case "update":
      return state.map((a) => (a.id === action.asset.id ? action.asset : a));
    case "delete":
      return state.filter((a) => a.id !== action.id);
  }
}

export function BrandAssetsView({ assets, live }: { assets: BrandAsset[]; live: boolean }) {
  const toast = useToast();
  const [optimistic, apply] = useOptimistic(assets, reduce);
  const [tab, setTab] = useState<Kind | "all">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const filtered = optimistic.filter((a) => (tab === "all" ? true : a.kind === tab));

  const openNew = () => {
    if (!live) return;
    setMsg(null);
    setDraft({ name: "", kind: "Logo" });
  };
  const openEdit = (a: BrandAsset) => {
    if (!live) return;
    setMsg(null);
    setDraft({ id: a.id, name: a.name, kind: a.kind });
  };

  const save = () => {
    if (!draft || !draft.name.trim()) return;
    const d = draft;
    const name = d.name.trim();
    setMsg(null);
    start(async () => {
      if (d.id) {
        apply({ kind: "update", asset: { id: d.id, name, kind: d.kind, updated: today() } });
        const res = await updateBrandAsset(d.id, { name, kind: d.kind });
        if (!res.ok) {
          setMsg(res.error ?? "Could not save the asset.");
          toast.push(res.error ?? "Could not save the asset.", "error");
          return;
        }
        toast.push("Saved");
      } else {
        const temp: BrandAsset = { id: `temp-${crypto.randomUUID()}`, name, kind: d.kind, updated: today() };
        apply({ kind: "add", asset: temp });
        const res = await createBrandAsset({ name, kind: d.kind });
        if (!res.ok) {
          setMsg(res.error ?? "Could not add the asset.");
          toast.push(res.error ?? "Could not add the asset.", "error");
          return;
        }
        toast.push("Saved");
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
      const res = await deleteBrandAsset(id);
      if (!res.ok) {
        setMsg(res.error ?? "Could not delete the asset.");
        toast.push(res.error ?? "Could not delete the asset.", "error");
        return;
      }
      toast.push("Deleted");
      setDraft(null);
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Documents"
        title="Brand Assets"
        subtitle="Logos, photos, video, and guidelines."
        actions={
          <Button size="sm" onClick={openNew} disabled={!live} title={live ? "" : "Saving goes live with the database"}>
            <Icon name="plus" size={14} />
            Add asset
          </Button>
        }
      />

      {!live && (
        <div className="rounded-control border border-warn/40 bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
          Demo assets. Adding, editing, and removing asset records goes live with the database (active in production).
        </div>
      )}

      {live && (
        <div className="rounded-control border border-border bg-surface-2 px-3 py-2 text-[11px] text-fg-muted">
          Asset records only. Uploading the files themselves (Supabase Storage) arrives in Phase 2.
        </div>
      )}

      {draft && (
        <Card className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
            <input
              className={inputCls}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Asset name"
              disabled={pending}
              autoFocus
            />
            <select
              aria-label="Kind"
              className={inputCls}
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as Kind })}
              disabled={pending}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={save} disabled={pending || !draft.name.trim()}>
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
                Delete asset
              </button>
            )}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const count = t.kind === "all" ? optimistic.length : optimistic.filter((a) => a.kind === t.kind).length;
          const on = t.kind === tab;
          return (
            <button
              key={t.label}
              type="button"
              onClick={() => setTab(t.kind)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${on ? "border-accent text-fg" : "border-transparent text-fg-dim hover:text-fg"}`}
            >
              {t.label}
              <span className="text-xs tabular-nums text-fg-muted">{count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon="folder" title="No assets" message={live ? "Add one with the Add asset button." : undefined} />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((a) => {
            const body = (
              <>
                <div className="flex h-24 items-center justify-center rounded-control bg-surface-2 text-fg-muted">
                  <Icon name={KIND_ICON[a.kind]} size={26} />
                </div>
                <div>
                  <div className="truncate text-sm font-medium text-fg">{a.name}</div>
                  <div className="mt-0.5 flex items-center justify-between text-[11px] text-fg-muted">
                    <span>{a.kind}</span>
                    <span>{a.updated}</span>
                  </div>
                </div>
              </>
            );
            return live ? (
              <Card key={a.id} className="p-0">
                <button
                  type="button"
                  onClick={() => openEdit(a)}
                  className="flex w-full flex-col gap-3 p-5 text-left transition-colors hover:bg-surface-2"
                  aria-label={`Edit ${a.name}`}
                >
                  {body}
                </button>
              </Card>
            ) : (
              <Card key={a.id} className="flex flex-col gap-3">
                {body}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
