// R12-13 (approved: iCal feed, NO OAuth): minimal .ics parsing for the
// per-coach personal calendar. A coach pastes their calendar's secret iCal
// address (Google: Settings -> "Secret address in iCal format"); the server
// fetches the feed and these pure helpers turn it into dated events for the
// portal Calendar. Deliberately small: SUMMARY + DTSTART, with weekly/daily
// RRULE expansion inside the requested window (team meetings are weekly).
// Monthly/yearly recurrences render their literal DTSTART only - honest,
// documented, and avoidable complexity until someone actually needs them.

export type IcalEvent = { date: string; title: string };

const DAY = 86_400_000;
const BYDAY: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 };

/** Unfold RFC 5545 folded lines (continuation lines start with a space/tab). */
function unfold(ics: string): string[] {
  const out: string[] = [];
  for (const raw of ics.split(/\r?\n/)) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.length) out[out.length - 1] += raw.slice(1);
    else out.push(raw);
  }
  return out;
}

/** DTSTART value ("20260819", "20260819T093000", "...Z") -> local YYYY-MM-DD.
 *  All-day DATE values pass through; timed values collapse to their date.
 *  TZID subtleties are ignored on purpose: day-granularity display. */
function toDate(value: string): string | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Parse an .ics feed into events within [from, to] (inclusive ISO dates). */
export function parseIcalEvents(ics: string, from: string, to: string): IcalEvent[] {
  const out: IcalEvent[] = [];
  let inEvent = false;
  let summary = "";
  let dtstart: string | null = null;
  let rrule: string | null = null;

  const flush = () => {
    if (!dtstart) return;
    const title = summary.trim().replace(/\\,/g, ",").replace(/\;/g, ";").replace(/\\n/g, " ").slice(0, 120) || "Busy";
    if (!rrule) {
      if (dtstart >= from && dtstart <= to) out.push({ date: dtstart, title });
      return;
    }
    // Weekly/daily expansion inside the window.
    const freq = /FREQ=(WEEKLY|DAILY)/.exec(rrule)?.[1];
    if (!freq) {
      if (dtstart >= from && dtstart <= to) out.push({ date: dtstart, title });
      return;
    }
    const interval = Number(/INTERVAL=(\d+)/.exec(rrule)?.[1] ?? 1) || 1;
    const until = /UNTIL=(\d{8})/.exec(rrule)?.[1];
    const untilIso = until ? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` : null;
    const count = Number(/COUNT=(\d+)/.exec(rrule)?.[1] ?? 0) || null;
    const bydays = (/BYDAY=([A-Z,0-9-]+)/.exec(rrule)?.[1] ?? "")
      .split(",")
      .map((d) => BYDAY[d.replace(/^[-+]?\d+/, "")])
      .filter((d) => d !== undefined);
    const start = Date.parse(dtstart + "T00:00:00Z");
    const windowEnd = Date.parse(to + "T00:00:00Z");
    let occurrences = 0;
    for (let t = start; t <= windowEnd; t += DAY) {
      const iso = new Date(t).toISOString().slice(0, 10);
      const dow = new Date(t).getUTCDay();
      const daysFromStart = Math.round((t - start) / DAY);
      let hit = false;
      if (freq === "DAILY") hit = daysFromStart % interval === 0;
      else {
        const weeksFromStart = Math.floor(daysFromStart / 7);
        const dayMatch = bydays.length ? bydays.includes(dow) : dow === new Date(start).getUTCDay();
        hit = dayMatch && weeksFromStart % interval === 0;
      }
      if (!hit) continue;
      occurrences++;
      if (count && occurrences > count) break;
      if (untilIso && iso > untilIso) break;
      if (iso >= from && iso <= to) out.push({ date: iso, title });
      if (out.length >= 200) return out; // hard cap, feed sanity
    }
  };

  for (const line of unfold(ics)) {
    if (line.startsWith("BEGIN:VEVENT")) {
      inEvent = true;
      summary = "";
      dtstart = null;
      rrule = null;
    } else if (line.startsWith("END:VEVENT")) {
      if (inEvent) flush();
      inEvent = false;
    } else if (inEvent) {
      if (line.startsWith("SUMMARY")) summary = line.slice(line.indexOf(":") + 1);
      else if (line.startsWith("DTSTART")) dtstart = toDate(line.slice(line.indexOf(":") + 1));
      else if (line.startsWith("RRULE:")) rrule = line.slice(6);
    }
  }
  return out;
}

/** Accept only https feeds from known calendar providers (SSRF containment:
 *  the server fetches this URL, so it must never be a private address). */
export function isAllowedIcalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host === "calendar.google.com" ||
      host.endsWith(".icloud.com") ||
      host === "outlook.live.com" ||
      host === "outlook.office365.com" ||
      host.endsWith(".calendar.yahoo.com")
    );
  } catch {
    return false;
  }
}

/** Mask a stored feed URL for display (the path carries the secret). */
export function maskIcalUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}/…${url.slice(-8)}`;
  } catch {
    return "connected";
  }
}
