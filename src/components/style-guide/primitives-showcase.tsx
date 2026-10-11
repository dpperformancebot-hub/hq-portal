"use client";

import { useState } from "react";
import {
  AreaChart,
  Avatar,
  Button,
  Card,
  DataTable,
  Delta,
  Kpi,
  PageHeader,
  PlanPill,
  SegmentedControl,
  SidebarNavItem,
  StatusPill,
  type Column,
  type PlanVariant,
  type StatusVariant,
} from "@/components/ui";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
        {title}
      </h3>
      {children}
    </div>
  );
}

// Minimal inline icons for the sidebar demo (stroke = currentColor).
const IconDashboard = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);
const IconClients = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="4" />
    <path d="M2 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" />
    <circle cx="17" cy="6" r="3" />
  </svg>
);

type ClientRow = {
  id: number;
  name: string;
  plan: PlanVariant;
  status: StatusVariant;
  week: number;
  rate: number;
};

const ROWS: ClientRow[] = [
  { id: 1, name: "Alannah Parfett", plan: "weekly", status: "sent", week: 12, rate: 220 },
  { id: 2, name: "Charlotte Jezard", plan: "fortnightly", status: "send-message", week: 8, rate: 160 },
  { id: 3, name: "Jake Reynolds", plan: "weekly", status: "ghosted", week: 8, rate: 220 },
  { id: 4, name: "Emma Clarke", plan: "fortnightly", status: "due", week: 2, rate: 160 },
];

const COLUMNS: Column<ClientRow>[] = [
  {
    key: "name",
    header: "Client",
    render: (r) => (
      <span className="flex items-center gap-2">
        <Avatar name={r.name} size="sm" />
        <span className="truncate">{r.name}</span>
      </span>
    ),
  },
  { key: "plan", header: "Plan", render: (r) => <PlanPill variant={r.plan} /> },
  { key: "status", header: "Status", render: (r) => <StatusPill variant={r.status} /> },
  { key: "week", header: "Week", align: "right", width: "80px", render: (r) => r.week },
  { key: "rate", header: "Rate", align: "right", width: "90px", render: (r) => `$${r.rate}` },
];

const REVENUE = [
  { month: "Jan", value: 38200 },
  { month: "Feb", value: 41100 },
  { month: "Mar", value: 39800 },
  { month: "Apr", value: 44500 },
  { month: "May", value: 46900 },
  { month: "Jun", value: 48250 },
];

export function PrimitivesShowcase() {
  const [period, setPeriod] = useState("Monthly");
  const [range, setRange] = useState("3M");
  const [nav, setNav] = useState("dashboard");

  return (
    <div>
      <Block title="PageHeader">
        <PageHeader
          eyebrow="Overview"
          title="Dashboard"
          subtitle="Active clients, revenue, and check-in health at a glance."
          actions={
            <>
              <Button variant="ghost" size="sm">
                Export
              </Button>
              <Button size="sm">New client</Button>
            </>
          }
        />
      </Block>

      <Block title="KPI">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Kpi label="Active clients" value={128} delta={4} deltaSuffix="" hint="vs last month" />
          <Kpi label="MRR" value={48250} prefix="$" delta={5.2} deltaSuffix="%" sparkline={REVENUE.map((r) => r.value)} />
          <Kpi label="Churn" value={3.1} suffix="%" delta={-0.4} deltaSuffix="%" hint="rolling 30 days" />
        </div>
      </Block>

      <Block title="Card">
        <Card>
          <p className="text-sm text-fg">Base surface container.</p>
          <p className="mt-1 text-xs text-fg-dim">
            Hairline border, 14px radius, 20px padding. No shadow.
          </p>
        </Card>
      </Block>

      <Block title="Delta">
        <div className="flex flex-wrap items-center gap-2">
          <Delta value={12.4} suffix="%" />
          <Delta value={-3.1} suffix="%" />
          <Delta value={0} suffix="%" />
          <Delta value={250} prefix="$" />
        </div>
      </Block>

      <Block title="Avatar (sm / md / lg)">
        <div className="flex items-center gap-3">
          <Avatar name="Alannah Parfett" size="sm" />
          <Avatar name="Daniel Price" size="md" />
          <Avatar name="Charlotte Jezard" size="lg" />
        </div>
      </Block>

      <Block title="SegmentedControl">
        <div className="flex flex-col gap-3">
          <SegmentedControl
            aria-label="Period"
            value={period}
            onChange={setPeriod}
            options={[
              { label: "Weekly", value: "Weekly" },
              { label: "Monthly", value: "Monthly" },
              { label: "Quarterly", value: "Quarterly" },
              { label: "Yearly", value: "Yearly" },
            ]}
          />
          <SegmentedControl
            aria-label="Range"
            size="sm"
            value={range}
            onChange={setRange}
            options={[
              { label: "1M", value: "1M" },
              { label: "3M", value: "3M" },
              { label: "6M", value: "6M" },
              { label: "1Y", value: "1Y" },
              { label: "Custom", value: "Custom" },
            ]}
          />
        </div>
      </Block>

      <Block title="Button">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Primary sm</Button>
          <Button size="md">Primary md</Button>
          <Button size="lg">Primary lg</Button>
          <Button variant="ghost" size="md">
            Ghost
          </Button>
          <Button size="md" disabled>
            Disabled
          </Button>
        </div>
      </Block>

      <Block title="SidebarNavItem">
        <div className="w-56 space-y-1 rounded-card border border-border bg-surface p-2">
          <SidebarNavItem icon={IconDashboard} label="Dashboard" active={nav === "dashboard"} onClick={() => setNav("dashboard")} />
          <SidebarNavItem icon={IconClients} label="My Clients" active={nav === "clients"} onClick={() => setNav("clients")} />
        </div>
      </Block>

      <Block title="DataTable (click a row)">
        <Card className="p-0">
          <DataTable
            columns={COLUMNS}
            data={ROWS}
            getRowKey={(r) => r.id}
            onRowClick={() => {}}
          />
        </Card>
      </Block>

      <Block title="AreaChart">
        <Card>
          <AreaChart data={REVENUE} xKey="month" yKey="value" valuePrefix="$" height={220} />
        </Card>
      </Block>
    </div>
  );
}
