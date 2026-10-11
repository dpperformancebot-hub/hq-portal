"use client";

// Business expenses panel (2026-07-02, owner request): enter recurring costs
// (rent, software, contractors) with a cadence; the list shows each expense's
// monthly equivalent and the recurring monthly total. Owner-only writes
// (enforced server-side in expenses-actions). Coach pay is NOT entered here:
// it is computed live from rosters and shown in Coach payouts above plus the
// dashboard expense roll-up.

import { useState, useTransition } from "react";
import { Button, EmptyState, Panel, useToast } from "@/components/ui";
import {
  createExpenseAction,
  deleteExpenseAction,
  setExpenseActiveAction,
  type Expense,
  type ExpenseCadence,
} from "@/lib/expenses-actions";
import { CADENCE_LABEL, monthlyAmount } from "@/lib/expenses-math";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const inputCls =
  "rounded-control border border-border-soft bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent disabled:opacity-50";

export function ExpensesPanel({ expenses: initial, isOwner }: { expenses: Expense[]; isOwner: boolean }) {
  const toast = useToast();
  const [expenses, setExpenses] = useState(initial);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<ExpenseCadence>("monthly");
  const [pending, start] = useTransition();

  const recurringMonthly = expenses.filter((e) => e.active).reduce((s, e) => s + monthlyAmount(e), 0);

  const add = () =>
    start(async () => {
      const res = await createExpenseAction({ name, amount: Number(amount) || 0, cadence });
      if (res.ok) {
        setExpenses((list) => [...list, res.data]);
        setName("");
        setAmount("");
        setCadence("monthly");
        toast.push(`Expense added: ${res.data.name}`);
      } else {
        toast.push(res.error, "error");
      }
    });

  const toggle = (e: Expense) =>
    start(async () => {
      const res = await setExpenseActiveAction(e.id, !e.active);
      if (res.ok) {
        setExpenses((list) => list.map((x) => (x.id === e.id ? { ...x, active: !e.active } : x)));
        toast.push(e.active ? `${e.name} paused` : `${e.name} active again`);
      } else {
        toast.push(res.error, "error");
      }
    });

  const remove = (e: Expense) =>
    start(async () => {
      const res = await deleteExpenseAction(e.id);
      if (res.ok) {
        setExpenses((list) => list.filter((x) => x.id !== e.id));
        toast.push(`${e.name} deleted`);
      } else {
        toast.push(res.error, "error");
      }
    });

  return (
    <Panel
      title="Business expenses"
      subtitle="Recurring costs you enter. Coach pay is computed automatically from rosters (Coach payouts above)."
      action={
        <span className="text-xs text-fg-dim">
          Recurring: <span className="font-medium tabular-nums text-fg">{money(recurringMonthly)}/mo</span>
        </span>
      }
    >
      {isOwner ? (
        <div
          className="mb-4 flex flex-wrap items-end gap-3"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !pending && name.trim()) add();
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Name
            <input
              className={`${inputCls} min-w-[180px]`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kahunas subscription"
              disabled={pending}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Amount
            <input
              className={`${inputCls} w-28`}
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              disabled={pending}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Repeats
            <select
              className={inputCls}
              value={cadence}
              onChange={(e) => setCadence(e.target.value as ExpenseCadence)}
              disabled={pending}
            >
              {(Object.keys(CADENCE_LABEL) as ExpenseCadence[]).map((c) => (
                <option key={c} value={c}>
                  {CADENCE_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" onClick={add} disabled={pending || !name.trim()}>
            {pending ? "Saving…" : "Add expense"}
          </Button>
        </div>
      ) : null}

      {expenses.length === 0 ? (
        <EmptyState
          icon="dollar"
          title="No expenses yet"
          message="Add rent, software, and other recurring costs; the dashboard rolls them into your monthly expense number."
        />
      ) : (
        <div className="divide-y divide-border-soft">
          {expenses.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className={`truncate text-sm font-medium ${e.active ? "text-fg" : "text-fg-muted line-through"}`}>
                  {e.name}
                </div>
                <div className="text-xs text-fg-dim">
                  {money(e.amount)} {CADENCE_LABEL[e.cadence].toLowerCase()}
                  {e.cadence !== "monthly" && e.cadence !== "one_off" ? ` · ${money(monthlyAmount(e))}/mo` : ""}
                  {e.cadence === "one_off" ? " · not recurring" : ""}
                </div>
              </div>
              {isOwner ? (
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggle(e)}
                    disabled={pending}
                    className="text-xs font-medium text-fg-dim hover:text-fg disabled:opacity-50"
                  >
                    {e.active ? "Pause" : "Resume"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(e)}
                    disabled={pending}
                    className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
