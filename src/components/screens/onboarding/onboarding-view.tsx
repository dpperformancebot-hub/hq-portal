"use client";

// Client onboarding tracker (2026-07-09, reshaped 2026-07-10 to a general
// spreadsheet-style grid at the owner's request). Mirrors the coaches' "New
// Client Plan Creation Tracker" sheet: grouped columns (Activation | Nutrition
// | Workout | Welcome Video | Notes), one row per client, every cell editable
// inline. Coaches tick their steps on their own rows; the head coach / owner
// writes feedback and flips Approved + Sent. "Needs review" derives from state
// (work submitted, not yet approved).

import { useMemo, useRef, useState, useTransition } from "react";
import { Button, Card, EmptyState, PageHeader, useToast } from "@/components/ui";
import {
  bulkImportOnboardingAction,
  createOnboardingAction,
  deleteOnboardingAction,
  updateOnboardingAction,
  type OnboardingRow,
} from "@/lib/onboarding-actions";
import { parseOnboardingSheet } from "@/components/screens/onboarding/import-sheet";

type Tab = "all" | "review" | "approved" | "sent";

const needsReview = (r: OnboardingRow) =>
  !r.approved && (r.nutritionPlanMade || r.workoutPlanMade || !!r.loomUrl);

/** Spreadsheet checkbox cell. */
function CellCheck({
  checked,
  disabled,
  onChange,
  title,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  title?: string;
}) {
  return (
    <td className="border-r border-border-soft px-2 py-1.5 text-center">
      <input
        type="checkbox"
        title={title}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-[#16a34a] disabled:opacity-50"
      />
    </td>
  );
}

/** Spreadsheet text cell: borderless input, saves on blur/Enter. */
function CellText({
  value,
  disabled,
  placeholder,
  onSave,
  width = "minw-[140px]",
}: {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onSave: (next: string) => void;
  width?: string;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <td className={`border-r border-border-soft p-0 ${width}`}>
      <input
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onSave(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setDraft(value);
        }}
        className="w-full bg-transparent px-2 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:bg-surface-2 focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:text-fg-dim"
      />
    </td>
  );
}

export function OnboardingView({
  rows: initial,
  canReview,
  canEdit,
}: {
  rows: OnboardingRow[];
  canReview: boolean;
  canEdit: boolean;
}) {
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [tab, setTab] = useState<Tab>("all");
  const [coachFilter, setCoachFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftKahunas, setDraftKahunas] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  // Upload the master tracker sheet (CSV/XLSX): parse in the browser, dry-run
  // server-side to PREVIEW the sync (X new, Y updated), then write only after
  // the explicit Confirm (owner's approval rule for data syncs, 2026-07-11).
  const [pendingSync, setPendingSync] = useState<{
    rows: Awaited<ReturnType<typeof parseOnboardingSheet>>["rows"];
    inserted: number;
    updated: number;
  } | null>(null);

  const onFile = async (file: File) => {
    setImporting(true);
    try {
      const { rows: parsed, error } = await parseOnboardingSheet(file);
      if (error) {
        toast.push(error, "error");
        return;
      }
      const res = await bulkImportOnboardingAction(parsed, { dryRun: true });
      if (res.ok) setPendingSync({ rows: parsed, inserted: res.data.inserted, updated: res.data.updated });
      else toast.push(res.error, "error");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const confirmSync = async () => {
    if (!pendingSync) return;
    setImporting(true);
    try {
      const res = await bulkImportOnboardingAction(pendingSync.rows);
      if (res.ok) {
        toast.push(`Synced: ${res.data.inserted} new, ${res.data.updated} updated`);
        window.location.reload();
      } else {
        toast.push(res.error, "error");
      }
    } finally {
      setImporting(false);
      setPendingSync(null);
    }
  };

  const patch = (id: string, next: Partial<OnboardingRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)));

  const save = (
    row: OnboardingRow,
    field: Parameters<typeof updateOnboardingAction>[1],
    value: boolean | string,
    optimistic: Partial<OnboardingRow>,
  ) => {
    const before = { ...row };
    patch(row.id, optimistic);
    startTransition(async () => {
      const res = await updateOnboardingAction(row.id, field, value);
      if (!res.ok) {
        patch(row.id, before);
        toast.push(res.error, "error");
      }
    });
  };

  const add = () => {
    const name = draftName.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await createOnboardingAction({ clientName: name, kahunasUrl: draftKahunas || null });
      if (res.ok) {
        toast.push("Row added");
        setDraftName("");
        setDraftKahunas("");
        setAdding(false);
        window.location.reload(); // pick up the new row id
      } else toast.push(res.error, "error");
    });
  };

  const remove = (row: OnboardingRow) => {
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    startTransition(async () => {
      const res = await deleteOnboardingAction(row.id);
      if (!res.ok) {
        setRows((prev) => [row, ...prev]);
        toast.push(res.error, "error");
      } else toast.push("Row removed");
    });
  };

  const coaches = useMemo(() => Array.from(new Set(rows.map((r) => r.coachName))).sort(), [rows]);
  const filtered = rows.filter((r) => {
    if (coachFilter !== "all" && r.coachName !== coachFilter) return false;
    if (tab === "review") return needsReview(r);
    if (tab === "approved") return r.approved && !r.sent;
    if (tab === "sent") return r.sent;
    return true;
  });
  const reviewCount = rows.filter(needsReview).length;

  const TABS: { label: string; value: Tab; count: number }[] = [
    { label: "All", value: "all", count: rows.length },
    { label: "Needs review", value: "review", count: reviewCount },
    { label: "Approved", value: "approved", count: rows.filter((r) => r.approved && !r.sent).length },
    { label: "Sent", value: "sent", count: rows.filter((r) => r.sent).length },
  ];

  const group = "border-r border-border px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted";
  const head = "border-r border-border-soft px-2 py-1.5 text-left text-[11px] font-medium text-fg-dim whitespace-nowrap";

  return (
    <div className="space-y-6">
      <PageHeader
        back
        eyebrow="Coaching"
        title="Client Onboarding"
        subtitle={
          // B6: this screen tracks PLAN CREATION for already-assigned clients
          // (the head coach's review flow). Assigning a client to a coach
          // happens in the Client Journey Tracker, never here.
          canReview
            ? `Plan creation tracker across all coaches · ${reviewCount} awaiting review · coach assignment lives in the Journey Tracker`
            : "Your new clients: tick each step as you complete it. The head coach reviews and approves."
        }
        actions={
          <div className="flex items-center gap-2">
            {canEdit ? (
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
                <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={importing}>
                  {importing ? "Importing…" : "Upload sheet"}
                </Button>
                <Button size="sm" onClick={() => setAdding((a) => !a)}>
                  {adding ? "Cancel" : "+ Add row"}
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      {/* Sync approval strip: nothing writes until Confirm. */}
      {pendingSync ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent/40 bg-accent-soft/30 px-4 py-3">
          <div className="text-sm text-fg">
            Sync preview: <span className="font-medium tabular-nums">{pendingSync.inserted}</span> new,{" "}
            <span className="font-medium tabular-nums">{pendingSync.updated}</span> updated from the sheet. Nothing
            has been written yet.
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPendingSync(null)} disabled={importing}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void confirmSync()} disabled={importing}>
              {importing ? "Syncing…" : "Confirm sync"}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Per-coach sub-tabs (reviewers): one tab per coach with rows on the board. */}
      {canReview && coaches.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {["all", ...coaches].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCoachFilter(n)}
              className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors ${
                coachFilter === n
                  ? "bg-accent text-white"
                  : "border border-border text-fg-dim hover:border-accent/40 hover:text-fg"
              }`}
            >
              {n === "all" ? "All coaches" : n}
              <span className="ml-1.5 tabular-nums opacity-70">
                {n === "all" ? rows.length : rows.filter((r) => r.coachName === n).length}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {adding ? (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Client name (as written on Kahunas)"
            className="min-w-[220px] flex-1 rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <input
            value={draftKahunas}
            onChange={(e) => setDraftKahunas(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Kahunas profile URL (optional)"
            className="min-w-[220px] flex-1 rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <Button size="sm" onClick={add} disabled={!draftName.trim()}>
            Add
          </Button>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.value ? "border-accent text-fg" : "border-transparent text-fg-dim hover:text-fg"
            }`}
          >
            {t.label}
            <span className="text-xs tabular-nums text-fg-muted">{t.count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon="clipboard"
            title={rows.length === 0 ? "No clients in onboarding" : "Nothing here"}
            message={
              rows.length === 0
                ? "Add a row to start a client's plan-creation checklist."
                : "No rows match this filter."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[1180px] border-collapse text-sm">
            <thead>
              {/* Grouped header row, like the sheet */}
              <tr className="border-b border-border bg-surface-2/60">
                <th className={group} colSpan={4}>
                  Client Activation
                </th>
                <th className={group} colSpan={3}>
                  Nutrition
                </th>
                <th className={group} colSpan={3}>
                  Workout
                </th>
                <th className={group} colSpan={3}>
                  Welcome Video
                </th>
                <th className={group}>Notes</th>
                <th className="px-2 py-1" />
              </tr>
              <tr className="border-b border-border">
                <th className={head}>Client</th>
                <th className={head}>Coach</th>
                <th className={head}>Start</th>
                <th className={head} title="Initial Q&A received">
                  Q&A
                </th>
                <th className={head}>Made</th>
                <th className={head}>Feedback</th>
                <th className={head} title="Adjustments made (if needed)">
                  Adj
                </th>
                <th className={head}>Made</th>
                <th className={head}>Feedback</th>
                <th className={head} title="Adjustments made (if needed)">
                  Adj
                </th>
                <th className={head}>Loom</th>
                <th className={head}>Approved</th>
                <th className={head}>Sent</th>
                <th className={head}>Free text</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-border-soft transition-colors hover:bg-surface-2/40 ${
                    needsReview(r) ? "bg-warn-soft/20" : ""
                  }`}
                >
                  <td className="border-r border-border-soft px-2 py-1.5 whitespace-nowrap">
                    {r.kahunasUrl ? (
                      <a
                        href={r.kahunasUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-accent hover:underline"
                        title="Open in Kahunas"
                      >
                        {r.clientName}
                      </a>
                    ) : (
                      <span className="text-xs font-medium text-fg">{r.clientName}</span>
                    )}
                  </td>
                  <td className="border-r border-border-soft px-2 py-1.5 text-xs text-fg-dim whitespace-nowrap">{r.coachName}</td>
                  <CellText
                    value={r.startDate ?? ""}
                    placeholder="YYYY-MM-DD"
                    disabled={!canEdit}
                    width="min-w-[96px]"
                    onSave={(v) => save(r, "start_date", v, { startDate: v || null })}
                  />
                  <CellCheck
                    title="Initial Q&A received"
                    checked={r.qnaReceived}
                    disabled={!canEdit}
                    onChange={(v) => save(r, "qna_received", v, { qnaReceived: v })}
                  />
                  <CellCheck
                    title="Nutrition plan made"
                    checked={r.nutritionPlanMade}
                    disabled={!canEdit}
                    onChange={(v) => save(r, "nutrition_plan_made", v, { nutritionPlanMade: v })}
                  />
                  <CellText
                    value={r.nutritionFeedback ?? ""}
                    placeholder={canReview ? "feedback" : ""}
                    disabled={!canReview}
                    onSave={(v) => save(r, "nutrition_feedback", v, { nutritionFeedback: v || null })}
                  />
                  <CellCheck
                    title="Nutrition adjustments made"
                    checked={r.nutritionAdjusted}
                    disabled={!canEdit}
                    onChange={(v) => save(r, "nutrition_adjusted", v, { nutritionAdjusted: v })}
                  />
                  <CellCheck
                    title="Workout plan made"
                    checked={r.workoutPlanMade}
                    disabled={!canEdit}
                    onChange={(v) => save(r, "workout_plan_made", v, { workoutPlanMade: v })}
                  />
                  <CellText
                    value={r.workoutFeedback ?? ""}
                    placeholder={canReview ? "feedback" : ""}
                    disabled={!canReview}
                    onSave={(v) => save(r, "workout_feedback", v, { workoutFeedback: v || null })}
                  />
                  <CellCheck
                    title="Workout adjustments made"
                    checked={r.workoutAdjusted}
                    disabled={!canEdit}
                    onChange={(v) => save(r, "workout_adjusted", v, { workoutAdjusted: v })}
                  />
                  <td className="border-r border-border-soft p-0 min-w-[120px]">
                    <div className="flex items-center">
                      <input
                        defaultValue={r.loomUrl ?? ""}
                        placeholder="link"
                        disabled={!canEdit}
                        onBlur={(e) => e.target.value !== (r.loomUrl ?? "") && save(r, "loom_url", e.target.value, { loomUrl: e.target.value || null })}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        className="w-full bg-transparent px-2 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:bg-surface-2 focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed"
                      />
                      {r.loomUrl ? (
                        <a href={r.loomUrl} target="_blank" rel="noreferrer" className="px-1.5 text-xs text-accent hover:underline">
                          ↗
                        </a>
                      ) : null}
                    </div>
                  </td>
                  <CellCheck
                    title="Approved (head coach)"
                    checked={r.approved}
                    disabled={!canReview}
                    onChange={(v) => save(r, "approved", v, { approved: v })}
                  />
                  <CellCheck
                    title="Sent to client"
                    checked={r.sent}
                    disabled={!canReview}
                    onChange={(v) => save(r, "sent", v, { sent: v })}
                  />
                  <CellText
                    value={r.notes ?? ""}
                    placeholder="notes"
                    disabled={!canEdit}
                    width="min-w-[160px]"
                    onSave={(v) => save(r, "notes", v, { notes: v || null })}
                  />
                  <td className="px-2 py-1.5 text-center">
                    {canReview ? (
                      <button
                        type="button"
                        onClick={() => remove(r)}
                        className="text-xs text-fg-muted transition-colors hover:text-danger"
                        title="Remove row"
                      >
                        ✕
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
