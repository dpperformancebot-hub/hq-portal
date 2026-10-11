"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Button, Card, DataTable, EmptyState, PageHeader, Panel, useToast, type Column } from "@/components/ui";
import type { Campaign, LeadMagnet } from "@/lib/seed";
import { createCampaignAction, createLeadMagnetAction } from "@/lib/marketing-actions";

const CAMPAIGN_STATUSES: Campaign["status"][] = ["active", "ended"];

const CAMPAIGN_COLUMNS: Column<Campaign>[] = [
  { key: "name", header: "Campaign", render: (c) => <span className="font-medium text-fg">{c.name}</span> },
  { key: "type", header: "Type", width: "120px", render: (c) => <span className="text-fg-dim">{c.type}</span> },
  {
    key: "status",
    header: "Status",
    width: "100px",
    render: (c) => (
      <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium capitalize ${c.status === "active" ? "bg-positive-soft text-positive" : "bg-surface-2 text-fg-muted"}`}>
        {c.status}
      </span>
    ),
  },
  { key: "spend", header: "Spend", align: "right", width: "90px", render: (c) => `$${c.spend.toLocaleString()}` },
  { key: "leads", header: "Leads", align: "right", width: "80px", render: (c) => c.leads },
  { key: "closed", header: "Closed", align: "right", width: "80px", render: (c) => c.closed },
  { key: "roas", header: "ROAS", align: "right", width: "80px", render: (c) => (c.roas ? `${c.roas.toFixed(1)}x` : "-") },
  { key: "period", header: "Period", width: "80px", render: (c) => <span className="text-fg-dim">{c.period}</span> },
];

const inputCls =
  "rounded-control border border-border-soft bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent disabled:opacity-50";

type CampaignDraft = {
  name: string;
  type: string;
  status: Campaign["status"];
  spend: string;
  leads: string;
  closed: string;
  roas: string;
  period: string;
};
type MagnetDraft = { name: string; optIns: string; conversionPct: string };

type State = { campaigns: Campaign[]; magnets: LeadMagnet[] };
type Action = { kind: "campaign"; campaign: Campaign } | { kind: "magnet"; magnet: LeadMagnet };

function reduce(state: State, action: Action): State {
  switch (action.kind) {
    case "campaign":
      return { ...state, campaigns: [action.campaign, ...state.campaigns] };
    case "magnet":
      return { ...state, magnets: [action.magnet, ...state.magnets] };
  }
}

const num = (s: string) => (s.trim() === "" ? 0 : Number(s) || 0);

export function MarketingView({
  campaigns,
  magnets,
  live,
}: {
  campaigns: Campaign[];
  magnets: LeadMagnet[];
  live: boolean;
}) {
  const toast = useToast();
  const [optimistic, apply] = useOptimistic<State, Action>({ campaigns, magnets }, reduce);
  const [campaignDraft, setCampaignDraft] = useState<CampaignDraft | null>(null);
  const [magnetDraft, setMagnetDraft] = useState<MagnetDraft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const active = optimistic.campaigns.filter((c) => c.status === "active");

  const openCampaign = () => {
    if (!live) return;
    setMsg(null);
    setMagnetDraft(null);
    setCampaignDraft({ name: "", type: "Paid", status: "active", spend: "", leads: "", closed: "", roas: "", period: "" });
  };
  const openMagnet = () => {
    if (!live) return;
    setMsg(null);
    setCampaignDraft(null);
    setMagnetDraft({ name: "", optIns: "", conversionPct: "" });
  };

  const saveCampaign = () => {
    if (!campaignDraft || !campaignDraft.name.trim()) return;
    const d = campaignDraft;
    setMsg(null);
    start(async () => {
      const roas = num(d.roas);
      apply({
        kind: "campaign",
        campaign: {
          id: `temp-${crypto.randomUUID()}`,
          name: d.name.trim(),
          type: d.type.trim() || "Paid",
          status: d.status,
          spend: num(d.spend),
          leads: Math.round(num(d.leads)),
          closed: Math.round(num(d.closed)),
          roas,
          period: d.period.trim(),
        },
      });
      const res = await createCampaignAction({
        name: d.name,
        type: d.type,
        status: d.status,
        spend: num(d.spend),
        leads: num(d.leads),
        closed: num(d.closed),
        roas: roas > 0 ? roas : null,
        period: d.period,
      });
      if (!res.ok) {
        setMsg(res.error ?? "Could not add the campaign.");
        toast.push(res.error ?? "Could not add the campaign.", "error");
        return;
      }
      toast.push("Campaign created");
      setCampaignDraft(null);
    });
  };

  const saveMagnet = () => {
    if (!magnetDraft || !magnetDraft.name.trim()) return;
    const d = magnetDraft;
    setMsg(null);
    start(async () => {
      apply({
        kind: "magnet",
        magnet: { id: `temp-${crypto.randomUUID()}`, name: d.name.trim(), optIns: Math.round(num(d.optIns)), conversionPct: num(d.conversionPct) },
      });
      const res = await createLeadMagnetAction({ name: d.name, optIns: num(d.optIns), conversionPct: num(d.conversionPct) });
      if (!res.ok) {
        setMsg(res.error ?? "Could not add the lead magnet.");
        toast.push(res.error ?? "Could not add the lead magnet.", "error");
        return;
      }
      toast.push("Lead magnet created");
      setMagnetDraft(null);
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Brand"
        title="Marketing & Campaigns"
        subtitle="Growth: active campaigns, lead magnets, content & challenges."
        actions={
          <Button size="sm" onClick={openCampaign} disabled={!live} title={live ? "" : "Saving goes live with the database"}>
            New campaign
          </Button>
        }
      />

      {!live && (
        <div className="rounded-control border border-warn/40 bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
          Demo data. Creating campaigns and lead magnets goes live with the database (active in production). This tracks growth only, it launches nothing.
        </div>
      )}

      {campaignDraft && live && (
        <Card className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <input className={inputCls} value={campaignDraft.name} onChange={(e) => setCampaignDraft({ ...campaignDraft, name: e.target.value })} placeholder="Campaign name" disabled={pending} autoFocus />
            <input className={inputCls} value={campaignDraft.type} onChange={(e) => setCampaignDraft({ ...campaignDraft, type: e.target.value })} placeholder="Type (e.g. Challenge)" disabled={pending} />
            <select aria-label="Status" className={inputCls} value={campaignDraft.status} onChange={(e) => setCampaignDraft({ ...campaignDraft, status: e.target.value as Campaign["status"] })} disabled={pending}>
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s}
                </option>
              ))}
            </select>
            <input className={inputCls} value={campaignDraft.period} onChange={(e) => setCampaignDraft({ ...campaignDraft, period: e.target.value })} placeholder="Period (e.g. Jun)" disabled={pending} />
            <input className={inputCls} type="number" min="0" value={campaignDraft.spend} onChange={(e) => setCampaignDraft({ ...campaignDraft, spend: e.target.value })} placeholder="Spend $" disabled={pending} />
            <input className={inputCls} type="number" min="0" value={campaignDraft.leads} onChange={(e) => setCampaignDraft({ ...campaignDraft, leads: e.target.value })} placeholder="Leads" disabled={pending} />
            <input className={inputCls} type="number" min="0" value={campaignDraft.closed} onChange={(e) => setCampaignDraft({ ...campaignDraft, closed: e.target.value })} placeholder="Closed" disabled={pending} />
            <input className={inputCls} type="number" min="0" step="0.1" value={campaignDraft.roas} onChange={(e) => setCampaignDraft({ ...campaignDraft, roas: e.target.value })} placeholder="ROAS (e.g. 4.2)" disabled={pending} />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={saveCampaign} disabled={pending || !campaignDraft.name.trim()}>
              {pending ? "Saving…" : "Add campaign"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCampaignDraft(null)} disabled={pending}>
              Cancel
            </Button>
            {msg ? <span className="text-sm text-danger">{msg}</span> : null}
          </div>
        </Card>
      )}

      <Panel title="Active campaigns" flush>
        {active.length === 0 ? (
          <EmptyState icon="megaphone" title="No active campaigns" message="Launch a campaign to see it here." />
        ) : (
          <DataTable columns={CAMPAIGN_COLUMNS} data={active} getRowKey={(c) => c.id} />
        )}
      </Panel>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Panel
          title="Lead magnets"
          action={
            <Button variant="ghost" size="sm" onClick={openMagnet} disabled={!live} title={live ? "" : "Saving goes live with the database"}>
              Add magnet
            </Button>
          }
        >
          {magnetDraft && live && (
            <Card className="mb-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                <input className={inputCls} value={magnetDraft.name} onChange={(e) => setMagnetDraft({ ...magnetDraft, name: e.target.value })} placeholder="Lead magnet name" disabled={pending} autoFocus />
                <input className={inputCls} type="number" min="0" value={magnetDraft.optIns} onChange={(e) => setMagnetDraft({ ...magnetDraft, optIns: e.target.value })} placeholder="Opt-ins" disabled={pending} />
                <input className={inputCls} type="number" min="0" step="0.1" value={magnetDraft.conversionPct} onChange={(e) => setMagnetDraft({ ...magnetDraft, conversionPct: e.target.value })} placeholder="Conv %" disabled={pending} />
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={saveMagnet} disabled={pending || !magnetDraft.name.trim()}>
                  {pending ? "Saving…" : "Add"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setMagnetDraft(null)} disabled={pending}>
                  Cancel
                </Button>
                {msg ? <span className="text-sm text-danger">{msg}</span> : null}
              </div>
            </Card>
          )}
          {optimistic.magnets.length === 0 ? (
            <EmptyState icon="gift" title="No lead magnets yet" />
          ) : (
            <div className="space-y-3">
              {optimistic.magnets.map((m) => (
                <div key={m.id} className="flex items-center justify-between">
                  <span className="text-sm text-fg">{m.name}</span>
                  <span className="text-xs tabular-nums text-fg-dim">
                    {m.optIns.toLocaleString()} opt-ins · {m.conversionPct}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Content calendar" subtitle="Embedded week view. Full planner in Content Planner.">
          <EmptyState icon="layers" title="Week view" message="A condensed content week embeds here. Ads tracking is a later extension point." />
        </Panel>
      </div>
    </div>
  );
}
