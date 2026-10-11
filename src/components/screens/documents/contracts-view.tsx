"use client";

import { useState, useTransition } from "react";
import { Button, Card, DataTable, PageHeader, useToast, type Column } from "@/components/ui";
import { Icon } from "@/lib/icons";
import type { Contract } from "@/lib/seed";
import {
  createContract,
  deleteContract,
  updateContract,
  type ContractInput,
} from "@/lib/contracts-merch-actions";

const STATUS_CHIP: Record<Contract["status"], string> = {
  active: "bg-positive-soft text-positive",
  pending: "bg-warn-soft text-warn",
  expired: "bg-surface-2 text-fg-muted",
};

const EMPTY_FORM: ContractInput = {
  client: "",
  type: "Coaching",
  value: 0,
  signed: "",
  term: "",
  status: "pending",
};

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

function ContractForm({
  initial,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  initial: ContractInput;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (form: ContractInput) => void;
}) {
  const [form, setForm] = useState<ContractInput>(initial);
  const set = <K extends keyof ContractInput>(k: K, v: ContractInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={busy ? undefined : onCancel} />
      <Card className="relative z-10 w-full max-w-lg space-y-4">
        <div className="flex items-start justify-between">
          <div className="font-display text-lg tracking-display text-fg">
            {initial.client ? "Edit contract" : "New contract"}
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-lg leading-none text-fg-muted hover:text-fg">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Client">
              <input className={inputCls} value={form.client} onChange={(e) => set("client", e.target.value)} placeholder="Client or prospect name" />
            </Field>
          </div>
          <Field label="Type">
            <input className={inputCls} value={form.type} onChange={(e) => set("type", e.target.value)} placeholder="12-week PIF" />
          </Field>
          <Field label="Value (AUD)">
            <input type="number" min={0} className={`${inputCls} tabular-nums`} value={form.value} onChange={(e) => set("value", e.target.value === "" ? 0 : Number(e.target.value))} />
          </Field>
          <Field label="Signed">
            <input type="date" className={`${inputCls} tabular-nums`} value={form.signed} onChange={(e) => set("signed", e.target.value)} />
          </Field>
          <Field label="Term">
            <input className={inputCls} value={form.term} onChange={(e) => set("term", e.target.value)} placeholder="12 weeks" />
          </Field>
          <Field label="Status">
            <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value as Contract["status"])}>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
            </select>
          </Field>
        </div>

        <div className="rounded-control border border-dashed border-border-soft px-3 py-2 text-xs text-fg-muted">
          Signed PDF upload (document_url) lands in Phase 2 with file storage. Record the contract details here for now.
        </div>

        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={() => onSubmit(form)} disabled={busy}>
            {busy ? "Saving..." : "Save contract"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function ContractsView({ contracts, canWrite }: { contracts: Contract[]; canWrite: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<Contract[]>(contracts);
  const [editing, setEditing] = useState<Contract | "new" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const openNew = () => {
    setFormError(null);
    setEditing("new");
  };
  const openEdit = (c: Contract) => {
    setFormError(null);
    setEditing(c);
  };

  const submit = (form: ContractInput) => {
    setFormError(null);
    startTransition(async () => {
      if (editing === "new") {
        // Optimistic insert with a temporary id, reconciled on success.
        const tempId = `tmp-${Date.now()}`;
        const optimistic: Contract = { id: tempId, client: form.client, type: form.type, value: form.value, signed: form.signed, term: form.term, status: form.status };
        setRows((r) => [optimistic, ...r]);
        const res = await createContract(form);
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
        const res = await updateContract(id, form);
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

  const remove = (c: Contract) => {
    setRowError(null);
    const snapshot = rows;
    setRows((r) => r.filter((x) => x.id !== c.id));
    startTransition(async () => {
      const res = await deleteContract(c.id);
      if (res.ok) {
        toast.push("Deleted");
      } else {
        setRows(snapshot);
        setRowError(res.error);
        toast.push(res.error, "error");
      }
    });
  };

  const columns: Column<Contract>[] = [
    { key: "client", header: "Client", render: (c) => <span className="font-medium text-fg">{c.client}</span> },
    { key: "type", header: "Type", render: (c) => <span className="text-fg-dim">{c.type}</span> },
    { key: "value", header: "Value", align: "right", width: "100px", render: (c) => `$${c.value.toLocaleString()}` },
    { key: "signed", header: "Signed", width: "120px", render: (c) => <span className="text-fg-dim tabular-nums">{c.signed || "-"}</span> },
    { key: "term", header: "Term", width: "100px", render: (c) => <span className="text-fg-dim">{c.term || "-"}</span> },
    {
      key: "status",
      header: "Status",
      width: "100px",
      render: (c) => <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_CHIP[c.status]}`}>{c.status}</span>,
    },
  ];

  if (canWrite) {
    columns.push({
      key: "actions",
      header: "",
      align: "right",
      width: "140px",
      render: (c) => (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => openEdit(c)} disabled={busy} className="text-xs font-medium text-fg-dim hover:text-fg disabled:opacity-50">
            Edit
          </button>
          <button type="button" onClick={() => remove(c)} disabled={busy} className="text-xs font-medium text-danger hover:underline disabled:opacity-50">
            Delete
          </button>
        </div>
      ),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Documents"
        title="Contracts"
        subtitle="Client agreements and terms."
        actions={
          canWrite ? (
            <Button size="sm" onClick={openNew}>
              <Icon name="plus" size={14} />New contract
            </Button>
          ) : (
            <Button size="sm" disabled title="Adding contracts needs the datastore (HQ_PERSISTENCE)">
              <Icon name="plus" size={14} />New contract
            </Button>
          )
        }
      />

      {rowError ? <p className="text-sm text-danger" role="alert">{rowError}</p> : null}

      <Card className="p-2">
        <DataTable columns={columns} data={rows} getRowKey={(c) => c.id} emptyMessage="No contracts yet." />
      </Card>

      {editing ? (
        <ContractForm
          initial={editing === "new" ? EMPTY_FORM : { client: editing.client, type: editing.type, value: editing.value, signed: editing.signed, term: editing.term, status: editing.status }}
          busy={busy}
          error={formError}
          onCancel={() => (busy ? undefined : setEditing(null))}
          onSubmit={submit}
        />
      ) : null}
    </div>
  );
}
