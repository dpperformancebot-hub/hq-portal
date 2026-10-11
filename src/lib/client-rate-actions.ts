"use server";

// HQ-OWNED per-client weekly rate. Like the coach link (coach-assign-actions),
// the rate lives in the HQ's own Supabase row (clients.weekly_rate) and is
// written directly here: it is HQ source-of-truth data, nothing leaves the HQ
// and no one is contacted, so it is never gated behind OUTREACH_ENABLED and
// there is no GHL write-back. The nightly GHL sync preserves this value for
// brands whose GHL does not carry rates (BRAND.roster.ownFieldsInHq), so an
// owner-entered rate is never clobbered.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { moneyHiddenFromViewer } from "@/lib/access-policy";
import { getServerIdentity } from "@/lib/role-server";

export type RateResult = { ok: true } | { ok: false; error: string };

const NO_DB = "Setting a rate needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";
const NOT_ALLOWED = "Only the owner can set client rates.";
// A weekly coaching rate; generous ceiling guards against a fat-fingered entry.
const MAX_WEEKLY = 100_000;

/** Set (owner only) one client's weekly rate. 0 clears it back to "not set".
 *  Checked on the REAL role so an owner impersonating a coach can still edit,
 *  but a coach/sales/va session calling directly cannot (rates are pay data). */
export async function setClientRateAction(clientId: string, weeklyRate: number): Promise<RateResult> {
  if (!clientId) return { ok: false, error: "clientId required" };
  if (!Number.isFinite(weeklyRate) || weeklyRate < 0 || weeklyRate > MAX_WEEKLY) {
    return { ok: false, error: `Enter a weekly rate between 0 and ${MAX_WEEKLY.toLocaleString()}.` };
  }
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const id = await getServerIdentity();
  // TJD: not while the owner views as a coach (the coach view has no money).
  if (id.realRole !== "owner" || moneyHiddenFromViewer(id)) return { ok: false, error: NOT_ALLOWED };

  // Round to cents; the column is numeric(10,2).
  const value = Math.round(weeklyRate * 100) / 100;
  const { error } = await dbAdmin().from("clients").update({ weekly_rate: value }).eq("id", clientId);
  if (error) return { ok: false, error: error.message };

  // Rate feeds MRR, payouts, LTV and the run-rate estimates across these views.
  for (const p of ["/client-database", `/client-database/${clientId}`, "/dashboard", "/financials", "/my-pay", "/renewals"]) {
    revalidatePath(p);
  }
  return { ok: true };
}
