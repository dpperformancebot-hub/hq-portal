"use client";

// "Import check-ins" panel (2026-07-11): upload the Kahunas CSV/XLSX export
// OR paste the copied Kahunas table, see exactly what would happen (matched /
// unmatched / new / already recorded), then Confirm to write. Nothing is
// written before the Confirm click (owner's approval rule for data syncs).

import { useRef, useState } from "react";
import { Button, SlideOver, useToast } from "@/components/ui";
import {
  parseCheckInFile,
  parseCheckInPaste,
  type ParsedCheckIn,
} from "@/components/screens/coach-tools/import-check-ins";
import {
  commitCheckInImportAction,
  previewCheckInImportAction,
  type CheckInImportPreview,
} from "@/lib/check-in-import-actions";

export function ImportCheckInsPanel() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [rows, setRows] = useState<ParsedCheckIn[]>([]);
  const [preview, setPreview] = useState<CheckInImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setRows([]);
    setPreview(null);
    setPasted("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const runPreview = async (parsed: ParsedCheckIn[]) => {
    setBusy(true);
    try {
      const res = await previewCheckInImportAction(parsed.map((r) => ({ name: r.name, dateIso: r.dateIso })));
      if (!res.ok) {
        toast.push(res.error, "error");
        return;
      }
      setRows(parsed);
      setPreview(res.data);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File) => {
    const { rows: parsed, error } = await parseCheckInFile(file);
    if (error) {
      toast.push(error, "error");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    await runPreview(parsed);
  };

  const onPaste = async () => {
    const { rows: parsed, error } = parseCheckInPaste(pasted);
    if (error) {
      toast.push(error, "error");
      return;
    }
    await runPreview(parsed);
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await commitCheckInImportAction(rows.map((r) => ({ name: r.name, dateIso: r.dateIso })));
      if (!res.ok) {
        toast.push(res.error, "error");
        return;
      }
      toast.push(`Imported ${res.data.inserted} new check-ins, ${res.data.updated} already recorded`);
      setOpen(false);
      reset();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  const stat = (label: string, value: number, tone?: "warn") => (
    <div className="rounded-control border border-border-soft bg-surface-2 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{label}</div>
      <div className={`mt-0.5 font-display text-xl tabular-nums tracking-display ${tone === "warn" && value > 0 ? "text-warn" : "text-fg"}`}>
        {value}
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-control border border-border px-2.5 py-1 text-xs font-medium text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg"
      >
        Import check-ins
      </button>

      <SlideOver
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="Import Kahunas check-ins"
        subtitle="Upload the export or paste the copied table. Nothing is written until you confirm."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
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
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              Upload CSV / XLSX
            </Button>
            <span className="text-xs text-fg-muted">or paste below</span>
          </div>

          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={6}
            placeholder="Copy the Kahunas check-ins table (including its header row) and paste it here"
            className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => void onPaste()} disabled={busy || !pasted.trim()}>
              {busy ? "Checking…" : "Preview pasted table"}
            </Button>
          </div>

          {preview ? (
            <div className="space-y-3 border-t border-border-soft pt-4">
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
                What this import would do
              </div>
              <div className="grid grid-cols-2 gap-2">
                {stat("Matched clients", preview.matched)}
                {stat("Unmatched names", preview.unmatchedNames.length, "warn")}
                {stat("New check-ins", preview.newCount)}
                {stat("Already recorded", preview.existingCount)}
              </div>
              {preview.unmatchedNames.length > 0 ? (
                <div className="rounded-control border border-border-soft bg-surface-2 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-warn">
                    No matching client (fix these in GHL or the sheet)
                  </div>
                  <div className="mt-1 max-h-32 overflow-y-auto text-xs text-fg-dim">
                    {preview.unmatchedNames.join(", ")}
                  </div>
                </div>
              ) : null}
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void confirm()} disabled={busy || preview.matched === 0}>
                  {busy ? "Importing…" : `Confirm: write ${preview.newCount} new`}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </SlideOver>
    </>
  );
}
