"use server";

// HQ-NATIVE document-store writes for Contracts and Merch (Datastore Phase 1,
// migration 20260620000001). These tables hold internal records only: no email,
// no phone, no outbound path. Writes therefore go straight through dbAdmin()
// and are NEVER gated behind OUTREACH_ENABLED, because nothing here can contact
// anyone. Each write is guarded by persistenceEnabled() and revalidates its own
// screen route so the server projection stays in step with the optimistic UI.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import type { Contract, MerchProduct } from "@/lib/seed/m4";
import { assertBrandManager } from "@/lib/role-server";

const CONTRACTS_ROUTE = "/contracts";
const MERCH_ROUTE = "/merch";

const NO_DB =
  "Saving needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";

type Ok<T> = { ok: true; item: T };
type Deleted = { ok: true };
type Err = { ok: false; error: string };

// ----------------------------------------------------------------- contracts

export type ContractInput = {
  client: string;
  type: string;
  value: number;
  signed: string; // "YYYY-MM-DD" or "" for unsigned
  term: string;
  status: Contract["status"];
};

type ContractRow = {
  id: string;
  client_name: string;
  type: string;
  value: number | string;
  signed: string | null;
  term: string | null;
  status: Contract["status"];
};

const CONTRACT_STATUSES: Contract["status"][] = ["active", "expired", "pending"];

function rowToContract(r: ContractRow): Contract {
  return {
    id: r.id,
    client: r.client_name,
    type: r.type,
    value: Number(r.value) || 0,
    signed: r.signed ? r.signed.slice(0, 10) : "",
    term: r.term ?? "",
    status: r.status,
  };
}

/** Normalise the form input into a contracts row, or an error string. */
function contractRow(input: ContractInput): { row: Omit<ContractRow, "id"> } | { error: string } {
  const client = (input.client ?? "").trim();
  if (!client) return { error: "Client name is required." };
  const value = Number(input.value);
  return {
    row: {
      client_name: client,
      type: (input.type ?? "").trim() || "Coaching",
      value: Number.isFinite(value) ? Math.max(0, value) : 0,
      signed: (input.signed ?? "").trim() || null,
      term: (input.term ?? "").trim() || null,
      status: CONTRACT_STATUSES.includes(input.status) ? input.status : "pending",
    },
  };
}

export async function createContract(input: ContractInput): Promise<Ok<Contract> | Err> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const built = contractRow(input);
  if ("error" in built) return { ok: false, error: built.error };
  const { data, error } = await dbAdmin()
    .from("contracts")
    .insert(built.row)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not create the contract." };
  revalidatePath(CONTRACTS_ROUTE);
  return { ok: true, item: rowToContract(data as ContractRow) };
}

export async function updateContract(id: string, input: ContractInput): Promise<Ok<Contract> | Err> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!id) return { ok: false, error: "id required" };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const built = contractRow(input);
  if ("error" in built) return { ok: false, error: built.error };
  const { data, error } = await dbAdmin()
    .from("contracts")
    .update(built.row)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not update the contract." };
  revalidatePath(CONTRACTS_ROUTE);
  return { ok: true, item: rowToContract(data as ContractRow) };
}

export async function deleteContract(id: string): Promise<Deleted | Err> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!id) return { ok: false, error: "id required" };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const { error } = await dbAdmin().from("contracts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(CONTRACTS_ROUTE);
  return { ok: true };
}

// ------------------------------------------------------------- merch products

export type MerchInput = {
  name: string;
  unitsSold: number;
  revenue: number;
};

type MerchRow = { id: string; name: string; units_sold: number; revenue: number | string };

function rowToMerch(r: MerchRow): MerchProduct {
  return { id: r.id, name: r.name, unitsSold: r.units_sold, revenue: Number(r.revenue) || 0 };
}

/** Normalise the form input into a merch_products row, or an error string. */
function merchRow(input: MerchInput): { row: Omit<MerchRow, "id"> } | { error: string } {
  const name = (input.name ?? "").trim();
  if (!name) return { error: "Product name is required." };
  const units = Number(input.unitsSold);
  const revenue = Number(input.revenue);
  return {
    row: {
      name,
      units_sold: Number.isFinite(units) ? Math.max(0, Math.round(units)) : 0,
      revenue: Number.isFinite(revenue) ? Math.max(0, revenue) : 0,
    },
  };
}

export async function createMerchProduct(input: MerchInput): Promise<Ok<MerchProduct> | Err> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const built = merchRow(input);
  if ("error" in built) return { ok: false, error: built.error };
  const { data, error } = await dbAdmin()
    .from("merch_products")
    .insert(built.row)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not add the product." };
  revalidatePath(MERCH_ROUTE);
  return { ok: true, item: rowToMerch(data as MerchRow) };
}

export async function updateMerchProduct(id: string, input: MerchInput): Promise<Ok<MerchProduct> | Err> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!id) return { ok: false, error: "id required" };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const built = merchRow(input);
  if ("error" in built) return { ok: false, error: built.error };
  const { data, error } = await dbAdmin()
    .from("merch_products")
    .update(built.row)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not update the product." };
  revalidatePath(MERCH_ROUTE);
  return { ok: true, item: rowToMerch(data as MerchRow) };
}

export async function deleteMerchProduct(id: string): Promise<Deleted | Err> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!id) return { ok: false, error: "id required" };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const { error } = await dbAdmin().from("merch_products").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(MERCH_ROUTE);
  return { ok: true };
}
