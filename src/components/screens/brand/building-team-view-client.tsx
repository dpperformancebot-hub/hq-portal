"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Button, Card, PageHeader, useToast } from "@/components/ui";
import type { Hire } from "@/lib/seed";
import { createHireAction } from "@/lib/brand-build-actions";

const STAGES: Hire["stage"][] = ["Sourcing", "Interviewing", "Offer", "Hired"];

const inputCls =
  "rounded-control border border-border-soft bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent disabled:opacity-50";

type Draft = { role: string; candidate: string; stage: Hire["stage"] };

function reduce(state: Hire[], hire: Hire): Hire[] {
  return [hire, ...state];
}

export function BuildingTeamView({ hires, live }: { hires: Hire[]; live: boolean }) {
  const toast = useToast();
  const [optimistic, apply] = useOptimistic(hires, reduce);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const openNew = () => {
    if (!live) return;
    setMsg(null);
    setDraft({ role: "", candidate: "", stage: "Sourcing" });
  };

  const save = () => {
    if (!draft || !draft.role.trim()) return;
    const d = draft;
    setMsg(null);
    start(async () => {
      apply({ id: `temp-${crypto.randomUUID()}`, role: d.role.trim(), candidate: d.candidate.trim(), stage: d.stage });
      const res = await createHireAction({ role: d.role, candidate: d.candidate, stage: d.stage });
      if (!res.ok) {
        setMsg(res.error ?? "Could not add the role.");
        toast.push(res.error ?? "Could not add the role.", "error");
        return;
      }
      toast.push("Role created");
      setDraft(null);
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Brand"
        title="Building the Team"
        subtitle="Hiring pipeline by stage."
        actions={
          <Button size="sm" onClick={openNew} disabled={!live} title={live ? "" : "Saving goes live with the database"}>
            New role
          </Button>
        }
      />

      {!live && (
        <div className="rounded-control border border-warn/40 bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
          Demo pipeline. Adding roles goes live with the database (active in production).
        </div>
      )}

      {draft && live && (
        <Card className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[2fr_2fr_1fr_auto]">
            <input
              className={inputCls}
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              placeholder="Role (e.g. Junior Coach)"
              disabled={pending}
              autoFocus
            />
            <input
              className={inputCls}
              value={draft.candidate}
              onChange={(e) => setDraft({ ...draft, candidate: e.target.value })}
              placeholder="Candidate (e.g. 3 candidates)"
              disabled={pending}
            />
            <select
              aria-label="Stage"
              className={inputCls}
              value={draft.stage}
              onChange={(e) => setDraft({ ...draft, stage: e.target.value as Hire["stage"] })}
              disabled={pending}
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={save} disabled={pending || !draft.role.trim()}>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((stage) => {
          const items = optimistic.filter((h) => h.stage === stage);
          return (
            <div key={stage}>
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-muted">{stage}</span>
                <span className="text-xs tabular-nums text-fg-muted">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((h) => (
                  <Card key={h.id} className="p-3">
                    <div className="text-sm font-medium text-fg">{h.role}</div>
                    <div className="mt-1 text-xs text-fg-dim">{h.candidate}</div>
                  </Card>
                ))}
                {items.length === 0 ? (
                  <div className="rounded-card border border-dashed border-border px-3 py-6 text-center text-xs text-fg-muted">None</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
