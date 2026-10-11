// Maps raw GHL contacts/opportunities onto the app's data contracts
// (src/lib/seed/types.ts). Normalisation rules follow the real DP master
// sheet conventions documented in DATA-MODEL.md and BUILD-SPEC.md section 4:
// status, check-in frequency, billing frequency, PIF and term length live in
// the 16 GHL contact custom fields created for the DP build.
//
// MRR maths: monthlyRate = weeklyRate x 52 / 12 (weekly-equivalent). PIF
// clients carry the same weekly-equivalent while inside their term, so a
// naive sum stays correct; cash facts come from Stripe at retainer phase.

import type {
  Client,
  ClientStatus,
  Coach,
  JourneyStage,
  Lead,
  LeadSource,
  LeadStage,
  OnboardingType,
  Plan,
} from "@/lib/seed/types";
import type {
  GhlCalendarEvent,
  GhlContact,
  GhlConversation,
  GhlCustomFieldDef,
  GhlMessage,
  GhlOpportunity,
  GhlPipeline,
  GhlUser,
} from "./types";
import { SALES_ROLES, salesRole, type SalesRole } from "@/lib/sales-config";
// Type-only imports from the m4 seed module (the inbox/calendar contracts).
// Type-only, so no runtime cycle with the seed barrel.
import type {
  CalendarEvent,
  CallBooking,
  Conversation,
  ConversationMessage,
  InboxChannel,
} from "@/lib/seed/m4";
import { DEFAULT_COACH_CAPACITY } from "@/lib/coach-config";
import { BRAND } from "@/lib/brand";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Build contact-custom-field lookup: defId -> normalised field name. */
export function fieldNameById(defs: GhlCustomFieldDef[]): Map<string, string> {
  return new Map(defs.map((d) => [d.id, norm(d.name)]));
}

function fieldValue(
  contact: GhlContact,
  byId: Map<string, string>,
  wanted: string,
): string | null {
  for (const f of contact.customFields ?? []) {
    if (byId.get(f.id) === wanted) {
      if (f.value == null) return null;
      return Array.isArray(f.value) ? f.value.join(",") : String(f.value);
    }
  }
  return null;
}

function parseStatus(raw: string | null): ClientStatus | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "active") return "active";
  if (v === "paused") return "paused";
  if (v === "cancelled" || v === "canceled") return "cancelled";
  if (v === "past") return "past";
  return null;
}

function parsePlan(raw: string | null): Plan {
  const v = (raw ?? "").trim().toLowerCase();
  if (v.startsWith("fort")) return "Fortnightly";
  if (v.startsWith("month")) return "Monthly";
  return "Weekly";
}

/** Conditional onboarding pathway. GHL stores this as a free-text/dropdown
 *  custom field; we normalise to the three known flows and leave anything
 *  unrecognised (or absent) null so the UI shows nothing rather than a guess. */
function parseOnboarding(raw: string | null): OnboardingType | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v.includes("challenge")) return "Challenge";
  if (v.includes("photo") || v.includes("shoot")) return "Photoshoot";
  if (v.includes("standard")) return "Standard";
  return null;
}

/** GHL date custom fields arrive as epoch milliseconds (number). Accept that,
 *  epoch-ms strings, and ISO strings; emit ISO "YYYY-MM-DD" or null. */
function toIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  const t = /^\d{11,14}$/.test(raw) ? Number(raw) : Date.parse(raw);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

export const WEEKS = (iso: string | null): number => {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (7 * 86_400_000)));
};

export function journeyStage(
  status: ClientStatus,
  weeks: number,
  termLength: number | null,
  termEnd: string | null,
): JourneyStage {
  if (status === "cancelled" || status === "past") return "Renewed/Graduated";
  if (weeks < 2) return "Onboarding";
  if (termEnd) {
    const daysToEnd = (Date.parse(termEnd) - Date.now()) / 86_400_000;
    if (!Number.isNaN(daysToEnd) && daysToEnd <= 21 && daysToEnd > -7) return "Approaching Renewal";
  }
  // PIF re-sign window: active week 13-14 of a 16-week term (scaled for longer terms).
  if (termLength && weeks >= termLength - 3 && weeks <= termLength) return "Approaching Renewal";
  if (weeks >= 8 && weeks <= 10) return "Mid-Program Review";
  return "Active";
}

/** Like parseSource but returns undefined for unrecognised values instead of
 *  the Instagram default, so callers can fall through to better signals. */
function strictSource(raw: string | null | undefined): LeadSource | undefined {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "tiktok") return "TikTok";
  if (v === "instagram") return "Instagram";
  if (v === "ambassador") return "Ambassador";
  if (v === "referral") return "Referral";
  return undefined;
}

function parseSource(raw: string | null, tags: string[] | undefined): LeadSource {
  const v = (raw ?? "").trim().toLowerCase();
  const t = (tags ?? []).map((x) => x.toLowerCase());
  if (v === "instagram" || t.includes("instagram")) return "Instagram";
  if (v === "tiktok" || t.includes("tiktok")) return "TikTok";
  if (v === "ambassador" || t.includes("ambassador")) return "Ambassador";
  if (v === "referral") return "Referral";
  return "Instagram"; // dominant channel; unknowns are tag-crosschecked by the VA
}

const COACH_DEFAULTS = { maxCapacity: 30, weeklyRate: 25, fortnightlyRate: 15 };

/** R19-6: which GHL fields this contact ACTUALLY had a value for.
 *
 *  The mapper has to return something for every field, so a blank CRM field
 *  becomes a default: plan became "Weekly", rate became 0, source became
 *  "Instagram". Projected onto an existing row those defaults overwrite real
 *  portal data, which is how 18 TJD clients silently moved from fortnightly to
 *  weekly and started being paid at the wrong rate. The mapped value alone
 *  cannot tell you whether GHL said "Weekly" or said nothing, so the mapper
 *  reports presence separately and the projection keeps what the portal holds
 *  whenever a field was absent. */
export type GhlPresentField =
  | "plan" | "startDate" | "endDate" | "billingFrequency" | "weeklyRate" | "termLength" | "source";

export type MappedRoster = {
  clients: Client[];
  coaches: Coach[];
  /** contact id -> the fields GHL actually carried a value for. */
  present: Map<string, Set<GhlPresentField>>;
};

/** Which contacts are coaching clients depends on the brand's GHL shape
 *  (BRAND.roster): DP identifies clients by a populated Status custom field;
 *  TJD identifies them by a `client` tag (Status/coach/rate live in the HQ,
 *  not GHL). Non-client contacts (GHL example contacts, raw leads) are excluded. */
export function mapContactsToRoster(
  contacts: GhlContact[],
  defs: GhlCustomFieldDef[],
): MappedRoster {
  const byId = fieldNameById(defs);
  const coachIds = new Map<string, string>(); // name -> id
  const coaches: Coach[] = [];
  const clients: Client[] = [];
  const present = new Map<string, Set<GhlPresentField>>();

  for (const c of contacts) {
    let status = parseStatus(fieldValue(c, byId, "status"));
    // Tag-identified clients (TJD): a `client` tag with no Status field is an
    // active client. Brand-gated so DP, whose lead contacts sometimes carry a
    // `client` tag, stays strictly status-based and is unaffected.
    if (!status && BRAND.roster.clientTag && (c.tags ?? []).some((t) => t.toLowerCase() === "client")) {
      status = "active";
    }
    if (!status) continue;

    const name =
      c.contactName?.trim() ||
      [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
      "Unknown";

    const coachName = (fieldValue(c, byId, "assignedcoach") ?? "").trim();
    let coachId: string | null = null;
    if (coachName) {
      const existing = coachIds.get(coachName);
      if (existing) {
        coachId = existing;
      } else {
        coachId = `ghl-co-${norm(coachName)}`;
        coachIds.set(coachName, coachId);
        coaches.push({
          id: coachId,
          name: coachName,
          // Head coach by first name, so "Angus" or "Angus Stals" both match.
          // R9-1: per-brand head-coach naming (DP: Angus arrives named from
          // GHL; TJD manages the tier in the portal, so no name matches).
          role:
            BRAND.roster.headCoachFirstName !== null &&
            coachName.trim().toLowerCase().split(" ")[0] === BRAND.roster.headCoachFirstName
              ? "head_coach"
              : "coach",
          ...COACH_DEFAULTS,
          // R17-4: this path builds a coach straight from a GHL contact, so
          // there is no coaches row to read a capacity from yet. The stored
          // value takes over once the sync has created the row.
          maxCapacity: DEFAULT_COACH_CAPACITY,
          // Performance metrics need check-in history (Kahunas, no API) or
          // cancelled-client history; zeroed until those land.
          adherence: 0,
          avgResponseHours: 0,
          retention: 0,
          churn: 0,
        });
      }
    }

    const rawRate = fieldValue(c, byId, "weeklyrate");
    const rawPlan = fieldValue(c, byId, "checkinfrequency");
    const rawBilling = fieldValue(c, byId, "billingfrequency");
    const rawTermLength = fieldValue(c, byId, "termlength");
    const rawStart = fieldValue(c, byId, "startdate");
    const rawTermEnd = fieldValue(c, byId, "termenddate");
    const rawSource = fieldValue(c, byId, "leadsource");

    const weeklyRate = Number(rawRate ?? 0) || 0;
    const startDate = toIsoDate(rawStart);
    const termLengthRaw = Number(rawTermLength ?? 0) || 0;
    const termLength = termLengthRaw > 0 ? termLengthRaw : null;
    const termEnd = toIsoDate(rawTermEnd);
    const weeks = WEEKS(startDate);

    // R19-6: record what GHL actually SAID, before any default is applied.
    // A field counts as present only when it carries a usable value, so a
    // blank or unreadable cell can never be mistaken for an instruction.
    const has = new Set<GhlPresentField>();
    const filled = (v: string | null) => typeof v === "string" && v.trim() !== "";
    if (filled(rawPlan)) has.add("plan");
    if (filled(rawBilling)) has.add("billingFrequency");
    if (startDate) has.add("startDate");
    if (termEnd) has.add("endDate");
    if (termLength !== null) has.add("termLength");
    if (filled(rawRate) && weeklyRate > 0) has.add("weeklyRate");
    // Source is also derivable from tags, so presence follows the same rule
    // the parser uses rather than the custom field alone.
    if (strictSource(rawSource) || (c.tags ?? []).some((t) => ["instagram", "tiktok", "ambassador"].includes(t.toLowerCase()))) {
      has.add("source");
    }
    present.set(c.id, has);

    clients.push({
      id: c.id,
      name,
      plan: parsePlan(rawPlan),
      monthlyRate: Math.round((weeklyRate * 52) / 12),
      // R17-1a: NO fallback. dateAdded is when the CONTACT was created, which
      // for a Newie signup is the payment date, and presenting that as a
      // program start is the bug this round fixes. Unknown stays unknown.
      startDate,
      endDate: termEnd, // cancellation date (cancelled) or upcoming term end (active PIF)
      billingFrequency: fieldValue(c, byId, "billingfrequency"),
      weeklyRate,
      termLength,
      onboardingType: parseOnboarding(fieldValue(c, byId, "onboardingtype")),
      status,
      coachId,
      source: parseSource(rawSource, c.tags),
      lastCheckIn: null, // check-ins live in Kahunas (no API); starts fresh per owner decision
      checkInCode: status === "paused" ? "P" : status === "cancelled" ? "C" : "N",
      cashCollected: weeklyRate * (termLength ? Math.min(weeks, termLength) : weeks),
      journeyStage: journeyStage(status, weeks, termLength, termEnd),
      weightStart: 0,
      weightCurrent: 0,
    });
  }

  coaches.sort((a, b) => a.name.localeCompare(b.name));
  return { clients, coaches, present };
}

// GHL pipeline stage names -> HQ LeadStage. Keys are norm()'d (lowercased,
// non-alphanumerics stripped) stage names, so spelling/spacing drift collapses
// to one key. Verified READ-ONLY against the live DP location 2026-06-22: two
// pipelines exist and both feed HQ leads (fetchAllOpportunities pulls every
// opportunity, no pipeline filter), so both are mapped here.
//
//   Pipeline "Client Acquisition" (the sales pipeline):
//     New Inquiry, In Conversation, Call Booked, Call Taken, No Show,
//     Follow Up, Won / New Client, Lost
//   Pipeline "Marketing Pipeline":
//     New Lead, Hot Lead, New Booking, Visit Attended, Sale, Left a Review
//
// Won/lost are also driven by opportunity.status (won->Submitted, lost->Lost)
// in mapOpportunitiesToLeads, which overrides whatever the stage maps to.
// Unrecognised stages fall back to "New Enquiry" (parse defensively).
const STAGE_MAP: Record<string, LeadStage> = {
  // --- Client Acquisition (sales pipeline), live stage names ---------------
  newinquiry: "New Enquiry", // GHL spelling ("Inquiry")
  newenquiry: "New Enquiry", // HQ/AU spelling synonym, kept for drift
  inconversation: "Contacted",
  // Dan's spec 2026-08-09: new stage between In Conversation and Call Booked.
  // Brands without it in Brand.pipelineStages collapse it to Contacted below.
  calloffered: "Call Offered",
  callbooked: "Call Booked",
  calltaken: "Call Taken",
  noshow: "Follow-Up",
  followup: "Follow-Up",
  wonnewclient: "New Client Processing", // "Won / New Client"
  won: "New Client Processing", // bare synonym
  lost: "Lost",
  // --- Marketing Pipeline, live stage names --------------------------------
  newlead: "New Enquiry",
  hotlead: "Contacted",
  newbooking: "Call Booked",
  visitattended: "Call Taken",
  sale: "New Client Processing",
  leftareview: "New Client Processing", // post-sale terminal; no closer HQ stage
};

// Suggested next step per stage. GHL opportunities have no native "next action"
// field, so this is a deterministic workflow hint (not invented lead data): it
// tells the rep what the stage's job is. Won/lost stages have nothing pending.
const NEXT_ACTION_BY_STAGE: Record<LeadStage, string> = {
  "New Enquiry": "Reach out and qualify",
  Contacted: "Book consult call",
  "Call Offered": "Lock in a call time",
  "Call Booked": "Run consult call",
  "Call Taken": "Send proposal and follow up",
  "Follow-Up": "Follow up to close",
  "New Client Processing": "Complete onboarding",
  Submitted: "",
  Lost: "",
};

/** contactId -> lead source, parsed from the full contact's leadsource custom
 *  field (with a tag cross-check), the same way the roster derives source. The
 *  opportunity's embedded `contact` rarely carries custom fields, so this map
 *  built from the full contact list is the reliable source signal. */
export function contactSourceMap(
  contacts: GhlContact[],
  defs: GhlCustomFieldDef[],
): Map<string, LeadSource> {
  const byId = fieldNameById(defs);
  const out = new Map<string, LeadSource>();
  for (const c of contacts) out.set(c.id, parseSource(fieldValue(c, byId, "leadsource"), c.tags));
  return out;
}

/** Best-effort contact channels for a lead, derived from the contact record:
 *  a phone implies WhatsApp/SMS reach (priority 1), an email implies email
 *  reach (priority 2). Drives the ordered channel chips on the lead drawer. */
function leadChannels(contact: GhlContact | null | undefined): Lead["contactChannels"] {
  const channels: Lead["contactChannels"] = [];
  if (contact?.phone) channels.push({ channel: "whatsapp", priority: 1 });
  if (contact?.email) channels.push({ channel: "email", priority: 2 });
  return channels;
}

export function mapOpportunitiesToLeads(
  opps: GhlOpportunity[],
  pipelines: GhlPipeline[],
  contactSourceById?: Map<string, LeadSource>,
): Lead[] {
  const stageNameById = new Map<string, string>();
  for (const p of pipelines) for (const s of p.stages) stageNameById.set(s.id, s.name);

  return opps.map((o) => {
    const stageName = norm(stageNameById.get(o.pipelineStageId ?? "") ?? "");
    let stage: LeadStage = STAGE_MAP[stageName] ?? "New Enquiry";
    // A stage this brand does not run collapses to its funnel neighbour
    // instead of vanishing (Call Offered exists on DP only, per Dan's spec).
    if (stage === "Call Offered" && !BRAND.pipelineStages.includes("Call Offered")) {
      stage = "Contacted";
    }
    if (o.status === "won") stage = "Submitted";
    if (o.status === "lost" || o.status === "abandoned") stage = "Lost";
    const name =
      o.contact?.contactName?.trim() ||
      [o.contact?.firstName, o.contact?.lastName].filter(Boolean).join(" ").trim() ||
      o.name?.trim() ||
      "Unknown lead";
    // Source priority (2026-07-02, Typeform Zap readiness): the opportunity's
    // own Lead Source (what the Zap sets) wins when recognised; then the
    // contact's source field; then contact tags; then the parseSource default.
    const source =
      strictSource(o.source) ??
      (o.contactId ? contactSourceById?.get(o.contactId) : undefined) ??
      parseSource(null, o.contact?.tags);
    return {
      id: o.id,
      name,
      source,
      stage,
      ownerId: o.assignedTo ?? "",
      ownerName: "", // resolved at read time via the GHL users map (enrichLeadOwners)
      lastActivity: (o.updatedAt ?? o.createdAt ?? "").slice(0, 10),
      nextAction: NEXT_ACTION_BY_STAGE[stage],
      value: o.monetaryValue ?? 0,
      stageEnteredAt: (o.lastStageChangeAt ?? o.lastStatusChangeAt ?? o.createdAt ?? "").slice(0, 10),
      contactChannels: leadChannels(o.contact),
    };
  });
}

// ===========================================================================
// Sales reps (setters / closers). Opportunities and appointments reference the
// owner by GHL user id (assignedTo / assignedUserId); resolve to a display name
// here, then sales-config.ts (Lucas=setter, Lilli=closer) classifies the role.
// ===========================================================================

/** GHL user id -> display name. */
export function userNameById(users: GhlUser[]): Map<string, string> {
  return new Map(
    users.map((u) => [
      u.id,
      (u.name?.trim() ||
        [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
        "").trim(),
    ]),
  );
}

/** Sales role from a full GHL display name. Config keys are first names
 *  (e.g. "lucas"), so try the whole name then the first word. */
export function looseSalesRole(name: string | null | undefined): SalesRole | null {
  const v = (name ?? "").trim();
  if (!v) return null;
  return salesRole(v) ?? salesRole(v.split(/\s+/)[0] ?? "");
}

/** The sales-config key (lowercased first name) a GHL owner name maps to, or
 *  null when the owner is not a configured setter/closer. */
export function salesRepKey(name: string | null | undefined): string | null {
  const v = (name ?? "").trim().toLowerCase();
  if (!v) return null;
  if (SALES_ROLES[v]) return v;
  const first = v.split(/\s+/)[0] ?? "";
  return first && SALES_ROLES[first] ? first : null;
}

// ===========================================================================
// STAGE 1 (read): Inbox + Calendar mappers. GHL conversation/calendar/event
// shapes onto the existing m4 contracts. The exact GHL channel-type enum and
// date encodings are confirmed against live data at verification; the helpers
// below are deliberately tolerant (ISO or epoch ms; nested or flat).
// ===========================================================================

const DAY_MS = 86_400_000;

/** GHL dates arrive as ISO strings, numeric epoch-ms, or numeric strings. */
function parseGhlDate(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  if (/^\d+$/.test(raw)) return Number(raw);
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}

const CHANNEL_LABEL: Record<InboxChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  email: "Email",
};

/** Humanise a raw GHL channel type, e.g. "TYPE_LIVE_CHAT" -> "Live Chat". */
function humanizeChannel(raw: string): string {
  const base = raw.replace(/^TYPE_/i, "").replace(/_/g, " ").trim();
  const special: Record<string, string> = {
    sms: "SMS",
    whatsapp: "WhatsApp",
    gmb: "GMB",
    ig: "Instagram",
  };
  const lower = base.toLowerCase();
  if (special[lower]) return special[lower];
  return base
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

// Real GHL conversation/lastMessage types seen on the live DP location include
// channel types (TYPE_SMS, TYPE_WHATSAPP, TYPE_INSTAGRAM, TYPE_EMAIL, TYPE_GMB,
// TYPE_FACEBOOK, TYPE_PHONE/TYPE_CALL) and non-channel activity types
// (TYPE_NO_SHOW, TYPE_ACTIVITY*, TYPE_INTERNAL_COMMENT, appointment events).
// Only real, non-1:1 channels earn a secondary label; activity types do not.
const REAL_SUBCHANNEL = /(phone|call|voicemail|facebook|messenger|livechat|gmb|sms|review)/;

/** Map a raw GHL channel type to one of the three first-class inbox channels,
 *  plus an honest secondary label when it does not map 1:1 (SMS, Phone, FB,
 *  Live Chat, ...). SMS/WhatsApp/Phone -> whatsapp, IG/FB -> instagram,
 *  Email/GMB -> email; anything unrecognised falls into the messaging bucket.
 *  Non-channel activity types (no-show, internal comment) keep the bucket but
 *  surface no secondary label, so the inbox never shows a fake "channel" chip.
 *  Verified against live data 2026-06-21. */
export function channelFromGhl(raw: string | null | undefined): {
  channel: InboxChannel;
  rawChannel?: string;
} {
  const n = norm(raw ?? "");
  let channel: InboxChannel;
  if (n.includes("instagram")) channel = "instagram";
  else if (n.includes("email") || n.includes("gmb")) channel = "email";
  else if (n.includes("facebook") || n.includes("messenger")) channel = "instagram";
  else if (n.includes("whatsapp") || n.includes("sms")) channel = "whatsapp";
  else channel = "whatsapp"; // default messaging bucket (incl. phone + system)
  const human = raw ? humanizeChannel(raw) : "";
  const showSub = REAL_SUBCHANNEL.test(n) && human !== CHANNEL_LABEL[channel];
  return { channel, rawChannel: showSub ? human : undefined };
}

/** Thread-list timestamp: today -> "9:42am", yesterday -> "Yesterday",
 *  this week -> "Mon", older -> "3 Jun". */
function formatThreadTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d
      .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })
      .replace(/\s/g, "")
      .toLowerCase();
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const days = (now.getTime() - ms) / DAY_MS;
  if (days >= 0 && days < 7) return d.toLocaleDateString("en-AU", { weekday: "short" });
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/** Clock time, e.g. "10:00am". */
function formatClock(ms: number): string {
  return new Date(ms)
    .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })
    .replace(/\s/g, "")
    .toLowerCase();
}

/** Message bubble timestamp: same day -> "9:30am", else "Mon 9:30am". */
function formatMessageTime(ms: number | null): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const now = new Date();
  const clock = formatClock(ms);
  if (d.toDateString() === now.toDateString()) return clock;
  return `${d.toLocaleDateString("en-AU", { weekday: "short" })} ${clock}`;
}

/** GHL conversations -> inbox threads. Joins the roster by contactId
 *  (Client.id is the GHL contact id); off-roster contacts are Leads. Messages
 *  load on demand, so each thread ships with an empty messages array. */
export function mapConversations(
  convos: GhlConversation[],
  clients: Client[],
  coaches: Coach[],
): Conversation[] {
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const coachNameById = new Map(coaches.map((c) => [c.id, c.name]));
  return convos.map((c) => {
    const { channel, rawChannel } = channelFromGhl(c.lastMessageType ?? c.type);
    const client = c.contactId ? clientById.get(c.contactId) : undefined;
    const ms = parseGhlDate(c.lastMessageDate);
    return {
      id: c.id,
      name:
        client?.name ??
        c.fullName?.trim() ??
        c.contactName?.trim() ??
        "Unknown contact",
      contactId: c.contactId ?? null,
      channel,
      rawChannel,
      contactType: client ? "Client" : "Lead",
      preview: c.lastMessageBody ?? "",
      time: ms ? formatThreadTime(ms) : "",
      unread: c.unreadCount ?? 0,
      coach: client ? coachNameById.get(client.coachId ?? "") ?? "Unassigned" : "Unassigned",
      plan: client?.plan ?? "Prospect",
      adherence: 0, // check-ins live in Kahunas (no API)
      lastCheckIn: client ? "awaiting" : "n/a",
      ltv: client?.cashCollected ?? 0,
      messages: [], // loaded on demand via getMessages
    };
  });
}

/** GHL thread messages -> bubbles, oldest first, empty/system rows dropped. */
export function mapMessages(messages: GhlMessage[]): ConversationMessage[] {
  return messages
    .filter((m) => (m.body ?? "").trim().length > 0)
    .sort((a, b) => (parseGhlDate(a.dateAdded) ?? 0) - (parseGhlDate(b.dateAdded) ?? 0))
    .map((m) => ({
      id: m.id,
      from: m.direction === "outbound" ? "us" : "them",
      text: m.body ?? "",
      time: formatMessageTime(parseGhlDate(m.dateAdded)),
    }));
}

/** GHL appointments -> month-grid events. Appointments are calls/consults, so
 *  they all classify as "call" for now; per-calendar typing can be tuned once
 *  the live calendar list is known. */
export function mapCalendarEvents(events: GhlCalendarEvent[]): CalendarEvent[] {
  return events
    .map((e) => ({ e, ms: parseGhlDate(e.startTime) }))
    .filter((x): x is { e: GhlCalendarEvent; ms: number } => x.ms != null)
    .map(({ e, ms }) => ({
      id: e.id,
      date: new Date(ms).toISOString().slice(0, 10),
      title: e.title?.trim() || "Appointment",
      type: "call" as const,
    }));
}

/** GHL appointments -> call-calendar rows. Joins the roster for Client/Lead
 *  classification + name. The appointment owner (assignedUserId) resolves to a
 *  name via `usersById`, then sales-config classifies it as the setter or
 *  closer slot; "-" when no users map is supplied or the owner is unmapped. */
export function mapCallBookings(
  events: GhlCalendarEvent[],
  clients: Client[],
  usersById?: Map<string, string>,
): CallBooking[] {
  const clientById = new Map(clients.map((c) => [c.id, c]));
  return events
    .map((e) => ({ e, ms: parseGhlDate(e.startTime) }))
    .filter((x): x is { e: GhlCalendarEvent; ms: number } => x.ms != null)
    .sort((a, b) => a.ms - b.ms)
    .map(({ e, ms }) => {
      const client = e.contactId ? clientById.get(e.contactId) : undefined;
      const addr = (e.address ?? "").toLowerCase();
      const online = addr.includes("zoom") || addr.includes("meet") || addr.includes("http");
      const ownerName = e.assignedUserId ? usersById?.get(e.assignedUserId) ?? "" : "";
      const role = looseSalesRole(ownerName);
      return {
        id: e.id,
        date: new Date(ms).toISOString().slice(0, 10),
        time: formatClock(ms),
        name: client?.name ?? e.title?.trim() ?? "Unknown",
        kind: client ? ("Client" as const) : ("Lead" as const),
        setter: role === "setter" ? ownerName : "-",
        closer: role === "closer" ? ownerName : "-",
        channel: online ? ("Zoom" as const) : ("Phone" as const),
      };
    });
}
