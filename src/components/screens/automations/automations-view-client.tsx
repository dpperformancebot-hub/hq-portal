"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { Icon } from "@/lib/icons";
import type { Automation, AutomationStatus } from "@/lib/seed";
import {
  saveAutomationConfig,
  setAutomationEnabled,
  type AutomationConfig,
} from "@/lib/automations-actions";

const STATUS_CHIP: Record<AutomationStatus, string> = {
  active: "bg-positive-soft text-positive",
  paused: "bg-surface-2 text-fg-dim",
  failing: "bg-danger-soft text-danger",
  draft: "bg-warn-soft text-warn",
};

const TABS: { label: string; match: (a: Automation) => boolean }[] = [
  { label: "All", match: () => true },
  { label: "Active", match: (a) => a.status === "active" },
  { label: "Paused", match: (a) => a.status === "paused" },
  { label: "Failing", match: (a) => a.status === "failing" },
  { label: "Drafts", match: (a) => a.status === "draft" },
  { label: "Replaces VA task", match: (a) => Boolean(a.replacesVATask) },
];

const toConfig = (a: Automation): AutomationConfig => ({
  name: a.name,
  trigger: a.trigger,
  actions: a.actions,
  cadence: a.cadence,
  status: a.status,
  replacesVATask: a.replacesVATask,
});

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: (e: React.MouseEvent) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-6 w-10 shrink-0 rounded-pill transition-colors disabled:opacity-50 ${on ? "bg-accent" : "border border-border bg-surface-2"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-pill bg-white shadow-sm transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="text-sm text-fg">{value}</div>
    </div>
  );
}

// Per-rule detail / editor. Trigger and actions are shown as a When -> Then
// flow and are editable. Saving stores config only: the automation engine ships
// later, so a saved rule does NOT execute yet. Name is the rule identity (the
// merge key) and stays read-only. Keyed by rule.id in the parent so the local
// form resets when a different rule opens.
function RuleDrawer({
  rule,
  live,
  busy,
  onToggle,
  onSave,
  onClose,
}: {
  rule: Automation;
  live: boolean;
  busy: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onSave: (patch: { trigger: string; actions: string; cadence: string }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ trigger: rule.trigger, actions: rule.actions, cadence: rule.cadence });
  const enabled = rule.status === "active";
  const field =
    "mt-1 w-full rounded-control border border-border-soft bg-surface-2 px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent disabled:opacity-50";
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto border-l border-border bg-surface p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-xl tracking-display text-fg">{rule.name}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`rounded-pill px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_CHIP[rule.status]}`}>{rule.status}</span>
              {rule.isNew ? (
                <span className="rounded-pill bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-deep">New</span>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-lg leading-none text-fg-muted hover:text-fg">
            ✕
          </button>
        </div>

        <div className="space-y-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">When</div>
            <textarea
              rows={2}
              className={field}
              value={form.trigger}
              disabled={busy}
              onChange={(e) => setForm((f) => ({ ...f, trigger: e.target.value }))}
            />
          </div>
          <div className="text-center text-fg-muted">↓</div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Then</div>
            <textarea
              rows={2}
              className={field}
              value={form.actions}
              disabled={busy}
              onChange={(e) => setForm((f) => ({ ...f, actions: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <div className="text-xs text-fg-muted">Cadence</div>
            <input
              className={field}
              value={form.cadence}
              disabled={busy}
              onChange={(e) => setForm((f) => ({ ...f, cadence: e.target.value }))}
            />
          </label>
          <Detail label="Replaces VA task" value={rule.replacesVATask || "-"} />
        </div>

        <div className="flex items-center justify-between rounded-control border border-border-soft px-3 py-2">
          <span className="text-sm text-fg">{enabled ? "Enabled" : "Disabled"}</span>
          <Toggle on={enabled} disabled={busy} onClick={onToggle} />
        </div>

        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => onSave(form)}>
            {busy ? "Saving..." : "Save"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>

        <p className="mt-auto text-xs text-fg-muted">
          {live
            ? "Saved config persists to the datastore. The automation engine ships later, so nothing runs yet."
            : "Editing saves locally in demo mode. Connect the datastore (HQ_PERSISTENCE) to persist."}
        </p>
      </div>
    </div>
  );
}

export function AutomationsView({ automations, live }: { automations: Automation[]; live: boolean }) {
  // Server data is the source of truth; mirror locally for optimistic toggles
  // and edits, and re-sync whenever a write revalidates /automations.
  const [items, setItems] = useState<Automation[]>(automations);
  useEffect(() => setItems(automations), [automations]);

  const [tab, setTab] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selected = items.find((a) => a.id === selectedId) ?? null;

  const toggle = (a: Automation) => {
    setError(null);
    const next: AutomationStatus = a.status === "active" ? "paused" : "active";
    const before = a;
    setItems((list) => list.map((x) => (x.id === a.id ? { ...x, status: next } : x))); // optimistic
    if (!live) return; // demo mode: toggle stays local (no datastore)
    start(async () => {
      const res = await setAutomationEnabled(toConfig(a), next === "active");
      if (!res.ok) {
        setItems((list) => list.map((x) => (x.id === a.id ? before : x)));
        setError(res.error);
      }
    });
  };

  const save = (a: Automation, patch: { trigger: string; actions: string; cadence: string }) => {
    setError(null);
    const before = a;
    const updated: Automation = { ...a, ...patch };
    setItems((list) => list.map((x) => (x.id === a.id ? updated : x))); // optimistic
    if (!live) {
      setSelectedId(null); // demo mode: edit stays local
      return;
    }
    start(async () => {
      const res = await saveAutomationConfig(toConfig(updated));
      if (res.ok) {
        setSelectedId(null);
      } else {
        setItems((list) => list.map((x) => (x.id === a.id ? before : x)));
        setError(res.error);
      }
    });
  };

  const activeCount = items.filter((a) => a.status === "active").length;
  const vaCount = items.filter((a) => a.replacesVATask).length;
  const filtered = items.filter(TABS[tab].match);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automations"
        title="Automations"
        subtitle={`Workflows · ${activeCount} active · ${vaCount} rules replace VA tasks`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">Browse templates</Button>
            <Button size="sm">New automation</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2 rounded-control border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn">
          <Icon name="cpu" size={14} /> Toggles and edits store config. The automation engine ships later, nothing runs yet.
        </div>
        <div className="flex items-center gap-2 rounded-control border border-border bg-surface-2 px-3 py-2 text-xs text-fg-dim">
          <Icon name="trending_up" size={14} /> Estimated time saved: ~40h / month.
        </div>
      </div>

      {error ? (
        <div className="rounded-control border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t, i) => {
          const count = items.filter(t.match).length;
          const on = i === tab;
          return (
            <button
              key={t.label}
              type="button"
              onClick={() => setTab(i)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                on ? "border-accent text-fg" : "border-transparent text-fg-dim hover:text-fg"
              }`}
            >
              {t.label}
              <span className="text-xs tabular-nums text-fg-muted">{count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon="cpu" title="No automations here" />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <Card
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className="flex cursor-pointer items-center gap-4 transition-colors hover:border-accent/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-fg">{a.name}</span>
                  {a.isNew ? (
                    <span className="rounded-pill bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-deep">New</span>
                  ) : null}
                  <span className={`rounded-pill px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_CHIP[a.status]}`}>{a.status}</span>
                </div>
                <div className="mt-1 text-xs text-fg-dim">
                  {a.trigger} → {a.actions}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[10px] text-fg-muted">{a.cadence}</span>
                  {a.replacesVATask ? (
                    <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[10px] text-fg-muted">Replaces &ldquo;{a.replacesVATask}&rdquo;</span>
                  ) : null}
                </div>
              </div>
              <Toggle
                on={a.status === "active"}
                disabled={pending}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(a);
                }}
              />
            </Card>
          ))}
        </div>
      )}

      {selected ? (
        <RuleDrawer
          key={selected.id}
          rule={selected}
          live={live}
          busy={pending}
          onToggle={(e) => {
            e.stopPropagation();
            toggle(selected);
          }}
          onSave={(patch) => save(selected, patch)}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}
