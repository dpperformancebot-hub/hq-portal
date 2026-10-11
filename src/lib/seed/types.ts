// Seed data types. Mirror DATA-MODEL.md entity shapes.
// These are the contracts the UI reads through src/lib/seed/index.ts.
// At M5 the seed is swapped for live Supabase; keep these types stable.

import type { StatusVariant } from "@/components/ui/pill";

export type Plan = "Weekly" | "Fortnightly" | "Monthly";

export type ClientStatus = "active" | "paused" | "cancelled" | "past";

export type LeadSource =
  | "Instagram"
  | "TikTok"
  | "YouTube"
  | "Referral"
  | "Ambassador"
  | "Lead Magnet"
  | "Email"
  | "Website"
  | "Word of Mouth";

export type LeadStage =
  | "New Enquiry"
  | "Contacted"
  | "Call Offered"
  | "Call Booked"
  | "Call Taken"
  | "Follow-Up"
  | "New Client Processing"
  | "Submitted"
  | "Lost";

export type ContactChannel = "whatsapp" | "instagram" | "imessage" | "email";

// Real weekly check-in status codes from the coaching sheet.
// Codes are fixed: SM/Y/F/G/M/P/C/N. Labels are PROVISIONAL and finalized at
// M5 against the real sheet. Owner corrections (2026-06-03), left as-is for now:
//   F = fortnightly-cadence marker (NOT "follow-up")
//   G = ghosted
//   M = missed / messaged (to disambiguate at M5)
//   N = no check-in
// The CHECKIN_META labels below are intentionally not yet updated to these.
// R16-2c (Dan, 2026-09-17 Loom): MS "Message sent" replaces BOTH the old SM
// "Send message" and M "Messaged"; M now means "Missed". Stored rows were
// remapped SM/M -> MS by scripts/remap-checkin-codes.mjs before this shipped.
export type CheckInCode = "Y" | "MS" | "M" | "F" | "G" | "P" | "C" | "N";
/** Codes still allowed in the DB during the SM -> MS transition. */
export const LEGACY_CHECKIN_CODES: Record<string, CheckInCode> = { SM: "MS" };

export type CoachRole = "coach" | "head_coach";

export type TransformationStatus =
  | "draft"
  | "coach_approved"
  | "admin_approved"
  | "scheduled"
  | "posted";

export type AuditCadence = "W4" | "W8" | "W12" | "W16";
export type AuditStatus = "submitted" | "sent" | "messaged" | "ghosted";
export type DueState = "due" | "overdue" | "completed";

// Conditional onboarding pathway a new client is routed through (GHL custom
// field). Standard is the default flow; Challenge and Photoshoot are
// campaign-driven variants with different onboarding steps. Surfaced read-only
// in HQ (the routing itself happens in GHL workflows).
export type OnboardingType = "Standard" | "Challenge" | "Photoshoot";

export type JourneyStage =
  | "Onboarding"
  | "Active"
  | "Mid-Program Review"
  | "Approaching Renewal"
  | "Renewed/Graduated";

export type TransactionStatus = "paid" | "refunded" | "past_due";

// Appointment setter or closer. Added in the M4 refinement pass for the Sales
// Leaderboard; include in the M5 Supabase schema design. closeRate is computed.
export type SalesRepRole = "setter" | "closer";
export type SalesRep = {
  id: string;
  name: string;
  role: SalesRepRole;
  callsTaken: number;
  closes: number;
  cashCollected: number;
  /** Rank movement vs the previous period. */
  movement: number;
};

export type Coach = {
  id: string;
  name: string;
  role: CoachRole;
  maxCapacity: number;
  weeklyRate: number;
  fortnightlyRate: number;
  // Performance metrics (seeded; computed from real data later).
  adherence: number; // 0..1
  avgResponseHours: number;
  retention: number; // 0..1
  churn: number; // 0..1
};

export type Client = {
  id: string;
  name: string;
  plan: Plan;
  monthlyRate: number;
  /** Program start from GHL. NULL = unknown; never guessed from dateAdded (R17-1a). */
  startDate: string | null;
  /** R17-1b: start date set in the portal. Wins over startDate. */
  startDateOverride?: string | null; // ISO date
  /** Cancellation/term end, when known (cancelled clients, M5 live data). */
  endDate?: string | null;
  /** R12-6/8 (HQ-owned; the GHL sync never writes these columns): the
   *  client's agreed weekly check-in day (0=Sun..6=Sat, JS getDay()) and the
   *  coach-workflow flags that feed Results. */
  checkInDay?: number | null;
  programDone?: boolean;
  progressReviewRank?: number | null;
  transformationHad?: boolean;
  transformationPostApproved?: boolean;
  /** Live billing facts from GHL custom fields (M5). */
  billingFrequency?: string | null;
  weeklyRate?: number | null;
  termLength?: number | null;
  /** Conditional onboarding pathway from GHL (M5). Null when not yet set. */
  onboardingType?: OnboardingType | null;
  /** Renewal note (D5): call booked / thinking / etc. HQ-owned (never synced
   *  from GHL); null pre-migration 20260804000003. */
  renewalNote?: string | null;
  /** R16-6a: manual term end from the Renewals screen; wins over endDate when set. */
  termEndOverride?: string | null;
  status: ClientStatus;
  coachId: string | null;
  source: LeadSource;
  lastCheckIn: string | null; // ISO date
  checkInCode: CheckInCode;
  cashCollected: number; // basis for LTV
  journeyStage: JourneyStage;
  weightStart: number;
  weightCurrent: number;
};

export type Lead = {
  id: string;
  name: string;
  source: LeadSource;
  stage: LeadStage;
  ownerId: string;
  ownerName: string;
  lastActivity: string; // ISO date
  nextAction: string;
  value: number;
  stageEnteredAt: string; // ISO date, basis for daysInStage
  contactChannels: { channel: ContactChannel; priority: number }[];
};

export type Transformation = {
  id: string;
  clientId: string;
  coachId: string;
  milestone: string; // e.g. W12, W20
  status: TransformationStatus;
  approvedToPostAt: string | null;
  postedAt: string | null;
  hasBefore: boolean;
  hasAfter: boolean;
  /** Reviewer's reason when the card was sent back a stage (A9). Cleared on
   *  the next advance; null before migration 20260804000001 is applied. */
  sentBackReason?: string | null;
  /** Row creation timestamp; feeds "transformations this week" (E3). */
  createdAt?: string | null;
  /** R4-4 post-log (sheet "Ready To Post"/"Post Log"); absent before
   *  migration 20260807000005. */
  postedIg?: boolean;
  postedTt?: boolean;
  canvaUrl?: string | null;
  caption?: string | null;
};

// Transformation enriched with display names, for the Results Tracker cards.
// Names are resolved at read time (live: client/coach maps; demo: seed helpers)
// so the view never reaches back into the seed layer.
export type TransformationCard = Transformation & { clientName: string; coachName: string };

// A check-in row in the HQ-native check_ins table. Two sources: Kahunas form
// submissions (via the Zapier intake, src/lib/sync/kahunas.ts) and the coach
// weekly logs (via scripts/import-coach-log.mjs). `code` is the coach's weekly
// status; `adherence` is an optional Kahunas form score. Latest row per client
// drives the coach Check-ins screen.
export type CheckInSource = "kahunas" | "coach_log";
export type CheckIn = {
  id: string;
  clientId: string;
  coachId: string;
  submittedAt: string; // ISO; the check-in week/date
  code: CheckInCode | null; // coach weekly status (SM/Y/F/G/M/P/C/N)
  adherence: number | null; // 0..100, from a Kahunas form when present
  weekNumber: number | null;
  source: CheckInSource;
  /** R12-7: optional Loom link attached when the check-in was logged. */
  loomUrl?: string | null;
  /** R16-2f: coach's cell note (check_ins.note, max 280 chars). */
  note?: string | null;
};

export type ClientAudit = {
  id: string;
  clientId: string;
  coachId: string;
  cadenceWeek: AuditCadence;
  status: AuditStatus;
  resolved: boolean; // basis for computed dueState
  /** Reviewer feedback for the coach (C5). Null pre-migration 20260804000002. */
  feedback?: string | null;
  /** Loom walkthrough link for this audit (C5). */
  loomUrl?: string | null;
  /** R4-5 owner spot-review (sheet "Daniel Reviews"): 1-3 rating + notes.
   *  Null pre-migration 20260807000005. */
  ownerRating?: number | null;
  ownerNotes?: string | null;
};

// Kanban statuses (C1). Legacy DB rows may still say "open"; the read layer
// maps them to "todo" so the app only ever sees these five.
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "approved";

export type Task = {
  id: string;
  title: string;
  assigneeName: string;
  type: string;
  dueDate: string | null; // ISO date
  status: TaskStatus;
  // Live tasks carry the users.id behind assigneeName so the assignee picker
  // can preselect. Undefined for seed tasks (no per-person assignment there).
  assignedTo?: string | null;
  /** Who opened the task/ticket (C2). Null pre-migration / for seed rows. */
  openedBy?: string | null;
  /** Created date (YYYY-MM-DD) for display (C2). */
  createdAt?: string | null;
  /** R6-1 taskboard v2 (migration 20260808000001); null pre-migration. */
  template?: string | null;
  fields?: Record<string, string> | null;
  blockedReason?: string | null;
  completedAt?: string | null;
  activity?: { who: string; what: string; when: string }[];
  isNew?: boolean;
};

export type Transaction = {
  id: string;
  date: string; // ISO date
  clientName: string;
  plan: Plan;
  amount: number;
  source: string;
  status: TransactionStatus;
};

// Map a check-in code to a display label and a themed status pill variant.
// Key order = the cell menu order (R16-2c): Y, MS, M, F, G, P, C, N.
export const CHECKIN_META: Record<CheckInCode, { label: string; pill: StatusVariant }> = {
  Y: { label: "Submitted", pill: "submitted" },
  MS: { label: "Message sent", pill: "message-sent" },
  M: { label: "Missed", pill: "missed-check-in" },
  F: { label: "Follow-up", pill: "follow-up" },
  G: { label: "Ghosted", pill: "ghosted" },
  P: { label: "Paused", pill: "paused" },
  C: { label: "Cancelled", pill: "cancelled" },
  N: { label: "No check-in", pill: "no-check-in" },
};
