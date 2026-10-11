"use client";

import { useMemo, useState, type ReactNode } from "react";
import { exportRowsToCsv, type CsvColumn } from "@/lib/csv";

export type Column<T> = {
  /** Unique column id, also used as the default value accessor. */
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  /** CSS grid track size. Defaults to "1fr". */
  width?: string;
  render?: (row: T) => ReactNode;
  /** When set, the column header is clickable to sort; returns the sort key.
   *  Columns without it still sort when csvValue or the raw key yields a
   *  plain value (sortValue -> csvValue -> raw key fallback). */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Plain value for CSV export. Falls back to sortValue then the raw key.
   *  Set this when the on-screen cell is rendered (so its text is not a raw
   *  field) and should still export a clean value. */
  csvValue?: (row: T) => string | number | null | undefined;
  /** Keep this column out of CSV export (e.g. an actions/controls column). */
  csvExclude?: boolean;
  /** Opt a column out of click-to-sort (e.g. an actions/controls column). */
  sortExclude?: boolean;
};

/** Faceted filter above the table. Options are derived from the data
 *  (distinct getValue results, with row counts), so screens only declare
 *  what to facet on, never the option list. */
export type TableFilter<T> = {
  key: string;
  label: string;
  getValue: (row: T) => string | null | undefined;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  getRowKey: (row: T, index: number) => string | number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  /** When set, an "Export CSV" button appears and downloads the currently
   *  filtered (the data passed in) and sorted rows under this filename. */
  exportFilename?: string;
  /** Initial sort applied on mount (header clicks still override it). */
  defaultSort?: { key: string; dir: "asc" | "desc" };
  /** Built-in search input above the table. */
  searchable?: { placeholder?: string; getText: (row: T) => string };
  /** Faceted filter dropdowns above the table. */
  filters?: TableFilter<T>[];
  /** Rows per page. Pagination UI appears only when rows exceed it. */
  pageSize?: number;
};

const ALIGN: Record<NonNullable<Column<unknown>["align"]>, string> = {
  left: "text-left justify-start",
  right: "text-right justify-end",
  center: "text-center justify-center",
};

const GAP_PX = 12; // gap-3
const ROW_PADDING_PX = 32; // px-4 both sides
const FLEX_MIN_PX = 96; // scroll-floor for a flexible (1fr / unspecified) column
const DEFAULT_PAGE_SIZE = 50;

function columnMinPx(width?: string): number {
  if (!width) return FLEX_MIN_PX;
  const m = /^(\d+)px$/.exec(width.trim());
  return m ? Number(m[1]) : FLEX_MIN_PX;
}

const CONTROL_CLASS =
  "rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs text-fg transition-colors hover:bg-surface-2 focus:outline-none focus:ring-1 focus:ring-accent";

/** Generic CSS-grid table. Uppercase hairline header, hover rows, optional
 * click-through, click-to-sort on every column with a plain value, built-in
 * search + faceted filters, and pagination on long lists. */
export function DataTable<T>({
  columns,
  data,
  getRowKey,
  onRowClick,
  emptyMessage = "Nothing to show yet.",
  exportFilename,
  defaultSort,
  searchable,
  filters,
  pageSize = DEFAULT_PAGE_SIZE,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(defaultSort ?? null);
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);

  // Sort accessor chain: sortValue -> csvValue -> the raw key when it holds a
  // plain value. This keeps sorting working on tables that only configured
  // CSV export, with no per-screen changes.
  const sortAccessor = (col: Column<T>): ((row: T) => string | number | null | undefined) | null => {
    if (col.sortExclude) return null;
    if (col.sortValue) return col.sortValue;
    if (col.csvValue) return col.csvValue;
    const sample = data.find((row) => (row as Record<string, unknown>)[col.key] != null);
    if (!sample) return null;
    const raw = (sample as Record<string, unknown>)[col.key];
    if (typeof raw !== "string" && typeof raw !== "number") return null;
    return (row: T) => (row as Record<string, unknown>)[col.key] as string | number | null | undefined;
  };

  // Facet options are derived from the full data set (not the filtered rows)
  // so picking one option never hides the others.
  const facetOptions = useMemo(() => {
    if (!filters?.length) return {};
    const out: Record<string, { value: string; count: number }[]> = {};
    for (const f of filters) {
      const counts = new Map<string, number>();
      for (const row of data) {
        const v = f.getValue(row);
        if (v == null || v === "") continue;
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      out[f.key] = [...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([value, count]) => ({ value, count }));
    }
    return out;
  }, [data, filters]);

  const processed = useMemo(() => {
    let rows = data;
    const q = query.trim().toLowerCase();
    if (searchable && q) rows = rows.filter((row) => searchable.getText(row).toLowerCase().includes(q));
    if (filters?.length) {
      for (const f of filters) {
        const want = facets[f.key];
        if (want) rows = rows.filter((row) => f.getValue(row) === want);
      }
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const sv = col ? sortAccessor(col) : null;
      if (sv) {
        const arr = [...rows].sort((a, b) => {
          const av = sv(a);
          const bv = sv(b);
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          if (typeof av === "number" && typeof bv === "number") return av - bv;
          return String(av).localeCompare(String(bv));
        });
        if (sort.dir === "desc") arr.reverse();
        rows = arr;
      }
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sort, columns, query, facets, searchable, filters]);

  // Clamp instead of resetting via effects: shrinking the result set (a new
  // search, a facet pick) lands on the last valid page automatically.
  const pageCount = Math.max(1, Math.ceil(processed.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paged = processed.length > pageSize ? processed.slice(safePage * pageSize, (safePage + 1) * pageSize) : processed;

  const toggleSort = (key: string) =>
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const gridTemplateColumns = columns.map((c) => c.width ?? "1fr").join(" ");
  const minWidth =
    columns.reduce((sum, c) => sum + columnMinPx(c.width), 0) +
    GAP_PX * Math.max(0, columns.length - 1) +
    ROW_PADDING_PX;

  // Export ALL currently filtered + sorted rows (not just the visible page).
  // Per column: csvValue, then sortValue, then the raw key, so most tables
  // export cleanly with no extra column config.
  const exportCsv = () => {
    const cols: CsvColumn<T>[] = columns
      .filter((c) => !c.csvExclude)
      .map((c) => ({
        header: c.header,
        value: (row: T) =>
          c.csvValue
            ? c.csvValue(row)
            : c.sortValue
              ? c.sortValue(row)
              : ((row as Record<string, unknown>)[c.key] as string | number | null | undefined),
      }));
    exportRowsToCsv(exportFilename ?? "export", processed, cols);
  };

  const hasFacetControls = Boolean(filters?.length);
  const activeFacets = filters?.filter((f) => facets[f.key]) ?? [];
  const showToolbar = Boolean(searchable || hasFacetControls || exportFilename);
  const filteredDown = processed.length !== data.length;

  return (
    <div className="w-full overflow-x-auto">
      {showToolbar ? (
        <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
          {searchable ? (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchable.placeholder ?? "Search"}
              aria-label={searchable.placeholder ?? "Search rows"}
              className="w-full rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent sm:w-52"
            />
          ) : null}
          {filters?.map((f) => {
            const options = facetOptions[f.key] ?? [];
            if (options.length < 2 && !facets[f.key]) return null;
            const active = facets[f.key] ?? "";
            return (
              <select
                key={f.key}
                value={active}
                onChange={(e) => setFacets((prev) => ({ ...prev, [f.key]: e.target.value }))}
                aria-label={`Filter by ${f.label}`}
                className={`${CONTROL_CLASS} ${active ? "border-accent text-fg" : "text-fg-dim"}`}
              >
                <option value="">{f.label}: All</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.value} ({o.count})
                  </option>
                ))}
              </select>
            );
          })}
          {activeFacets.length > 0 || (searchable && query) ? (
            <button
              type="button"
              onClick={() => {
                setFacets({});
                setQuery("");
              }}
              className="text-xs font-medium text-accent hover:underline"
            >
              Clear
            </button>
          ) : null}
          <div className="ml-auto flex items-center gap-3">
            {filteredDown ? (
              <span className="text-xs tabular-nums text-fg-muted">
                {processed.length} of {data.length}
              </span>
            ) : null}
            {exportFilename ? (
              <button
                type="button"
                onClick={exportCsv}
                disabled={processed.length === 0}
                className="rounded-control border border-border px-2.5 py-1 text-xs font-medium text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                title="Download these rows as a CSV"
              >
                Export CSV
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div style={{ minWidth }}>
        <div
          className="grid gap-3 border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-fg-muted"
          style={{ gridTemplateColumns }}
        >
          {columns.map((c) => {
            const sortable = sortAccessor(c) != null;
            const active = sort?.key === c.key;
            const content = (
              <>
                {c.header}
                {sortable ? (
                  <span className={active ? "text-accent" : "opacity-40"} aria-hidden="true">
                    {active ? (sort?.dir === "asc" ? "↑" : "↓") : "↕"}
                  </span>
                ) : null}
              </>
            );
            return (
              <div key={c.key} className={`flex items-center gap-1 ${ALIGN[c.align ?? "left"]}`}>
                {sortable ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className="flex items-center gap-1 uppercase tracking-[0.06em] transition-colors hover:text-fg"
                    aria-label={`Sort by ${c.header}`}
                  >
                    {content}
                  </button>
                ) : (
                  content
                )}
              </div>
            );
          })}
        </div>

        {processed.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-fg-muted">
            {query || activeFacets.length > 0 ? "No rows match the current search or filters." : emptyMessage}
          </div>
        ) : (
          paged.map((row, i) => (
            <div
              key={getRowKey(row, safePage * pageSize + i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`grid gap-3 border-b border-border-soft px-4 py-3 text-sm text-fg transition-colors ${
                onRowClick ? "cursor-pointer hover:bg-surface-2" : ""
              }`}
              style={{ gridTemplateColumns }}
            >
              {columns.map((c) => (
                <div
                  key={c.key}
                  className={`flex min-w-0 items-center ${ALIGN[c.align ?? "left"]} ${c.align === "right" ? "tabular-nums" : ""}`}
                >
                  {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {processed.length > pageSize ? (
        <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs text-fg-muted">
          <span className="tabular-nums">
            Showing {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, processed.length)} of{" "}
            {processed.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className={`${CONTROL_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              Prev
            </button>
            <span className="px-2 tabular-nums">
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
              disabled={safePage >= pageCount - 1}
              className={`${CONTROL_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
