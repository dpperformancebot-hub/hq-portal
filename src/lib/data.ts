// DATA FACADE (M5) -- single switch between the seed layer and the live GHL
// projection. Screens being moved to live data import from here; screens not
// yet swapped keep importing "@/lib/seed" directly.
//
// Mode resolution:
//   demo  -> NEXT_PUBLIC_DEMO_MODE !== "false"  (default: demo)
//   live  -> NEXT_PUBLIC_DEMO_MODE=false AND GHL_API_TOKEN present
// Missing token in live mode falls back to seed so the app never crashes.

import { BRAND, IS_DP } from "@/lib/brand";
import { DEMO_MODE } from "@/lib/demo";
import { ghlConfigured } from "@/lib/ghl/client";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { listTasks } from "@/lib/tasks";
import { isTaskAssignedTo, isTaskOpenedBy } from "@/lib/task-assignees";
import * as seed from "@/lib/seed";
import * as live from "@/lib/live";
import type { CheckIn, Client, Task, Transformation, TransformationCard } from "@/lib/seed/types";
import type {
  Automation,
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
  Report,
  Sop,
} from "@/lib/seed/m4";
import type { CoachScorecard } from "@/lib/seed";
import { CAPACITY_SLOTS, listWeekCapacity } from "@/lib/capacity";
import { isOpsRole } from "@/lib/navigation";
import { monthlyRetentionSeries, type MonthlyRetentionPoint } from "@/lib/churn-math";
import { WEEKS } from "@/lib/ghl/map";
import {
  stripClientMoney,
  stripClientMoneyAll,
  stripPaymentSignals,
  stripPaymentSignalsAll,
  stripPayRates,
} from "@/lib/pay-visibility";
import { moneyHiddenFromViewer } from "@/lib/access-policy";
import type { Role } from "@/lib/navigation";
import { SETUP_BONUS, RETENTION_BONUS_PER_10_WEEKS, payTreatment } from "@/lib/coach-config";
import { salesRole } from "@/lib/sales-config";
import { listClientNotes, type ClientNote } from "@/lib/client-notes";
import { listPauses } from "@/lib/pause-actions";
import { daysUntilReactivation, reactivatesSoon } from "@/lib/pause-math";
import { listMilestones } from "@/lib/engagement-actions";
import { milestoneState, milestoneWeeks } from "@/lib/engagement-math";
import { clientWeek, effectiveStartDate } from "@/lib/client-start-date";
import { paymentStructure } from "@/lib/journey-buckets";

import { listExpenses } from "@/lib/expenses-actions";
import { CADENCE_LABEL, monthlyAmount } from "@/lib/expenses-math";

export function liveMode(): boolean {
  return !DEMO_MODE && ghlConfigured();
}

/** R4-3: engagement calls currently DUE (unbooked, window reached), for the
 *  VA dashboard and daily digest. Soonest-week first. */
export async function listEngagementDue(): Promise<{ clientName: string; coachName: string; week: number }[]> {
  const [clients, coachNames, milestones] = await Promise.all([
    getClientsData(),
    getCoachNamesData(),
    listMilestones(),
  ]);
  const stored = new Map<string, Record<number, "booked" | "done">>();
  for (const m of milestones) {
    const rec = stored.get(m.clientId) ?? {};
    rec[m.week] = m.state;
    stored.set(m.clientId, rec);
  }
  const due: { clientName: string; coachName: string; week: number }[] = [];
  for (const c of clients) {
    if (c.status !== "active") continue;
    const currentWeek = WEEKS(c.startDate);
    const rec = stored.get(c.id) ?? {};
    for (const w of milestoneWeeks(paymentStructure(c) === "PIF", currentWeek, 16, BRAND.engagement.milestoneCallsAfterWeek)) {
      if (milestoneState(w, currentWeek, rec[w]) === "due") {
        due.push({
          clientName: c.name,
          coachName: c.coachId ? coachNames[c.coachId] ?? "Unassigned" : "Unassigned",
          week: w,
        });
      }
    }
  }
  return due.sort((a, b) => a.week - b.week);
}

/**
 * The roster every ops screen should start from: ACTIVE clients only.
 *
 * CLAUDE.md: "Default all dashboard and roster queries to active-only at the
 * query level." That rule lived in each page's .filter() call, which is one
 * forgotten filter away from putting churned clients on a work list. This is
 * the data-layer default; a screen that genuinely wants paused or cancelled
 * clients asks for them explicitly (getClientsData, or the cancelled list).
 *
 * R17-3 note: this was NOT the cause of the cancelled clients Jameela saw on
 * Engagement. All four she named are `active` in the portal. The real cause is
 * stale GHL Status: 97 of 533 active clients have a term end date that has
 * already passed. See `termEnded` below.
 */
export async function getActiveClientsData(): Promise<Client[]> {
  return (await getClientsData()).filter((c) => c.status === "active");
}

/** True when the client is still marked active but their term end date has
 *  already passed: almost certainly churned in real life with GHL Status never
 *  updated. Surfaced rather than filtered, because guessing someone has
 *  cancelled is the owner's call, not ours. */
export function termEnded(c: Client, today: string = new Date().toISOString().slice(0, 10)): boolean {
  return c.status === "active" && !!c.endDate && c.endDate < today;
}

/** Compact per-client projection for dashboard drill-ins (2026-07-02): the
 *  slide-overs behind each KPI list the actual records. No PII beyond what
 *  the client screens already show. */
export type DashboardClient = {
  id: string;
  name: string;
  status: Client["status"];
  plan: Client["plan"];
  /** R17-1a: null when GHL has no start date. */
  /** R17-1a: null when GHL has no start date. */
  startDate: string | null;
  /** R17-1b: portal override; wins over startDate. */
  startDateOverride?: string | null;
  /** Cancellation/term end when known; drives the net-change lost list (A3). */
  endDate: string | null;
  termLength: number | null;
  coachId: string | null;
};

/** Dashboard expense roll-up (2026-07-02, owner request): coach pay computed
 *  from live rosters on each coach's rates (same formula as the Financials
 *  payouts table) plus the owner-entered recurring expenses, normalized to
 *  monthly. */
export type ExpensesSummary = {
  coachPayMonthly: number;
  recurringMonthly: number;
  totalMonthly: number;
  coachLines: { name: string; amount: number }[];
  recurring: { name: string; amountMonthly: number; cadence: string; active: boolean }[];
};

export async function getDashboardData() {
  const [clients, coachNames] = await Promise.all([getClientsData(), getCoachNamesData()]);
  const clientIndex: DashboardClient[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    plan: c.plan,
    startDate: c.startDate,
    startDateOverride: c.startDateOverride ?? null,
    endDate: c.endDate ?? null,
    termLength: c.termLength ?? null,
    coachId: c.coachId,
  }));
  // Expense roll-up: coach pay from rosters (Financials payouts formula:
  // weekly plan = weeklyRate x 4, else fortnightlyRate x 2, per active
  // client) + owner-entered recurring expenses (monthly-normalized).
  const [scorecards, expenseRows, weekCapacity] = await Promise.all([
    getCoachScorecardsData(),
    listExpenses(),
    listWeekCapacity(),
  ]);
  // R8-1: this week's self-reported capacity (band midpoints). Null until
  // anyone has answered, honest, never faked.
  const capacityWeek =
    weekCapacity.length === 0
      ? null
      : {
          total: Math.round(weekCapacity.reduce((s2, c) => s2 + (CAPACITY_SLOTS[c.capacity] ?? 0), 0)),
          answered: weekCapacity.length,
          rows: weekCapacity.map((c) => ({
            coachId: c.coachId,
            band: c.capacity as string,
            slots: CAPACITY_SLOTS[c.capacity] ?? 0,
          })),
        };
  const activeClients = clients.filter((c) => c.status === "active");
  const coachLines = scorecards
    .map((co) => ({
      name: co.name,
      amount: activeClients
        .filter((cl) => cl.coachId === co.id)
        .reduce((s, cl) => s + (cl.plan === "Weekly" ? co.weeklyRate * 4 : co.fortnightlyRate * 2), 0),
    }))
    .filter((l) => l.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const coachPayMonthly = coachLines.reduce((s, l) => s + l.amount, 0);
  const recurring = expenseRows.map((e) => ({
    name: e.name,
    amountMonthly: Math.round(monthlyAmount(e)),
    cadence: CADENCE_LABEL[e.cadence],
    active: e.active,
  }));
  const recurringMonthly = expenseRows
    .filter((e) => e.active)
    .reduce((s, e) => s + monthlyAmount(e), 0);
  const expensesSummary: ExpensesSummary = {
    coachPayMonthly: Math.round(coachPayMonthly),
    recurringMonthly: Math.round(recurringMonthly),
    totalMonthly: Math.round(coachPayMonthly + recurringMonthly),
    coachLines,
    recurring,
  };

  if (liveMode()) {
    const [metrics, coachLeaderboard, salesLeaderboard] = await Promise.all([
      live.getDashboardMetrics(),
      live.getCoachLeaderboard(),
      live.getSalesLeaderboard(),
    ]);
    return { metrics, coachLeaderboard, salesLeaderboard, clientIndex, coachNames, expensesSummary, capacityWeek };
  }
  return {
    metrics: seed.getDashboardMetrics(),
    coachLeaderboard: seed.getCoachLeaderboard(),
    salesLeaderboard: seed.getSalesLeaderboard(),
    clientIndex,
    coachNames,
    expensesSummary,
    capacityWeek,
  };
}

export async function getClientsData(): Promise<Client[]> {
  return liveMode() ? live.getClients() : seed.getClients();
}

/** id -> name for every coach (live or seed). Passed into client components so
 *  they resolve live Supabase coach UUIDs without the server-only registry
 *  (see makeCoachNamer in renewals/coach-name.ts). Shares the React-cached live
 *  load with the roster query, so this adds no extra DB round trip. */
/** id -> name, for DISPLAY. Includes deactivated coaches on purpose: every
 *  caller is rendering a name against something that already happened (a
 *  client's history, a renewal, a task, a report), and a removed coach must
 *  still read as themselves there rather than as a blank. Pickers and rosters
 *  use getCoachesData(), which stays active-only. */
export async function getCoachNamesData(): Promise<Record<string, string>> {
  if (liveMode()) return live.getAllCoachNames();
  const map: Record<string, string> = {};
  for (const c of seed.getCoaches()) map[c.id] = c.name;
  return map;
}

export async function getLeadsData() {
  return liveMode() ? live.getLeads() : seed.getLeads();
}

export async function getCoachScorecardsData() {
  return liveMode() ? live.getCoachScorecards() : seed.getCoachScorecards();
}

export async function getFinancialsData() {
  return liveMode() ? live.getFinancials() : seed.getFinancials();
}

// ------------------------------------------------ document + content stores
// Datastore Phase 1 (migration 20260620000001). Read live from Supabase when
// live mode is on AND persistence is configured; otherwise the existing seed.
// In live mode an empty table returns [] (screens have empty states): we do
// NOT fall back to seed once live persistence is on. Names mirror the seed
// selectors so the per-store screens can swap their source in a later step.

// Client Audits auto-populate from the active/paused roster (one per client,
// placed on the 4-week cadence) with any persisted status/resolved overlaid.
// Live derives + overlays in the live layer; demo enriches the seed audits with
// seed names so the view renders names without a client/coach lookup of its own.
export async function getAudits(): Promise<live.AuditCard[]> {
  if (liveMode() && persistenceEnabled()) return live.getAudits();
  return seed.getAudits().map((a) => ({
    ...a,
    clientName: seed.clientName(a.clientId),
    coachName: seed.coachName(a.coachId),
  }));
}

export async function getSops(): Promise<Sop[]> {
  return liveMode() && persistenceEnabled() ? live.getSops() : seed.getSops();
}

export async function getContracts(): Promise<Contract[]> {
  return liveMode() && persistenceEnabled() ? live.getContracts() : seed.getContracts();
}

export async function getBrief(): Promise<BriefItem[]> {
  return liveMode() && persistenceEnabled() ? live.getBrief() : seed.getBrief();
}

export async function getMerch(): Promise<MerchProduct[]> {
  return liveMode() && persistenceEnabled() ? live.getMerch() : seed.getMerch();
}

export async function getContentPosts(): Promise<ContentPost[]> {
  return liveMode() && persistenceEnabled() ? live.getContentPosts() : seed.getContentPosts();
}

export async function getCollaborations(): Promise<Collaboration[]> {
  return liveMode() && persistenceEnabled() ? live.getCollaborations() : seed.getCollaborations();
}

export async function getBrandAssets(): Promise<BrandAsset[]> {
  return liveMode() && persistenceEnabled() ? live.getBrandAssets() : seed.getBrandAssets();
}

// Brand / marketing / reports stores (migration 20260630000002). Same rule as
// the document stores above: live Supabase rows when live + persistence, else
// the seed list. An empty live table renders the screen's empty state.

export async function getReportsData(): Promise<Report[]> {
  return liveMode() && persistenceEnabled() ? live.getReports() : seed.getReports();
}

export async function getBrandBuildData(): Promise<BuildTask[]> {
  return liveMode() && persistenceEnabled() ? live.getBrandBuild() : seed.getBrandBuild();
}

export async function getHiresData(): Promise<Hire[]> {
  return liveMode() && persistenceEnabled() ? live.getHires() : seed.getHires();
}

export async function getCampaignsData(): Promise<Campaign[]> {
  return liveMode() && persistenceEnabled() ? live.getCampaigns() : seed.getCampaigns();
}

export async function getLeadMagnetsData(): Promise<LeadMagnet[]> {
  return liveMode() && persistenceEnabled() ? live.getLeadMagnets() : seed.getLeadMagnets();
}

// Automations are a fixed catalog (the seed list), unlike the user-created
// stores above. When persistence is on we MERGE persisted rows over the seed
// catalog by name: a toggle or rule edit writes one automations row (config
// only, no engine), and that row overrides its seed defaults here. The catalog
// always shows, even before anything is persisted. `live` tells the view it can
// persist (and reads reflect the store); demo mode keeps toggles local.
export async function getAutomationsData(): Promise<{ automations: Automation[]; live: boolean }> {
  // R10: the seeded catalog is DP's planned automation set (with aspirational
  // statuses). A rebranded deploy starts from its own persisted rows only.
  const catalog = IS_DP ? seed.getAutomations() : [];
  if (!(liveMode() && persistenceEnabled())) return { automations: catalog, live: false };
  const rows = await live.getAutomations();
  const byName = new Map(rows.map((r) => [r.name, r]));
  // Override each catalog rule with its persisted row (keep seed-only isNew),
  // then append any persisted rule whose name is not in the catalog.
  const merged = catalog.map((a) => {
    const row = byName.get(a.name);
    return row ? { ...a, ...row, isNew: a.isNew } : a;
  });
  const names = new Set(catalog.map((a) => a.name));
  const extras = rows.filter((r) => !names.has(r.name));
  return { automations: [...merged, ...extras], live: true };
}

// ----------------------------------------------------------------- M4 inbox + calendar
// Stage 1 (read): live in live mode, seed otherwise. `live` tells the inbox
// view to drop the MOCK banner and load thread messages on demand.

export async function getInboxData(): Promise<{ conversations: Conversation[]; live: boolean }> {
  if (liveMode()) return { conversations: await live.getInbox(), live: true };
  return { conversations: seed.getConversations(), live: false };
}

/** On-demand thread messages. In live mode hits GHL; in demo returns the
 *  seed thread's own messages (the demo view rarely calls this since seed
 *  threads ship with messages, but it stays correct if it does). */
export async function getMessagesData(conversationId: string): Promise<ConversationMessage[]> {
  if (liveMode()) return live.getMessages(conversationId);
  return seed.getConversations().find((c) => c.id === conversationId)?.messages ?? [];
}

export async function getCalendarData(): Promise<CalendarEvent[]> {
  return liveMode() ? live.getCalendarEventsLive() : seed.getCalendarEvents();
}

export async function getCallCalendarData(): Promise<CallBooking[]> {
  return liveMode() ? live.getCallBookingsLive() : seed.getCallBookings();
}

export type { RenewalRow, SalesRepRow, AuditCard } from "@/lib/live";

// ---------------------------------------------------------------- M6 roles
// QUERY-LEVEL SCOPING: these are the single choke points for role-scoped
// data. Coach data is filtered to one coach HERE, never in components. When
// per-screen Supabase reads land, these become WHERE clauses.

export type CoachDashboardData = {
  coach: CoachScorecard | null;
  roster: Client[];
  /** Check-ins on record across the visible roster in the last 7 days. */
  checkInsThisWeek: number;
  /** Roster clients whose latest check-in code is ghosted (G). */
  atRisk: Client[];
  /** Unresolved audit cards (this coach's, or every coach's for a head coach). */
  auditsToReview: number;
  /** This coach's own pay snapshot (own roster even for a head coach). */
  pay: { gross: number; nextPayDate: string };
  /** 12-week trend series (Monday-start weeks, oldest first): the coach's own
   *  business arc (2026-07-02). pay from the Pay Log, check-ins per week,
   *  roster size over time. */
  trends: { weeks: string[]; checkIns: number[]; pay: number[]; roster: number[] };
  /** Complete-month retention history for the D1 panel (this coach's own
   *  roster incl. cancelled history). */
  retentionMonths: MonthlyRetentionPoint[];
};

const WEEK_MS = 7 * 86_400_000;
const mondayOf = (t: number): number => {
  const d = new Date(t);
  const day = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
};

/** Shared coach scoping context. coachId comes from users.linked_coach_id in
 *  clerk mode. DEFAULT DECISION (flagged): in dev preview (no auth), the
 *  coach views preview as the head coach (Angus); falls back to the first
 *  coach. Returns the coach plus ONLY that coach's clients. */
/** Coach-card resolution shared by resolveCoachContext and getIsHeadCoach:
 *  the requested coach, else (DEV PREVIEW ONLY) the head coach, else the
 *  first coach.
 *
 *  Under real auth (AUTH_MODE=clerk) there is NO fallback: an unknown or
 *  unlinked coach id resolves to null (empty roster). The old unconditional
 *  head-coach fallback meant a coach login with no linked_coach_id resolved
 *  AS the head coach, inheriting all-client visibility and head-coach
 *  elevation (getIsHeadCoach(null) returned true). Fixed 2026-07-24.
 *  Env read directly (not role-server's clerkAuthEnabled) so this module
 *  never pulls next/headers into a client bundle. */
function resolveCoachCard(cards: CoachScorecard[], coachId?: string | null): CoachScorecard | null {
  const requested = coachId ? cards.find((c) => c.id === coachId) ?? null : null;
  if (requested) return requested;
  if (process.env.AUTH_MODE === "clerk") return null;
  return cards.find((c) => c.role === "head_coach") ?? cards[0] ?? null;
}

/** Head-coach check for getServerIdentity: same resolution (and dev-preview
 *  fallback) as resolveCoachContext, without fetching the roster. */
export async function getIsHeadCoach(coachId?: string | null): Promise<boolean> {
  const cards = liveMode() ? await live.getCoachScorecards() : seed.getCoachScorecards();
  return resolveCoachCard(cards, coachId)?.role === "head_coach";
}

/** Who is looking at a coach-facing payload: the REAL signed-in role
 *  (ServerIdentity.realRole) and the EFFECTIVE role (ServerIdentity.role).
 *  Coach loaders take it so a coach or head coach never gets client money,
 *  and on TJD neither does the owner viewing as a coach (the coach view is
 *  exactly what the coach sees). The owner not viewing as anyone keeps it. */
export type MoneyViewer = { realRole: Role; role: Role };

/** Brand.pay.coachCanSeePay = false (TJD): coach loaders strip every client
 *  $ figure (price, monthly equivalent, billed to date) unless the caller
 *  proves the viewer may see money. A missing viewer fails CLOSED, so an
 *  action or page that forgets to pass one leaks nothing. DP (flag true)
 *  never strips: unchanged. */
function coachLoaderHidesMoney(viewer?: MoneyViewer | null): boolean {
  if (BRAND.pay.coachCanSeePay) return false;
  return viewer ? moneyHiddenFromViewer(viewer) : true;
}

async function resolveCoachContext(
  coachId?: string | null,
  viewer?: MoneyViewer | null,
): Promise<{
  coach: CoachScorecard | null;
  /** Visible roster: this coach's own clients, or EVERY coach's clients when
   *  the resolved coach is the head coach (Angus). Drives the coaching screens. */
  clients: Client[];
  /** Always this coach's own clients, regardless of head-coach status. Used by
   *  My Pay so a head coach's pay stays scoped to their own roster. */
  ownClients: Client[];
  isHeadCoach: boolean;
}> {
  const [cards, allClients] = liveMode()
    ? await Promise.all([live.getCoachScorecards(), live.getClients()])
    : [seed.getCoachScorecards(), seed.getClients()];
  const coach = resolveCoachCard(cards, coachId);
  const isHeadCoach = coach?.role === "head_coach";
  // B2: payment-structure signals (billingFrequency/termLength, the PIF/WBW
  // inputs) are owner/VA-only, so they are stripped from every coach-facing
  // roster payload here at the source.
  // TJD (coachCanSeePay false): client prices are stripped here too, at the
  // single choke point every coach roster payload flows through.
  const forCoach = (list: Client[]) =>
    coachLoaderHidesMoney(viewer) ? stripClientMoneyAll(stripPaymentSignalsAll(list)) : stripPaymentSignalsAll(list);
  const ownClients = coach ? forCoach(allClients.filter((cl) => cl.coachId === coach.id)) : [];
  // Head coach sees every coach's clients across the coaching screens; pay stays
  // own-only (ownClients). Everyone else sees only their own roster.
  const clients = isHeadCoach ? forCoach(allClients) : ownClients;
  return { coach, clients, ownClients, isHeadCoach };
}

export async function getCoachDashboardData(
  coachId?: string | null,
  opts?: {
    /** Scope to the coach's OWN roster even when they are the head coach.
     *  The per-coach overview (/coach-overview/[coachId]) reviews ONE coach,
     *  so the head coach's all-coach widening must not apply there. */
    ownOnly?: boolean;
    /** The real viewer; omitted = strip client money on a no-pay brand. */
    viewer?: MoneyViewer | null;
  },
): Promise<CoachDashboardData> {
  const ctx = await resolveCoachContext(coachId, opts?.viewer);
  const { coach } = ctx;
  const clients = opts?.ownOnly ? ctx.ownClients : ctx.clients;
  const isHeadCoach = ctx.isHeadCoach && !opts?.ownOnly;
  const roster = clients.filter((cl) => cl.status === "active");
  if (!coach) {
    return {
      coach: null,
      roster: [],
      checkInsThisWeek: 0,
      atRisk: [],
      auditsToReview: 0,
      pay: { gross: 0, nextPayDate: nextPayDate() },
      trends: { weeks: [], checkIns: [], pay: [], roster: [] },
      retentionMonths: [],
    };
  }
  const rosterIds = new Set(clients.map((c) => c.id));
  // Query-level scoping (2026-07-02): full per-coach history, not a slice of
  // the newest 1000 global rows.
  const checkIns =
    liveMode() && persistenceEnabled() ? await live.getCheckInsScoped(isHeadCoach ? null : coach.id) : [];
  // check_ins comes newest-first, so the first row seen per client is the latest.
  const latestCode = new Map<string, string | null>();
  for (const ci of checkIns) {
    if (rosterIds.has(ci.clientId) && !latestCode.has(ci.clientId)) latestCode.set(ci.clientId, ci.code);
  }
  const weekAgo = Date.now() - 7 * 86_400_000;
  const checkInsThisWeek = checkIns.filter(
    (ci) => rosterIds.has(ci.clientId) && Date.parse(ci.submittedAt) >= weekAgo,
  ).length;
  const atRisk = roster.filter((c) => latestCode.get(c.id) === "G");
  // getCoachAuditsData widens to all coaches for a head coach; own-roster
  // scope narrows it back to just this coach's clients.
  const audits = (await getCoachAuditsData(coachId)).filter(
    (a) => !opts?.ownOnly || a.coachId === coach.id,
  );
  const auditsToReview = audits.filter((a) => !a.resolved).length;
  const payData = await getMyPayData(coachId);

  // 12-week trends. Check-ins bucket by Monday-start week; pay aligns the Pay
  // Log's week columns onto the same buckets; roster counts clients started by
  // each week's end (active roster only, so it reads as "my roster now").
  const currentWeek = mondayOf(Date.now());
  const weekStarts = Array.from({ length: 12 }, (_, i) => currentWeek - (11 - i) * WEEK_MS);
  const ciBuckets = new Map<number, number>();
  for (const ci of checkIns) {
    if (!rosterIds.has(ci.clientId)) continue;
    const t = Date.parse(ci.submittedAt);
    if (Number.isNaN(t)) continue;
    const w = mondayOf(t);
    ciBuckets.set(w, (ciBuckets.get(w) ?? 0) + 1);
  }
  const payBuckets = new Map<number, number>();
  payData.payLog.weeks.forEach((wk, i) => {
    const t = Date.parse(wk);
    if (Number.isNaN(t)) return;
    const w = mondayOf(t);
    const total = payData.payLog.rows.reduce((s, r) => s + (r.cells[i]?.amount ?? 0), 0);
    payBuckets.set(w, (payBuckets.get(w) ?? 0) + total);
  });
  const trends = {
    weeks: weekStarts.map((w) => new Date(w).toISOString().slice(0, 10)),
    checkIns: weekStarts.map((w) => ciBuckets.get(w) ?? 0),
    pay: weekStarts.map((w) => Math.round(payBuckets.get(w) ?? 0)),
    roster: weekStarts.map((w) =>
      roster.filter((c) => {
        const iso = effectiveStartDate(c);
        return iso !== null && Date.parse(iso) <= w + WEEK_MS;
      }).length,
    ),
  };

  return {
    coach,
    roster,
    checkInsThisWeek,
    atRisk,
    auditsToReview,
    pay: { gross: payData.gross, nextPayDate: payData.nextPayDate },
    trends,
    // D1: monthly retention history from the coach's OWN full history
    // (cancelled included), regardless of the head-coach widening above.
    retentionMonths: monthlyRetentionSeries(ctx.ownClients),
  };
}

export type CoachRosterData = {
  coach: CoachScorecard | null;
  /** Active first, then paused; cancelled/past excluded (active-only rule,
   *  paused included because coaches still check on paused clients). */
  clients: Client[];
  /** This coach's check-ins (Kahunas via Zapier), latest first. Empty in demo
   *  mode or until the feed lands. */
  checkIns: CheckIn[];
  /** R12-2: the coach's cancelled/past clients, kept SEPARATE so the default
   *  roster (and the check-ins grid, which shares this data) stays active-only.
   *  My Clients reveals them behind a "Show cancelled" toggle so a coach can
   *  reconcile their portal count against their own sheet. */
  cancelledClients: Client[];
};

export async function getCoachRosterData(
  coachId?: string | null,
  opts?: {
    /** Scope to the coach's OWN roster even when they are the head coach.
     *  R15-1 (Angus, 2026-09-05): "My Clients" showed the head coach every
     *  client in the business, so his own roster was unfindable inside it.
     *  Same escape hatch getCoachDashboardData already offers. */
    ownOnly?: boolean;
    /** The real viewer; omitted = strip client money on a no-pay brand. */
    viewer?: MoneyViewer | null;
  },
): Promise<CoachRosterData> {
  const ctx = await resolveCoachContext(coachId, opts?.viewer);
  const { coach } = ctx;
  const clients = opts?.ownOnly ? ctx.ownClients : ctx.clients;
  const isHeadCoach = ctx.isHeadCoach && !opts?.ownOnly;
  const order = { active: 0, paused: 1 } as Record<Client["status"], number>;
  // Query-level scoping (2026-07-02): a coach gets their FULL history (the
  // week grid needs it); the head coach sees all coaches over a 16-week
  // window. The old path filtered the newest 1000 global rows in JS, which
  // starved per-coach history. ownOnly narrows the check-in query too, so the
  // grid matches the roster beside it.
  const checkIns = liveMode() && coach ? await live.getCheckInsScoped(isHeadCoach ? null : coach.id) : [];
  return {
    coach: coachCardForCoachScreens(coach),
    clients: clients
      .filter((cl) => cl.status === "active" || cl.status === "paused")
      .sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name)),
    checkIns,
    cancelledClients: clients
      .filter((cl) => cl.status === "cancelled" || cl.status === "past")
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Brand.pay.coachCanSeePay = false (TJD): the coach card's own pay rates are
 *  stripped from the coach-facing roster/results payloads at the source. No
 *  coach screen renders them, but RSC props ship unrendered. Brand-wide on
 *  purpose: the owner viewing as a coach loses nothing (the fields are never
 *  shown there) and the owner's pay surfaces read rates through their own
 *  paths. DP (true) is unchanged. */
function coachCardForCoachScreens(coach: CoachScorecard | null): CoachScorecard | null {
  if (!coach || BRAND.pay.coachCanSeePay) return coach;
  return stripPayRates(coach);
}

export type CoachResultsData = {
  coach: CoachScorecard | null;
  transformations: { t: Transformation; clientName: string }[];
};

export async function getCoachResultsData(coachId?: string | null): Promise<CoachResultsData> {
  const { coach, clients, isHeadCoach } = await resolveCoachContext(coachId);
  if (!coach) return { coach: null, transformations: [] };
  // Transformations are HQ-native (coach logs + Kahunas). Live reads the
  // Supabase table; demo shows seed data. Names come from the visible roster
  // (all coaches' clients for a head coach).
  const nameById = new Map(clients.map((c) => [c.id, c.name]));
  const all = liveMode() ? await live.getTransformations() : seed.getTransformations();
  return {
    coach: coachCardForCoachScreens(coach),
    transformations: all
      .filter((t) => isHeadCoach || t.coachId === coach.id)
      .map((t) => ({ t, clientName: nameById.get(t.clientId) ?? "Unknown client" })),
  };
}

/** Coach Client Audits: the auto-populated audit cadence filtered to this
 *  coach's own clients. getAudits already scopes to active + paused clients
 *  and branches seed/live; here we keep only the cards whose coachId is this
 *  coach. The status/resolved writes go through the shared audit-actions keyed
 *  by the card's client_id, so a coach only ever touches their own clients. */
export async function getCoachAuditsData(coachId?: string | null): Promise<live.AuditCard[]> {
  const { coach, isHeadCoach } = await resolveCoachContext(coachId);
  if (!coach) return [];
  const audits = await getAudits();
  return isHeadCoach ? audits : audits.filter((a) => a.coachId === coach.id);
}

export type CoachTasksData = {
  coachName: string | null;
  tasks: Task[];
  /** True when the live store backs the screen, so create/complete/edit are
   *  enabled (live mode + persistence); demo is a read-only seed view. */
  live: boolean;
};

/** Coach Tasks: only tasks assigned to this coach (tasks.assignee_name = the
 *  coach's name). Live reads the Supabase tasks table; demo filters the seed
 *  list. The view locks the assignee picker to this coach, so a coach can
 *  neither see nor reassign anyone else's tasks. */
export async function getCoachTasksData(
  coachId?: string | null,
  /** The signed-in person's extra keys (users.id, users/invite name), so a
   *  task assigned to them by id or by their invite name before their first
   *  sign-in still lands on this board. Omit for the name-only match. */
  viewer?: { userId?: string | null; names?: string[] },
): Promise<CoachTasksData> {
  const { coach } = await resolveCoachContext(coachId);
  const isLive = liveMode() && persistenceEnabled();
  if (!coach) return { coachName: null, tasks: [], live: isLive };
  const all = persistenceEnabled() ? await listTasks().catch(() => []) : seed.getTasks();
  const keys = { userId: viewer?.userId ?? null, names: [coach.name, ...(viewer?.names ?? [])] };
  return {
    coachName: coach.name,
    // C2/C3: a coach sees tasks assigned to them AND tickets they opened (so
    // they can watch what they delegated up the chain). Matched normalised.
    tasks: all.filter((t) => isTaskAssignedTo(t, keys) || isTaskOpenedBy(t, keys)),
    live: isLive,
  };
}

/** Owner Results Tracker: every transformation enriched with client + coach
 *  names. Live reads the Supabase table; demo uses seed. */
export async function getTransformationsData(): Promise<TransformationCard[]> {
  if (liveMode()) {
    const [transformations, clients, coaches] = await Promise.all([
      live.getTransformations(),
      live.getClients(),
      live.getCoaches(),
    ]);
    const cn = new Map(clients.map((c) => [c.id, c.name]));
    const kn = new Map(coaches.map((c) => [c.id, c.name]));
    return transformations.map((t) => ({
      ...t,
      clientName: cn.get(t.clientId) ?? "Unknown client",
      coachName: kn.get(t.coachId) ?? "Unknown coach",
    }));
  }
  return seed.getTransformations().map((t) => ({
    ...t,
    clientName: seed.clientName(t.clientId),
    coachName: seed.coachName(t.coachId),
  }));
}

export type ClientDetailData = {
  client: Client;
  checkIns: CheckIn[];
  transformations: Transformation[];
  notes: ClientNote[];
};

/** One client plus their check-in history, transformations, and HQ notes. Live
 *  reads the Supabase tables; demo has no check-ins/notes and uses seed
 *  transformations. */
export async function getClientDetailData(id: string): Promise<ClientDetailData | null> {
  const client = (await getClientsData()).find((c) => c.id === id);
  if (!client) return null;
  if (liveMode()) {
    const [checkIns, transformations, notes] = await Promise.all([
      live.getCheckIns(),
      live.getTransformations(),
      listClientNotes(id),
    ]);
    return {
      client,
      checkIns: checkIns.filter((ci) => ci.clientId === id),
      transformations: transformations.filter((t) => t.clientId === id),
      notes,
    };
  }
  return {
    client,
    checkIns: [],
    transformations: seed.getTransformations().filter((t) => t.clientId === id),
    notes: [],
  };
}

/** Coach-scoped client detail: the full client profile, but only when the
 *  client is in this coach's visible roster (a head coach sees any). Null
 *  otherwise, so a coach can never open another coach's client by URL. */
export async function getCoachClientDetail(
  clientId: string,
  coachId?: string | null,
  /** The real viewer; omitted = strip client money on a no-pay brand. */
  viewer?: MoneyViewer | null,
): Promise<ClientDetailData | null> {
  const { clients } = await resolveCoachContext(coachId, viewer);
  if (!clients.some((c) => c.id === clientId)) return null;
  const detail = await getClientDetailData(clientId);
  if (!detail) return null;
  // B2: coach-facing detail, so the payment-structure signals stay server-side.
  const client = stripPaymentSignals(detail.client);
  // TJD: and the client's price/billed-to-date never reach a coach (this
  // also covers getClientPanelAction, the slide-over's server action).
  return { ...detail, client: coachLoaderHidesMoney(viewer) ? stripClientMoney(client) : client };
}

export type MyPayData = {
  coach: CoachScorecard | null;
  /** Per active client, ACCURATE pay from their real weekly check-ins via
   *  PAY_RULES: earned (sum of weekly pay), paidWeeks, ghostedWeeks, plus the
   *  retention bonus. ratePerWeek comes from the coach row (weeklyRate /
   *  fortnightlyRate), never from a figure written into this file. On a brand
   *  with no bonuses the retention field stays 0 and the UI hides it entirely
   *  rather than rendering a zero (see src/lib/pay/pay-display.ts). */
  lines: {
    clientName: string;
    plan: Client["plan"];
    ratePerWeek: number;
    weeks: number;
    paidWeeks: number;
    ghostedWeeks: number;
    earned: number;
    retentionBonus: number;
  }[];
  /** Sum of weekly pay earned across the roster, from real check-ins. */
  gross: number;
  weeklyCount: number;
  fortnightlyCount: number;
  /** $50 onboarding per client (estimated as one per active client until the
   *  program-date field is fed in) and $50 per full 10 weeks retained. */
  onboardingBonus: number;
  retentionBonus: number;
  bonusesTotal: number;
  /** gross + bonuses. */
  total: number;
  /** Next payday: Brand.pay day-of-month, covering the prior month. */
  nextPayDate: string;
  /** Check-in pay accrued in the month the NEXT payday covers (A6: the coach
   *  portal headlines the coming pay cycle, not an all-time total). */
  cycle: { label: string; gross: number };
  /** Week-by-week pay grid (every logged week; the view pages): the Pay Log. */
  payLog: {
    weeks: string[];
    rows: {
      clientName: string;
      ratePerWeek: number;
      total: number;
      cells: ({ code: string; amount: number } | null)[];
    }[];
  };
};

/** Next payday: Brand.pay.paydayDayOfMonth of the month, covering the prior
 *  month (R9-1: per-brand; both brands currently pay on the 5th). */
function nextPayDate(): string {
  const day = BRAND.pay.paydayDayOfMonth;
  const now = new Date();
  const payDate =
    now.getDate() <= day
      ? new Date(now.getFullYear(), now.getMonth(), day)
      : new Date(now.getFullYear(), now.getMonth() + 1, day);
  // Short month: "5 Sep 2026" fits the KPI card (R10 overflow pass).
  return payDate.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/** The calendar month the next payday covers (the month before the pay date's
 *  month, per the pay-on-the-5th-for-prior-month rule). */
function payCycleWindow(): { start: number; end: number; label: string } {
  const now = new Date();
  // Pay month: this month if we are on/before payday, else next month.
  const payMonth =
    now.getDate() <= BRAND.pay.paydayDayOfMonth
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const start = new Date(payMonth.getFullYear(), payMonth.getMonth() - 1, 1);
  const end = payMonth;
  return {
    start: start.getTime(),
    end: end.getTime(),
    label: start.toLocaleDateString("en-AU", { month: "long", year: "numeric" }),
  };
}

export async function getMyPayData(coachId?: string | null): Promise<MyPayData> {
  const { coach, ownClients } = await resolveCoachContext(coachId);
  if (!coach)
    return {
      coach: null,
      lines: [],
      gross: 0,
      weeklyCount: 0,
      fortnightlyCount: 0,
      onboardingBonus: 0,
      retentionBonus: 0,
      bonusesTotal: 0,
      total: 0,
      nextPayDate: nextPayDate(),
      cycle: { label: payCycleWindow().label, gross: 0 },
      payLog: { weeks: [], rows: [] },
    };
  // Pay is always the coach's OWN roster, even for a head coach.
  const active = ownClients.filter((cl) => cl.status === "active");
  const ownIds = new Set(ownClients.map((c) => c.id));
  // Real weekly check-ins drive the pay (PAY_RULES decides which code pays).
  // Scoped at the query level (2026-07-02): pay needs the coach's FULL
  // history, which the unscoped 1000-row page could silently truncate.
  const checkIns = liveMode() && persistenceEnabled() ? await live.getCheckInsScoped(coach.id) : [];
  const byClient = new Map<string, CheckIn[]>();
  for (const ci of checkIns) {
    if (!ownIds.has(ci.clientId)) continue;
    const arr = byClient.get(ci.clientId);
    if (arr) arr.push(ci);
    else byClient.set(ci.clientId, [ci]);
  }
  // Collected for the Pay Log grid: every week key seen + per-client cells.
  const allWeeks = new Set<string>();
  const grid: {
    clientName: string;
    ratePerWeek: number;
    total: number;
    cells: Map<string, { code: string; amount: number }>;
  }[] = [];
  const lines = active
    .map((cl) => {
      const ratePerWeek = cl.plan === "Fortnightly" ? coach.fortnightlyRate : coach.weeklyRate;
      const cis = (byClient.get(cl.id) ?? [])
        .slice()
        .sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
      let earned = 0;
      let paidWeeks = 0;
      let ghostedWeeks = 0;
      let consecGhost = 0;
      const cells = new Map<string, { code: string; amount: number }>();
      for (const ci of cis) {
        const wk = ci.submittedAt.slice(0, 10);
        allWeeks.add(wk);
        const t = payTreatment(ci.code);
        let amount = 0;
        if (t === "full") {
          amount = ratePerWeek;
          earned += amount;
          paidWeeks += 1;
          consecGhost = 0;
        } else if (t === "ghosted") {
          consecGhost += 1;
          ghostedWeeks += 1;
          if (consecGhost <= 2) amount = ratePerWeek * 0.5; // Dan's rule
          earned += amount;
        } else {
          consecGhost = 0;
        }
        cells.set(wk, { code: ci.code ?? "", amount: Math.round(amount) });
      }
      const weeks = WEEKS(cl.startDate);
      grid.push({ clientName: cl.name, ratePerWeek, total: Math.round(earned), cells });
      return {
        clientName: cl.name,
        plan: cl.plan,
        ratePerWeek,
        weeks,
        paidWeeks,
        ghostedWeeks,
        earned: Math.round(earned),
        retentionBonus: Math.floor(weeks / 10) * RETENTION_BONUS_PER_10_WEEKS,
      };
    })
    .sort((a, b) => b.earned - a.earned);
  const gross = lines.reduce((s, l) => s + l.earned, 0);
  const weeklyCount = active.filter((cl) => cl.plan !== "Fortnightly").length;
  const fortnightlyCount = active.filter((cl) => cl.plan === "Fortnightly").length;
  const onboardingBonus = active.length * SETUP_BONUS;
  const retentionBonus = lines.reduce((s, l) => s + l.retentionBonus, 0);
  const bonusesTotal = onboardingBonus + retentionBonus;
  // This pay cycle: check-in pay whose week falls inside the month the next
  // payday covers (A6).
  const cycleWin = payCycleWindow();
  let cycleGross = 0;
  for (const g of grid) {
    for (const [wk, cell] of g.cells) {
      const t = Date.parse(wk);
      if (!Number.isNaN(t) && t >= cycleWin.start && t < cycleWin.end) cycleGross += cell.amount;
    }
  }
  // Pay Log: every logged week (R12-14: the view pages in windows, so the
  // full history has to travel), clients ordered by earnings.
  const weekCols = [...allWeeks].sort();
  const payLogRows = grid
    .sort((a, b) => b.total - a.total)
    .map((g) => ({
      clientName: g.clientName,
      ratePerWeek: g.ratePerWeek,
      total: g.total,
      cells: weekCols.map((wk) => g.cells.get(wk) ?? null),
    }));
  return {
    coach,
    lines,
    gross,
    weeklyCount,
    fortnightlyCount,
    onboardingBonus,
    retentionBonus,
    bonusesTotal,
    total: gross + bonusesTotal,
    nextPayDate: nextPayDate(),
    cycle: { label: cycleWin.label, gross: Math.round(cycleGross) },
    payLog: { weeks: weekCols, rows: payLogRows },
  };
}

export type SalesDashboardData = {
  pipelineEmpty: boolean;
  newLeads: number;
  toAction: number;
  consultsBooked: number;
  consultsCompleted: number;
  followUps: number;
  onboarded: number;
  closeRatePct: number | null; // null until any lead reaches Submitted/Lost
  bySource: { source: string; count: number }[];
  /** Live DM signals from the connected GHL inbox (2026-07-03). null = the
   *  message feed is not connected yet (view keeps its honest placeholder). */
  dm: { inboundToRespond: number; conversationsActive: number } | null;
};

export async function getSalesDashboardData(): Promise<SalesDashboardData> {
  const leads = await getLeadsData();
  const count = (stages: string[]) => leads.filter((l) => stages.includes(l.stage)).length;
  const won = count(["Submitted"]);
  const lost = count(["Lost"]);
  const sources = new Map<string, number>();
  for (const l of leads) sources.set(l.source, (sources.get(l.source) ?? 0) + 1);

  // DM signals: live conversation feed (empty array = channels connected but
  // quiet; that is real data, still shown). Errors or demo mode fall back to
  // null so the view renders its awaiting-feed placeholders.
  let dm: SalesDashboardData["dm"] = null;
  if (liveMode()) {
    try {
      const conversations = await live.getInbox();
      dm = {
        inboundToRespond: conversations.filter((c) => c.unread > 0).length,
        conversationsActive: conversations.length,
      };
    } catch {
      dm = null;
    }
  }

  return {
    pipelineEmpty: leads.length === 0,
    newLeads: count(["New Enquiry"]),
    toAction: count(["New Enquiry", "Contacted"]),
    consultsBooked: count(["Call Booked"]),
    consultsCompleted: count(["Call Taken"]),
    followUps: count(["Follow-Up"]),
    onboarded: count(["New Client Processing", "Submitted"]),
    closeRatePct: won + lost === 0 ? null : (won / (won + lost)) * 100,
    bySource: [...sources.entries()]
      .map(([source, n]) => ({ source, count: n }))
      .sort((a, b) => b.count - a.count),
    dm,
  };
}

/** Setter/closer activity per rep. Live: from GHL opportunities (owner names
 *  resolved via the GHL users map, role from sales-config). Demo: adapted from
 *  the seed reps. Empty of real signal until GHL opportunities exist. */
export async function getSalesPerformanceData(): Promise<live.SalesRepRow[]> {
  if (liveMode()) return live.getSalesPerformance();
  return seed.getSalesPerformance().map((r) => ({
    name: r.name,
    role: salesRole(r.name),
    leads: r.callsTaken,
    callsBooked: r.callsTaken,
    callsTaken: r.callsTaken,
    closed: r.closed,
    lost: Math.max(0, r.callsTaken - r.closed),
    closeRatePct: r.closeRatePct,
    revenueClosed: r.revenueClosed,
  }));
}

export type AnalyticsData = live.AnalyticsData;

/** Analytics: funnel + lead-source table read live from GHL opportunities, the
 *  retention curve from the live client roster. The seed shape is structurally
 *  identical, so the screen renders the same either way. */
export async function getAnalyticsData(): Promise<live.AnalyticsData> {
  return liveMode() ? live.getAnalytics() : seed.getAnalytics();
}

export type VaDashboardData = {
  tasks: Task[];
  paused: number;
  renewalCallsThisWeek: number;
  /** G1: the re-sign list rides on the dashboard, soonest due first. */
  renewals: live.RenewalRow[];
  /** Tick-off works only when the live task store is on. */
  tasksLive: boolean;
  /** Coach id -> display name for the renewal rows. */
  coachNames: Record<string, string>;
  /** R4-3: engagement calls currently due (the VA books them). */
  engagementDue: { clientName: string; coachName: string; week: number }[];
  /** R17-1a: active/paused clients with no known program start. Their GHL
   *  Start Date is blank and the portal no longer guesses it from the signup
   *  (payment) date, so someone has to enter the real one. */
  needStartDate: { clientId: string; clientName: string; coachName: string }[];
};

export async function getVaDashboardData(): Promise<VaDashboardData> {
  // G1 (FEEDBACK-V2): the VA dashboard is Jameela's job list: renewals at the
  // top, tick-off tasks below. The active-clients block is gone by request.
  const [renewals, coachNames, engagementDue, allClients] = await Promise.all([
    getRenewalsData(),
    getCoachNamesData(),
    listEngagementDue(),
    getClientsData(),
  ]);
  // R17-1a: the job list now surfaces clients whose start date nobody knows.
  // Active/paused only: a cancelled client's missing start is not a job.
  const needStartDate = allClients
    .filter((c) => (c.status === "active" || c.status === "paused") && effectiveStartDate(c) === null)
    .map((c) => ({
      clientId: c.id,
      clientName: c.name,
      coachName: c.coachId ? coachNames[c.coachId] ?? "Unassigned" : "Unassigned",
    }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
  const sortedRenewals = [...renewals].sort((a, b) => a.daysToRenewal - b.daysToRenewal);
  const renewalCallsThisWeek = renewals.filter((r) => r.daysToRenewal <= 7).length;
  if (liveMode()) {
    const [m, tasks] = await Promise.all([
      live.getDashboardMetrics(),
      persistenceEnabled() ? listTasks().catch(() => []) : Promise.resolve([]),
    ]);
    return {
      tasks,
      paused: m.paused,
      renewalCallsThisWeek,
      renewals: sortedRenewals,
      engagementDue,
      tasksLive: persistenceEnabled(),
      coachNames,
      needStartDate,
    };
  }
  const m = seed.getDashboardMetrics();
  return {
    tasks: seed.getTasks(),
    paused: m.paused,
    renewalCallsThisWeek,
    renewals: sortedRenewals,
    engagementDue,
    tasksLive: false,
    coachNames,
    needStartDate,
  };
}

/** Owner morning view. One flat shape so the digest renders identically in
 *  demo and live mode; live gaps (handovers, refunds) arrive as honest zeros. */
export type DigestData = {
  date: string;
  netChange: number;
  gained: number;
  lost: number;
  paused: number;
  mrr: number;
  cashCollected30d: number;
  refunds: number;
  pastDueCount: number;
  payoutsCount: number;
  callsBooked: number;
  closedWon: number;
  closedLost: number;
  handovers: number;
  renewalCallsDue: number;
  dueThisWeek: number;
  /** True yesterday movement from daily_snapshots; null until persistence is
   *  live with at least one completed day, and always null in demo mode. */
  daily: { date: string; gained: number; lost: number; net: number } | null;
  /** E3: this week's self-reported team capacity from the Sunday prompt.
   *  Null until anyone has answered (honest, never faked). */
  teamCapacity: { slotsRemaining: number; answered: number; coaches: number } | null;
  /** E3: transformations logged in the last 7 days (0 in demo/pre-persistence). */
  transformationsThisWeek: number;
  /** R4-1: paused clients whose pause ends within 4 days (sheet alert flag). */
  reactivatingSoon: { name: string; days: number }[];
  /** R4-3: engagement calls currently due (count + first few names). */
  engagementDue: { clientName: string; coachName: string; week: number }[];
  /** R6-3: clients in a year-anniversary week right now (W52/104/156...). */
  yearMilestones: { name: string; years: number }[];
};

export async function getDigestData(): Promise<DigestData> {
  const renewals = await getRenewalsData();
  const dueThisWeek = renewals.filter((r) => r.daysToRenewal <= 7).length;

  // E3: team capacity from the Sunday prompt + transformations this week.
  // Both honest: capacity is null until someone answers, transformations 0
  // until rows exist.
  const [weekCapacity, coachNames] = await Promise.all([listWeekCapacity(), getCoachNamesData()]);
  const teamCapacity =
    weekCapacity.length === 0
      ? null
      : {
          slotsRemaining: weekCapacity.reduce((s, c) => s + (CAPACITY_SLOTS[c.capacity] ?? 0), 0),
          answered: weekCapacity.length,
          coaches: Object.keys(coachNames).length,
        };
  const weekAgo = Date.now() - 7 * 86_400_000;
  const transformationsThisWeek =
    liveMode() && persistenceEnabled()
      ? (await live.getTransformations()).filter(
          (t) => t.createdAt && Date.parse(t.createdAt) >= weekAgo,
        ).length
      : 0;
  // R4-1: pauses ending in the next 4 days (empty pre-migration).
  const reactivatingSoon = (await listPauses())
    .filter((p) => reactivatesSoon(p.pauseEnd))
    .map((p) => ({ name: p.clientName, days: daysUntilReactivation(p.pauseEnd) ?? 0 }))
    .sort((a, b) => a.days - b.days);
  // R4-3: engagement calls due right now.
  const engagementDue = await listEngagementDue();
  // R6-3: yearly-milestone alert (gift week). Week exactly divisible by 52.
  const yearMilestones = (await getClientsData())
    .filter((c) => c.status === "active")
    .map((c) => ({ name: c.name, week: WEEKS(c.startDate) }))
    .filter((c) => c.week > 0 && c.week % 52 === 0)
    .map((c) => ({ name: c.name, years: c.week / 52 }));

  if (liveMode()) {
    const [m, f, leads, daily] = await Promise.all([
      live.getDashboardMetrics(),
      live.getFinancials(),
      live.getLeads(),
      live.getDailyDeltas(),
    ]);
    return {
      daily,
      teamCapacity,
      transformationsThisWeek,
      reactivatingSoon,
      engagementDue,
      yearMilestones,
      date: new Date().toISOString().slice(0, 10),
      netChange: m.netChange,
      gained: m.gained,
      lost: m.lost,
      paused: m.paused,
      mrr: m.mrr,
      cashCollected30d: m.cashCollected30d,
      refunds: f.refunds,
      pastDueCount: f.pastDueCount,
      payoutsCount: f.payouts.length,
      callsBooked: leads.filter((l) => l.stage === "Call Booked").length,
      closedWon: leads.filter((l) => l.stage === "Submitted").length,
      closedLost: leads.filter((l) => l.stage === "Lost").length,
      handovers: 0, // transformations are HQ-native (Supabase phase)
      renewalCallsDue: renewals.length,
      dueThisWeek,
    };
  }

  const m = seed.getDashboardMetrics();
  const f = seed.getFinancials();
  const leads = seed.getLeads();
  return {
    date: seed.TODAY.toISOString().slice(0, 10),
    netChange: m.netChange,
    gained: m.gained,
    lost: m.lost,
    paused: m.paused,
    mrr: m.mrr,
    cashCollected30d: m.cashCollected30d,
    refunds: f.refunds,
    pastDueCount: f.pastDueCount,
    payoutsCount: f.payouts.length,
    callsBooked: seed.getCallBookings().length,
    closedWon: leads.filter((l) => l.stage === "Submitted").length,
    closedLost: leads.filter((l) => l.stage === "Lost").length,
    handovers: seed.getTransformations().filter((t) => t.status === "admin_approved").length,
    renewalCallsDue: renewals.length,
    dueThisWeek,
    daily: null,
    teamCapacity,
    transformationsThisWeek,
    reactivatingSoon,
    engagementDue,
    yearMilestones,
  };
}

// --- Notifications (topbar bell, 2026-07-02 "feels alive" pass) -------------
// Real, role-scoped signals derived from data the HQ already has. No new
// tables, no push infra: computed on render, each item links to the screen
// where the work lives.

export type HqNotification = {
  id: string;
  label: string;
  href: string;
  tone: "warn" | "info";
};

const ATTENTION_CODES: ReadonlySet<string> = new Set(["M", "F", "G", "N"]); // R16-2c: M = missed

export async function getNotificationsData(identity: {
  role: string;
  linkedCoachId: string | null;
  isHeadCoach?: boolean;
}): Promise<HqNotification[]> {
  const items: HqNotification[] = [];
  // R6-5: portal-owned notification rows lead the bell (empty pre-migration).
  try {
    const { getServerIdentity } = await import("@/lib/role-server");
    const { listUnreadNotifications, notificationText } = await import("@/lib/notify");
    const me = await getServerIdentity();
    if (me.displayName) {
      for (const n of await listUnreadNotifications(me.displayName, 6)) {
        items.push({
          id: `nf-${n.id}`,
          label: notificationText(n).replace(`@${n.recipientName}: `, ""),
          href: "/tasks",
          tone: n.type === "task_blocked" || n.type === "task_escalated" ? "warn" : "info",
        });
      }
    }
  } catch {
    /* best-effort */
  }
  try {
    if (identity.role === "coach") {
      const { clients, checkIns } = await getCoachRosterData(identity.linkedCoachId);
      const latest = new Map<string, string | null>();
      for (const ci of checkIns) if (!latest.has(ci.clientId)) latest.set(ci.clientId, ci.code);
      const attention = clients.filter((c) => {
        const code = latest.get(c.id);
        return code ? ATTENTION_CODES.has(code) : false;
      }).length;
      if (attention > 0) {
        items.push({
          id: "checkins-attention",
          label: `${attention} check-in${attention === 1 ? "" : "s"} need attention`,
          href: "/check-ins",
          tone: "warn",
        });
      }
      // Head-coach oversight items (2026-07-11 audit): onboarding rows
      // awaiting review + open audits across all coaches. Queried directly
      // (not via onboarding-actions) to keep data.ts import-cycle-free.
      if (identity.isHeadCoach) {
        if (persistenceEnabled()) {
          try {
            const { data } = await dbAdmin()
              .from("client_onboarding")
              .select("approved,nutrition_plan_made,workout_plan_made,loom_url")
              .eq("approved", false);
            const review = ((data ?? []) as {
              nutrition_plan_made: boolean;
              workout_plan_made: boolean;
              loom_url: string | null;
            }[]).filter((r) => r.nutrition_plan_made || r.workout_plan_made || !!r.loom_url).length;
            if (review > 0) {
              items.push({
                id: "onboarding-review",
                label: `${review} onboarding row${review === 1 ? "" : "s"} awaiting your review`,
                href: "/onboarding",
                tone: "warn",
              });
            }
          } catch {
            // pre-migration: no onboarding table, no item
          }
        }
        const openAudits = (await getCoachAuditsData(identity.linkedCoachId)).filter((a) => !a.resolved).length;
        if (openAudits > 0) {
          items.push({
            id: "audits-open",
            label: `${openAudits} audit${openAudits === 1 ? "" : "s"} open across the team`,
            href: "/client-audits",
            tone: "info",
          });
        }
      }
      return items;
    }

    if (identity.role === "owner" || isOpsRole(identity.role)) {
      const today = new Date().toISOString().slice(0, 10);
      const tasks = (await listTasks()).filter(
        (t) => t.status !== "done" && t.status !== "approved" && t.dueDate && t.dueDate <= today,
      );
      if (tasks.length > 0) {
        items.push({
          id: "tasks-due",
          label: `${tasks.length} task${tasks.length === 1 ? "" : "s"} due or overdue`,
          href: "/tasks",
          tone: "warn",
        });
      }
    }

    if (identity.role === "owner") {
      const renewals = (await getRenewalsData()).filter((r) => r.daysToRenewal <= 7 && r.daysToRenewal >= 0);
      if (renewals.length > 0) {
        items.push({
          id: "renewals-week",
          label: `${renewals.length} renewal${renewals.length === 1 ? "" : "s"} due this week`,
          href: "/renewals",
          tone: "info",
        });
      }
    }
  } catch {
    // Notifications are decoration: any selector error just means an empty bell.
  }
  return items;
}

export async function getRenewalsData() {
  if (liveMode()) return live.getRenewals();
  // Seed approximation: Approaching Renewal clients, dated from start + 16wk.
  return seed
    .getActiveClients()
    .filter((c) => c.journeyStage === "Approaching Renewal")
    .map((c) => {
      const iso = effectiveStartDate(c) ?? c.startDate;
      const t = (iso ? Date.parse(iso) : Date.now()) + 112 * 86_400_000;
      return {
        client: c,
        renewalDate: new Date(t).toISOString().slice(0, 10),
        daysToRenewal: Math.round((t - Date.now()) / 86_400_000),
        weeksIn: clientWeek(c),
      };
    })
    .sort((a, b) => a.daysToRenewal - b.daysToRenewal);
}
