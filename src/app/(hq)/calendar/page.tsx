import { CalendarView } from "@/components/screens/calendar/calendar-view";
import { ConnectCalendarPanel } from "@/components/screens/calendar/connect-calendar-panel";
import { getCalendarData, liveMode } from "@/lib/data";
import { getConnectedCalendarUrl } from "@/lib/calendar-connect-actions";
import { maskIcalUrl, parseIcalEvents } from "@/lib/ical";
import type { CalendarEvent } from "@/lib/seed/m4";

// R12-13 (approved: iCal feed, no OAuth): a connected personal calendar is
// fetched server-side (the secret URL never reaches the browser) and merged
// into the month as "personal" events beside the GHL bookings.
export default async function CalendarPage() {
  const events = await getCalendarData();
  const icalUrl = await getConnectedCalendarUrl();
  let personal: CalendarEvent[] = [];
  if (icalUrl) {
    try {
      const res = await fetch(icalUrl, { next: { revalidate: 600 }, signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const now = new Date();
        const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
        personal = parseIcalEvents(await res.text(), from, to).map((e, i) => ({
          id: `ical-${i}`,
          date: e.date,
          title: e.title,
          type: "personal" as const,
        }));
      }
    } catch {
      // Feed unreachable: the calendar still renders GHL events; the panel
      // stays connected so a transient outage is not a disconnect.
    }
  }
  return (
    <div className="space-y-4">
      <CalendarView events={[...events, ...personal]} live={liveMode()} />
      <ConnectCalendarPanel maskedUrl={icalUrl ? maskIcalUrl(icalUrl) : null} />
    </div>
  );
}
