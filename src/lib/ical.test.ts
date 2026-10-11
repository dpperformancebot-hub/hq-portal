import { describe, expect, it } from "vitest";
import { isAllowedIcalUrl, maskIcalUrl, parseIcalEvents } from "./ical";

const FEED = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "SUMMARY:Team meeting",
  "DTSTART;TZID=Australia/Brisbane:20260803T093000",
  "RRULE:FREQ=WEEKLY;BYDAY=MO",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:PT session\\, gym",
  "DTSTART;VALUE=DATE:20260820",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:Outside window",
  "DTSTART:20261225T100000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseIcalEvents (R12-13)", () => {
  it("returns single events inside the window with unescaped titles", () => {
    const ev = parseIcalEvents(FEED, "2026-08-17", "2026-08-23");
    expect(ev.some((e) => e.date === "2026-08-20" && e.title === "PT session, gym")).toBe(true);
    expect(ev.some((e) => e.title === "Outside window")).toBe(false);
  });
  it("expands weekly recurrences onto each Monday in the window", () => {
    const ev = parseIcalEvents(FEED, "2026-08-17", "2026-08-31").filter((e) => e.title === "Team meeting");
    expect(ev.map((e) => e.date)).toEqual(["2026-08-17", "2026-08-24", "2026-08-31"]);
  });
  it("handles folded lines", () => {
    const folded = "BEGIN:VEVENT\r\nSUMMARY:Long\r\n  title\r\nDTSTART:20260818\r\nEND:VEVENT";
    const ev = parseIcalEvents(folded, "2026-08-01", "2026-08-31");
    expect(ev[0].title).toBe("Long title");
  });
});

describe("isAllowedIcalUrl", () => {
  it("accepts the big three providers over https", () => {
    expect(isAllowedIcalUrl("https://calendar.google.com/calendar/ical/x/private-abc/basic.ics")).toBe(true);
    expect(isAllowedIcalUrl("https://p123-caldav.icloud.com/published/2/xyz")).toBe(true);
  });
  it("rejects http, other hosts, and garbage (SSRF containment)", () => {
    expect(isAllowedIcalUrl("http://calendar.google.com/a.ics")).toBe(false);
    expect(isAllowedIcalUrl("https://169.254.169.254/latest")).toBe(false);
    expect(isAllowedIcalUrl("https://internal.local/feed.ics")).toBe(false);
    expect(isAllowedIcalUrl("not a url")).toBe(false);
  });
});

describe("maskIcalUrl", () => {
  it("never shows the secret path", () => {
    const masked = maskIcalUrl("https://calendar.google.com/calendar/ical/SECRETSECRET/basic.ics");
    expect(masked).not.toContain("SECRETSECRET");
    expect(masked).toContain("calendar.google.com");
  });
});
