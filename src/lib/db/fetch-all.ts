// Page through a PostgREST result instead of silently taking the first 1000.
//
// R19-1: this is the bug that lost Jameela's coach assignments overnight.
// PostgREST caps an unbounded select at 1000 rows and returns NO error and no
// indication it truncated. `ghl-sync.ts` built its "which clients already have
// a coach" map from such a select. DP passed 1000 clients, so every client
// beyond the cap was absent from that map, `decideCoachId` saw no existing
// coach, treated them as brand new, and wrote coach_id = null. The coach was
// erased and, because the policy never saw them as existing, no coach_drift
// row was logged either, which is exactly the signature we found.
//
// The same silent truncation was live in the portal's main roster read and in
// the leads read, where the book is >24,000 rows.
//
// Use this for ANY read whose result is a complete set: a lookup map, a count,
// a roster, an export. Do not use it for a single row or an intentionally
// bounded list (the pause board's newest-300, for instance).

/** A page fetcher: given an inclusive range, return that slice. */
export type PageFetcher<T> = (
  from: number,
  to: number,
) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export type FetchAllOptions = {
  /** Rows per request. PostgREST's own default ceiling is 1000. */
  pageSize?: number;
  /**
   * Runaway guard. Throws rather than looping forever if the source keeps
   * returning full pages. Default 100 pages, i.e. 100k rows at the default
   * page size, comfortably above anything in this product.
   */
  maxPages?: number;
  /** Named in the error message so a failure says which read broke. */
  label?: string;
};

/**
 * Read every row, one page at a time.
 *
 * Throws on a query error rather than returning a short list: a partial
 * roster that looks complete is what caused this bug in the first place, so
 * silence is the one thing this must never do.
 *
 * CALLER CONTRACT: the query you pass MUST specify a stable, unique order,
 * in practice `.order("id")`. Postgres gives no ordering guarantee without
 * one, so it returns rows in heap order, and a row that moves in the heap
 * between two pages can come back twice or not at all. That is the exact
 * failure this helper exists to fix: the 2026-09-28 assignment loss happened
 * because writing a row moved it out of an unordered 1000-row window. Paging
 * without an order re-creates the same hole at every page boundary, just
 * narrower. The order cannot be enforced from in here, because the query is
 * the caller's; it is checked by reading the call sites.
 */
export async function fetchAllRows<T>(page: PageFetcher<T>, options: FetchAllOptions = {}): Promise<T[]> {
  const pageSize = options.pageSize ?? 1000;
  const maxPages = options.maxPages ?? 100;
  const label = options.label ?? "fetchAllRows";
  if (pageSize < 1) throw new Error(`${label}: pageSize must be at least 1`);

  const out: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const from = i * pageSize;
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const batch = data ?? [];
    out.push(...batch);
    // A short page means we reached the end. A full page means there may be
    // more, so ask again; an exactly-divisible total costs one empty request.
    if (batch.length < pageSize) return out;
  }
  throw new Error(
    `${label}: stopped after ${maxPages} pages (${out.length} rows). Raise maxPages if this table really is that large.`,
  );
}
