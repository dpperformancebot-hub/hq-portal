"use client";

import { useState, useTransition } from "react";
import { Button, Card, Kpi, PageHeader, useToast } from "@/components/ui";
import { Icon } from "@/lib/icons";
import type { MerchProduct } from "@/lib/seed";
import { BRAND } from "@/lib/brand";
import {
  createMerchProduct,
  deleteMerchProduct,
  updateMerchProduct,
  type MerchInput,
} from "@/lib/contracts-merch-actions";

const EMPTY_FORM: MerchInput = { name: "", unitsSold: 0, revenue: 0 };

const inputCls =
  "w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{label}</span>
      {children}
    </label>
  );
}

function MerchForm({
  initial,
  isNew,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  initial: MerchInput;
  isNew: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (form: MerchInput) => void;
}) {
  const [form, setForm] = useState<MerchInput>(initial);
  const set = <K extends keyof MerchInput>(k: K, v: MerchInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={busy ? undefined : onCancel} />
      <Card className="relative z-10 w-full max-w-md space-y-4">
        <div className="flex items-start justify-between">
          <div className="font-display text-lg tracking-display text-fg">{isNew ? "Add product" : "Edit product"}</div>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-lg leading-none text-fg-muted hover:text-fg">
            ✕
          </button>
        </div>

        <Field label="Name">
          <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={`${BRAND.initials} Training Tee`} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Units sold">
            <input type="number" min={0} className={`${inputCls} tabular-nums`} value={form.unitsSold} onChange={(e) => set("unitsSold", e.target.value === "" ? 0 : Number(e.target.value))} />
          </Field>
          <Field label="Revenue (AUD)">
            <input type="number" min={0} className={`${inputCls} tabular-nums`} value={form.revenue} onChange={(e) => set("revenue", e.target.value === "" ? 0 : Number(e.target.value))} />
          </Field>
        </div>

        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={() => onSubmit(form)} disabled={busy}>{busy ? "Saving..." : "Save product"}</Button>
        </div>
      </Card>
    </div>
  );
}

export function MerchView({ products, canWrite }: { products: MerchProduct[]; canWrite: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<MerchProduct[]>(products);
  const [editing, setEditing] = useState<MerchProduct | "new" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const totalUnits = rows.reduce((s, p) => s + p.unitsSold, 0);
  const totalRevenue = rows.reduce((s, p) => s + p.revenue, 0);

  const submit = (form: MerchInput) => {
    setFormError(null);
    startTransition(async () => {
      if (editing === "new") {
        const tempId = `tmp-${Date.now()}`;
        const optimistic: MerchProduct = { id: tempId, name: form.name, unitsSold: form.unitsSold, revenue: form.revenue };
        setRows((r) => [optimistic, ...r]);
        const res = await createMerchProduct(form);
        if (!res.ok) {
          setRows((r) => r.filter((x) => x.id !== tempId));
          setFormError(res.error);
          toast.push(res.error, "error");
          return;
        }
        toast.push("Saved");
        setRows((r) => r.map((x) => (x.id === tempId ? res.item : x)));
        setEditing(null);
      } else if (editing) {
        const id = editing.id;
        const prev = editing;
        setRows((r) => r.map((x) => (x.id === id ? { ...x, ...form } : x)));
        const res = await updateMerchProduct(id, form);
        if (!res.ok) {
          setRows((r) => r.map((x) => (x.id === id ? prev : x)));
          setFormError(res.error);
          toast.push(res.error, "error");
          return;
        }
        toast.push("Saved");
        setRows((r) => r.map((x) => (x.id === id ? res.item : x)));
        setEditing(null);
      }
    });
  };

  const remove = (p: MerchProduct) => {
    setRowError(null);
    const snapshot = rows;
    setRows((r) => r.filter((x) => x.id !== p.id));
    startTransition(async () => {
      const res = await deleteMerchProduct(p.id);
      if (res.ok) {
        toast.push("Deleted");
      } else {
        setRows(snapshot);
        setRowError(res.error);
        toast.push(res.error, "error");
      }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Documents"
        title="Merch"
        subtitle="Product range, units sold, and revenue."
        actions={
          canWrite ? (
            <Button size="sm" onClick={() => { setFormError(null); setEditing("new"); }}>
              <Icon name="plus" size={14} />Add product
            </Button>
          ) : (
            <Button size="sm" disabled title="Adding products needs the datastore (HQ_PERSISTENCE)">
              <Icon name="plus" size={14} />Add product
            </Button>
          )
        }
      />

      {rowError ? <p className="text-sm text-danger" role="alert">{rowError}</p> : null}

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <Kpi label="Units sold" value={totalUnits} />
        <Kpi label="Revenue" value={totalRevenue} prefix="$" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => (
          <Card key={p.id} className="flex flex-col gap-3">
            <div className="flex h-24 items-center justify-center rounded-control bg-surface-2 text-fg-muted">
              <Icon name="folder" size={26} />
            </div>
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium text-fg">{p.name}</div>
                {canWrite ? (
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => { setFormError(null); setEditing(p); }} disabled={busy} className="text-xs font-medium text-fg-dim hover:text-fg disabled:opacity-50">
                      Edit
                    </button>
                    <button type="button" onClick={() => remove(p)} disabled={busy} className="text-xs font-medium text-danger hover:underline disabled:opacity-50">
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-fg-dim">
                <span className="tabular-nums">{p.unitsSold} sold</span>
                <span className="tabular-nums">${p.revenue.toLocaleString()}</span>
              </div>
            </div>
          </Card>
        ))}
        {rows.length === 0 ? (
          <div className="rounded-card border border-dashed border-border px-3 py-10 text-center text-sm text-fg-muted sm:col-span-2 lg:col-span-3">
            No products yet.
          </div>
        ) : null}
      </div>

      {editing ? (
        <MerchForm
          initial={editing === "new" ? EMPTY_FORM : { name: editing.name, unitsSold: editing.unitsSold, revenue: editing.revenue }}
          isNew={editing === "new"}
          busy={busy}
          error={formError}
          onCancel={() => (busy ? undefined : setEditing(null))}
          onSubmit={submit}
        />
      ) : null}
    </div>
  );
}
