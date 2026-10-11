import { Button, Card, PageHeader } from "@/components/ui";
import type { CalendarEvent, EventType } from "@/lib/seed";

const TYPE_STYLE: Record<EventType, string> = {
  personal: "bg-accent-soft text-accent-deep",
  call: "bg-plan-weekly text-plan-weekly-fg",
  content: "bg-type-template text-type-template-fg",
  launch: "bg-type-video text-type-video-fg",
  internal: "bg-surface-2 text-fg-dim",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView({ events, live }: { events: CalendarEvent[]; live: boolean }) {
  // Renders the current calendar month. Live events come from GHL appointments
  // for this month; seed events are dated into the current month for the demo.
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const monthLabel = now.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first offset.
  const lead = (first.getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const mm = String(month + 1).padStart(2, "0");
  const eventsOn = (day: number) =>
    events.filter((e) => e.date === `${year}-${mm}-${String(day).padStart(2, "0")}`);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Brand"
        title="Calendar"
        subtitle={live ? `${monthLabel}. Live from GoHighLevel.` : `${monthLabel}. Pulls from Google Calendar later.`}
        actions={<Button size="sm">Add event</Button>}
      />

      {/* Legend reflects only the event types actually present, so live mode
          (where GHL appointments all classify as "call") does not advertise
          categories that never appear. */}
      <div className="flex flex-wrap gap-3 text-xs text-fg-dim">
        {(["call", "content", "launch", "internal", "personal"] as EventType[])
          .filter((t) => events.some((e) => e.type === t))
          .map((t) => (
            <span key={t} className="flex items-center gap-1.5 capitalize">
              <span className={`h-2.5 w-2.5 rounded-pill ${TYPE_STYLE[t].split(" ")[0]}`} />
              {t}
            </span>
          ))}
      </div>

      <Card className="p-0">
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => (
            <div
              key={i}
              className={`min-h-24 border-b border-r border-border-soft p-2 ${(i + 1) % 7 === 0 ? "border-r-0" : ""}`}
            >
              {day ? (
                <>
                  <div className="mb-1 text-xs tabular-nums text-fg-muted">{day}</div>
                  <div className="space-y-1">
                    {eventsOn(day).map((e) => (
                      <div key={e.id} className={`truncate rounded-sm px-1.5 py-0.5 text-[11px] ${TYPE_STYLE[e.type]}`}>
                        {e.title}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
