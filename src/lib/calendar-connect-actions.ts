"use server";

// R12-13: connect a personal calendar by secret iCal address (approved: no
// OAuth). The URL is stored per-LOGIN in user_state (existing table, no
// migration) and only ever fetched server-side; the UI sees a masked form.
// Validation is an https + known-provider allowlist so the server never
// fetches an arbitrary or private address (SSRF containment in lib/ical.ts).

import { revalidatePath } from "next/cache";
import { isAllowedIcalUrl } from "@/lib/ical";
import { getUserStateAction, setUserStateAction } from "@/lib/user-state-actions";

// state_key in user_state (inlined: "use server" files may only export async fns).
const CALENDAR_ICAL_KEY = "calendar_ical_url";

type Result = { ok: true } | { ok: false; error: string };

export async function connectCalendarAction(url: string): Promise<Result> {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return { ok: false, error: "Paste your calendar's iCal address first." };
  if (!isAllowedIcalUrl(trimmed)) {
    return {
      ok: false,
      error:
        "That does not look like a calendar feed. Use the https iCal address from Google Calendar (Settings, then Secret address in iCal format), iCloud, or Outlook.",
    };
  }
  const res = await setUserStateAction(CALENDAR_ICAL_KEY, trimmed);
  if (!res.ok) return { ok: false, error: res.error ?? "Could not save the calendar link." };
  revalidatePath("/calendar");
  return { ok: true };
}

export async function disconnectCalendarAction(): Promise<Result> {
  const res = await setUserStateAction(CALENDAR_ICAL_KEY, null);
  if (!res.ok) return { ok: false, error: res.error ?? "Could not disconnect." };
  revalidatePath("/calendar");
  return { ok: true };
}

/** The stored feed URL for the signed-in login (server-side use only). */
export async function getConnectedCalendarUrl(): Promise<string | null> {
  const v = await getUserStateAction(CALENDAR_ICAL_KEY);
  return typeof v === "string" && v ? v : null;
}
