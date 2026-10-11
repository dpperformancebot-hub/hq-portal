"use client";

import { Card, DataTable, PageHeader, type Column } from "@/components/ui";
import { getReferrals, type Referral } from "@/lib/seed";

const STATUS_CHIP: Record<Referral["status"], string> = {
  pending: "bg-warn-soft text-warn",
  earned: "bg-plan-weekly text-plan-weekly-fg",
  paid: "bg-positive-soft text-positive",
};

const COLUMNS: Column<Referral>[] = [
  { key: "referrer", header: "Referred by", render: (r) => <span className="font-medium text-fg">{r.referrer}</span> },
  { key: "referred", header: "New client", render: (r) => <span className="text-fg">{r.referred}</span> },
  { key: "reward", header: "Reward", render: (r) => <span className="text-fg-dim">{r.reward}</span> },
  {
    key: "status",
    header: "Status",
    width: "110px",
    render: (r) => <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_CHIP[r.status]}`}>{r.status}</span>,
  },
];

export function ReferralsView({ referrals }: { referrals: Referral[] }) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Brand" title="Referrals" subtitle="Who referred whom, and reward status." />
      <Card className="p-2">
        <DataTable columns={COLUMNS} data={referrals} getRowKey={(r) => r.id} emptyMessage="No referrals yet." />
      </Card>
    </div>
  );
}

export function ReferralsScreen() {
  return <ReferralsView referrals={getReferrals()} />;
}
