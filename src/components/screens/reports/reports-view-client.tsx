"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, DataTable, PageHeader, useToast, type Column } from "@/components/ui";
import type { Report } from "@/lib/seed";
import { createReportAction } from "@/lib/reports-actions";

const REPORT_TYPES = ["Summary", "Monthly", "Quarterly", "Coaching"];

const COLUMNS: Column<Report>[] = [
  { key: "title", header: "Report", render: (r) => <span className="font-medium text-fg">{r.title}</span> },
  { key: "type", header: "Type", width: "120px", render: (r) => <span className="text-fg-dim">{r.type}</span> },
  { key: "period", header: "Period", width: "140px", render: (r) => <span className="text-fg-dim">{r.period}</span> },
  { key: "generatedAt", header: "Generated", width: "140px", render: (r) => <span className="text-fg-muted">{r.generatedAt}</span> },
];

const inputCls =
  "rounded-control border border-border-soft bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent disabled:opacity-50";

type Draft = { title: string; type: string; period: string; generatedAt: string; body: string };

function reduce(state: Report[], report: Report): Report[] {
  return [report, ...state];
}

export function ReportsView({ reports, live }: { reports: Report[]; live: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [optimistic, apply] = useOptimistic(reports, reduce);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const openNew = () => {
    if (!live) return;
    setMsg(null);
    setDraft({ title: "", type: "Summary", period: "", generatedAt: "", body: "" });
  };

  const save = () => {
    if (!draft || !draft.title.trim()) return;
    const d = draft;
    setMsg(null);
    start(async () => {
      const generatedAt = d.generatedAt || new Date().toISOString().slice(0, 10);
      apply({ id: `temp-${crypto.randomUUID()}`, title: d.title.trim(), type: d.type, period: d.period.trim(), generatedAt });
      const res = await createReportAction({
        title: d.title,
        type: d.type,
        period: d.period,
        body: d.body,
        generatedAt: d.generatedAt || null,
      });
      if (!res.ok) {
        setMsg(res.error ?? "Could not add the report.");
        toast.push(res.error ?? "Could not add the report.", "error");
        return;
      }
      toast.push("Report created");
      setDraft(null);
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        back
        eyebrow="Insights"
        title="Reports"
        subtitle="Generated reports. Open one for the detail."
        actions={
          <Button size="sm" onClick={openNew} disabled={!live} title={live ? "" : "Saving goes live with the database"}>
            New report
          </Button>
        }
      />

      {!live && (
        <div className="rounded-control border border-warn/40 bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
          Demo reports. Creating reports goes live with the database (active in production).
        </div>
      )}

      {draft && live && (
        <Card className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <input
              className={inputCls}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Report title"
              disabled={pending}
              autoFocus
            />
            <select
              aria-label="Type"
              className={inputCls}
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value })}
              disabled={pending}
            >
              {REPORT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              className={inputCls}
              value={draft.period}
              onChange={(e) => setDraft({ ...draft, period: e.target.value })}
              placeholder="Period (e.g. May 2026)"
              disabled={pending}
            />
            <input
              className={inputCls}
              type="date"
              aria-label="Generated date"
              value={draft.generatedAt}
              onChange={(e) => setDraft({ ...draft, generatedAt: e.target.value })}
              disabled={pending}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={save} disabled={pending || !draft.title.trim()}>
                {pending ? "Saving…" : "Add"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </div>
          <textarea
            className={`${inputCls} w-full`}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            placeholder="Report notes (optional)"
            rows={2}
            disabled={pending}
          />
          {msg ? <span className="block text-sm text-danger">{msg}</span> : null}
        </Card>
      )}

      {msg && !draft && <span className="block text-sm text-danger">{msg}</span>}

      <Card className="p-2">
        <DataTable
          columns={COLUMNS}
          data={optimistic}
          getRowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/reports/${r.id}`)}
          emptyMessage="No reports yet."
        />
      </Card>
    </div>
  );
}
