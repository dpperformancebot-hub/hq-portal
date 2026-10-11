// Client-side parser for recipe imports (CSV / XLSX), sibling of the
// onboarding import-sheet.ts. Loose header matching: Title/Name, Category,
// Serves, Ingredients, Method/Instructions/Directions. Multi-line cells are
// preserved (one ingredient or step per line); rows without a title are
// skipped.
//
// xlsx (SheetJS) is imported dynamically so it never lands in the main bundle.

import type { ImportedRecipe } from "@/lib/recipes-actions";

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function classify(header: string): keyof ImportedRecipe | null {
  const h = norm(header);
  if (!h) return null;
  if (h.includes("title") || h === "name" || h === "recipe" || h.includes("recipename")) return "title";
  if (h.includes("categor") || h === "tag" || h === "tags" || h.includes("mealtype") || h === "meal") return "category";
  if (h.includes("serve") || h.includes("portion")) return "serves";
  if (h.includes("ingredient")) return "ingredients";
  if (h.includes("method") || h.includes("instruction") || h.includes("direction") || h.includes("steps")) return "method";
  return null;
}

export async function parseRecipeSheet(file: File): Promise<{ rows: ImportedRecipe[]; error?: string }> {
  const XLSX = await import("xlsx");
  let wb: import("xlsx").WorkBook;
  try {
    wb = XLSX.read(await file.arrayBuffer());
  } catch {
    return { rows: [], error: "Could not read that file. Export it as .xlsx or .csv and try again." };
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], error: "The file has no sheets." };

  const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (grid.length === 0) return { rows: [], error: "The sheet is empty." };

  // Header row: the first row with a title-ish cell (tolerates a banner row).
  let headerIdx = grid.findIndex((r) => r.some((c) => classify(String(c)) === "title"));
  if (headerIdx === -1) headerIdx = 0;

  const colKind = grid[headerIdx].map((h) => classify(String(h)));
  const titleCol = colKind.indexOf("title");
  if (titleCol === -1) return { rows: [], error: 'No "Title" (or "Name") column found in the sheet.' };

  const rows: ImportedRecipe[] = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const raw = grid[r];
    const title = String(raw[titleCol] ?? "").trim();
    if (!title) continue; // no title, no recipe

    const row: ImportedRecipe = { title };
    for (let c = 0; c < colKind.length; c++) {
      const kind = colKind[c];
      if (!kind || kind === "title") continue;
      // String() keeps embedded newlines: multi-line cells stay one item/step
      // per line for the reader.
      const s = String(raw[c] ?? "").trim();
      if (s) row[kind] = s;
    }
    rows.push(row);
  }
  return rows.length ? { rows } : { rows: [], error: "No recipe rows found under the header row." };
}
