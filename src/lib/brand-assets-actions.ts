"use server";

// HQ-native CRUD for the Brand Assets store (brand_assets). Server-side only:
// every write goes through the service-role dbAdmin() client and is gated by
// persistenceEnabled(), so the actions no-op with an honest message until the
// owner flips HQ_PERSISTENCE.
//
// These are internal asset records with no outbound path: they contact nobody.
// Do NOT add any send/outreach here. Uploading the actual files (Supabase
// Storage) is Phase 2; this manages the metadata records only.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import type { BrandAsset } from "@/lib/seed";
import { assertBrandManager } from "@/lib/role-server";

const PATH = "/brand-assets";
const SELECT = "id,name,kind,updated_at";
const KINDS: BrandAsset["kind"][] = ["Logo", "Photo", "Video", "Guideline"];

type Result<T> = { ok: boolean; error?: string; data?: T };

const OFF: Result<never> = {
  ok: false,
  error: "Persistence is off. Saving goes live with the database.",
};

type Row = { id: string; name: string; kind: BrandAsset["kind"]; updated_at: string };
// updated_at -> updated (YYYY-MM-DD), matching the live read in lib/live.
const toAsset = (r: Row): BrandAsset => ({ id: r.id, name: r.name, kind: r.kind, updated: r.updated_at.slice(0, 10) });

export async function createBrandAsset(input: {
  name: string;
  kind: BrandAsset["kind"];
}): Promise<Result<BrandAsset>> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!persistenceEnabled()) return OFF;
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Asset name is required." };
  const kind = KINDS.includes(input.kind) ? input.kind : "Logo";
  const { data, error } = await dbAdmin()
    .from("brand_assets")
    .insert({ name, kind, updated_at: new Date().toISOString() })
    .select(SELECT)
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not add asset." };
  revalidatePath(PATH);
  return { ok: true, data: toAsset(data as Row) };
}

export async function updateBrandAsset(
  id: string,
  patch: { name?: string; kind?: BrandAsset["kind"] },
): Promise<Result<BrandAsset>> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!persistenceEnabled()) return OFF;
  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return { ok: false, error: "Asset name is required." };
    fields.name = name;
  }
  if (patch.kind !== undefined) fields.kind = KINDS.includes(patch.kind) ? patch.kind : "Logo";
  if (Object.keys(fields).length === 0) return { ok: false, error: "Nothing to update." };
  fields.updated_at = new Date().toISOString();
  const { data, error } = await dbAdmin()
    .from("brand_assets")
    .update(fields)
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not update asset." };
  revalidatePath(PATH);
  return { ok: true, data: toAsset(data as Row) };
}

export async function deleteBrandAsset(id: string): Promise<Result<never>> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!persistenceEnabled()) return OFF;
  const { error } = await dbAdmin().from("brand_assets").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}
