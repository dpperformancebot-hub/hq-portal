"use server";

// Business expenses (2026-07-02, owner request). Owner-gated CRUD on the
// expenses table (migration 20260702000002) plus the read used by Financials
// and the dashboard. Amounts are normalized to a monthly equivalent for the
// rolled-up numbers; one-off expenses are listed but excluded from the
// recurring monthly total. Internal records only, NO outbound path.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { moneyHiddenFromViewer } from "@/lib/access-policy";
import { getServerIdentity } from "@/lib/role-server";

export type ExpenseCadence = "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly" | "one_off";

export type Expense = {
  id: string;
  name: string;
  amount: number;
  cadence: ExpenseCadence;
  category: string | null;
  active: boolean;
  startedOn: string;
  notes: string | null;
};

const CADENCES: ExpenseCadence[] = ["weekly", "fortnightly", "monthly", "quarterly", "yearly", "one_off"];

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const NO_DB = "Expenses need the HQ datastore (apply migration 20260702000002).";
const NOT_OWNER = "Only the owner can manage expenses.";

async function assertOwner(): Promise<string | null> {
  const id = await getServerIdentity();
  // TJD: not while the owner views as a coach (the coach view has no money).
  return id.realRole === "owner" && !moneyHiddenFromViewer(id) ? null : NOT_OWNER;
}

type Row = {
  id: string;
  name: string;
  amount: number | string;
  cadence: string;
  category: string | null;
  active: boolean;
  started_on: string | null;
  notes: string | null;
};

const toExpense = (r: Row): Expense => ({
  id: r.id,
  name: r.name,
  amount: Number(r.amount),
  cadence: CADENCES.includes(r.cadence as ExpenseCadence) ? (r.cadence as ExpenseCadence) : "monthly",
  category: r.category,
  active: r.active,
  startedOn: r.started_on ?? "",
  notes: r.notes,
});

/** All expenses, active first then name. Empty when the table is absent so
 *  screens degrade to their empty states pre-migration. */
export async function listExpenses(): Promise<Expense[]> {
  if (!persistenceEnabled()) return [];
  // SEC-AUDIT (2026-09-06): business expenses are financial data. The read
  // was open to any signed-in session calling it directly; owner + admin only
  // (the same rule as /financials). Others get an empty list, never an error,
  // so the owner dashboard's KPI path degrades cleanly for other roles.
  const id = await getServerIdentity();
  const { realRole, role } = id;
  if (realRole !== "owner" && role !== "owner" && role !== "admin") return [];
  if (moneyHiddenFromViewer(id)) return []; // TJD owner viewing as a coach
  try {
    const { data, error } = await dbAdmin()
      .from("expenses")
      .select("id,name,amount,cadence,category,active,started_on,notes")
      .order("active", { ascending: false })
      .order("name", { ascending: true });
    if (error || !data) return [];
    return (data as Row[]).map(toExpense);
  } catch {
    return [];
  }
}

export async function createExpenseAction(input: {
  name: string;
  amount: number;
  cadence: ExpenseCadence;
  category?: string | null;
  notes?: string | null;
}): Promise<Result<Expense>> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const denied = await assertOwner();
  if (denied) return { ok: false, error: denied };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name required" };
  if (!(input.amount >= 0)) return { ok: false, error: "Amount must be 0 or more" };
  if (!CADENCES.includes(input.cadence)) return { ok: false, error: "Invalid cadence" };

  const { data, error } = await dbAdmin()
    .from("expenses")
    .insert({
      name,
      amount: input.amount,
      cadence: input.cadence,
      category: input.category?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select("id,name,amount,cadence,category,active,started_on,notes")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save expense." };
  revalidatePath("/financials");
  revalidatePath("/dashboard");
  return { ok: true, data: toExpense(data as Row) };
}

export async function setExpenseActiveAction(id: string, active: boolean): Promise<Result<null>> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const denied = await assertOwner();
  if (denied) return { ok: false, error: denied };
  if (!id) return { ok: false, error: "id required" };
  const { error } = await dbAdmin().from("expenses").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/financials");
  revalidatePath("/dashboard");
  return { ok: true, data: null };
}

export async function deleteExpenseAction(id: string): Promise<Result<null>> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const denied = await assertOwner();
  if (denied) return { ok: false, error: denied };
  if (!id) return { ok: false, error: "id required" };
  const { error } = await dbAdmin().from("expenses").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/financials");
  revalidatePath("/dashboard");
  return { ok: true, data: null };
}
