"use client";

import { downloadCsv } from "@/lib/csv";

// Client island for server components: they cannot pass value-accessor
// functions across the boundary, so they precompute the CSV string with
// rowsToCsv() (pure, server-safe) and hand it here for the click-to-download.
// Client components should instead use DataTable's exportFilename prop or call
// exportRowsToCsv() directly.
export function DownloadCsvButton({
  filename,
  csv,
  disabled,
  label = "Export CSV",
}: {
  filename: string;
  csv: string;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(filename, csv)}
      disabled={disabled}
      className="rounded-control border border-border px-2.5 py-1 text-xs font-medium text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
      title="Download these rows as a CSV"
    >
      {label}
    </button>
  );
}
