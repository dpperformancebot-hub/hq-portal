// Expense math + labels shared by server selectors and client panels (plain
// module, importable anywhere). One-off expenses normalize to 0: they are
// listed but excluded from the recurring monthly total.

import type { ExpenseCadence } from "@/lib/expenses-actions";

export const CADENCE_LABEL: Record<ExpenseCadence, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  one_off: "One-off",
};

export function monthlyAmount(e: { amount: number; cadence: ExpenseCadence }): number {
  switch (e.cadence) {
    case "weekly":
      return (e.amount * 52) / 12;
    case "fortnightly":
      return (e.amount * 26) / 12;
    case "monthly":
      return e.amount;
    case "quarterly":
      return e.amount / 3;
    case "yearly":
      return e.amount / 12;
    case "one_off":
      return 0;
  }
}
