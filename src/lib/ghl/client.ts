// GoHighLevel API v2 client. Server-side only: reads GHL_API_TOKEN from env.
// Read-only Private Integration token, scopes: View Contacts, View
// Opportunities, View Custom Fields. See docs/ghl-integration.md.
//
// Polling model (M5 phase 1): every fetch is cached for REVALIDATE_SECONDS via
// the Next.js data cache, so dashboards poll GHL at most once per window.
// Webhooks come later (M5 phase 2).

import { BRAND } from "@/lib/brand";
import type {
  GhlCalendar,
  GhlCalendarEvent,
  GhlContact,
  GhlContactsPage,
  GhlConversation,
  GhlConversationsPage,
  GhlCustomFieldDef,
  GhlMessage,
  GhlMessagesPage,
  GhlOpportunitiesPage,
  GhlOpportunity,
  GhlPipeline,
  GhlUser,
} from "./types";

const API_BASE = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";
const REVALIDATE_SECONDS = 300;
const PAGE_LIMIT = 100;

// Active brand's GHL sub-account. Env wins when set; otherwise the brand
// config's own location id, so a deploy can never silently read another
// client's sub-account (the old fallback hardcoded DP's).
export const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID ?? BRAND.ghlLocationId;

export function ghlConfigured(): boolean {
  return Boolean(process.env.GHL_API_TOKEN);
}

async function ghlFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = process.env.GHL_API_TOKEN;
  if (!token) throw new Error("GHL_API_TOKEN is not set");
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  // GHL's list endpoints intermittently 429 or return a 400 "Request Timeout
  // after 30000ms" on a slow page (seen on /contacts/ paginating the ~10k DP
  // book, 2026-07-15). Retry transient failures with backoff so one slow page
  // does not fail the whole sync; a real 4xx (bad params, auth) is not retried.
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: API_VERSION,
        Accept: "application/json",
      },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (res.ok) return (await res.json()) as T;
    // Read the body to tell a GHL-side timeout (retryable) from a real 400.
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    const transient =
      res.status === 429 ||
      res.status === 408 ||
      res.status >= 500 ||
      (res.status === 400 && /timeout/i.test(body));
    if (transient && attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      continue;
    }
    // Never log token or response bodies (may contain client PII).
    throw new Error(`GHL ${path} responded ${res.status}`);
  }
}

/** The GHL message type for an outbound send, from the thread's channel.
 *  Conservative: unknown channels return null and the send is refused rather
 *  than guessed onto the wrong channel. */
export function outboundMessageType(channel: string, rawChannel?: string | null): string | null {
  const raw = (rawChannel ?? "").toLowerCase();
  if (raw.includes("facebook") || raw === "fb") return "FB";
  if (raw.includes("sms")) return "SMS";
  if (raw.includes("live chat")) return null; // no reliable outbound mapping
  switch (channel) {
    case "whatsapp":
      return "WhatsApp";
    case "instagram":
      return "IG";
    case "email":
      return "Email";
    default:
      return null;
  }
}

/** Stage 2 write: send one message into an existing conversation's channel.
 *  Callers MUST pass assertOutreachAllowed first (enforced again in the
 *  server action); this function is transport only. */
export async function sendConversationMessage(input: {
  type: string;
  contactId: string;
  message: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.GHL_API_TOKEN;
  if (!token) return { ok: false, error: "GHL_API_TOKEN is not set" };
  const res = await fetch(`${API_BASE}/conversations/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Version: API_VERSION,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: input.type, contactId: input.contactId, message: input.message }),
    cache: "no-store",
  });
  if (!res.ok) {
    // 401 scope missing / 422 channel not sendable (e.g. WhatsApp outside the
    // 24h session window). Body withheld from logs (PII), status is enough.
    return { ok: false, error: `GHL send responded ${res.status}` };
  }
  return { ok: true };
}

export async function fetchCustomFieldDefs(): Promise<GhlCustomFieldDef[]> {
  const data = await ghlFetch<{ customFields: GhlCustomFieldDef[] }>(
    `/locations/${GHL_LOCATION_ID}/customFields`,
  );
  return data.customFields ?? [];
}

export async function fetchAllContacts(): Promise<GhlContact[]> {
  const all: GhlContact[] = [];
  let startAfterId: string | undefined;
  let startAfter: number | undefined;
  // Hard ceiling of 400 pages (40,000 contacts) as a runaway guard. Raised
  // from 50 (2026-07-15) then 200 (2026-07-24): the raw-DM flood grows the DP
  // book ~1.3k contacts/day and it passed 20,000, so 200 pages truncated
  // again. A silent cap here silently drops clients from the sync.
  for (let page = 0; page < 400; page++) {
    const params: Record<string, string> = {
      locationId: GHL_LOCATION_ID,
      limit: String(PAGE_LIMIT),
    };
    if (startAfterId) params.startAfterId = startAfterId;
    if (startAfter) params.startAfter = String(startAfter);
    const data = await ghlFetch<GhlContactsPage>("/contacts/", params);
    const batch = data.contacts ?? [];
    all.push(...batch);
    if (batch.length < PAGE_LIMIT) break;
    startAfterId = data.meta?.startAfterId;
    startAfter = data.meta?.startAfter;
    if (!startAfterId && !startAfter) break;
  }
  return all;
}

/** Single-contact fetch for webhook handling. Uncached: webhooks exist to
 *  beat the 5 minute poll window. Returns null on 404 (deleted contact). */
export async function fetchContactById(id: string): Promise<GhlContact | null> {
  const token = process.env.GHL_API_TOKEN;
  if (!token) throw new Error("GHL_API_TOKEN is not set");
  const res = await fetch(`${API_BASE}/contacts/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Version: API_VERSION, Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GHL contact fetch responded ${res.status}`);
  const data = (await res.json()) as { contact: GhlContact };
  return data.contact ?? null;
}

/** Single-opportunity fetch for webhook handling. Uncached. */
export async function fetchOpportunityById(id: string): Promise<GhlOpportunity | null> {
  const token = process.env.GHL_API_TOKEN;
  if (!token) throw new Error("GHL_API_TOKEN is not set");
  const res = await fetch(`${API_BASE}/opportunities/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Version: API_VERSION, Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GHL opportunity fetch responded ${res.status}`);
  const data = (await res.json()) as { opportunity: GhlOpportunity };
  return data.opportunity ?? null;
}

/** Location users: the lead owners / setters / closers referenced by id on
 *  opportunities (assignedTo) and appointments (assignedUserId). Cached on the
 *  standard poll window. Scope: View Users. Tolerates the older shape where the
 *  list is returned at the top level instead of under `users`. */
export async function fetchUsers(): Promise<GhlUser[]> {
  const data = await ghlFetch<{ users?: GhlUser[] } | GhlUser[]>("/users/", {
    locationId: GHL_LOCATION_ID,
  });
  if (Array.isArray(data)) return data;
  return data.users ?? [];
}

export async function fetchPipelines(): Promise<GhlPipeline[]> {
  const data = await ghlFetch<{ pipelines: GhlPipeline[] }>("/opportunities/pipelines", {
    locationId: GHL_LOCATION_ID,
  });
  return data.pipelines ?? [];
}

export async function fetchAllOpportunities(): Promise<GhlOpportunity[]> {
  const all: GhlOpportunity[] = [];
  // Cursor pagination (startAfter/startAfterId), NOT page numbers: GHL hard-
  // rejects page=101 with a 400, so page-based paging can never see past
  // 10,000 opportunities. The DP pipeline passed 17,000 (2026-07-24), which
  // silently dropped every stage change in the tail. Guard: 400 pages (40k).
  let startAfterId: string | undefined;
  let startAfter: number | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 400; page++) {
    const params: Record<string, string> = {
      location_id: GHL_LOCATION_ID,
      limit: String(PAGE_LIMIT),
    };
    if (startAfterId) params.startAfterId = startAfterId;
    if (startAfter) params.startAfter = String(startAfter);
    const data = await ghlFetch<GhlOpportunitiesPage>("/opportunities/search", params);
    const batch = (data.opportunities ?? []).filter((o) => o.id && !seen.has(o.id));
    for (const o of batch) seen.add(o.id);
    all.push(...batch);
    if (batch.length === 0) break;
    if ((data.opportunities ?? []).length < PAGE_LIMIT) break;
    startAfterId = data.meta?.startAfterId;
    startAfter = data.meta?.startAfter;
    if (!startAfterId && !startAfter) break;
  }
  return all;
}

// --- Conversations / Inbox (Stage 1 read) ---------------------------------
// Scope: View Conversations. Cached on the standard poll window so the inbox
// list does not hammer GHL; individual threads load on demand (uncached).

/** Conversation list for the inbox. `limit` caps the first page; the inbox is
 *  a recent-activity view, not a full archive, so one page is enough for now.
 *  VERIFY the exact query params + sort against live data. */
/** Recent conversations, paged DEEP (2026-07-05): the old single page of 50
 *  meant a burst on one channel (a weekend of IG DMs) pushed every WhatsApp
 *  thread out of the window and the Inbox looked like messages "disappeared".
 *  Pages via startAfterDate (threads sort newest-first by last message) until
 *  maxThreads or the feed is exhausted. */
export async function fetchConversations(maxThreads = 300): Promise<GhlConversation[]> {
  const out: GhlConversation[] = [];
  const seen = new Set<string>();
  let startAfterDate: number | undefined;
  for (let page = 0; page < Math.ceil(maxThreads / 100); page++) {
    const params: Record<string, string> = {
      locationId: GHL_LOCATION_ID,
      limit: "100",
      sortBy: "last_message_date",
      sort: "desc",
    };
    if (startAfterDate) params.startAfterDate = String(startAfterDate);
    const data = await ghlFetch<GhlConversationsPage>("/conversations/search", params);
    const batch = (data.conversations ?? []).filter((c) => !seen.has(c.id));
    if (batch.length === 0) break;
    for (const c of batch) seen.add(c.id);
    out.push(...batch);
    const last = batch[batch.length - 1];
    const lastMs = typeof last.lastMessageDate === "number" ? last.lastMessageDate : Date.parse(String(last.lastMessageDate ?? ""));
    if (!lastMs || Number.isNaN(lastMs)) break;
    startAfterDate = lastMs;
    if (out.length >= maxThreads) break;
  }
  return out.slice(0, maxThreads);
}

/** Messages for one thread. Uncached (cache: no-store): threads are opened on
 *  demand and should reflect the live conversation. GHL nests the array under
 *  messages.messages; we tolerate either shape. */
export async function fetchMessages(conversationId: string): Promise<GhlMessage[]> {
  const token = process.env.GHL_API_TOKEN;
  if (!token) throw new Error("GHL_API_TOKEN is not set");
  const res = await fetch(
    `${API_BASE}/conversations/${conversationId}/messages`,
    {
      headers: { Authorization: `Bearer ${token}`, Version: API_VERSION, Accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`GHL messages responded ${res.status}`);
  const data = (await res.json()) as GhlMessagesPage & { messages?: unknown };
  // Documented shape: { messages: { messages: [...] } }. Some accounts return
  // { messages: [...] } directly; handle both.
  const nested = data.messages;
  if (Array.isArray(nested)) return nested as GhlMessage[];
  return nested?.messages ?? [];
}

// --- Calendar (Stage 1 read) ----------------------------------------------

export async function fetchCalendars(): Promise<GhlCalendar[]> {
  const data = await ghlFetch<{ calendars: GhlCalendar[] }>("/calendars/", {
    locationId: GHL_LOCATION_ID,
  });
  return data.calendars ?? [];
}

/** Calendar events (appointments) in a time window. startTime/endTime are epoch
 *  milliseconds. Verified against live DP data 2026-06-21: the events endpoint
 *  rejects a bare locationId query with 422 "Either of userId, calendarId or
 *  groupId is required", so we read the location's calendars and fan out one
 *  query per calendar, then aggregate (deduped by event id). A single calendar
 *  failing is skipped, not fatal; no calendars / no events is an honest empty
 *  state, never a throw. */
export async function fetchCalendarEvents(
  startTimeMs: number,
  endTimeMs: number,
): Promise<GhlCalendarEvent[]> {
  let calendars: GhlCalendar[];
  try {
    calendars = await fetchCalendars();
  } catch {
    return [];
  }
  const byId = new Map<string, GhlCalendarEvent>();
  // Bounded fan-out: the DP location has a handful of calendars (guard at 50).
  for (const cal of calendars.slice(0, 50)) {
    if (!cal.id) continue;
    try {
      const data = await ghlFetch<{ events?: GhlCalendarEvent[] }>("/calendars/events", {
        locationId: GHL_LOCATION_ID,
        calendarId: cal.id,
        startTime: String(startTimeMs),
        endTime: String(endTimeMs),
      });
      for (const e of data.events ?? []) if (e?.id) byId.set(e.id, e);
    } catch {
      // Skip a calendar that errors (e.g. an event-type calendar with no
      // bookings) so one bad calendar does not blank the whole grid.
    }
  }
  return [...byId.values()];
}
