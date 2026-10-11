"use server";

// D5 (FEEDBACK-V2): renewal note per client (call booked / thinking / etc).
// HQ-owned column on the client row (the nightly GHL sync never writes it).
// Internal data only, no outbound path, nobody is contacted.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";
import { isOpsRole } from "@/lib/navigation";

export type RenewalNoteResult = { ok: true } | { ok: false; error: string };

const NO_DB =
  "Saving renewal notes needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";
const NEEDS_MIGRATION =
  "Saving renewal notes needs a one-time database migration the owner must apply (20260804000003).";

/** Owner + VA write the re-sign call list; nobody else. Owner is checked on
 *  the REAL role so impersonation keeps working. */
export async function setRenewalNoteAction(clientId: string, note: string): Promise<RenewalNoteResult> {
  if (!clientId) return { ok: false, error: "clientId required" };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const identity = await getServerIdentity();
  if (identity.realRole !== "owner" && !isOpsRole(identity.role)) {
    return { ok: false, error: "Only the owner or ops can edit renewal notes." };
  }

  const value = note.trim().slice(0, 300) || null;
  const { error } = await dbAdmin().from("clients").update({ renewal_note: value }).eq("id", clientId);
  if (error) {
    const missing = error.code === "42703" || /renewal_note/i.test(error.message);
    return { ok: false, error: missing ? NEEDS_MIGRATION : error.message };
  }

  revalidatePath("/renewals");
  return { ok: true };
}

// R16-6a: manual Term End. Writes clients.term_end_override (migration
// 20260921000004), never GHL: writeback.ts has no GHL PUT path yet and the
// GHL Subscription End / Pause workflows key off the term end date, so a
// portal write could trigger contact. Same gate as the renewal note.
export type TermEndResult = { ok: true } | { ok: false; error: string };
const NEEDS_TERM_END_MIGRATION =
  "Editing the term end needs a one-time database migration the owner must apply (20260921000004). It is written, not yet applied.";

export async function setTermEndOverrideAction(clientId: string, isoDate: string | null): Promise<TermEndResult> {
  if (!clientId) return { ok: false, error: "Missing client." };
  if (isoDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return { ok: false, error: "Term end must be a date." };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const identity = await getServerIdentity();
  if (identity.realRole !== "owner" && !isOpsRole(identity.role)) {
    return { ok: false, error: "Only the owner or ops can edit the term end." };
  }
  const { error } = await dbAdmin().from("clients").update({ term_end_override: isoDate }).eq("id", clientId);
  if (error) {
    const missing = error.code === "42703" || /term_end_override/i.test(error.message);
    return { ok: false, error: missing ? NEEDS_TERM_END_MIGRATION : error.message };
  }
  revalidatePath("/renewals");
  revalidatePath("/dashboard");
  revalidatePath(`/client-database/${clientId}`);
  return { ok: true };
}
