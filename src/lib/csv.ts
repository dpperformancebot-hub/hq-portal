// Reusable client-side CSV export. One helper for every table in the HQ,
// generalised from the original Coach Performance scorecard export: build the
// text, hand it to the browser as a Blob download. Quotes/commas/newlines are
// escaped per RFC 4180; a UTF-8 BOM keeps accented names intact in Excel.
//
// Client-only (uses document/Blob/URL). Safe to import into client components.

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

// Formula-injection guard (audit 2026-07-02): a cell starting with = + @ -
// can execute as a formula when the CSV is opened in Excel/Sheets. Prefix
// such cells with an apostrophe UNLESS the cell is a plain number (so
// negative metrics like -5 stay numeric).
const FORMULA_PREFIX = /^[=+@-]/;
const defuse = (v: string) => (FORMULA_PREFIX.test(v) && Number.isNaN(Number(v)) ? `'${v}` : v);

const esc = (raw: string) => {
  const v = defuse(raw);
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export function rowsToCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => esc(c.header));
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = c.value(row);
      return esc(v == null ? "" : String(v));
    }),
  );
  return [header, ...body].map((r) => r.join(",")).join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  const name = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportRowsToCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]): void {
  downloadCsv(filename, rowsToCsv(rows, columns));
}

/** Append today's date to a base filename: "clients" -> "clients-2026-06-30". */
export function datedFilename(base: string): string {
  return `${base}-${new Date().toISOString().slice(0, 10)}`;
}
