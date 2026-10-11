// Postgres row shapes (snake_case) and mappers back to the app contracts
// (src/lib/seed/types.ts). Computed fields (monthlyRate, journeyStage,
// cashCollected, weekNumber) are derived HERE at read time, never stored,
// per DATA-MODEL.md rule 3. Derivation logic is shared with the GHL-direct
// path via the exported helpers in src/lib/ghl/map.ts.

import { journeyStage, WEEKS } from "@/lib/ghl/map";
import type {
  CheckIn,
  CheckInCode,
  Client,
  ClientStatus,
  Coach,
  Lead,
  LeadSource,
  LeadStage,
  Plan,
  Transformation,
} from "@/lib/seed/types";
import { LEGACY_CHECKIN_CODES } from "@/lib/seed/types";
import type { BuildTask, Campaign, Hire, LeadMagnet, Report } from "@/lib/seed/m4";

export type ClientRow = {
  id: string;
  ghl_contact_id: string;
  name: string;
  plan: Plan;
  billing_frequency: string | null;
  weekly_rate: number;
  term_length: number | null;
  start_date: string | null;
  /** R17-1b, absent until migration 20260925000001 is applied. */
  start_date_override?: string | null;
  /** Absent until migration 20260804000003 (D5 renewal notes) is applied. */
  renewal_note?: string | null;
  /** Absent until migration 20260921000004 (R16-6a term end override). */
  term_end_override?: string | null;
  end_date: string | null;
  status: ClientStatus;
  coach_id: string | null;
  source: string | null;
  videos_uploaded: boolean;
  converted_to_app: boolean;
  synced_at: string | null;
};

export type CoachRow = {
  id: string;
  name: string;
  role: "coach" | "head_coach";
  max_capacity: number;
  weekly_rate: number;
  fortnightly_rate: number;
  is_active: boolean;
};

export type LeadRow = {
  id: string;
  ghl_opportunity_id: string;
  name: string;
  source: string | null;
  stage: LeadStage;
  ghl_assigned_to: string | null;
  last_activity: string | null;
  next_action: string | null;
  value: number;
  stage_entered_at: string | null;
  contact_channels: Lead["contactChannels"];
};

export function rowToClient(r: ClientRow): Client {
  const weeks = WEEKS(r.start_date);
  const weeklyRate = Number(r.weekly_rate) || 0;
  const checkInCode: CheckInCode =
    r.status === "paused" ? "P" : r.status === "cancelled" ? "C" : "N";
  return {
    id: r.id,
    name: r.name,
    plan: r.plan,
    monthlyRate: Math.round((weeklyRate * 52) / 12),
    startDate: r.start_date,
    startDateOverride: r.start_date_override ?? null,
    endDate: r.end_date,
    billingFrequency: r.billing_frequency,
    weeklyRate,
    termLength: r.term_length,
    renewalNote: r.renewal_note ?? null,
    termEndOverride: r.term_end_override ?? null,
    status: r.status,
    coachId: r.coach_id,
    source: (r.source ?? "Instagram") as LeadSource,
    lastCheckIn: null, // Kahunas has no API; starts fresh per owner decision
    checkInCode,
    checkInDay: (r as { check_in_day?: number | null }).check_in_day ?? null,
    programDone: (r as { program_done?: boolean }).program_done ?? false,
    progressReviewRank: (r as { progress_review_rank?: number | null }).progress_review_rank ?? null,
    transformationHad: (r as { transformation_had?: boolean }).transformation_had ?? false,
    transformationPostApproved: (r as { transformation_post_approved?: boolean }).transformation_post_approved ?? false,
    cashCollected: weeklyRate * (r.term_length ? Math.min(weeks, r.term_length) : weeks),
    journeyStage: journeyStage(r.status, weeks, r.term_length, r.end_date),
    weightStart: 0,
    weightCurrent: 0,
  };
}

export function rowToCoach(r: CoachRow): Coach {
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    // R17-4: capacity now lives on the row, not in code. The stored values
    // were all the legacy default 30 while the code resolved everyone to 70,
    // which is why this used to ignore the column; they were normalised to 70
    // on 2026-09-25 before this read was switched over. Set a coach's capacity
    // on their row (the Add coach form writes it) and it applies everywhere.
    maxCapacity: r.max_capacity,
    weeklyRate: Number(r.weekly_rate),
    fortnightlyRate: Number(r.fortnightly_rate),
    // Performance metrics need check-in history (Kahunas, no API); zeroed.
    adherence: 0,
    avgResponseHours: 0,
    retention: 0,
    churn: 0,
  };
}

export function rowToLead(r: LeadRow): Lead {
  return {
    id: r.id,
    name: r.name,
    source: (r.source ?? "Instagram") as LeadSource,
    stage: r.stage,
    ownerId: r.ghl_assigned_to ?? "",
    ownerName: "", // G1 gap: lead owner names pending team mapping
    lastActivity: r.last_activity ?? "",
    nextAction: r.next_action ?? "",
    value: Number(r.value) || 0,
    stageEnteredAt: r.stage_entered_at ?? "",
    contactChannels: r.contact_channels ?? [],
  };
}

export type CheckInRow = {
  id: string;
  client_id: string;
  coach_id: string;
  submitted_at: string;
  code: CheckInCode | null;
  adherence: number | null;
  week_number: number | null;
  source: "kahunas" | "coach_log";
  /** R16-2f, null until migration 20260921000003 is applied. */
  note?: string | null;
};

export function rowToCheckIn(r: CheckInRow): CheckIn {
  return {
    id: r.id,
    clientId: r.client_id,
    coachId: r.coach_id,
    submittedAt: r.submitted_at,
    // R16-2c: a stored legacy code (SM) reads as its replacement (MS) so the
    // UI never meets a code CHECKIN_META does not know.
    code: r.code ? (LEGACY_CHECKIN_CODES[r.code as string] ?? r.code) : null,
    adherence: r.adherence === null ? null : Number(r.adherence),
    weekNumber: r.week_number,
    source: r.source,
    loomUrl: (r as unknown as { loom_url?: string | null }).loom_url ?? null,
    note: r.note ?? null,
  };
}

export type TransformationRow = {
  id: string;
  client_id: string;
  coach_id: string;
  milestone: string;
  status: Transformation["status"];
  permission: "Y" | "N" | "?" | null;
  handover: boolean;
  before_after_assets: { kind?: string }[] | null;
  approved_to_post_at: string | null;
  posted_at: string | null;
  created_at?: string | null;
  /** Absent until migration 20260804000001 (A9 send-back) is applied. */
  sent_back_reason?: string | null;
  /** Absent until migration 20260807000005 (R4-4 post-log) is applied. */
  posted_ig?: boolean | null;
  posted_tt?: boolean | null;
  canva_url?: string | null;
  caption?: string | null;
};

export function rowToTransformation(r: TransformationRow): Transformation {
  const assets = Array.isArray(r.before_after_assets) ? r.before_after_assets : [];
  return {
    id: r.id,
    clientId: r.client_id,
    coachId: r.coach_id,
    milestone: r.milestone,
    status: r.status,
    approvedToPostAt: r.approved_to_post_at,
    postedAt: r.posted_at,
    hasBefore: assets.some((a) => a?.kind === "before"),
    hasAfter: assets.some((a) => a?.kind === "after"),
    sentBackReason: r.sent_back_reason ?? null,
    createdAt: r.created_at ?? null,
    postedIg: r.posted_ig ?? false,
    postedTt: r.posted_tt ?? false,
    canvaUrl: r.canva_url ?? null,
    caption: r.caption ?? null,
  };
}

// --------------------------------------------------------------------------
// Brand / marketing / reports stores (migration 20260630000002). HQ-native
// lists, no outbound path. Mappers return the existing seed view contracts
// (src/lib/seed/m4.ts) so the screens render unchanged; numeric columns are
// coerced from the numeric/text Postgres types, date columns sliced to the
// YYYY-MM-DD display string the views show.

const toDate = (ts: string | null): string => (ts ? ts.slice(0, 10) : "");

export type ReportRow = {
  id: string;
  title: string;
  type: string;
  period: string | null;
  body: string | null;
  generated_at: string | null;
};

export function rowToReport(r: ReportRow): Report {
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    period: r.period ?? "",
    generatedAt: toDate(r.generated_at),
    body: r.body ?? undefined,
  };
}

export type BrandBuildTaskRow = {
  id: string;
  title: string;
  status: BuildTask["status"];
  assignee_name: string | null;
};

export function rowToBrandBuildTask(r: BrandBuildTaskRow): BuildTask {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    assignee: r.assignee_name ?? "Unassigned",
  };
}

export type HireRow = {
  id: string;
  role: string;
  candidate: string | null;
  stage: Hire["stage"];
};

export function rowToHire(r: HireRow): Hire {
  return {
    id: r.id,
    role: r.role,
    stage: r.stage,
    candidate: r.candidate ?? "",
  };
}

export type CampaignRow = {
  id: string;
  name: string;
  type: string;
  // The table allows 'active' | 'paused' | 'ended'; the seed view contract is
  // 'active' | 'ended'. A persisted 'paused' is coerced to 'ended' so the
  // existing status pill stays valid.
  status: "active" | "paused" | "ended";
  spend: number | string;
  leads: number;
  closed: number;
  roas: number | string | null;
  period: string | null;
};

export function rowToCampaign(r: CampaignRow): Campaign {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    status: r.status === "active" ? "active" : "ended",
    spend: Number(r.spend) || 0,
    leads: r.leads,
    closed: r.closed,
    roas: Number(r.roas) || 0,
    period: r.period ?? "",
  };
}

export type LeadMagnetRow = {
  id: string;
  name: string;
  opt_ins: number;
  conversion_pct: number | string;
};

export function rowToLeadMagnet(r: LeadMagnetRow): LeadMagnet {
  return {
    id: r.id,
    name: r.name,
    optIns: r.opt_ins,
    conversionPct: Number(r.conversion_pct) || 0,
  };
}
