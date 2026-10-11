"use client";

// Recipe Index (M6; shared library 2026-07-11): the 12 built-in recipes plus
// everything coaches have uploaded, merged server-side (listRecipes). Any
// coach can add to the shared index by uploading a CSV/XLSX; the head coach
// and owner can remove uploaded rows (built-ins are code). Favourites persist
// per-login with a localStorage fallback.

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, EmptyState, PageHeader, SlideOver, useToast } from "@/components/ui";
import type { SharedRecipe } from "@/lib/recipes-actions";
import { deleteRecipeAction, importRecipesAction } from "@/lib/recipes-actions";
import { parseRecipeSheet } from "@/components/screens/coach-tools/import-recipes";
import { getUserStateAction, setUserStateAction } from "@/lib/user-state-actions";

const FAVS_KEY = "tjd-recipe-favourites";

const hasMacros = (r: SharedRecipe) => r.kcal + r.protein + r.carbs + r.fats > 0;

export function RecipesView({
  recipes,
  canUpload = false,
  canDelete = false,
}: {
  recipes: SharedRecipe[];
  canUpload?: boolean;
  canDelete?: boolean;
}) {
  const toast = useToast();
  const [tag, setTag] = useState("All");
  const [query, setQuery] = useState("");
  const [favsOnly, setFavsOnly] = useState(false);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [openRecipe, setOpenRecipe] = useState<SharedRecipe | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Favourites follow the LOGIN (user_state, 2026-07-02), merged with the
  // localStorage fallback so pre-migration favourites are kept.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAVS_KEY);
      if (raw) setFavs(new Set(JSON.parse(raw) as string[]));
    } catch {
      // ignore
    }
    void getUserStateAction("recipe-favourites").then((v) => {
      if (Array.isArray(v)) setFavs((local) => new Set([...local, ...(v as string[])]));
    });
  }, []);

  const toggleFav = (title: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      try {
        localStorage.setItem(FAVS_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      // Follow the login (best-effort; localStorage stays the fallback).
      void setUserStateAction("recipe-favourites", [...next]);
      return next;
    });
  };

  // Upload a recipe sheet (CSV/XLSX): parse in the browser, dry-run to
  // PREVIEW the counts, write only after the explicit Confirm (owner's
  // approval rule for data syncs, 2026-07-11).
  const [pendingImport, setPendingImport] = useState<{
    rows: Awaited<ReturnType<typeof parseRecipeSheet>>["rows"];
    inserted: number;
    updated: number;
  } | null>(null);

  const onFile = async (file: File) => {
    setImporting(true);
    try {
      const { rows, error } = await parseRecipeSheet(file);
      if (error) {
        toast.push(error, "error");
        return;
      }
      const res = await importRecipesAction(rows, { dryRun: true });
      if (res.ok) setPendingImport({ rows, inserted: res.data.inserted, updated: res.data.updated });
      else toast.push(res.error, "error");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const confirmImport = async () => {
    if (!pendingImport) return;
    setImporting(true);
    try {
      const res = await importRecipesAction(pendingImport.rows);
      if (res.ok) {
        toast.push(`Imported ${res.data.inserted} new, ${res.data.updated} updated`);
        window.location.reload();
      } else {
        toast.push(res.error, "error");
      }
    } finally {
      setImporting(false);
      setPendingImport(null);
    }
  };

  const remove = (r: SharedRecipe) => {
    if (!r.id) return;
    void deleteRecipeAction(r.id).then((res) => {
      if (res.ok) {
        toast.push("Recipe removed");
        window.location.reload();
      } else toast.push(res.error, "error");
    });
  };

  // Category chips come from the data itself (seed tags + uploaded categories).
  const tags = useMemo(() => {
    const all = new Set<string>();
    for (const r of recipes) for (const t of r.tags) all.add(t);
    return ["All", ...[...all].sort((a, b) => a.localeCompare(b))];
  }, [recipes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter(
      (r) =>
        (tag === "All" || r.tags.includes(tag)) &&
        (!favsOnly || favs.has(r.title)) &&
        (!q ||
          r.title.toLowerCase().includes(q) ||
          (r.ingredients ?? []).some((i) => i.toLowerCase().includes(q))),
    );
  }, [recipes, tag, query, favsOnly, favs]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recipe Index"
        subtitle={`${recipes.length} recipes, shared across the whole team. Upload a sheet to add yours.`}
        actions={
          canUpload ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
              <Button size="sm" onClick={() => fileRef.current?.click()} disabled={importing}>
                {importing ? "Importing…" : "Upload recipes"}
              </Button>
            </>
          ) : null
        }
      />

      {/* Import approval strip: nothing writes until Confirm. */}
      {pendingImport ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent/40 bg-accent-soft/30 px-4 py-3">
          <div className="text-sm text-fg">
            Import preview: <span className="font-medium tabular-nums">{pendingImport.inserted}</span> new,{" "}
            <span className="font-medium tabular-nums">{pendingImport.updated}</span> updated (title matches).
            Nothing has been written yet.
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPendingImport(null)} disabled={importing}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void confirmImport()} disabled={importing}>
              {importing ? "Importing…" : "Confirm import"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {tags.map((t) => (
          <button
            key={t}
            onClick={() => setTag(t)}
            className={`rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${
              tag === t ? "border-accent text-fg" : "border-border-soft text-fg-dim hover:text-fg"
            }`}
          >
            {t}
          </button>
        ))}
        <button
          onClick={() => setFavsOnly((v) => !v)}
          className={`rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${
            favsOnly ? "border-accent text-fg" : "border-border-soft text-fg-dim hover:text-fg"
          }`}
        >
          Favourites ({favs.size})
        </button>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs tabular-nums text-fg-muted">{filtered.length} recipes</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or ingredient"
            className="rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No recipes match" message="Try another category or search." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <div
              key={r.title}
              role="button"
              tabIndex={0}
              onClick={() => setOpenRecipe(r)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpenRecipe(r)}
              className="cursor-pointer rounded-card border border-border-soft bg-surface p-4 transition-colors hover:border-accent/50 hover:bg-surface-2"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-fg">{r.title}</h3>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFav(r.title);
                  }}
                  aria-label={favs.has(r.title) ? "Unfavourite" : "Favourite"}
                  className={favs.has(r.title) ? "text-accent" : "text-fg-muted hover:text-fg"}
                >
                  {favs.has(r.title) ? "♥" : "♡"}
                </button>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {r.tags.map((t) => (
                  <span key={t} className="rounded-pill bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-fg-dim">
                    {t}
                  </span>
                ))}
              </div>
              {hasMacros(r) ? (
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  {(
                    [
                      ["kcal", r.kcal],
                      ["P", `${r.protein}g`],
                      ["C", `${r.carbs}g`],
                      ["F", `${r.fats}g`],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="rounded-control bg-surface-2 px-1 py-1.5">
                      <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">{label}</div>
                      <div className="font-display text-sm tabular-nums tracking-display text-fg">{value}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              {r.rating > 0 ? <div className="mt-2 text-xs text-fg-dim">Rating {r.rating.toFixed(1)} / 5</div> : null}
              {r.id ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-fg-muted">added by {r.addedBy}</span>
                  {canDelete ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(r);
                      }}
                      className="text-[11px] font-medium text-danger hover:underline"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Full recipe (2026-07-02): ingredients + method in a slide-over. */}
      <SlideOver
        open={openRecipe !== null}
        onClose={() => setOpenRecipe(null)}
        title={openRecipe?.title ?? ""}
        subtitle={
          openRecipe
            ? [
                hasMacros(openRecipe)
                  ? `${openRecipe.kcal} kcal · ${openRecipe.protein}P / ${openRecipe.carbs}C / ${openRecipe.fats}F`
                  : null,
                openRecipe.serves ? `serves ${openRecipe.serves}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || undefined
            : undefined
        }
      >
        {openRecipe ? (
          openRecipe.ingredients?.length && openRecipe.method?.length ? (
            <div className="space-y-5">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Ingredients</div>
                <ul className="space-y-1.5 text-sm text-fg-dim">
                  {openRecipe.ingredients.map((i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-pill bg-accent" />
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Method</div>
                <ol className="space-y-2 text-sm text-fg-dim">
                  {openRecipe.method.map((step, i) => (
                    <li key={step} className="flex gap-2.5">
                      <span className="shrink-0 font-medium tabular-nums text-fg">{i + 1}.</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No recipe body yet"
              message="This one only has the basics so far. Re-upload it with Ingredients and Method columns filled in."
            />
          )
        ) : null}
      </SlideOver>
    </div>
  );
}
