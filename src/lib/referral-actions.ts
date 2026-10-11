"use server";

// R4-2: the REAL referral tracker (referrals table, migration
// 20260807000003), modelled on the master sheet "Referall Tracker": per
// client up to 4 referrals, each with a reward-paid flag. Owner/VA edit.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";
import { isOpsRole } from "@/lib/navigation";

export type ReferralRow = {
  id: string;
  clientId: string;
  referralName: string;
  rewardPaid: boolean;
};

type Result = { ok: boolean; error?: string };

const MAX_PER_CLIENT = 4;
const NO_DB = "The referral tracker needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";
const NEEDS_MIGRATION =
  "The referral tracker needs a one-time database migration the owner must apply (20260807000003).";

const missingTable = (error: { code?: string; message?: string } | null) =>
  error?.code === "42P01" || /referrals/i.test(error?.message ?? "");

async function canEdit(): Promise<boolean> {
  const identity = await getServerIdentity();
  return identity.realRole === "owner" || isOpsRole(identity.role);
}

export async function addReferralAction(input: { clientId: string; name: string }): Promise<Result> {
  const name = input.name.trim();
  if (!input.clientId || !name) return { ok: false, error: "Client and referral name are required." };
  if (name.length > 120) return { ok: false, error: "Keep the referral name under 120 characters." };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  if (!(await canEdit())) return { ok: false, error: "Only owner or VA edit referrals." };

  const db = dbAdmin();
  const { count, error: countError } = await db
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("client_id", input.clientId);
  if (countError) return { ok: false, error: missingTable(countError) ? NEEDS_MIGRATION : countError.message };
  if ((count ?? 0) >= MAX_PER_CLIENT) {
    return { ok: false, error: `A client tracks at most ${MAX_PER_CLIENT} referrals (sheet convention).` };
  }

  const { error } = await db.from("referrals").insert({ client_id: input.clientId, referral_name: name });
  if (error) return { ok: false, error: missingTable(error) ? NEEDS_MIGRATION : error.message };
  revalidatePath("/referrals");
  return { ok: true };
}

export async function setReferralPaidAction(input: { id: string; paid: boolean }): Promise<Result> {
  if (!input.id) return { ok: false, error: "Missing referral row." };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  if (!(await canEdit())) return { ok: false, error: "Only owner or VA edit referrals." };

  const { error } = await dbAdmin().from("referrals").update({ reward_paid: input.paid }).eq("id", input.id);
  if (error) return { ok: false, error: missingTable(error) ? NEEDS_MIGRATION : error.message };
  revalidatePath("/referrals");
  return { ok: true };
}

/** All referral rows (empty pre-migration / persistence off). */
export async function listReferrals(): Promise<ReferralRow[]> {
  if (!persistenceEnabled()) return [];
  // SEC-AUDIT (2026-09-06): referral rows name clients and the people they
  // referred. Read was unguarded; now the same owner/ops rule as the writes.
  if (!(await canEdit())) return [];
  const { data, error } = await dbAdmin()
    .from("referrals")
    .select("id, client_id, referral_name, reward_paid")
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error || !data) return [];
  return (data as { id: string; client_id: string; referral_name: string; reward_paid: boolean }[]).map((r) => ({
    id: r.id,
    clientId: r.client_id,
    referralName: r.referral_name,
    rewardPaid: r.reward_paid,
  }));
}
