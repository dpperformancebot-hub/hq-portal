"use client";

import { Card, DataTable, PageHeader, type Column } from "@/components/ui";
import { getAmbassadors, type Ambassador } from "@/lib/seed";
import { IS_DP } from "@/lib/brand";

const TIER_CHIP: Record<Ambassador["tier"], string> = {
  Gold: "bg-type-article text-type-article-fg",
  Silver: "bg-surface-2 text-fg-dim",
  Bronze: "bg-type-video text-type-video-fg",
};

const COLUMNS: Column<Ambassador>[] = [
  { key: "handle", header: "Ambassador", render: (a) => <span className="font-medium text-fg">{a.handle}</span> },
  {
    key: "tier",
    header: "Tier",
    width: "90px",
    render: (a) => <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium ${TIER_CHIP[a.tier]}`}>{a.tier}</span>,
  },
  { key: "referrals", header: "Referrals", align: "right", width: "100px", render: (a) => a.referrals },
  { key: "closed", header: "Closed", align: "right", width: "90px", render: (a) => a.closed },
  { key: "commission", header: "Commission", align: "right", width: "120px", render: (a) => `$${a.commission.toLocaleString()}` },
  {
    key: "status",
    header: "Status",
    width: "90px",
    render: (a) => <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium capitalize ${a.status === "active" ? "bg-positive-soft text-positive" : "bg-surface-2 text-fg-muted"}`}>{a.status}</span>,
  },
];

export function AmbassadorsView({ ambassadors }: { ambassadors: Ambassador[] }) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Brand" title="Ambassadors" subtitle="Tiered ambassadors, referrals, and commission." />
      <Card className="p-2">
        <DataTable columns={COLUMNS} data={ambassadors} getRowKey={(a) => a.id} emptyMessage="No ambassadors yet." />
      </Card>
    </div>
  );
}

export function AmbassadorsScreen() {
  // R10: the seeded ambassador list is DP demo data; other brands start empty.
  return <AmbassadorsView ambassadors={IS_DP ? getAmbassadors() : []} />;
}
