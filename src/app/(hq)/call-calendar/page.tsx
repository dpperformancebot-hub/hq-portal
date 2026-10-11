import { CallCalendarView } from "@/components/screens/calendar/call-calendar-view";
import { getCallCalendarData, liveMode } from "@/lib/data";

export default async function CallCalendarPage() {
  const bookings = await getCallCalendarData();
  return <CallCalendarView bookings={bookings} live={liveMode()} />;
}
