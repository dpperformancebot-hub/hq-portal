// ============================================================================
// SEED DATA LAYER  ·  SWAP POINT FOR LIVE SUPABASE (M5)
// ----------------------------------------------------------------------------
// Every screen reads data ONLY through the selector functions exported at the
// bottom of this file (getClients, getDashboardMetrics, etc). The raw arrays
// are in-repo mock data shaped to DATA-MODEL.md. At M5, replace the selector
// bodies with Supabase queries and delete the arrays; screens do not change.
// Dates are computed relative to TODAY (fixed) so values are deterministic.
// ============================================================================

import { BRAND } from "@/lib/brand";
import { dashboardChurnStats } from "@/lib/churn-math";
import type {
  Client,
  ClientAudit,
  Coach,
  DueState,
  JourneyStage,
  Lead,
  LeadStage,
  SalesRep,
  Task,
  Transaction,
  Transformation,
} from "./types";

export * from "./types";

export const TODAY = new Date("2026-06-03T00:00:00Z");
// M4 secondary-screen seed + selectors (kept in the same swap point).

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * DAY).toISOString().slice(0, 10);
const daysFromNow = (n: number) => new Date(TODAY.getTime() + n * DAY).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Raw seed
// ---------------------------------------------------------------------------

const COACHES: Coach[] = [
  { id: "co1", name: "Angus", role: "head_coach", maxCapacity: 40, weeklyRate: 25, fortnightlyRate: 15, adherence: 0.91, avgResponseHours: 3.2, retention: 0.88, churn: 0.04 },
  { id: "co2", name: "Sarah Bennett", role: "coach", maxCapacity: 30, weeklyRate: 25, fortnightlyRate: 15, adherence: 0.86, avgResponseHours: 5.1, retention: 0.82, churn: 0.06 },
  { id: "co3", name: "Marcus Lee", role: "coach", maxCapacity: 30, weeklyRate: 25, fortnightlyRate: 15, adherence: 0.79, avgResponseHours: 7.4, retention: 0.74, churn: 0.09 },
  { id: "co4", name: "Priya Nair", role: "coach", maxCapacity: 25, weeklyRate: 25, fortnightlyRate: 15, adherence: 0.93, avgResponseHours: 2.6, retention: 0.9, churn: 0.03 },
  { id: "co5", name: "Connor Walsh", role: "coach", maxCapacity: 25, weeklyRate: 25, fortnightlyRate: 15, adherence: 0.71, avgResponseHours: 9.8, retention: 0.68, churn: 0.12 },
];

// Helper to keep client rows compact.
type CRow = [
  id: string,
  name: string,
  plan: Client["plan"],
  rate: number,
  startOffsetDays: number,
  status: Client["status"],
  coachId: string,
  source: Client["source"],
  lastCheckInDaysAgo: number | null,
  code: Client["checkInCode"],
  cashCollected: number,
  stage: JourneyStage,
  wStart: number,
  wNow: number,
];

const CLIENT_ROWS: CRow[] = [
  ["c1", "Alannah Parfett", "Weekly", 900, 145, "active", "co1", "Instagram", 3, "Y", 4350, "Approaching Renewal", 84, 76],
  ["c2", "Leilani Zapata", "Weekly", 900, 145, "active", "co1", "Referral", 4, "Y", 4350, "Approaching Renewal", 68, 64],
  ["c3", "Charlotte Jezard", "Fortnightly", 480, 124, "active", "co2", "YouTube", 9, "MS", 1920, "Active", 72, 70],
  ["c4", "Iman Ladhani", "Fortnightly", 480, 124, "active", "co2", "Website", 4, "MS", 1920, "Active", 90, 85],
  ["c5", "Eva Risson", "Fortnightly", 520, 110, "active", "co3", "Instagram", 4, "Y", 2080, "Active", 70, 67],
  ["c6", "Fira Griffith", "Fortnightly", 480, 110, "active", "co3", "Lead Magnet", 22, "G", 1440, "Active", 65, 66],
  ["c7", "Aria Kirwan", "Fortnightly", 480, 110, "paused", "co3", "Instagram", 30, "P", 1440, "Active", 60, 60],
  ["c8", "Sarah Mitchell", "Weekly", 850, 95, "active", "co4", "Word of Mouth", 6, "MS", 2550, "Active", 75, 73],
  ["c9", "Tom Watson", "Weekly", 950, 150, "active", "co1", "YouTube", 5, "G", 4750, "Approaching Renewal", 95, 91],
  ["c10", "Emma Clarke", "Fortnightly", 460, 28, "active", "co4", "Instagram", 8, "N", 460, "Onboarding", 82, 80],
  ["c11", "Jake Reynolds", "Weekly", 880, 124, "active", "co5", "Email", 14, "G", 3520, "Mid-Program Review", 100, 99],
  ["c12", "Mia Lawson", "Weekly", 880, 84, "active", "co5", "Instagram", 2, "Y", 2640, "Active", 78, 75],
  ["c13", "Noah Bennett", "Weekly", 900, 200, "active", "co1", "Referral", 5, "Y", 6000, "Renewed/Graduated", 88, 79],
  ["c14", "Olivia Hart", "Fortnightly", 500, 56, "active", "co2", "Ambassador", 7, "MS", 1000, "Active", 66, 63],
  ["c15", "Liam Foster", "Weekly", 850, 175, "active", "co4", "Instagram", 4, "Y", 5100, "Approaching Renewal", 92, 84],
  ["c16", "Sophie Turner", "Fortnightly", 480, 70, "active", "co3", "Website", 11, "F", 1440, "Active", 71, 69],
  ["c17", "Ethan Cole", "Weekly", 880, 42, "active", "co5", "YouTube", 9, "MS", 1320, "Active", 96, 94],
  ["c18", "Grace Murphy", "Fortnightly", 460, 14, "active", "co4", "Lead Magnet", 5, "N", 230, "Onboarding", 64, 64],
  ["c19", "Ruby Anderson", "Weekly", 900, 220, "active", "co1", "Instagram", 3, "Y", 6600, "Renewed/Graduated", 80, 71],
  ["c20", "Harry Webb", "Fortnightly", 480, 98, "active", "co2", "Email", 16, "MS", 1920, "Mid-Program Review", 110, 104],
  ["c21", "Chloe Davies", "Weekly", 850, 60, "active", "co5", "Referral", 6, "Y", 1700, "Active", 73, 70],
  ["c22", "Daniel Owen", "Fortnightly", 480, 130, "paused", "co2", "Instagram", 26, "P", 1920, "Active", 88, 86],
  ["c23", "Isla Reid", "Weekly", 900, 240, "cancelled", "co3", "YouTube", 48, "C", 5400, "Active", 76, 74],
  ["c24", "Max Phillips", "Weekly", 880, 300, "past", "co1", "Instagram", 90, "C", 8800, "Renewed/Graduated", 102, 88],
];

// Conditional onboarding pathway per client (GHL custom field at M5). Most
// clients run Standard; a few demo the campaign-driven variants.
const ONBOARDING_BY_ID: Record<string, Client["onboardingType"]> = {
  c10: "Challenge",
  c14: "Photoshoot",
  c17: "Challenge",
  c18: "Standard",
};

const CLIENTS: Client[] = CLIENT_ROWS.map((r) => ({
  id: r[0],
  name: r[1],
  plan: r[2],
  monthlyRate: r[3],
  startDate: daysAgo(r[4]),
  status: r[5],
  coachId: r[6],
  source: r[7],
  lastCheckIn: r[8] === null ? null : daysAgo(r[8]),
  checkInCode: r[9],
  cashCollected: r[10],
  journeyStage: r[11],
  weightStart: r[12],
  weightCurrent: r[13],
  onboardingType: ONBOARDING_BY_ID[r[0]] ?? "Standard",
}));

const SALES_REPS = [
  { id: "u-lucas", name: "Lucas" },
  { id: "u-lilli", name: "Lilli" },
];

type LRow = [
  id: string,
  name: string,
  source: Lead["source"],
  stage: LeadStage,
  ownerIdx: number,
  lastActivityDaysAgo: number,
  nextAction: string,
  value: number,
  stageDaysAgo: number,
  channels: Lead["contactChannels"],
];

const wInsta: Lead["contactChannels"] = [
  { channel: "whatsapp", priority: 1 },
  { channel: "instagram", priority: 2 },
];
const wEmail: Lead["contactChannels"] = [
  { channel: "whatsapp", priority: 1 },
  { channel: "email", priority: 2 },
];
const igOnly: Lead["contactChannels"] = [{ channel: "instagram", priority: 1 }];

const LEAD_ROWS: LRow[] = [
  ["l1", "Amelia Stone", "Instagram", "New Enquiry", 0, 0, "Send intro DM", 0, 1, igOnly],
  ["l2", "Ben Carter", "YouTube", "New Enquiry", 1, 1, "Send intro message", 0, 2, wInsta],
  ["l3", "Zoe Mills", "Referral", "Contacted", 0, 2, "Follow up on reply", 900, 4, wEmail],
  ["l4", "Lucas Reed", "Lead Magnet", "Contacted", 1, 3, "Qualify budget", 0, 5, wEmail],
  ["l5", "Hannah Page", "Instagram", "Call Booked", 0, 1, "Confirm call Thu", 950, 3, wInsta],
  ["l6", "Oscar Dean", "Website", "Call Booked", 1, 2, "Send pre-call form", 880, 6, wEmail],
  ["l7", "Freya Lloyd", "Ambassador", "Call Taken", 0, 1, "Send proposal", 1080, 2, wInsta],
  ["l8", "Leo Barnes", "YouTube", "Call Taken", 1, 4, "Handle pricing question", 950, 7, wEmail],
  ["l9", "Ivy Hughes", "Instagram", "Follow-Up", 0, 5, "Nudge on decision", 900, 12, wInsta],
  ["l10", "Jack Morgan", "Email", "Follow-Up", 1, 8, "Re-engage, went quiet", 850, 18, wEmail],
  ["l11", "Ella Brooks", "Referral", "New Client Processing", 0, 1, "Collect onboarding form", 990, 2, wInsta],
  ["l12", "Finn Walsh", "Instagram", "New Client Processing", 1, 2, "Send WhatsApp group invite", 880, 3, wInsta],
  ["l13", "Ada Knight", "Word of Mouth", "Submitted", 0, 1, "Assign coach", 1020, 1, wInsta],
  ["l14", "Theo Grant", "Lead Magnet", "Submitted", 1, 2, "Assign coach", 860, 2, wEmail],
  ["l15", "Maya Patel", "Instagram", "Lost", 0, 20, "Closed lost: price", 0, 24, igOnly],
  ["l16", "Sam Doyle", "YouTube", "Lost", 1, 30, "Closed lost: timing", 0, 35, wEmail],
];

const LEADS: Lead[] = LEAD_ROWS.map((r) => ({
  id: r[0],
  name: r[1],
  source: r[2],
  stage: r[3],
  ownerId: SALES_REPS[r[4]].id,
  ownerName: SALES_REPS[r[4]].name,
  lastActivity: daysAgo(r[5]),
  nextAction: r[6],
  value: r[7],
  stageEnteredAt: daysAgo(r[8]),
  contactChannels: r[9],
}));

const TRANSFORMATIONS: Transformation[] = [
  { id: "t1", clientId: "c13", coachId: "co1", milestone: "W20", status: "posted", approvedToPostAt: daysAgo(20), postedAt: daysAgo(14), hasBefore: true, hasAfter: true },
  { id: "t2", clientId: "c19", coachId: "co1", milestone: "W20", status: "scheduled", approvedToPostAt: daysAgo(3), postedAt: null, hasBefore: true, hasAfter: true },
  { id: "t3", clientId: "c1", coachId: "co1", milestone: "W12", status: "admin_approved", approvedToPostAt: daysAgo(1), postedAt: null, hasBefore: true, hasAfter: true },
  { id: "t4", clientId: "c15", coachId: "co4", milestone: "W12", status: "coach_approved", approvedToPostAt: null, postedAt: null, hasBefore: true, hasAfter: true },
  { id: "t5", clientId: "c9", coachId: "co1", milestone: "W20", status: "coach_approved", approvedToPostAt: null, postedAt: null, hasBefore: true, hasAfter: false },
  { id: "t6", clientId: "c11", coachId: "co5", milestone: "W12", status: "draft", approvedToPostAt: null, postedAt: null, hasBefore: true, hasAfter: false },
  { id: "t7", clientId: "c20", coachId: "co2", milestone: "W12", status: "draft", approvedToPostAt: null, postedAt: null, hasBefore: false, hasAfter: false },
  { id: "t8", clientId: "c5", coachId: "co3", milestone: "W12", status: "draft", approvedToPostAt: null, postedAt: null, hasBefore: true, hasAfter: false },
  { id: "t9", clientId: "c24", coachId: "co1", milestone: "W40", status: "posted", approvedToPostAt: daysAgo(60), postedAt: daysAgo(52), hasBefore: true, hasAfter: true },
];

const AUDITS: ClientAudit[] = [
  { id: "a1", clientId: "c1", coachId: "co1", cadenceWeek: "W16", status: "sent", resolved: false },
  { id: "a2", clientId: "c3", coachId: "co2", cadenceWeek: "W16", status: "messaged", resolved: false },
  { id: "a3", clientId: "c6", coachId: "co3", cadenceWeek: "W12", status: "ghosted", resolved: false },
  { id: "a4", clientId: "c11", coachId: "co5", cadenceWeek: "W16", status: "ghosted", resolved: false },
  { id: "a5", clientId: "c8", coachId: "co4", cadenceWeek: "W12", status: "submitted", resolved: true },
  { id: "a6", clientId: "c12", coachId: "co5", cadenceWeek: "W8", status: "sent", resolved: false },
  { id: "a7", clientId: "c16", coachId: "co3", cadenceWeek: "W8", status: "submitted", resolved: true },
  { id: "a8", clientId: "c17", coachId: "co5", cadenceWeek: "W4", status: "messaged", resolved: false },
  { id: "a9", clientId: "c14", coachId: "co2", cadenceWeek: "W4", status: "submitted", resolved: true },
  { id: "a10", clientId: "c5", coachId: "co3", cadenceWeek: "W12", status: "sent", resolved: false },
  { id: "a11", clientId: "c20", coachId: "co2", cadenceWeek: "W12", status: "submitted", resolved: true },
  { id: "a12", clientId: "c21", coachId: "co5", cadenceWeek: "W8", status: "ghosted", resolved: false },
];

const TASKS: Task[] = [
  { id: "tk1", title: "Approve Tom Watson W20 transformation", assigneeName: "Daniel Price", type: "Approval", dueDate: daysAgo(1), status: "todo" },
  { id: "tk2", title: "Chase payment failure: Jake Reynolds", assigneeName: "Mykael", type: "Billing", dueDate: daysAgo(2), status: "todo" },
  { id: "tk3", title: "Assign coach to Ada Knight", assigneeName: "Angus", type: "Onboarding", dueDate: daysAgo(0), status: "todo" },
  { id: "tk4", title: "Review Fira Griffith (ghosted 3 weeks)", assigneeName: "Marcus Lee", type: "Retention", dueDate: daysAgo(0), status: "todo" },
  { id: "tk5", title: "Send weekly digest to owner", assigneeName: "Jameela", type: "Ops", dueDate: daysAgo(0), status: "done" },
  { id: "tk6", title: "Confirm Hannah Page call Thursday", assigneeName: "Lucas", type: "Sales", dueDate: daysFromNow(1), status: "todo" },
  { id: "tk7", title: "Prep W20 graduation pack: Ruby Anderson", assigneeName: "Brooke", type: "Content", dueDate: daysFromNow(2), status: "todo" },
  { id: "tk8", title: "Audit overdue check-ins for Connor's roster", assigneeName: "Connor Walsh", type: "Audit", dueDate: daysFromNow(3), status: "todo" },
  { id: "tk9", title: "Publish scheduled transformation: Ruby Anderson", assigneeName: "Brooke", type: "Content", dueDate: daysFromNow(1), status: "todo" },
  { id: "tk10", title: "Onboard Grace Murphy (week 2)", assigneeName: "Priya Nair", type: "Onboarding", dueDate: daysAgo(0), status: "done" },
];

const TRANSACTIONS: Transaction[] = [
  { id: "x1", date: daysAgo(1), clientName: "Ruby Anderson", plan: "Weekly", amount: 900, source: "Stripe", status: "paid" },
  { id: "x2", date: daysAgo(2), clientName: "Noah Bennett", plan: "Weekly", amount: 900, source: "Stripe", status: "paid" },
  { id: "x3", date: daysAgo(3), clientName: "Charlotte Jezard", plan: "Fortnightly", amount: 240, source: "Stripe", status: "paid" },
  { id: "x4", date: daysAgo(4), clientName: "Jake Reynolds", plan: "Weekly", amount: 880, source: "Stripe", status: "past_due" },
  { id: "x5", date: daysAgo(6), clientName: "Liam Foster", plan: "Weekly", amount: 850, source: "Stripe", status: "paid" },
  { id: "x6", date: daysAgo(8), clientName: "Isla Reid", plan: "Weekly", amount: 900, source: "Stripe", status: "refunded" },
  { id: "x7", date: daysAgo(9), clientName: "Harry Webb", plan: "Fortnightly", amount: 240, source: "GHL", status: "paid" },
  { id: "x8", date: daysAgo(11), clientName: "Mia Lawson", plan: "Weekly", amount: 880, source: "Stripe", status: "paid" },
  { id: "x9", date: daysAgo(13), clientName: "Sarah Mitchell", plan: "Weekly", amount: 850, source: "Stripe", status: "paid" },
  { id: "x10", date: daysAgo(16), clientName: "Eva Risson", plan: "Fortnightly", amount: 260, source: "Stripe", status: "paid" },
  { id: "x11", date: daysAgo(19), clientName: "Chloe Davies", plan: "Weekly", amount: 850, source: "Stripe", status: "paid" },
  { id: "x12", date: daysAgo(22), clientName: "Ethan Cole", plan: "Weekly", amount: 880, source: "Stripe", status: "paid" },
  { id: "x13", date: daysAgo(25), clientName: "Daniel Owen", plan: "Fortnightly", amount: 240, source: "Stripe", status: "refunded" },
  { id: "x14", date: daysAgo(28), clientName: "Olivia Hart", plan: "Fortnightly", amount: 250, source: "GHL", status: "paid" },
];

const REVENUE_SERIES = [
  // Trends up to the current MRR (sum of active monthlyRate = $14,080) so the
  // revenue trend stays consistent with the Recurring revenue / MRR KPIs.
  { month: "Jan", value: 11000 },
  { month: "Feb", value: 11750 },
  { month: "Mar", value: 12400 },
  { month: "Apr", value: 13050 },
  { month: "May", value: 13600 },
  { month: "Jun", value: 14080 },
];

// Comparison series for the revenue trend (index-aligned to REVENUE_SERIES).
// Prior year ~ -18% (so current reads roughly +18-22% vs last year).
const REVENUE_LAST_YEAR = [9000, 9600, 10200, 10700, 11150, 11500];
// Previous period: the six months before this one (Jul-Dec 2025), index-aligned.
const REVENUE_PREV_PERIOD = [9900, 10600, 11200, 11750, 12250, 12700];

const SOCIAL = [
  { channel: "Instagram", followers: 48200, deltaPct: 2.4 },
  { channel: "YouTube", followers: 19850, deltaPct: 1.1 },
  { channel: "TikTok", followers: 12400, deltaPct: 5.8 },
];

// Per-brand funnel order (Dan's DP list includes "Call Offered"; TJD keeps
// the classic shape). Single source: Brand.pipelineStages.
const PIPELINE_ORDER: LeadStage[] = BRAND.pipelineStages;

// ---------------------------------------------------------------------------
// Computed helpers (never stored; derived here)
// ---------------------------------------------------------------------------

const diffDays = (iso: string) => Math.floor((TODAY.getTime() - new Date(iso).getTime()) / DAY);

/** 1-based week. R17-1a: returns null when the start date is unknown, so
 *  callers show "Start date needed" instead of a confident "Week 1". */
export function weekNumber(client: Client): number | null {
  const iso = client.startDateOverride ?? client.startDate;
  if (!iso) return null;
  return Math.max(1, Math.floor(diffDays(iso) / 7) + 1);
}

export function ltv(client: Client): number {
  return client.cashCollected;
}

export function daysInStage(lead: Lead): number {
  return Math.max(0, diffDays(lead.stageEnteredAt));
}

export type CheckInFreshness = "recent" | "due" | "overdue" | "none";
export function checkInFreshness(lastCheckIn: string | null): CheckInFreshness {
  if (!lastCheckIn) return "none";
  const d = diffDays(lastCheckIn);
  if (d <= 7) return "recent";
  if (d <= 14) return "due";
  return "overdue";
}

export function auditDueState(audit: ClientAudit): DueState {
  if (audit.resolved) return "completed";
  return audit.status === "ghosted" ? "overdue" : "due";
}

// ---------------------------------------------------------------------------
// Selectors (the swap surface)
// ---------------------------------------------------------------------------

export function getCoaches(): Coach[] {
  return COACHES;
}
export function getCoach(id: string): Coach | undefined {
  return COACHES.find((c) => c.id === id);
}
export function coachName(id: string | null): string {
  return COACHES.find((c) => c.id === id)?.name ?? "Unassigned";
}

export function getClients(): Client[] {
  return CLIENTS;
}
export function getActiveClients(): Client[] {
  return CLIENTS.filter((c) => c.status === "active");
}
export function getClientsByStatus(status: Client["status"]): Client[] {
  return CLIENTS.filter((c) => c.status === status);
}
export function clientName(id: string): string {
  return CLIENTS.find((c) => c.id === id)?.name ?? "Unknown";
}

export function getLeads(): Lead[] {
  return LEADS;
}

export function getTransformations(): Transformation[] {
  return TRANSFORMATIONS;
}

export function getAudits(): ClientAudit[] {
  return AUDITS;
}

export function getTasks(): Task[] {
  return TASKS;
}

export function getTransactions(): Transaction[] {
  return TRANSACTIONS;
}

export function coachActiveClientCount(coachId: string): number {
  return CLIENTS.filter((c) => c.coachId === coachId && c.status === "active").length;
}
export function coachPendingAudits(coachId: string): number {
  return AUDITS.filter((a) => a.coachId === coachId && auditDueState(a) !== "completed").length;
}
export function coachCapacityPct(coach: Coach): number {
  return coach.maxCapacity === 0 ? 0 : coachActiveClientCount(coach.id) / coach.maxCapacity;
}

export type CoachScorecard = Coach & {
  activeClients: number;
  pendingAudits: number;
  capacityPct: number;
  slotsOpen: number;
  /** Mean week number across this coach's active clients (avg client length). */
  avgClientWeeks: number;
};

export function getCoachScorecards(): CoachScorecard[] {
  return COACHES.map((c) => {
    const roster = CLIENTS.filter((cl) => cl.coachId === c.id && cl.status === "active");
    const dated = roster.map((cl) => weekNumber(cl)).filter((w): w is number => w !== null);
    const avgClientWeeks = dated.length ? Math.round(dated.reduce((s, w) => s + w, 0) / dated.length) : 0;
    return {
      ...c,
      activeClients: roster.length,
      pendingAudits: coachPendingAudits(c.id),
      capacityPct: coachCapacityPct(c),
      slotsOpen: Math.max(0, c.maxCapacity - roster.length),
      avgClientWeeks,
    };
  });
}

// Rank movement vs last period (seeded; computed from history at M5).
const COACH_RANK_MOVEMENT: Record<string, number> = { co4: 1, co1: 0, co2: 1, co3: -2, co5: 0 };

export type CoachLeaderboardRow = CoachScorecard & { rank: number; movement: number };

export function getCoachLeaderboard(): CoachLeaderboardRow[] {
  return getCoachScorecards()
    .filter((c) => c.activeClients > 0)
    .sort((a, b) => b.retention - a.retention)
    .map((c, i) => ({ ...c, rank: i + 1, movement: COACH_RANK_MOVEMENT[c.id] ?? 0 }));
}

// Sales reps (appointment setters + closers). Added M4 refinement; include in
// the M5 schema design. closeRate is computed, never stored.
const SALES_LEADERBOARD: SalesRep[] = [
  // Real DP Performance sales team: Lilli closes, Lucas sets.
  { id: "sr-lilli", name: "Lilli", role: "closer", callsTaken: 48, closes: 16, cashCollected: 14400, movement: 1 },
  { id: "sr-lucas", name: "Lucas", role: "setter", callsTaken: 96, closes: 7, cashCollected: 6300, movement: 2 },
];

export type SalesLeaderboardRow = SalesRep & { closeRate: number };

export function getSalesLeaderboard(): SalesLeaderboardRow[] {
  return SALES_LEADERBOARD.map((r) => ({
    ...r,
    closeRate: r.callsTaken === 0 ? 0 : Math.round((r.closes / r.callsTaken) * 100),
  }));
}

export function getDashboardMetrics() {
  const active = getActiveClients();
  const mrr = active.reduce((sum, c) => sum + c.monthlyRate, 0);
  const cancelled = getClientsByStatus("cancelled");
  const gained = CLIENTS.filter((c) => c.status === "active" && c.startDate !== null && diffDays(c.startDate) <= 30).length;
  const lost = cancelled.length;
  // R8-3 (Dan's formula): monthly-average churn on the total roster.
  const churnStats = dashboardChurnStats(CLIENTS);
  const retentionPct = churnStats.retentionPct;

  const last = REVENUE_SERIES[REVENUE_SERIES.length - 1].value;
  const prev = REVENUE_SERIES[REVENUE_SERIES.length - 2].value;
  const revDeltaPct = prev === 0 ? 0 : ((last - prev) / prev) * 100;

  const cashCollected30d = TRANSACTIONS.filter(
    (t) => t.status === "paid" && diffDays(t.date) <= 30,
  ).reduce((s, t) => s + t.amount, 0);

  const won = LEADS.filter((l) => l.stage === "Submitted").length;
  const lostLeads = LEADS.filter((l) => l.stage === "Lost").length;
  const closeRatePct = won + lostLeads === 0 ? 0 : (won / (won + lostLeads)) * 100;

  const avgCapacity =
    COACHES.reduce((s, c) => s + coachCapacityPct(c), 0) / Math.max(1, COACHES.length);

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
    avgWeekAtChurn: churnStats.avgWeekAtChurn,
    cashCollected30d,
    paused: getClientsByStatus("paused").length,
    expiring30d: active.filter((c) => c.journeyStage === "Approaching Renewal").length,
    newLeads: LEADS.filter((l) => l.stage === "New Enquiry" || l.stage === "Contacted").length,
    closeRatePct,
    coachCapacityPct: avgCapacity * 100,
    revenueSeries: REVENUE_SERIES,
    revenueLastYear: REVENUE_LAST_YEAR,
    revenuePrevPeriod: REVENUE_PREV_PERIOD,
    // Per-period chart payloads (live computes these from client history; the
    // seed approximates from the monthly series so the controls still work).
    revenueByPeriod: {
      Weekly: { series: REVENUE_SERIES.map((p, i) => ({ month: `Wk ${i + 1}`, value: p.value })), lastYear: REVENUE_LAST_YEAR, prevPeriod: REVENUE_PREV_PERIOD },
      Monthly: { series: REVENUE_SERIES, lastYear: REVENUE_LAST_YEAR, prevPeriod: REVENUE_PREV_PERIOD },
      Quarterly: { series: REVENUE_SERIES.filter((_, i) => i % 2 === 0).map((p, i) => ({ month: `Q${i + 1}`, value: p.value })), lastYear: REVENUE_LAST_YEAR.filter((_, i) => i % 2 === 0), prevPeriod: REVENUE_PREV_PERIOD.filter((_, i) => i % 2 === 0) },
      Yearly: { series: [{ month: "2025", value: REVENUE_LAST_YEAR[REVENUE_LAST_YEAR.length - 1] }, { month: "2026", value: REVENUE_SERIES[REVENUE_SERIES.length - 1].value }], lastYear: [0, 0], prevPeriod: [0, 0] },
    },
    coachCapacity: COACHES.map((c) => ({
      coachId: c.id,
      name: c.name,
      active: coachActiveClientCount(c.id),
      max: c.maxCapacity,
      pct: coachCapacityPct(c),
    })),
    pipeline: PIPELINE_ORDER.map((stage) => ({
      stage,
      count: LEADS.filter((l) => l.stage === stage).length,
    })),
    social: SOCIAL,
    todaysFocus: TASKS.filter((t) => t.dueDate !== null && diffDays(t.dueDate) === 0),
  };
}

export function getFinancials() {
  const active = getActiveClients();
  const mrr = active.reduce((s, c) => s + c.monthlyRate, 0);
  const avgLtv = CLIENTS.reduce((s, c) => s + ltv(c), 0) / Math.max(1, CLIENTS.length);
  const refunds = TRANSACTIONS.filter((t) => t.status === "refunded").reduce((s, t) => s + t.amount, 0);
  const pastDueTx = TRANSACTIONS.filter((t) => t.status === "past_due");
  const pastDue = pastDueTx.reduce((s, t) => s + t.amount, 0);
  // Demo cash collected: seeded paid transactions stand in for Stripe's 30d feed.
  const cashCollected30d = TRANSACTIONS.filter((t) => t.status === "paid").reduce((s, t) => s + t.amount, 0);

  const planBreakdown = (["Weekly", "Fortnightly", "Monthly"] as const).map((plan) => ({
    plan,
    value: active.filter((c) => c.plan === plan).reduce((s, c) => s + c.monthlyRate, 0),
  }));

  // H2: PIF vs recurring split (seed clients carry no billing-structure
  // signal, so demo shows everything as unknown, which is honest).
  const mrrSplit = { pif: 0, recurring: 0, unknown: 0 };
  for (const c of active) {
    mrrSplit.unknown += c.monthlyRate;
  }

  const payouts = COACHES.map((c) => {
    const roster = active.filter((cl) => cl.coachId === c.id);
    const gross = roster.reduce(
      (s, cl) => s + (cl.plan === "Weekly" ? c.weeklyRate * 4 : c.fortnightlyRate * 2),
      0,
    );
    // Coach fee: per-brand config, labelled in the UI (V2-02).
    const fee = Math.round(gross * BRAND.coachFeePct);
    return { coachId: c.id, name: c.name, gross, fee, net: gross - fee };
  });

  return {
    mrr,
    arr: mrr * 12,
    avgLtv,
    cashCollected30d,
    refunds,
    pastDue,
    pastDueCount: pastDueTx.length,
    stripeConnected: false, // demo shows seeded cash facts, not a live Stripe feed
    revenueSeries: REVENUE_SERIES,
    planBreakdown,
    mrrSplit,
    payouts,
    transactions: TRANSACTIONS,
  };
}

export const JOURNEY_STAGES: JourneyStage[] = [
  "Onboarding",
  "Active",
  "Mid-Program Review",
  "Approaching Renewal",
  "Renewed/Graduated",
];

export { PIPELINE_ORDER };

// M4 selectors. Placed last so index.ts is fully initialized before m4 loads.
export * from "./m4";
