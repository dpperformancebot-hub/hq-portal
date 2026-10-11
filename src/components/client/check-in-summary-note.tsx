"use client";

// R9-2: the summary block riding one check-in row, now editable in place.
// Three states, no read-only dead ends:
//   - no summary yet  -> a quiet "Add summary / note" affordance
//   - summary, viewing -> collapsed details with an Edit button inside
//   - editing          -> the four fields with obvious Save / Cancel
// Everything happens on the check-in itself; the Loom tool remains the
// AI-transcript path, this is the direct one.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";
import { upsertCheckInSummaryAction } from "@/lib/check-in-summary-actions";
import type { CheckInSummary } from "@/lib/check-in-summaries";

const fieldCls =
  "w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent";

function SummaryEditor({
  clientId,
  weekNumber,
  existing,
  onDone,
}: {
  clientId: string;
  weekNumber: number | null;
  existing: CheckInSummary | null;
  onDone: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [loomUrl, setLoomUrl] = useState(existing?.loomUrl ?? "");
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const [actionItems, setActionItems] = useState(existing?.actionItems ?? "");
  const [coachNotes, setCoachNotes] = useState(existing?.coachNotes ?? "");
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const res = await upsertCheckInSummaryAction({
        id: existing?.id ?? null,
        clientId,
        weekNumber,
        loomUrl,
        summary,
        actionItems,
        coachNotes,
      });
      if (res.ok) {
        toast.push(existing ? "Check-in updated." : "Saved to this check-in.", "success");
        onDone();
        router.refresh();
      } else {
        toast.push(res.error, "error");
      }
    });

  return (
    <div className="mb-1 ml-6 space-y-1.5 rounded-control border border-accent/40 bg-surface-2/60 px-3 py-2">
      <input
        value={loomUrl}
        onChange={(e) => setLoomUrl(e.target.value)}
        placeholder="Loom link (optional)"
        className={fieldCls}
        aria-label="Loom link"
      />
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={3}
        placeholder="Summary: what happened this week"
        className={fieldCls}
        aria-label="Summary"
      />
      <textarea
        value={actionItems}
        onChange={(e) => setActionItems(e.target.value)}
        rows={2}
        placeholder="Action items (optional)"
        className={fieldCls}
        aria-label="Action items"
      />
      <textarea
        value={coachNotes}
        onChange={(e) => setCoachNotes(e.target.value)}
        rows={2}
        placeholder="Coach notes, internal (optional)"
        className={fieldCls}
        aria-label="Coach notes"
      />
      <div className="flex justify-end gap-2 pt-0.5">
        <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

export function CheckInSummaryNote({
  summary,
  clientId,
  weekNumber = null,
  canEdit = false,
}: {
  /** Existing summary row, or null for the add affordance. */
  summary: CheckInSummary | null;
  /** Required for editing; the server re-checks roster scope regardless. */
  clientId?: string;
  /** Week the check-in covers, stamped on a newly added summary. */
  weekNumber?: number | null;
  canEdit?: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing && clientId) {
    return (
      <SummaryEditor
        clientId={clientId}
        weekNumber={summary?.weekNumber ?? weekNumber}
        existing={summary}
        onDone={() => setEditing(false)}
      />
    );
  }

  if (!summary) {
    if (!canEdit || !clientId) return null;
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mb-1 ml-6 text-xs text-fg-muted transition-colors hover:text-accent"
      >
        + Add summary / note
      </button>
    );
  }

  return (
    <details className="mb-1 ml-6 rounded-control border border-border-soft bg-surface-2/60 px-3 py-1.5">
      <summary className="cursor-pointer text-xs text-fg-dim">
        <span className="font-semibold uppercase tracking-[0.08em] text-fg-muted">Loom summary</span>
        {summary.loomUrl ? (
          <a
            href={summary.loomUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ml-2 text-accent hover:underline"
          >
            Watch Loom
          </a>
        ) : null}
        {canEdit && clientId ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditing(true);
            }}
            className="ml-2 text-fg-muted transition-colors hover:text-accent"
          >
            Edit
          </button>
        ) : null}
      </summary>
      <div className="mt-1.5 space-y-1.5 pb-1 text-xs text-fg-dim">
        {summary.summary ? <p className="whitespace-pre-wrap">{summary.summary}</p> : null}
        {summary.actionItems ? (
          <p className="whitespace-pre-wrap">
            <span className="font-semibold uppercase tracking-[0.08em] text-fg-muted">Action items</span>
            {"\n"}
            {summary.actionItems}
          </p>
        ) : null}
        {summary.coachNotes ? (
          <p className="whitespace-pre-wrap">
            <span className="font-semibold uppercase tracking-[0.08em] text-fg-muted">Coach notes</span>
            {"\n"}
            {summary.coachNotes}
          </p>
        ) : null}
      </div>
    </details>
  );
}
