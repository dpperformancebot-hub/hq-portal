// LIVE DATA LAYER (M5 phase 1) -- GHL-backed counterpart to src/lib/seed.
// Same return shapes as the seed selectors so screens swap without changes.
// Loads the full GHL projection once per request (React cache) on top of the
// 5-minute Next.js data cache in src/lib/ghl/client.ts (polling model).
//
// Not yet live here: check-in data (Kahunas has no API), cash facts (Stripe,
// retainer phase), tasks/audits/transformations (HQ-native, Supabase phase),
// social stats (deferred feed). Those render as zeros/empty, never as fakes.

import { cache } from "react";
import {
  fetchAllContacts,
  fetchAllOpportunities,
  fetchCalendarEvents,
  fetchConversations,
  fetchCustomFieldDefs,
  fetchMessages,
  fetchPipelines,
  fetchUsers,
} from "@/lib/ghl/client";
import {
  contactSourceMap,
  mapCalendarEvents,
  mapCallBookings,
  mapContactsToRoster,
  mapConversations,
  mapMessages,
  mapOpportunitiesToLeads,
  salesRepKey,
  userNameById,
} from "@/lib/ghl/map";
import { SALES_ROLES, type SalesRole } from "@/lib/sales-config";
import type {
  Automation,
  AutomationStatus,
  BrandAsset,
  BriefItem,
  BuildTask,
  CalendarEvent,
  CallBooking,
  Campaign,
  Collaboration,
  ContentPost,
  Contract,
  Conversation,
  ConversationMessage,
  Hire,
  LeadMagnet,
  MerchProduct,
  PostType,
  Report,
  Sop,
} from "@/lib/seed/m4";
import { BRAND } from "@/lib/brand";
import { dashboardChurnStats, monthlyAverageChurn } from "@/lib/churn-math";
import { clientWeek, clientWeekNumber, effectiveStartDate } from "@/lib/client-start-date";
import { paymentStructure } from "@/lib/journey-buckets";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { fetchAllRows } from "@/lib/db/fetch-all";
import { registerCoaches } from "@/lib/coach-registry";
import {
  rowToBrandBuildTask,
  rowToCampaign,
  rowToCheckIn,
  rowToClient,
  rowToCoach,
  rowToHire,
  rowToLead,
  rowToLeadMagnet,
  rowToReport,
  rowToTransformation,
} from "@/lib/db/rows";
import type {
  BrandBuildTaskRow,
  CampaignRow,
  CheckInRow,
  ClientRow,
  CoachRow,
  HireRow,
  LeadMagnetRow,
  LeadRow,
  ReportRow,
  TransformationRow,
} from "@/lib/db/rows";
import type {
  AuditCadence,
  AuditStatus,
  CheckIn,
  Client,
  ClientAudit,
  Coach,
  Lead,
  LeadStage,
  Transformation,
} from "@/lib/seed/types";
import { stripeConfigured, getStripeFinancials, EMPTY_STRIPE_FINANCIALS } from "@/lib/stripe";
import type {
  CoachLeaderboardRow,
  CoachScorecard,
  SalesLeaderboardRow,
  getDashboardMetrics as seedGetDashboardMetrics,
} from "@/lib/seed";

/** Contract from the seed layer; screens type against this. */
type DashboardMetrics = ReturnType<typeof seedGetDashboardMetrics>;

// Brand funnel order minus Lost: the dashboard pipeline widget and the
// reach/conversion maths deliberately exclude the Lost bucket (a giant Lost
// bar would swamp the widget; reachIndex pins Lost leads to rung 0).
const PIPELINE_ORDER: LeadStage[] = BRAND.pipelineStages.filter((s) => s !== "Lost");

type LiveData = { clients: Client[]; coaches: Coach[]; leads: Lead[] };

/** M5 phase 2 read path: when HQ_PERSISTENCE=true the projection is read
 *  from Supabase (kept fresh by /api/sync/ghl) instead of polling GHL per
 *  request. Falls back to the GHL-direct path on any DB error so a sync gap
 *  never blanks the dashboard. */
async function loadFromDb(): Promise<LiveData> {
  const db = dbAdmin();
  // R19-1: every one of these is a COMPLETE set, so every one must be paged.
  // Unpaged, the portal itself only ever saw the first 1000 clients and the
  // first 1000 of >24,000 leads, with no error to say so.
  const [clientsData, coachesData, leadsData] = await Promise.all([
    fetchAllRows<ClientRow>((from, to) => db.from("clients").select("*").order("id").range(from, to), { label: "clients" }),
    fetchAllRows<CoachRow>((from, to) => db.from("coaches").select("*").eq("is_active", true).order("id").range(from, to), { label: "coaches" }),
    fetchAllRows<LeadRow>((from, to) => db.from("leads").select("*").order("id").range(from, to), { label: "leads" }),
  ]);
  const clientsRes = { data: clientsData, error: null };
  const coachesRes = { data: coachesData, error: null };
  const leadsRes = { data: leadsData, error: null };
  // Register live coach names so coachNameLoose can resolve real UUIDs.
  registerCoaches((coachesRes.data as CoachRow[]).map((c) => ({ id: c.id, name: c.name })));
  return {
    clients: (clientsRes.data as ClientRow[]).map(rowToClient),
    coaches: (coachesRes.data as CoachRow[]).map(rowToCoach),
    leads: leadsRes.error ? [] : (leadsRes.data as LeadRow[]).map(rowToLead),
  };
}

async function loadFromGhl(): Promise<LiveData> {
  const [defs, contacts] = await Promise.all([fetchCustomFieldDefs(), fetchAllContacts()]);
  const { clients, coaches } = mapContactsToRoster(contacts, defs);

  // Pipeline data is optional: the GHL pipeline may be empty pre-launch and
  // the opportunities endpoints must not take the whole dashboard down.
  let leads: Lead[] = [];
  try {
    const [pipelines, opps] = await Promise.all([fetchPipelines(), fetchAllOpportunities()]);
    // Resolve each opportunity's lead source from its full contact record
    // (the embedded opp.contact rarely carries custom fields).
    leads = mapOpportunitiesToLeads(opps, pipelines, contactSourceMap(contacts, defs));
  } catch {
    leads = [];
  }
  return { clients, coaches, leads };
}

/** GHL user id -> display name, cached per request. Empty map on any error
 *  (e.g. the token lacks the View Users scope) so owner names just stay blank
 *  rather than crashing the read path. */
const loadUsers = cache(async (): Promise<Map<string, string>> => {
  try {
    return userNameById(await fetchUsers());
  } catch {
    return new Map();
  }
});

/** Resolve lead.ownerName from the GHL users map. DB-projected leads carry only
 *  the owner id (ghl_assigned_to); the GHL-direct mapper leaves the name blank
 *  too. This closes the G1 owner-name gap at read time, no schema/sync change,
 *  which is what lets the setter/closer split light up once opportunities flow. */
async function enrichLeadOwners(leads: Lead[]): Promise<Lead[]> {
  if (leads.length === 0 || leads.every((l) => l.ownerName)) return leads;
  const users = await loadUsers();
  if (users.size === 0) return leads;
  return leads.map((l) =>
    l.ownerName || !l.ownerId ? l : { ...l, ownerName: users.get(l.ownerId) ?? l.ownerName },
  );
}

export const loadLiveData = cache(async (): Promise<LiveData> => {
  let base: LiveData | null = null;
  if (persistenceEnabled()) {
    try {
      const fromDb = await loadFromDb();
      // Empty table means the migration ran but no sync has: GHL-direct is
      // still the truth until the first /api/sync/ghl completes.
      if (fromDb.clients.length > 0) base = fromDb;
    } catch {
      // fall through to GHL-direct
    }
  }
  if (!base) base = await loadFromGhl();
  return { ...base, leads: await enrichLeadOwners(base.leads) };
});

function monthEnds(count: number): { label: string; end: Date }[] {
  const out: { label: string; end: Date }[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    out.push({ label: end.toLocaleString("en-AU", { month: "short" }), end });
  }
  return out;
}

/** True historical MRR: a client counts toward a point in time when they had
 *  started and (per imported end dates) had not yet cancelled. Cancelled
 *  clients without a known end date are excluded from history. */
function activeAt(c: Client, t: number): boolean {
  // R17-1a: no known start = cannot be placed on a historical timeline.
  const startIso = effectiveStartDate(c);
  if (startIso === null) return false;
  if (Date.parse(startIso) > t) return false;
  // Active/paused clients count regardless of an upcoming term end (renewal
  // date); only cancelled/past clients end their history at endDate.
  if (c.status === "active" || c.status === "paused") return true;
  return c.endDate ? Date.parse(c.endDate) > t : false;
}

function mrrAt(clients: Client[], t: number): number {
  return clients.filter((c) => activeAt(c, t)).reduce((s, c) => s + c.monthlyRate, 0);
}

type SeriesPayload = {
  series: { month: string; value: number }[];
  lastYear: number[];
  prevPeriod: number[];
};

const DAY = 86_400_000;

/** Sample MRR levels at the given timestamps; compares are index-aligned. */
function levelSeries(
  clients: Client[],
  points: { label: string; t: number }[],
  windowMs: number,
): SeriesPayload {
  return {
    series: points.map((p) => ({ month: p.label, value: mrrAt(clients, p.t) })),
    lastYear: points.map((p) => mrrAt(clients, p.t - 365 * DAY)),
    prevPeriod: points.map((p) => mrrAt(clients, p.t - windowMs)),
  };
}

function revenueByPeriod(clients: Client[]) {
  const now = Date.now();
  const weekly = Array.from({ length: 12 }, (_, i) => {
    const t = now - (11 - i) * 7 * DAY;
    return { label: new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short" }), t };
  });
  const monthly = monthEnds(12).map(({ label, end }) => ({ label, t: Math.min(end.getTime(), now) }));
  const quarterly = Array.from({ length: 8 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (7 - i) * 3);
    const t = Math.min(d.getTime(), now);
    return { label: `Q${Math.floor(d.getMonth() / 3) + 1} ${String(d.getFullYear()).slice(2)}`, t };
  });
  const yearly = Array.from({ length: 4 }, (_, i) => {
    const y = new Date().getFullYear() - (3 - i);
    const t = Math.min(new Date(y, 11, 31).getTime(), now);
    return { label: String(y), t };
  });
  return {
    Weekly: levelSeries(clients, weekly, 12 * 7 * DAY),
    Monthly: levelSeries(clients, monthly, 365 * DAY),
    Quarterly: levelSeries(clients, quarterly, 8 * 91 * DAY),
    Yearly: levelSeries(clients, yearly, 4 * 365 * DAY),
  };
}

function revenueSeries(clients: Client[]) {
  return monthEnds(6).map(({ label, end }) => ({
    month: label,
    value: mrrAt(clients, Math.min(end.getTime(), Date.now())),
  }));
}

const diffDays = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);

export async function getClients(): Promise<Client[]> {
  return (await loadLiveData()).clients;
}

export async function getCoaches(): Promise<Coach[]> {
  return (await loadLiveData()).coaches;
}

/** R19-2c: every coach name, INCLUDING deactivated ones.
 *
 *  getCoaches() is active-only on purpose, because it feeds the pickers, the
 *  capacity bars and the check-in grid, and a removed coach must not appear in
 *  any of them. But a removed coach's NAME still has to render against the
 *  check-ins they logged, the clients they used to hold, and the pay periods
 *  they worked. Looking those up through the active-only list would replace a
 *  real person with a blank in their own history. Names only, no roster. */
export async function getAllCoachNames(): Promise<Record<string, string>> {
  const rows = await fetchAllRows<{ id: string; name: string }>(
    (from, to) => dbAdmin().from("coaches").select("id,name").order("id").range(from, to),
    { label: "coach names (incl. inactive)" },
  );
  const out: Record<string, string> = {};
  for (const r of rows) out[r.id] = r.name;
  return out;
}

export async function getLeads(): Promise<Lead[]> {
  return (await loadLiveData()).leads;
}

/** Check-ins projected from Kahunas via the Zapier intake (check_ins table).
 *  Latest submission first. Empty until the feed lands or persistence is off. */
export async function getCheckIns(): Promise<CheckIn[]> {
  if (!persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("check_ins")
    .select("*")
    .order("submitted_at", { ascending: false });
  if (error || !data) return [];
  return (data as CheckInRow[]).map(rowToCheckIn);
}

/** Check-ins scoped at the QUERY level (2026-07-02, week-grid view). The
 *  unscoped reader above is capped by PostgREST's default 1000-row page, so a
 *  single coach's older history could fall outside the newest 1000 global
 *  rows. Scoping by coach (or a 16-week window for the head coach, who sees
 *  everyone) plus an explicit range keeps full week-grid history cheap. */
export async function getCheckInsScoped(coachId: string | null): Promise<CheckIn[]> {
  if (!persistenceEnabled()) return [];
  let q = dbAdmin()
    .from("check_ins")
    .select("*")
    .order("submitted_at", { ascending: false })
    .range(0, 9999);
  if (coachId) {
    q = q.eq("coach_id", coachId);
  } else {
    const since = new Date(Date.now() - 16 * 7 * 86_400_000).toISOString().slice(0, 10);
    q = q.gte("submitted_at", since);
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as CheckInRow[]).map(rowToCheckIn);
}

/** Transformations from the HQ-native table (coach logs + Kahunas). Newest
 *  first. Empty until data lands or persistence is off. */
export async function getTransformations(): Promise<Transformation[]> {
  if (!persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("transformations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as TransformationRow[]).map(rowToTransformation);
}

// ---------------------------------------------------------------------------
// Document + content stores (Datastore Phase 1, migration 20260620000001).
// HQ-native, read-only here (writes land in per-store server actions). Each
// loader mirrors getCheckIns/getTransformations: guarded by persistenceEnabled,
// snake_case rows mapped to the existing seed type, sensible default order.
// Empty until rows land; never falls back to seed (the facade decides that).

/** timestamptz / date column -> the seed's YYYY-MM-DD display string. */
const toDateStr = (ts: string | null): string => (ts ? ts.slice(0, 10) : "");

// Client Audits are DERIVED, not stored as a full roster: one QA audit per
// active/paused client, placed on the 4-week cadence by week-in-program, with
// any persisted status/resolved overlaid. The client_audits table holds only
// the rows a coach has actually touched (keyed by client_id + cadence_week);
// every other client shows as un-actioned ("due").

/** Enriched audit for the screen: the ClientAudit plus client + coach display
 *  names. Live client/coach ids are Supabase UUIDs the seed name helpers can't
 *  resolve, so the names are resolved here against the live roster. */
export type AuditCard = ClientAudit & { clientName: string; coachName: string };

const AUDIT_CADENCES: AuditCadence[] = ["W4", "W8", "W12", "W16"];

/** Un-actioned audits open at the first pipeline state, which reads as "due". */
const DEFAULT_AUDIT_STATUS: AuditStatus = "submitted";

/** Place a client's week-in-program onto the 4-week QA cadence. Audits recur
 *  every 4 weeks; with four visible buckets we map the current 4-week
 *  milestone, cycling W4 -> W8 -> W12 -> W16 -> W4 for terms past 16 weeks. */
function cadenceForWeek(week: number): AuditCadence {
  const milestone = Math.max(1, Math.ceil(week / 4));
  return AUDIT_CADENCES[(milestone - 1) % AUDIT_CADENCES.length];
}

type StoredAudit = {
  client_id: string;
  cadence_week: AuditCadence;
  status: AuditStatus;
  resolved: boolean;
  feedback?: string | null;
  loom_url?: string | null;
  owner_rating?: number | null;
  owner_notes?: string | null;
};

export async function getAudits(): Promise<AuditCard[]> {
  if (!persistenceEnabled()) return [];
  const [clients, coaches] = await Promise.all([getClients(), getCoaches()]);
  const coachNameById = new Map(coaches.map((c) => [c.id, c.name]));

  // Overlay persisted status/resolved (+ C5 feedback/Loom), matched on
  // client_id + cadence_week. Falls back to the legacy column list until
  // migration 20260804000002 adds feedback/loom_url.
  const primary = await dbAdmin()
    .from("client_audits")
    .select("client_id, cadence_week, status, resolved, feedback, loom_url, owner_rating, owner_notes");
  const secondary = primary.error
    ? await dbAdmin()
        .from("client_audits")
        .select("client_id, cadence_week, status, resolved, feedback, loom_url")
    : primary;
  const res = secondary.error
    ? await dbAdmin().from("client_audits").select("client_id, cadence_week, status, resolved")
    : secondary;
  const stored = new Map<string, StoredAudit>();
  for (const r of (res.data as StoredAudit[] | null) ?? []) {
    stored.set(`${r.client_id}:${r.cadence_week}`, r);
  }

  return clients
    .filter((c) => c.status === "active" || c.status === "paused")
    .map((c) => {
      const week = Math.max(1, (clientWeekNumber(c) ?? 1));
      const cadenceWeek = cadenceForWeek(week);
      const overlay = stored.get(`${c.id}:${cadenceWeek}`);
      return {
        // Stable synthetic key for React; writes are keyed by client + cadence.
        id: `${c.id}:${cadenceWeek}`,
        clientId: c.id,
        coachId: c.coachId ?? "",
        cadenceWeek,
        status: overlay?.status ?? DEFAULT_AUDIT_STATUS,
        resolved: overlay?.resolved ?? false,
        feedback: overlay?.feedback ?? null,
        loomUrl: overlay?.loom_url ?? null,
        ownerRating: overlay?.owner_rating ?? null,
        ownerNotes: overlay?.owner_notes ?? null,
        clientName: c.name,
        coachName: c.coachId ? coachNameById.get(c.coachId) ?? "Unassigned" : "Unassigned",
      };
    })
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
}

type SopRow = { id: string; title: string; category: string; version: string; updated_at: string };
export async function getSops(): Promise<Sop[]> {
  if (!persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("sops")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return (data as SopRow[]).map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    version: r.version,
    updated: toDateStr(r.updated_at),
  }));
}

type ContractRow = {
  id: string;
  client_name: string;
  type: string;
  value: number | string;
  signed: string | null;
  term: string | null;
  status: Contract["status"];
};
export async function getContracts(): Promise<Contract[]> {
  if (!persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("contracts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as ContractRow[]).map((r) => ({
    id: r.id,
    client: r.client_name,
    type: r.type,
    value: Number(r.value) || 0,
    signed: toDateStr(r.signed),
    term: r.term ?? "",
    status: r.status,
  }));
}

type BriefItemRow = { id: string; title: string; note: string };
export async function getBrief(): Promise<BriefItem[]> {
  if (!persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("brief_items")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as BriefItemRow[]).map((r) => ({ id: r.id, title: r.title, note: r.note }));
}

type MerchProductRow = { id: string; name: string; units_sold: number; revenue: number | string };
export async function getMerch(): Promise<MerchProduct[]> {
  if (!persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("merch_products")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as MerchProductRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    unitsSold: r.units_sold,
    revenue: Number(r.revenue) || 0,
  }));
}

type ContentPostRow = { id: string; account: string; day: number; type: PostType; title: string };
export async function getContentPosts(): Promise<ContentPost[]> {
  if (!persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("content_posts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as ContentPostRow[]).map((r) => ({
    id: r.id,
    account: r.account,
    day: r.day,
    type: r.type,
    title: r.title,
  }));
}

type CollaborationRow = { id: string; title: string; assignee: string; status: Collaboration["status"] };
export async function getCollaborations(): Promise<Collaboration[]> {
  if (!persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("collaborations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as CollaborationRow[]).map((r) => ({
    id: r.id,
    title: r.title,
    assignee: r.assignee,
    status: r.status,
  }));
}

type BrandAssetRow = { id: string; name: string; kind: BrandAsset["kind"]; updated_at: string };
export async function getBrandAssets(): Promise<BrandAsset[]> {
  if (!persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("brand_assets")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return (data as BrandAssetRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    updated: toDateStr(r.updated_at),
  }));
}

// --------------------------------------------------------------------------
// Brand / marketing / reports stores (migration 20260630000002). Same shape
// as the document-store loaders above: guarded by persistenceEnabled, rows
// mapped to the seed view contract, newest first. Empty until rows land; the
// data facade decides the seed fallback.

export async function getReports(): Promise<Report[]> {
  if (!persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("reports")
    .select("*")
    .order("generated_at", { ascending: false, nullsFirst: false });
  if (error || !data) return [];
  return (data as ReportRow[]).map(rowToReport);
}

export async function getBrandBuild(): Promise<BuildTask[]> {
  if (!persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("brand_build_tasks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as BrandBuildTaskRow[]).map(rowToBrandBuildTask);
}

export async function getHires(): Promise<Hire[]> {
  if (!persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("hires")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as HireRow[]).map(rowToHire);
}

export async function getCampaigns(): Promise<Campaign[]> {
  if (!persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as CampaignRow[]).map(rowToCampaign);
}

export async function getLeadMagnets(): Promise<LeadMagnet[]> {
  if (!persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("lead_magnets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as LeadMagnetRow[]).map(rowToLeadMagnet);
}

// trigger/actions/replaces_va_task are jsonb columns; this screen stores the
// human-readable strings the view shows, so a value reads back as a JSON string.
// Coerce defensively in case an older/structured value lands there.
const automationText = (v: unknown): string =>
  typeof v === "string" ? v : v == null ? "" : String(v);

type AutomationRow = {
  id: string;
  name: string;
  trigger: unknown;
  actions: unknown;
  cadence: string;
  status: AutomationStatus;
  replaces_va_task: unknown;
};
/** Persisted automation config (no engine yet). The table ships empty: the data
 *  facade merges these rows over the seed catalog by name (see getAutomations). */
export async function getAutomations(): Promise<Automation[]> {
  if (!persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("automations")
    .select("id,name,trigger,actions,cadence,status,replaces_va_task")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as AutomationRow[]).map((r) => {
    const replaces = automationText(r.replaces_va_task);
    return {
      id: r.id,
      name: r.name,
      trigger: automationText(r.trigger),
      actions: automationText(r.actions),
      cadence: r.cadence,
      status: r.status,
      replacesVATask: replaces || undefined,
    };
  });
}

/** Per-coach check-in adherence over the last 8 weeks: share of weeks coded Y
 *  (submitted) out of the clean submitted-or-missed signals (Y vs G/N/M; M =
 *  Missed since R16-2c). Coach workflow codes (F/MS) and paused/cancelled are
 *  ignored. Coaches with no recent clean signal are omitted, so the scorecard
 *  keeps "awaiting feed". */
function adherenceByCoach(checkIns: CheckIn[]): Map<string, number> {
  const cutoff = Date.now() - 56 * 86_400_000;
  const tally = new Map<string, { y: number; miss: number }>();
  for (const ci of checkIns) {
    if (Date.parse(ci.submittedAt) < cutoff) continue;
    if (ci.code !== "Y" && ci.code !== "G" && ci.code !== "N" && ci.code !== "M") continue;
    const t = tally.get(ci.coachId) ?? { y: 0, miss: 0 };
    if (ci.code === "Y") t.y++;
    else t.miss++;
    tally.set(ci.coachId, t);
  }
  const out = new Map<string, number>();
  for (const [coachId, t] of tally) {
    const total = t.y + t.miss;
    if (total > 0) out.set(coachId, t.y / total);
  }
  return out;
}

function scorecards(
  clients: Client[],
  coaches: Coach[],
  adherence?: Map<string, number>
): CoachScorecard[] {
  return coaches.map((c) => {
    const roster = clients.filter((cl) => cl.coachId === c.id && cl.status === "active");
    const own = clients.filter((cl) => cl.coachId === c.id);
    // A5 + D1 (owner rules): churn AND retention are lifetime averages of the
    // per-month rates, not all-time shares. See churn-math.ts.
    const churn = monthlyAverageChurn(own);
    return {
      ...c,
      adherence: adherence?.get(c.id) ?? c.adherence,
      retention: 1 - churn,
      churn,
      activeClients: roster.length,
      pendingAudits: 0, // HQ-native QA, Supabase phase
      capacityPct: c.maxCapacity === 0 ? 0 : roster.length / c.maxCapacity,
      slotsOpen: Math.max(0, c.maxCapacity - roster.length),
      // R17-1a: average over the roster we can actually date.
      avgClientWeeks: (() => {
        const dated = roster.map((cl) => clientWeek(cl)).filter((w): w is number => w !== null);
        return dated.length ? Math.round(dated.reduce((s, w) => s + w, 0) / dated.length) : 0;
      })(),
    };
  });
}

export async function getCoachScorecards(): Promise<CoachScorecard[]> {
  const { clients, coaches } = await loadLiveData();
  const checkIns = await getCheckIns();
  return scorecards(clients, coaches, adherenceByCoach(checkIns));
}

export async function getCoachLeaderboard(): Promise<CoachLeaderboardRow[]> {
  const rows = await getCoachScorecards();
  return rows
    .filter((c) => c.activeClients > 0)
    .sort((a, b) => b.retention - a.retention)
    .map((c, i) => ({ ...c, rank: i + 1, movement: 0 }));
}

export type RenewalRow = {
  client: Client;
  renewalDate: string;
  daysToRenewal: number;
  /** R17-1a: null when the client has no known start date. */
  weeksIn: number | null;
  /** R16-6a: true when renewalDate comes from the manual override, not GHL. Absent in seed mode. */
  overridden?: boolean;
};

/** Active clients with a known term end inside the call window: 7 days
 *  overdue through 45 days out. This is the re-sign call list (PIF clients
 *  get their re-sign call around active week 13-14 of a 16-week term). */
export async function getRenewals(): Promise<RenewalRow[]> {
  const { clients } = await loadLiveData();
  const now = Date.now();
  return clients
    .filter((c) => c.status === "active" && (c.termEndOverride || c.endDate))
    .map((c) => {
      // R16-6a: a manual override set on the Renewals screen wins over the
      // GHL term end until the owner clears it.
      const end = (c.termEndOverride || c.endDate) as string;
      const t = Date.parse(end);
      return {
        client: c,
        renewalDate: end,
        daysToRenewal: Math.round((t - now) / DAY),
        weeksIn: clientWeek(c, now),
        overridden: !!c.termEndOverride,
      };
    })
    .filter((r) => r.daysToRenewal >= -7 && r.daysToRenewal <= 45)
    .sort((a, b) => a.daysToRenewal - b.daysToRenewal);
}

export type DailyDeltas = {
  /** Snapshot date the deltas describe (the most recent completed day). */
  date: string;
  gained: number;
  lost: number;
  net: number;
};

/** True day-over-day movement from daily_snapshots (M5 phase 2). Reads the
 *  LATEST snapshot: the cron writes once daily at 5:55am AEST, right before
 *  the 7am digest, so the newest row is always the just-completed day. (UTC
 *  vs AEST date filtering caused an off-by-one; latest-row avoids it.) Null
 *  when persistence is off, the table is empty, or the read fails: callers
 *  fall back to 30d wording. */
export async function getDailyDeltas(): Promise<DailyDeltas | null> {
  if (!persistenceEnabled()) return null;
  try {
    const { data, error } = await dbAdmin()
      .from("daily_snapshots")
      .select("snapshot_date,gained_1d,lost_1d")
      .order("snapshot_date", { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const s = data[0] as { snapshot_date: string; gained_1d: number; lost_1d: number };
    return {
      date: s.snapshot_date,
      gained: s.gained_1d,
      lost: s.lost_1d,
      net: s.gained_1d - s.lost_1d,
    };
  } catch {
    return null;
  }
}

export async function getSalesLeaderboard(): Promise<SalesLeaderboardRow[]> {
  // Needs lead owner mapping (GHL gap G1) + payment attribution. Empty until then.
  return [];
}

// --- Sales performance (setter / closer) ----------------------------------
// Per-rep activity from the owner-resolved lead projection. sales-config.ts
// maps each rep to a role (Lucas=setter, Lilli=closer); the screen lights up
// the moment GHL opportunities carry an assignedTo we can resolve to a name.

export type SalesRepRow = {
  name: string;
  role: SalesRole | null;
  /** Opportunities owned by this rep (any stage). */
  leads: number;
  /** Reached Call Booked or beyond (the setter's job: book the call). */
  callsBooked: number;
  /** Reached Call Taken or beyond (the closer's job: take the call). */
  callsTaken: number;
  /** Closed-won (Submitted). */
  closed: number;
  lost: number;
  /** closed / (closed + lost), null until any opportunity resolves either way. */
  closeRatePct: number | null;
  revenueClosed: number;
};

const BOOKED_STAGES: LeadStage[] = [
  "Call Booked",
  "Call Taken",
  "Follow-Up",
  "New Client Processing",
  "Submitted",
];
const TAKEN_STAGES: LeadStage[] = [
  "Call Taken",
  "Follow-Up",
  "New Client Processing",
  "Submitted",
  "Lost",
];

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** One row per configured sales rep (so both Lucas and Lilli always show, even
 *  at zero). Metrics stay 0/null until opportunities with a resolvable owner
 *  arrive from GHL. */
export function computeSalesPerformance(leads: Lead[]): SalesRepRow[] {
  const byRep = new Map<string, Lead[]>();
  for (const l of leads) {
    const key = salesRepKey(l.ownerName);
    if (!key) continue;
    const arr = byRep.get(key);
    if (arr) arr.push(l);
    else byRep.set(key, [l]);
  }
  return Object.entries(SALES_ROLES).map(([key, role]) => {
    const ls = byRep.get(key) ?? [];
    const closed = ls.filter((l) => l.stage === "Submitted").length;
    const lost = ls.filter((l) => l.stage === "Lost").length;
    return {
      name: capitalize(key),
      role,
      leads: ls.length,
      callsBooked: ls.filter((l) => BOOKED_STAGES.includes(l.stage)).length,
      callsTaken: ls.filter((l) => TAKEN_STAGES.includes(l.stage)).length,
      closed,
      lost,
      closeRatePct: closed + lost === 0 ? null : Math.round((closed / (closed + lost)) * 100),
      revenueClosed: ls
        .filter((l) => l.stage === "Submitted")
        .reduce((s, l) => s + l.value, 0),
    };
  });
}

export async function getSalesPerformance(): Promise<SalesRepRow[]> {
  const { leads } = await loadLiveData();
  return computeSalesPerformance(leads);
}

// --- Analytics (funnel + lead-source table + retention) -------------------
// The funnel and the lead-source table read live from the opportunity
// projection; the retention curve is a real survival curve from the client
// roster. KPIs whose source is not connected yet are null and render as "—":
// time-to-close needs opportunity created dates (not carried on the lead) and
// show-up rate needs calendar appointment statuses (Stage 1 calendar feed).

export type AnalyticsData = {
  kpis: {
    conversionPct: number | null;
    avgDaysToClose: number | null;
    showUpRatePct: number | null;
    /** Average tenure in WEEKS (A4: owner wants tenure in weeks everywhere). */
    avgTenureWeeks: number | null;
    /** R8-3: total Average Week at Churn, all coaches combined (D2 formula,
     *  early dropouts excluded). Null until anyone has churned. */
    avgWeekAtChurn: number | null;
  };
  funnel: { stage: string; count: number }[];
  retentionCurve: { month: string; pct: number }[];
  sourcePerf: {
    source: string;
    leads: number;
    calls: number;
    closed: number;
    convPct: number;
    revenue: number;
  }[];
};

const MONTH_MS = 30.44 * DAY;

// How far down the pipeline a lead reached. Lost leads still entered as an
// enquiry, so they sit at the first rung (index 0) rather than dropping out.
function reachIndex(stage: LeadStage): number {
  const i = PIPELINE_ORDER.indexOf(stage);
  return i < 0 ? 0 : i;
}

// Cumulative funnel: each rung counts leads that reached that stage or beyond.
const FUNNEL_STEPS: { label: string; stage: LeadStage }[] = [
  { label: "Enquiries", stage: "New Enquiry" },
  { label: "Contacted", stage: "Contacted" },
  { label: "Call booked", stage: "Call Booked" },
  { label: "Call taken", stage: "Call Taken" },
  { label: "Onboarded", stage: "New Client Processing" },
];

const CALL_TAKEN_INDEX = PIPELINE_ORDER.indexOf("Call Taken");

export function computeAnalytics(leads: Lead[], clients: Client[]): AnalyticsData {
  // Funnel from live opportunities.
  const funnel = FUNNEL_STEPS.map((step) => {
    const min = reachIndex(step.stage);
    return { stage: step.label, count: leads.filter((l) => reachIndex(l.stage) >= min).length };
  });

  // Lead-source table: one row per source that has at least one lead.
  const sources = [...new Set(leads.map((l) => l.source))];
  const sourcePerf = sources
    .map((source) => {
      const ls = leads.filter((l) => l.source === source);
      const closedLeads = ls.filter((l) => l.stage === "Submitted");
      return {
        source,
        leads: ls.length,
        calls: ls.filter((l) => reachIndex(l.stage) >= CALL_TAKEN_INDEX && l.stage !== "Lost").length,
        closed: closedLeads.length,
        convPct: ls.length ? Math.round((closedLeads.length / ls.length) * 100) : 0,
        revenue: closedLeads.reduce((s, l) => s + l.value, 0),
      };
    })
    .sort((a, b) => b.leads - a.leads);

  // Real survival curve: of clients old enough to have reached month m, the
  // share still retained at m. Cancelled clients without a known end date can't
  // be assessed, so they are excluded from the cohort (same rule as MRR history).
  const assessable = clients.filter(
    (c) => c.status === "active" || c.status === "paused" || Boolean(c.endDate),
  );
  const retentionCurve = [1, 2, 3, 4, 5, 6].map((m) => {
    const horizon = m * MONTH_MS;
    const cohort = assessable.filter((c) => {
      const iso = effectiveStartDate(c);
      return iso !== null && Date.now() - Date.parse(iso) >= horizon;
    });
    const retained = cohort.filter((c) => {
      if (c.status === "active" || c.status === "paused") return true;
      const iso = effectiveStartDate(c);
      return c.endDate && iso ? Date.parse(c.endDate) - Date.parse(iso) >= horizon : false;
    });
    return { month: `M${m}`, pct: cohort.length ? Math.round((retained.length / cohort.length) * 100) : 0 };
  });

  const won = leads.filter((l) => l.stage === "Submitted").length;
  const lost = leads.filter((l) => l.stage === "Lost").length;
  const active = clients.filter((c) => c.status === "active");
  const datedActive = active.filter((c) => effectiveStartDate(c) !== null);
  const avgTenureWeeks = datedActive.length
    ? Math.round(
        (datedActive.reduce((s, c) => s + (Date.now() - Date.parse(effectiveStartDate(c) as string)), 0) / datedActive.length / (7 * DAY)) * 10,
      ) / 10
    : null;

  return {
    kpis: {
      conversionPct: won + lost === 0 ? null : Math.round((won / (won + lost)) * 100),
      avgDaysToClose: null, // needs opportunity created dates (not on the lead)
      showUpRatePct: null, // needs calendar appointment statuses (showed/noshow)
      avgTenureWeeks,
      // R8-3: same stats object as the dashboard KPI, so the two can never drift.
      avgWeekAtChurn: dashboardChurnStats(clients).avgWeekAtChurn,
    },
    funnel,
    retentionCurve,
    sourcePerf,
  };
}

export async function getAnalytics(): Promise<AnalyticsData> {
  const { leads, clients } = await loadLiveData();
  return computeAnalytics(leads, clients);
}

export async function getFinancials() {
  const { clients, coaches } = await loadLiveData();
  const active = clients.filter((c) => c.status === "active");
  const mrr = active.reduce((s, c) => s + c.monthlyRate, 0);
  // LTV estimate from billed run-rate; true cash facts arrive with Stripe.
  const avgLtv =
    clients.reduce((s, c) => s + c.cashCollected, 0) / Math.max(1, clients.length);

  const planBreakdown = (["Weekly", "Fortnightly", "Monthly"] as const).map((plan) => ({
    plan,
    value: active.filter((c) => c.plan === plan).reduce((s, c) => s + c.monthlyRate, 0),
  }));

  // H2 (FEEDBACK-V2): MRR split PIF/bulk vs genuine recurring (WRR), derived
  // from billing frequency + term length (paymentStructure). Clients with no
  // billing-structure signal land in `unknown`, shown honestly, never guessed.
  const mrrSplit = { pif: 0, recurring: 0, unknown: 0 };
  for (const c of active) {
    const pay = paymentStructure(c);
    if (pay === "PIF") mrrSplit.pif += c.monthlyRate;
    else if (pay === "WBW") mrrSplit.recurring += c.monthlyRate;
    else mrrSplit.unknown += c.monthlyRate;
  }

  const payouts = coaches.map((c) => {
    const roster = active.filter((cl) => cl.coachId === c.id);
    const gross = roster.reduce(
      (s, cl) => s + (cl.plan === "Weekly" ? c.weeklyRate * 4 : c.fortnightlyRate * 2),
      0,
    );
    // Coach fee: per-brand config, labelled in the UI (V2-02). Placeholder
    // pending Dan's payroll rules; see Brand.coachFeePct.
    const fee = Math.round(gross * BRAND.coachFeePct);
    return { coachId: c.id, name: c.name, gross, fee, net: gross - fee };
  });

  // Cash facts (collected 30d, refunds, past-due, transactions) come from
  // Stripe behind STRIPE_SECRET_KEY. Absent or unreachable = honest zeros; the
  // MRR run-rate estimate above carries the screen until the key lands.
  const connected = stripeConfigured();
  let cash = EMPTY_STRIPE_FINANCIALS;
  if (connected) {
    try {
      cash = await getStripeFinancials(clients);
    } catch {
      // Stripe unreachable: keep honest zeros, no fake numbers.
      cash = EMPTY_STRIPE_FINANCIALS;
    }
  }

  return {
    mrr,
    arr: mrr * 12,
    avgLtv,
    cashCollected30d: cash.cashCollected30d,
    refunds: cash.refunds,
    pastDue: cash.pastDue,
    pastDueCount: cash.pastDueCount,
    stripeConnected: connected,
    revenueSeries: revenueSeries(clients),
    planBreakdown,
    mrrSplit,
    payouts,
    transactions: cash.transactions,
  };
}

// --- Inbox (Stage 1 read) -------------------------------------------------

/** Live inbox threads from GHL conversations, joined to the roster. Messages
 *  are NOT loaded here; they stream in per-thread via getMessages. A GHL outage
 *  yields an empty inbox (honest empty state), never the error boundary. */
export async function getInbox(): Promise<Conversation[]> {
  try {
    const [{ clients, coaches }, convos] = await Promise.all([
      loadLiveData(),
      fetchConversations().catch(() => []),
    ]);
    return mapConversations(convos, clients, coaches);
  } catch {
    return [];
  }
}

/** On-demand messages for one thread (opened in the inbox). Empty on failure. */
export async function getMessages(conversationId: string): Promise<ConversationMessage[]> {
  try {
    return mapMessages(await fetchMessages(conversationId));
  } catch {
    return [];
  }
}

// --- Calendar (Stage 1 read) ----------------------------------------------

/** Events for the current calendar month (plus a few days either side so the
 *  grid's leading/trailing cells are covered). */
export async function getCalendarEventsLive(): Promise<CalendarEvent[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 7 * DAY;
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime() + 7 * DAY;
  try {
    return mapCalendarEvents(await fetchCalendarEvents(start, end));
  } catch {
    return [];
  }
}

/** Upcoming booked calls (now through +30 days) for the call calendar. A GHL
 *  outage yields an empty list (honest empty state), never the error boundary. */
export async function getCallBookingsLive(): Promise<CallBooking[]> {
  const now = Date.now();
  try {
    const [{ clients }, events, users] = await Promise.all([
      loadLiveData(),
      fetchCalendarEvents(now, now + 30 * DAY),
      loadUsers(),
    ]);
    return mapCallBookings(events, clients, users);
  } catch {
    return [];
  }
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const { clients, coaches, leads } = await loadLiveData();
  const active = clients.filter((c) => c.status === "active");
  const cancelled = clients.filter((c) => c.status === "cancelled");
  const mrr = active.reduce((s, c) => s + c.monthlyRate, 0);
  // R17-1a: "gained in the last 30 days" needs a real start date; a client
  // whose start is unknown is not evidence of growth.
  const gained = active.filter((c) => { const w = clientWeek(c); return w !== null && w <= 4; }).length;
  // Lost this month: cancellations whose (known) end date falls in the last
  // 30 days. Historical cancellations without a recent end date stay out of
  // the net-change KPI but still feed lifetime retention below.
  const lost = cancelled.filter(
    (c) => c.endDate && diffDays(c.endDate) >= 0 && diffDays(c.endDate) <= 30,
  ).length;
  // R8-3 (Dan's formula): monthly-average churn on the total roster (per
  // month churned ÷ end-of-month active, averaged), retention = 1 − churn.
  // Replaces the old lifetime active/(active+cancelled) share.
  const churnStats = dashboardChurnStats(clients);
  const retentionPct = churnStats.retentionPct;

  const byPeriod = revenueByPeriod(clients);
  const series = byPeriod.Monthly.series;
  const last = series[series.length - 1]?.value ?? 0;
  const prev = series[series.length - 2]?.value ?? 0;
  const revDeltaPct = prev === 0 ? 0 : ((last - prev) / prev) * 100;

  const won = leads.filter((l) => l.stage === "Submitted").length;
  const lostLeads = leads.filter((l) => l.stage === "Lost").length;
  const closeRatePct = won + lostLeads === 0 ? 0 : (won / (won + lostLeads)) * 100;

  const cards = scorecards(clients, coaches);
  const avgCapacity =
    cards.reduce((s, c) => s + c.capacityPct, 0) / Math.max(1, cards.length);

  return {
    recurringRevenue: mrr,
    recurringRevenueDeltaPct: revDeltaPct,
    mrr,
    activeClients: active.length,
    activeClientsThisMonth: gained,
    netChange: gained - lost,
    gained,
    lost,
    retentionPct,
    churnPct: churnStats.churnPct,
    // R8-3: total Average Week at Churn, all coaches combined.
    avgWeekAtChurn: churnStats.avgWeekAtChurn,
    // Billing run-rate estimate; real cash facts arrive with the Stripe feed.
    cashCollected30d: mrr,
    paused: clients.filter((c) => c.status === "paused").length,
    expiring30d: active.filter((c) => c.journeyStage === "Approaching Renewal").length,
    // Pre-booking top of funnel. Call Offered (DP) sits between Contacted and
    // Call Booked, so it stays in this bucket: without it the count would
    // silently drop when Dan moves a lead one step forward.
    newLeads: leads.filter(
      (l) => l.stage === "New Enquiry" || l.stage === "Contacted" || l.stage === "Call Offered",
    ).length,
    closeRatePct,
    coachCapacityPct: avgCapacity * 100,
    revenueSeries: byPeriod.Monthly.series,
    revenueLastYear: byPeriod.Monthly.lastYear,
    revenuePrevPeriod: byPeriod.Monthly.prevPeriod,
    revenueByPeriod: byPeriod,
    coachCapacity: cards.map((c) => ({
      coachId: c.id,
      name: c.name,
      active: c.activeClients,
      max: c.maxCapacity,
      pct: c.capacityPct,
    })),
    pipeline: PIPELINE_ORDER.map((stage) => ({
      stage,
      count: leads.filter((l) => l.stage === stage).length,
    })),
    social: [
      { channel: "Instagram", followers: 0, deltaPct: 0 },
      { channel: "YouTube", followers: 0, deltaPct: 0 },
      { channel: "TikTok", followers: 0, deltaPct: 0 },
    ],
    todaysFocus: [] as never[],
  };
}
