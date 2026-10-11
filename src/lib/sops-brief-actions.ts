"use server";

// HQ-NATIVE CRUD for the SOPs and Brief document stores (Datastore Phase 1,
// docs/datastore-phase1-proposal.md). Both tables are internal HQ content with
// NO outbound path: they contact nobody, so there is no outreach guard here.
// Every write goes through dbAdmin() (service role), is guarded by
// persistenceEnabled(), and revalidates its route so the server-read screen
// reflects the change. The sops.updated_at column is maintained by the table's
// set_updated_at() trigger, so updates never set it by hand.
//
// Deferred to Phase 2: sops.document_url (the uploaded SOP file). The column
// exists but file upload (Supabase Storage) is not wired, so it is never
// written here.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { assertBrandManager } from "@/lib/role-server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const NO_DB =
  "This needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured and the document-stores migration applied.";

// ---------------------------------------------------------------------- SOPs

export type SopInput = { title: string; category: string; version: string };

function cleanSop(input: SopInput): { title: string; category: string; version: string } | null {
  const title = input.title.trim();
  if (!title) return null;
  return {
    title,
    category: input.category.trim() || "General",
    version: input.version.trim() || "v1",
  };
}

export async function createSopAction(input: SopInput): Promise<ActionResult> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  const row = cleanSop(input);
  if (!row) return { ok: false, error: "Title is required." };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const { error } = await dbAdmin().from("sops").insert(row);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/sops");
  return { ok: true };
}

export async function updateSopAction(id: string, input: SopInput): Promise<ActionResult> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!id) return { ok: false, error: "Missing SOP id." };
  const row = cleanSop(input);
  if (!row) return { ok: false, error: "Title is required." };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const { error } = await dbAdmin().from("sops").update(row).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/sops");
  return { ok: true };
}

export async function deleteSopAction(id: string): Promise<ActionResult> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!id) return { ok: false, error: "Missing SOP id." };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const { error } = await dbAdmin().from("sops").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/sops");
  return { ok: true };
}

// --------------------------------------------------------------------- Brief

export type BriefInput = { title: string; note: string };

export async function createBriefItemAction(input: BriefInput): Promise<ActionResult> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const { error } = await dbAdmin()
    .from("brief_items")
    .insert({ title, note: input.note.trim() });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/brief");
  return { ok: true };
}

export async function updateBriefItemAction(id: string, input: BriefInput): Promise<ActionResult> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!id) return { ok: false, error: "Missing brief item id." };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const { error } = await dbAdmin()
    .from("brief_items")
    .update({ title, note: input.note.trim() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/brief");
  return { ok: true };
}

export async function deleteBriefItemAction(id: string): Promise<ActionResult> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!id) return { ok: false, error: "Missing brief item id." };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const { error } = await dbAdmin().from("brief_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/brief");
  return { ok: true };
}
