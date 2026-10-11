"use server";

// Shared recipe index (2026-07-11): the 12 built-in recipes plus the live
// recipes table, merged into one library every coach reads and any coach can
// add to by uploading a sheet. DB rows WIN over seed recipes on a title
// collision, so an upload can override a built-in. Internal content only,
// NO outbound path.
//
// Access: list = any signed-in role; import = any coach or the owner;
// delete = owner or head coach, DB rows only (seed recipes are code).

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";
import { RECIPES } from "@/lib/coach-content/recipes";
import type { Recipe } from "@/lib/coach-content/types";

/** What the Recipe Index renders: the seed Recipe shape plus provenance.
 *  DB-sourced recipes carry an id (deletable) and an uploader byline. */
export type SharedRecipe = Recipe & {
  /** recipes.id for DB rows; undefined for the built-ins. */
  id?: string;
  /** Uploader coach name for DB rows ("the team" when unknown). */
  addedBy?: string;
};

export type ImportedRecipe = {
  title: string;
  category?: string | null;
  serves?: string | null;
  ingredients?: string | null;
  method?: string | null;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const NO_DB =
  "Shared recipes need a one-time database migration (20260711000001_recipes.sql). It is written, not yet applied.";
const MAX_ROWS = 300;

type Row = {
  id: string;
  title: string;
  category: string | null;
  serves: string | null;
  ingredients: string;
  method: string;
  uploaded_by: string | null;
};

const SELECT = "id,title,category,serves,ingredients,method,uploaded_by";

const lines = (s: string | null | undefined): string[] =>
  String(s ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

function toShared(r: Row, coachNames: Map<string, string>): SharedRecipe {
  const serves = parseInt(String(r.serves ?? ""), 10);
  return {
    id: r.id,
    title: r.title,
    tags: r.category ? [r.category] : [],
    // Uploaded recipes carry no macros (the sheets do not have them); the
    // view hides the macro grid when everything is zero.
    kcal: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
    rating: 0,
    serves: Number.isNaN(serves) ? undefined : serves,
    ingredients: lines(r.ingredients),
    method: lines(r.method),
    addedBy: (r.uploaded_by ? coachNames.get(r.uploaded_by) : undefined) ?? "the team",
  };
}

/** The merged library: seed + DB, DB winning on (case-insensitive) title.
 *  Pre-migration or persistence-off this degrades silently to seed-only. */
export async function listRecipes(): Promise<SharedRecipe[]> {
  const seed: SharedRecipe[] = RECIPES;
  if (!persistenceEnabled()) return seed;
  try {
    const [{ data, error }, { data: coaches }] = await Promise.all([
      dbAdmin().from("recipes").select(SELECT).order("title"),
      dbAdmin().from("coaches").select("id,name"),
    ]);
    if (error || !data) return seed;
    const names = new Map((coaches ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
    const db = (data as Row[]).map((r) => toShared(r, names));
    const dbTitles = new Set(db.map((r) => r.title.toLowerCase()));
    return [...seed.filter((r) => !dbTitles.has(r.title.toLowerCase())), ...db].sort((a, b) =>
      a.title.localeCompare(b.title),
    );
  } catch {
    // Table not present yet (migration not applied): seed-only.
    return seed;
  }
}

/** Bulk import from a parsed sheet: update existing DB rows by title (case-
 *  insensitive), insert the rest. Any coach or the owner may upload.
 *  opts.dryRun (owner's approval rule, 2026-07-11) reports the counts
 *  without writing; the view confirms, then calls again for real. */
export async function importRecipesAction(
  rows: ImportedRecipe[],
  opts?: { dryRun?: boolean },
): Promise<Result<{ inserted: number; updated: number }>> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const identity = await getServerIdentity();
  if (identity.role !== "coach" && identity.realRole !== "owner") {
    return { ok: false, error: "Only coaches and the owner can upload recipes." };
  }
  const clean = rows
    .map((r) => ({
      title: String(r.title ?? "").trim(),
      category: r.category?.trim() || null,
      serves: r.serves?.trim() || null,
      ingredients: String(r.ingredients ?? "").trim(),
      method: String(r.method ?? "").trim(),
    }))
    .filter((r) => r.title);
  if (clean.length === 0) return { ok: false, error: "No recipe rows with a title found in the sheet." };
  if (clean.length > MAX_ROWS) {
    return { ok: false, error: `That sheet has ${clean.length} rows; the cap is ${MAX_ROWS} per upload.` };
  }
  // Last occurrence of a duplicated title within one sheet wins.
  const byTitle = new Map(clean.map((r) => [r.title.toLowerCase(), r]));

  try {
    // The dedupe index is on lower(title), which PostgREST's onConflict cannot
    // target, so match existing rows here and split update vs insert.
    const { data: existing, error: readError } = await dbAdmin().from("recipes").select("id,title");
    if (readError) {
      return { ok: false, error: /relation .* does not exist/i.test(readError.message) ? NO_DB : readError.message };
    }
    const existingByTitle = new Map(
      ((existing ?? []) as { id: string; title: string }[]).map((r) => [r.title.toLowerCase(), r.id]),
    );
    const uploadedBy = identity.linkedCoachId;

    // Approval step: report what WOULD happen, write nothing.
    if (opts?.dryRun) {
      const updatedCount = [...byTitle.keys()].filter((k) => existingByTitle.has(k)).length;
      return { ok: true, data: { inserted: byTitle.size - updatedCount, updated: updatedCount } };
    }

    let inserted = 0;
    let updated = 0;
    const inserts: Record<string, unknown>[] = [];
    for (const [key, r] of byTitle) {
      const id = existingByTitle.get(key);
      const values = {
        title: r.title,
        category: r.category,
        serves: r.serves,
        ingredients: r.ingredients,
        method: r.method,
        uploaded_by: uploadedBy,
      };
      if (id) {
        const { error } = await dbAdmin().from("recipes").update(values).eq("id", id);
        if (error) return { ok: false, error: error.message };
        updated++;
      } else {
        inserts.push(values);
      }
    }
    if (inserts.length > 0) {
      const { error } = await dbAdmin().from("recipes").insert(inserts);
      if (error) return { ok: false, error: error.message };
      inserted = inserts.length;
    }
    revalidatePath("/recipes");
    return { ok: true, data: { inserted, updated } };
  } catch {
    return { ok: false, error: NO_DB };
  }
}

/** Remove a DB recipe (owner or head coach only; the built-ins are code and
 *  cannot be deleted). */
export async function deleteRecipeAction(id: string): Promise<Result<null>> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  if (!id) return { ok: false, error: "id required" };
  const { realRole, isHeadCoach } = await getServerIdentity();
  if (realRole !== "owner" && !isHeadCoach) {
    return { ok: false, error: "Only the head coach or owner can remove recipes." };
  }
  const { error } = await dbAdmin().from("recipes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/recipes");
  return { ok: true, data: null };
}
