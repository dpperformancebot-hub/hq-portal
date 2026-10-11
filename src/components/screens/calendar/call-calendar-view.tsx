"use client";

import { Card, DataTable, PageHeader, type Column } from "@/components/ui";
import type { CallBooking } from "@/lib/seed";

/** ISO date (YYYY-MM-DD) -> readable label. Parsed from components so the day
 *  never shifts across timezones. */
const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};

const COLUMNS: Column<CallBooking>[] = [
  { key: "date", header: "Date", width: "120px", render: (b) => <span className="text-fg-dim">{formatDate(b.date)}</span> },
  { key: "time", header: "Time", width: "100px", render: (b) => <span className="text-fg">{b.time}</span> },
  {
    key: "name",
    header: "With",
    render: (b) => (
      <span className="flex items-center gap-2">
        <span className="font-medium text-fg">{b.name}</span>
        <span className="rounded-pill bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg-muted">{b.kind}</span>
      </span>
    ),
  },
  { key: "setter", header: "Setter", render: (b) => <span className="text-fg-dim">{b.setter}</span> },
  { key: "closer", header: "Closer", render: (b) => <span className="text-fg-dim">{b.closer}</span> },
  { key: "channel", header: "Channel", width: "100px", render: (b) => <span className="text-fg-dim">{b.channel}</span> },
];

export function CallCalendarView({ bookings, live }: { bookings: CallBooking[]; live: boolean }) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Brand"
        title="Call Calendar"
        subtitle={live ? "Upcoming booked calls. Live from GoHighLevel." : "Booked calls. Pulls from Calendly later."}
      />
      <Card className="p-2">
        <DataTable columns={COLUMNS} data={bookings} getRowKey={(b) => b.id} emptyMessage="No calls booked." />
      </Card>
    </div>
  );
}
