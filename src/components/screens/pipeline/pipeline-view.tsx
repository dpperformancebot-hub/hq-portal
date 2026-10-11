"use client";

import { useState } from "react";
import {
  Avatar,
  Card,
  DataTable,
  EmptyState,
  Kpi,
  PageHeader,
  Panel,
  SegmentedControl,
  type Column,
} from "@/components/ui";
import { daysInStage, PIPELINE_ORDER, type Lead, type LeadSource, type LeadStage } from "@/lib/seed";
import { datedFilename } from "@/lib/csv";

// Source colors reuse themed pill tokens (literal classes for the JIT).
const SOURCE_STYLE: Record<LeadSource, { tag: string; dot: string }> = {
  Instagram: { tag: "bg-type-cpd text-type-cpd-fg", dot: "bg-type-cpd-fg" },
  TikTok: { tag: "bg-plan-weekly text-plan-weekly-fg", dot: "bg-plan-weekly-fg" },
  YouTube: { tag: "bg-type-video text-type-video-fg", dot: "bg-type-video-fg" },
  Referral: { tag: "bg-type-template text-type-template-fg", dot: "bg-type-template-fg" },
  Ambassador: { tag: "bg-type-article text-type-article-fg", dot: "bg-type-article-fg" },
  "Lead Magnet": { tag: "bg-type-sop text-type-sop-fg", dot: "bg-type-sop-fg" },
  Email: { tag: "bg-type-policy text-type-policy-fg", dot: "bg-type-policy-fg" },
  Website: { tag: "bg-plan-weekly text-plan-weekly-fg", dot: "bg-plan-weekly-fg" },
  "Word of Mouth": { tag: "bg-plan-fortnightly text-plan-fortnightly-fg", dot: "bg-plan-fortnightly-fg" },
};

function SourceTag({ source }: { source: LeadSource }) {
  return (
    <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium ${SOURCE_STYLE[source].tag}`}>
      {source}
    </span>
  );
}

function StagePill({ stage }: { stage: LeadStage }) {
  return (
    <span className="inline-flex items-center rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-dim">
      {stage}
    </span>
  );
}

function ageClass(days: number) {
  if (days <= 3) return "text-fg-dim";
  if (days <= 10) return "text-warn";
  return "text-danger";
}

function daysLabel(d: number) {
  return d === 0 ? "today" : `${d}d`;
}

// Coarse age buckets so the table can be filtered by how long a lead has sat,
// which is more useful for triage than an exact-date facet (too many values).
function ageBucket(days: number): string {
  if (days <= 3) return "New (0-3d)";
  if (days <= 10) return "Warming (4-10d)";
  return "Stale (11d+)";
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="text-sm text-fg">{value}</div>
    </div>
  );
}

// Slide-over with the full lead record. Read-only: GHL write-back lands later.
function LeadDrawer({ lead, onClose, showMoney }: { lead: Lead; onClose: () => void; showMoney: boolean }) {
  const d = daysInStage(lead);
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto border-l border-border bg-surface p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-xl tracking-display text-fg">{lead.name}</div>
            <div className="mt-1 flex items-center gap-2">
              <SourceTag source={lead.source} />
              <StagePill stage={lead.stage} />
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-lg leading-none text-fg-muted hover:text-fg">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Detail label="Owner" value={lead.ownerName || "Unassigned"} />
          {showMoney ? <Detail label="Value" value={`$${lead.value.toLocaleString()}`} /> : null}
          <Detail label="Days in stage" value={daysLabel(d)} />
          <Detail label="Last activity" value={lead.lastActivity || "-"} />
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Next action</div>
          <div className="mt-1 text-sm text-fg">{lead.nextAction || "-"}</div>
        </div>

        {lead.contactChannels.length ? (
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Contact channels</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {[...lead.contactChannels]
                .sort((a, b) => a.priority - b.priority)
                .map((c) => (
                  <span key={c.channel} className="rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-fg-dim">
                    {c.channel}
                  </span>
                ))}
            </div>
          </div>
        ) : null}

        <p className="mt-auto text-xs text-fg-muted">
          Editing a lead writes back to GoHighLevel, which lands in a later phase. This view is read-only for now.
        </p>
      </div>
    </div>
  );
}

// How many cards a Kanban column shows before "Show more". Keeps the raw-lead
// bucket (New Enquiry can hold ~1,000) from rendering every card at once.
const KANBAN_PAGE = 25;

function Kanban({ leads, onSelect }: { leads: Lead[]; onSelect: (l: Lead) => void }) {
  // Per-column reveal count; grows by KANBAN_PAGE on "Show more".
  const [shown, setShown] = useState<Record<string, number>>({});

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {PIPELINE_ORDER.map((stage) => {
        const inStage = leads.filter((l) => l.stage === stage);
        const limit = shown[stage] ?? KANBAN_PAGE;
        const visible = inStage.slice(0, limit);
        const remaining = inStage.length - visible.length;
        return (
          <div key={stage} className="flex w-64 shrink-0 flex-col">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-muted">{stage}</span>
              <span className="text-xs tabular-nums text-fg-muted">{inStage.length}</span>
            </div>
            <div className="space-y-2">
              {visible.map((lead) => {
                const d = daysInStage(lead);
                return (
                  <Card
                    key={lead.id}
                    onClick={() => onSelect(lead)}
                    className="cursor-pointer p-3 transition-colors hover:border-accent/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-fg">{lead.name}</span>
                      <Avatar name={lead.ownerName} size="sm" />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <SourceTag source={lead.source} />
                      <span className={`text-xs tabular-nums ${ageClass(d)}`}>{daysLabel(d)}</span>
                    </div>
                  </Card>
                );
              })}
              {remaining > 0 ? (
                <button
                  type="button"
                  onClick={() => setShown((s) => ({ ...s, [stage]: limit + KANBAN_PAGE }))}
                  className="w-full rounded-card border border-dashed border-border px-3 py-2 text-center text-xs font-medium text-fg-dim transition-colors hover:border-accent/40 hover:text-fg"
                >
                  Show {Math.min(KANBAN_PAGE, remaining)} more ({remaining} left)
                </button>
              ) : null}
              {inStage.length === 0 ? (
                <div className="rounded-card border border-dashed border-border px-3 py-6 text-center text-xs text-fg-muted">
                  Empty
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Quick stage presets above the table. "Booked" (Call Booked) and "New
// Enquiry" (the raw-lead bucket) lead, since those are the two the team triages
// most. The active preset pre-filters the rows; the table's own search +
// facets + sort then work within it.
const TABLE_TABS: { label: string; match: (l: Lead) => boolean }[] = [
  { label: "All Leads", match: () => true },
  { label: "New Enquiry", match: (l) => l.stage === "New Enquiry" },
  // Brand-gated: only DP runs the Call Offered stage (Dan's spec).
  ...(PIPELINE_ORDER.includes("Call Offered")
    ? [{ label: "Call Offered", match: (l: Lead) => l.stage === "Call Offered" }]
    : []),
  { label: "Booked", match: (l) => l.stage === "Call Booked" },
  { label: "Follow-Up", match: (l) => l.stage === "Follow-Up" },
  { label: "Call Taken", match: (l) => l.stage === "Call Taken" },
  { label: "New Client Processing", match: (l) => l.stage === "New Client Processing" },
  { label: "Submitted", match: (l) => l.stage === "Submitted" },
  { label: "Lost", match: (l) => l.stage === "Lost" },
  { label: "Lead Magnets", match: (l) => l.source === "Lead Magnet" },
];

function Table({ leads, onSelect, showMoney }: { leads: Lead[]; onSelect: (l: Lead) => void; showMoney: boolean }) {
  const [tab, setTab] = useState(0);
  const filtered = leads.filter(TABLE_TABS[tab].match);

  const columns: Column<Lead>[] = [
    {
      key: "name",
      header: "Name",
      csvValue: (l) => l.name,
      render: (l) => (
        <button type="button" onClick={() => onSelect(l)} className="font-medium text-fg hover:text-accent hover:underline">
          {l.name}
        </button>
      ),
    },
    {
      key: "source",
      header: "Source",
      csvValue: (l) => l.source,
      render: (l) => (
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-pill ${SOURCE_STYLE[l.source].dot}`} />
          <span className="text-fg-dim">{l.source}</span>
        </span>
      ),
    },
    {
      key: "stage",
      header: "Status",
      // Sort by pipeline order, not alphabetically, so the column tracks funnel progress.
      sortValue: (l) => PIPELINE_ORDER.indexOf(l.stage),
      csvValue: (l) => l.stage,
      render: (l) => <StagePill stage={l.stage} />,
    },
    { key: "owner", header: "Assigned", csvValue: (l) => l.ownerName || "Unassigned", render: (l) => <span className="text-fg-dim">{l.ownerName || "Unassigned"}</span> },
    { key: "lastActivity", header: "Last Activity", csvValue: (l) => l.lastActivity, render: (l) => <span className="text-fg-dim">{l.lastActivity}</span> },
    { key: "nextAction", header: "Next Action", csvValue: (l) => l.nextAction, render: (l) => <span className="text-fg-dim">{l.nextAction}</span> },
    {
      key: "days",
      header: "Days in Stage",
      align: "right",
      width: "120px",
      sortValue: (l) => daysInStage(l),
      csvValue: (l) => daysInStage(l),
      render: (l) => {
        const d = daysInStage(l);
        return <span className={ageClass(d)}>{daysLabel(d)}</span>;
      },
    },
  ];

  const active = leads.filter((l) => l.stage !== "Lost").length;
  const won = leads.filter((l) => l.stage === "Submitted").length;
  const lost = leads.filter((l) => l.stage === "Lost").length;
  const convRate = won + lost === 0 ? 0 : Math.round((won / (won + lost)) * 100);
  const submitted = leads.filter((l) => l.stage === "Submitted");
  const avgDays =
    submitted.length === 0
      ? 0
      : Math.round(submitted.reduce((s, l) => s + daysInStage(l), 0) / submitted.length);
  const pipelineValue = leads.filter((l) => l.stage !== "Lost").reduce((s, l) => s + l.value, 0);

  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-2 gap-4 ${showMoney ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Kpi label="Active leads" value={active} />
        <Kpi label="Conversion rate" value={convRate} suffix="%" />
        <Kpi label="Avg days to close" value={avgDays} />
        {showMoney ? <Kpi label="Pipeline value" value={pipelineValue} prefix="$" /> : null}
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap gap-1 border-b border-border px-3 pt-3">
          {TABLE_TABS.map((t, i) => {
            const count = leads.filter(t.match).length;
            const isActive = i === tab;
            return (
              <button
                key={t.label}
                type="button"
                onClick={() => setTab(i)}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "border-accent text-fg" : "border-transparent text-fg-dim hover:text-fg"
                }`}
              >
                {t.label}
                <span className="text-xs tabular-nums text-fg-muted">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="p-2">
          <DataTable
            columns={columns}
            data={filtered}
            getRowKey={(l) => l.id}
            emptyMessage="No leads in this view."
            exportFilename={datedFilename("pipeline")}
            searchable={{
              placeholder: "Search leads by name, source, assigned...",
              getText: (l) => `${l.name} ${l.ownerName} ${l.source} ${l.stage}`,
            }}
            filters={[
              { key: "source", label: "Source", getValue: (l) => l.source },
              { key: "owner", label: "Assigned", getValue: (l) => l.ownerName || "Unassigned" },
              { key: "age", label: "Age", getValue: (l) => ageBucket(daysInStage(l)) },
            ]}
            defaultSort={{ key: "days", dir: "desc" }}
            pageSize={50}
          />
        </div>
      </Card>
    </div>
  );
}

// Stage configuration: read-only mirror of the GHL pipeline (GHL owns stage
// names + order). Shows each stage with its lead count and value.
function Stages({ leads, showMoney }: { leads: Lead[]; showMoney: boolean }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-muted">
        Stages mirror your GoHighLevel pipeline. Edit stage names and order in GHL; the HQ reflects them here.
      </p>
      <div className="space-y-2">
        {PIPELINE_ORDER.map((stage, i) => {
          const inStage = leads.filter((l) => l.stage === stage);
          const value = inStage.reduce((s, l) => s + l.value, 0);
          return (
            <Card key={stage} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-pill bg-surface-2 text-[11px] tabular-nums text-fg-muted">
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-fg">{stage}</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="tabular-nums text-fg-dim">{inStage.length} leads</span>
                {showMoney ? <span className="tabular-nums text-fg-muted">${value.toLocaleString()}</span> : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function PipelineView({
  leads,
  showMoney = true,
}: {
  leads: Lead[];
  /** false for a money-blind coach (TJD head coach by URL): deal values,
   *  stage totals and the pipeline value KPI disappear. Data already zeroed. */
  showMoney?: boolean;
}) {
  const [view, setView] = useState("Kanban");
  const [selected, setSelected] = useState<Lead | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        back
        eyebrow="Operations"
        title="Pipeline (CRM)"
        subtitle="Leads projected from GoHighLevel. Stage changes write back to GHL later."
        actions={
          <SegmentedControl
            aria-label="View"
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { label: "Kanban", value: "Kanban" },
              { label: "Table", value: "Table" },
              { label: "Stages", value: "Stages" },
            ]}
          />
        }
      />

      {leads.length === 0 ? (
        <Panel title="Pipeline">
          <EmptyState
            icon="filter"
            title="No leads yet"
            message="Leads appear here automatically once opportunities are imported into GoHighLevel. Stage mapping is already in place."
          />
        </Panel>
      ) : view === "Kanban" ? (
        <Kanban leads={leads} onSelect={setSelected} />
      ) : view === "Table" ? (
        <Table leads={leads} onSelect={setSelected} showMoney={showMoney} />
      ) : (
        <Stages leads={leads} showMoney={showMoney} />
      )}

      {selected ? <LeadDrawer lead={selected} onClose={() => setSelected(null)} showMoney={showMoney} /> : null}
    </div>
  );
}
