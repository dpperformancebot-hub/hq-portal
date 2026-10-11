// ============================================================================
// M4 SEED  ·  part of the SWAP POINT (see ./index.ts)
// Secondary-screen mock data + selectors. Replace bodies with Supabase / GHL
// at M5; screens read only through the exported selectors.
// ============================================================================

import { getLeads, type LeadSource } from "./index";
import { BRAND, IS_DP } from "@/lib/brand";

// Local TODAY (avoids a module-eval cycle with ./index, which re-exports this
// file). getLeads is imported but only called lazily inside selectors.
const TODAY = new Date("2026-06-03T00:00:00Z");
const DAY = 86_400_000;
const dAgo = (n: number) => new Date(TODAY.getTime() - n * DAY).toISOString().slice(0, 10);
const dFwd = (n: number) => new Date(TODAY.getTime() + n * DAY).toISOString().slice(0, 10);

// --- Inbox -----------------------------------------------------------------
export type InboxChannel = "whatsapp" | "instagram" | "email";
export type ConversationMessage = { id: string; from: "them" | "us"; text: string; time: string };
export type Conversation = {
  id: string;
  name: string;
  /** GHL contact id (live mode): required by the send write-back, and by the
   *  outreach guard's test-contact allowlist. Undefined in seed/demo. */
  contactId?: string | null;
  channel: InboxChannel;
  /** Raw GHL channel label when the source does not map cleanly to one of the
   *  three first-class channels (e.g. Facebook, Live Chat). Shown verbatim so
   *  the UI never misrepresents the channel. Undefined for seed/native ones. */
  rawChannel?: string;
  contactType: "Client" | "Lead";
  preview: string;
  time: string;
  unread: number;
  coach: string;
  plan: string;
  adherence: number;
  lastCheckIn: string;
  ltv: number;
  messages: ConversationMessage[];
};

const CONVERSATIONS: Conversation[] = [
  {
    id: "cv1", name: "Alannah Parfett", channel: "whatsapp", contactType: "Client", preview: "Smashed the week, down another kg!", time: "9:42am", unread: 2,
    coach: "Angus", plan: "Weekly", adherence: 0.92, lastCheckIn: "3 days ago", ltv: 4350,
    messages: [
      { id: "m1", from: "them", text: "Morning! Just submitted my check-in.", time: "9:30am" },
      { id: "m2", from: "us", text: "Great work this week. Carbs stay as-is, add 10min Zone 2 on off-days.", time: "9:38am" },
      { id: "m3", from: "them", text: "Smashed the week, down another kg!", time: "9:42am" },
    ],
  },
  {
    id: "cv2", name: "Charlotte Jezard", channel: "instagram", contactType: "Client", preview: "Can we move my check-in to Friday?", time: "Yesterday", unread: 1,
    coach: "Sarah Bennett", plan: "Fortnightly", adherence: 0.75, lastCheckIn: "9 days ago", ltv: 1920,
    messages: [
      { id: "m1", from: "them", text: "Can we move my check-in to Friday?", time: "4:10pm" },
    ],
  },
  {
    id: "cv3", name: "Hannah Page", channel: "instagram", contactType: "Lead", preview: "Yes Thursday works for the call", time: "Yesterday", unread: 0,
    coach: "Unassigned", plan: "Prospect", adherence: 0, lastCheckIn: "n/a", ltv: 0,
    messages: [
      { id: "m1", from: "us", text: "Want to jump on a quick call Thursday?", time: "2:00pm" },
      { id: "m2", from: "them", text: "Yes Thursday works for the call", time: "2:14pm" },
    ],
  },
  {
    id: "cv4", name: "Jake Reynolds", channel: "email", contactType: "Client", preview: "Sorry, been off the radar this week", time: "Mon", unread: 0,
    coach: "Connor Walsh", plan: "Weekly", adherence: 0.38, lastCheckIn: "14 days ago", ltv: 3520,
    messages: [
      { id: "m1", from: "us", text: "Haven't seen a check-in in a bit, all good?", time: "Mon 10:00am" },
      { id: "m2", from: "them", text: "Sorry, been off the radar this week", time: "Mon 6:30pm" },
    ],
  },
];

export function getConversations() {
  return CONVERSATIONS;
}

// --- Calendar --------------------------------------------------------------
// "personal" = R12-13 events from a coach's own connected iCal feed.
export type EventType = "call" | "content" | "launch" | "internal" | "personal";
export type CalendarEvent = { id: string; date: string; title: string; type: EventType };

const CALENDAR_EVENTS: CalendarEvent[] = [
  { id: "e1", date: dAgo(2), title: "Team standup", type: "internal" },
  { id: "e2", date: dAgo(1), title: "Sales call: Hannah Page", type: "call" },
  { id: "e3", date: dAgo(0), title: "Reel: cut myths", type: "content" },
  { id: "e4", date: dFwd(1), title: "Sales call: Oscar Dean", type: "call" },
  { id: "e5", date: dFwd(2), title: "YouTube: protein guide", type: "content" },
  { id: "e6", date: dFwd(4), title: "June challenge launch", type: "launch" },
  { id: "e7", date: dFwd(5), title: "Coach 1:1s", type: "internal" },
  { id: "e8", date: dFwd(9), title: "Email: renewal push", type: "content" },
];

export function getCalendarEvents() {
  return CALENDAR_EVENTS;
}

// --- Call calendar ---------------------------------------------------------
export type CallBooking = {
  id: string;
  date: string;
  time: string;
  name: string;
  kind: "Lead" | "Client";
  setter: string;
  closer: string;
  channel: "Zoom" | "Phone";
};

const CALL_BOOKINGS: CallBooking[] = [
  { id: "cb1", date: dFwd(1), time: "10:00am", name: "Oscar Dean", kind: "Lead", setter: "Lucas", closer: "Lilli", channel: "Zoom" },
  { id: "cb2", date: dFwd(1), time: "2:30pm", name: "Hannah Page", kind: "Lead", setter: "Lucas", closer: "Lilli", channel: "Zoom" },
  { id: "cb3", date: dFwd(2), time: "9:00am", name: "Freya Lloyd", kind: "Lead", setter: "Lucas", closer: "Lilli", channel: "Phone" },
  { id: "cb4", date: dFwd(3), time: "11:15am", name: "Ruby Anderson", kind: "Client", setter: "Lucas", closer: "Lilli", channel: "Zoom" },
];

export function getCallBookings() {
  return CALL_BOOKINGS;
}

// --- Content planner + collaborations --------------------------------------
export type PostType = "Reel" | "Post" | "Story" | "YouTube" | "Email";
export type ContentPost = { id: string; account: string; day: number; type: PostType; title: string };

// R9-1: per-brand account list, from the brand handle.
const CONTENT_ACCOUNTS = [`${BRAND.handle} IG`, "Owner IG", "YouTube"];
const CONTENT_POSTS: ContentPost[] = [
  { id: "p1", account: `${BRAND.handle} IG`, day: 0, type: "Reel", title: "Cut myths" },
  { id: "p2", account: `${BRAND.handle} IG`, day: 2, type: "Post", title: "Client win: Ruby" },
  { id: "p3", account: `${BRAND.handle} IG`, day: 4, type: "Story", title: "Q&A Friday" },
  { id: "p4", account: "Owner IG", day: 1, type: "Reel", title: "Day in the life" },
  { id: "p5", account: "Owner IG", day: 3, type: "Post", title: "Mindset note" },
  { id: "p6", account: "YouTube", day: 2, type: "YouTube", title: "Protein guide" },
  { id: "p7", account: "YouTube", day: 5, type: "YouTube", title: "Full day of eating" },
];

export function getContentAccounts() {
  return CONTENT_ACCOUNTS;
}
export function getContentPosts() {
  return CONTENT_POSTS;
}

export type Collaboration = { id: string; title: string; assignee: string; status: "planned" | "to-do" | "done" };
const COLLABORATIONS: Collaboration[] = [
  { id: "cl1", title: "Ambassador reel: Mia (Gold)", assignee: "Mia Lawson", status: "to-do" },
  { id: "cl2", title: "Testimonial carousel", assignee: "Brooke", status: "planned" },
  { id: "cl3", title: "Recipe collab: Sarah", assignee: "Sarah Bennett", status: "done" },
  { id: "cl4", title: "Challenge promo reel", assignee: "Brooke", status: "to-do" },
];
export function getCollaborations() {
  return COLLABORATIONS;
}

// --- Marketing & campaigns -------------------------------------------------
export type Campaign = {
  id: string; name: string; type: string; status: "active" | "ended";
  spend: number; leads: number; closed: number; roas: number; period: string;
};
const CAMPAIGNS: Campaign[] = [
  { id: "mc1", name: "June Shred Challenge", type: "Challenge", status: "active", spend: 1200, leads: 84, closed: 11, roas: 4.2, period: "Jun" },
  { id: "mc2", name: "Free Macro Guide", type: "Lead Magnet", status: "active", spend: 600, leads: 152, closed: 7, roas: 3.1, period: "Jun" },
  { id: "mc3", name: "May Transformation Push", type: "Content", status: "ended", spend: 0, leads: 38, closed: 6, roas: 0, period: "May" },
];
export function getCampaigns() {
  return CAMPAIGNS;
}

export type LeadMagnet = { id: string; name: string; optIns: number; conversionPct: number };
const LEAD_MAGNETS: LeadMagnet[] = [
  { id: "lm1", name: "Free Macro Calculator", optIns: 1240, conversionPct: 4.8 },
  { id: "lm2", name: "7-Day Meal Plan", optIns: 860, conversionPct: 3.6 },
  { id: "lm3", name: "Fat Loss Myths PDF", optIns: 540, conversionPct: 2.1 },
];
export function getLeadMagnets() {
  return LEAD_MAGNETS;
}

// --- Automations -----------------------------------------------------------
export type AutomationStatus = "active" | "paused" | "failing" | "draft";
export type Automation = {
  id: string; name: string; trigger: string; actions: string; cadence: string;
  status: AutomationStatus; replacesVATask?: string; isNew?: boolean;
};
const AUTOMATIONS: Automation[] = [
  { id: "au1", name: "Auto-create WhatsApp GCs", trigger: "Deal won (closed_won)", actions: "Create WhatsApp group, add coach + client", cadence: "Real-time", status: "active", replacesVATask: "Manually set up client WhatsApp group" },
  { id: "au2", name: "Booking GC on call booked", trigger: "Call booked", actions: "Create booking group, send reminder", cadence: "Real-time", status: "active", replacesVATask: "Create call reminder thread" },
  { id: "au3", name: "Fathom call notes to CRM", trigger: "Call recording ready", actions: "Summarize, attach notes to lead", cadence: "Real-time", status: "active", replacesVATask: "Type up call notes" },
  { id: "au4", name: "Newie sync (cancels + pauses)", trigger: "Status change in GHL", actions: "Sync cancels and pauses to roster", cadence: "Real-time", status: "failing", replacesVATask: "Update spreadsheet manually" },
  { id: "au5", name: "Payroll weekly compute", trigger: "Schedule", actions: "Compute coach payouts, request approval", cadence: "Weekly · Fri 18:00", status: "draft", replacesVATask: "Calculate coach pay", isNew: true },
  { id: "au6", name: "Setter commission ledger", trigger: "Schedule", actions: "Tally setter commissions", cadence: "Weekly · Sun 23:00", status: "draft", replacesVATask: "Reconcile commissions" },
  { id: "au7", name: "Typeform to lead", trigger: "Typeform submitted", actions: "Create lead with source tag", cadence: "Real-time", status: "active", replacesVATask: "Copy form responses into CRM" },
  { id: "au8", name: "W20 graduation pack", trigger: "Client reaches W20", actions: "Generate graduation pack, notify coach", cadence: "Real-time", status: "paused", replacesVATask: "Build graduation graphics", isNew: true },
];
export function getAutomations() {
  return AUTOMATIONS;
}

// --- Analytics + sales performance (computed from leads) -------------------
export function getAnalytics() {
  const leads = getLeads();
  const funnel = [
    { stage: "Submitted", count: leads.filter((l) => ["Submitted", "New Client Processing"].includes(l.stage)).length + 24 },
    { stage: "Called", count: leads.filter((l) => ["Call Taken", "Follow-Up", "Submitted", "New Client Processing"].includes(l.stage)).length + 16 },
    { stage: "Showed", count: 14 },
    { stage: "Signed", count: 9 },
    { stage: "Onboarded", count: 8 },
  ];
  const retentionCurve = [
    { month: "M1", pct: 100 },
    { month: "M2", pct: 94 },
    { month: "M3", pct: 88 },
    { month: "M4", pct: 81 },
    { month: "M5", pct: 76 },
    { month: "M6", pct: 72 },
  ];
  const sources: LeadSource[] = ["Instagram", "YouTube", "Referral", "Ambassador", "Lead Magnet", "Email", "Website", "Word of Mouth"];
  const sourcePerf = sources.map((s) => {
    const ls = leads.filter((l) => l.source === s);
    const closed = ls.filter((l) => l.stage === "Submitted").length;
    return {
      source: s,
      leads: ls.length,
      calls: ls.filter((l) => ["Call Taken", "Follow-Up", "Submitted", "New Client Processing"].includes(l.stage)).length,
      closed,
      convPct: ls.length ? Math.round((closed / ls.length) * 100) : 0,
      revenue: closed * 900,
    };
  });
  return {
    kpis: { conversionPct: 32, avgDaysToClose: 6, showUpRatePct: 78, avgTenureWeeks: 32, avgWeekAtChurn: 24.5 },
    funnel,
    retentionCurve,
    sourcePerf,
  };
}

export function getSalesPerformance() {
  const leads = getLeads();
  const reps = ["Lucas", "Lilli"];
  return reps.map((name) => {
    const taken = leads.filter((l) => l.ownerName === name && ["Call Taken", "Follow-Up", "Submitted", "New Client Processing", "Lost"].includes(l.stage)).length;
    const closed = leads.filter((l) => l.ownerName === name && l.stage === "Submitted").length;
    return {
      name,
      callsTaken: taken + 6,
      closed: closed + 3,
      closeRatePct: Math.round(((closed + 3) / (taken + 6)) * 100),
      revenueClosed: (closed + 3) * 900,
    };
  });
}

// --- Reports ---------------------------------------------------------------
export type Report = { id: string; title: string; type: string; generatedAt: string; period: string; body?: string };
const REPORTS: Report[] = [
  { id: "r1", title: "May Monthly Summary", type: "Monthly", generatedAt: dAgo(3), period: "May 2026" },
  { id: "r2", title: "Q1 Performance Review", type: "Quarterly", generatedAt: dAgo(40), period: "Q1 2026" },
  { id: "r3", title: "Coach Scorecard Export", type: "Coaching", generatedAt: dAgo(7), period: "May 2026" },
];
export function getReports() {
  return REPORTS;
}

// --- Document stores -------------------------------------------------------
export type BrandAsset = { id: string; name: string; kind: "Logo" | "Photo" | "Video" | "Guideline"; updated: string };
const BRAND_ASSETS: BrandAsset[] = [
  { id: "ba1", name: "Primary Logo (dark)", kind: "Logo", updated: dAgo(30) },
  { id: "ba2", name: "Primary Logo (light)", kind: "Logo", updated: dAgo(30) },
  { id: "ba3", name: "Founder shoot 2026", kind: "Photo", updated: dAgo(12) },
  { id: "ba4", name: "Brand intro reel", kind: "Video", updated: dAgo(20) },
  { id: "ba5", name: "Brand Guidelines v2", kind: "Guideline", updated: dAgo(5) },
];
export function getBrandAssets() {
  return BRAND_ASSETS;
}

export type Sop = { id: string; title: string; category: string; version: string; updated: string };
const SOPS: Sop[] = [
  { id: "s1", title: "New client onboarding", category: "Operations", version: "v3", updated: dAgo(8) },
  { id: "s2", title: "Weekly check-in response", category: "Coaching", version: "v5", updated: dAgo(2) },
  { id: "s3", title: "Sales call framework", category: "Sales", version: "v2", updated: dAgo(15) },
  { id: "s4", title: "Content posting workflow", category: "Marketing", version: "v1", updated: dAgo(22) },
  { id: "s5", title: "Refund handling", category: "Operations", version: "v2", updated: dAgo(40) },
];
export function getSops() {
  return SOPS;
}

export type Contract = { id: string; client: string; type: string; value: number; signed: string; term: string; status: "active" | "expired" | "pending" };
const CONTRACTS: Contract[] = [
  { id: "ct1", client: "Ruby Anderson", type: "12-week PIF", value: 2400, signed: dAgo(220), term: "12 weeks", status: "active" },
  { id: "ct2", client: "Noah Bennett", type: "6-month", value: 5400, signed: dAgo(200), term: "6 months", status: "active" },
  { id: "ct3", client: "Ada Knight", type: "12-week", value: 2400, signed: dAgo(1), term: "12 weeks", status: "pending" },
  { id: "ct4", client: "Max Phillips", type: "12-week", value: 2400, signed: dAgo(300), term: "12 weeks", status: "expired" },
];
export function getContracts() {
  return CONTRACTS;
}

export type BriefItem = { id: string; title: string; note: string };
const BRIEF: BriefItem[] = [
  { id: "br1", title: "North star", note: "Real, visible transformations with life intact." },
  { id: "br2", title: "Tone", note: "Direct, warm, evidence-led. No hype." },
  { id: "br3", title: "Q3 focus", note: "Retention + graduation content engine." },
];
export function getBrief() {
  return BRIEF;
}

export type MerchProduct = { id: string; name: string; unitsSold: number; revenue: number };
const MERCH: MerchProduct[] = [
  { id: "mp1", name: "DP Training Tee", unitsSold: 142, revenue: 4260 },
  { id: "mp2", name: "Shaker Bottle", unitsSold: 210, revenue: 2100 },
  { id: "mp3", name: "Lifting Straps", unitsSold: 88, revenue: 1320 },
];
export function getMerch() {
  return MERCH;
}

// --- Brand build / team / referrals / social / ambassadors / team ----------
export type BuildTask = { id: string; title: string; assignee: string; status: "to-do" | "in progress" | "done" };
const BRAND_BUILD: BuildTask[] = [
  { id: "bb1", title: "Refresh brand photography", assignee: "Owner", status: "in progress" },
  { id: "bb2", title: "Document tone of voice", assignee: "Sarah Bennett", status: "done" },
  { id: "bb3", title: "Launch YouTube channel art", assignee: "Owner", status: "to-do" },
];
export function getBrandBuild() {
  return BRAND_BUILD;
}

export type Hire = { id: string; role: string; stage: "Sourcing" | "Interviewing" | "Offer" | "Hired"; candidate: string };
const HIRES: Hire[] = [
  { id: "h1", role: "Junior Coach", stage: "Interviewing", candidate: "3 candidates" },
  { id: "h2", role: "Content VA", stage: "Offer", candidate: "Priya R." },
  { id: "h3", role: "Setter", stage: "Sourcing", candidate: "5 candidates" },
];
export function getHires() {
  return HIRES;
}

export type Referral = { id: string; referrer: string; referred: string; reward: string; status: "pending" | "earned" | "paid" };
const REFERRALS: Referral[] = [
  { id: "rf1", referrer: "Ruby Anderson", referred: "Ella Brooks", reward: "$100 credit", status: "earned" },
  { id: "rf2", referrer: "Noah Bennett", referred: "Theo Grant", reward: "$100 credit", status: "pending" },
  { id: "rf3", referrer: "Liam Foster", referred: "Ada Knight", reward: "$100 credit", status: "paid" },
];
export function getReferrals() {
  return REFERRALS;
}

export type SocialAccount = { id: string; handle: string; platform: string; followers: number; growthPct: number; topPost: string };
const SOCIAL_ACCOUNTS: SocialAccount[] = [
  { id: "sa1", handle: "@dpperformance", platform: "Instagram", followers: 48200, growthPct: 2.4, topPost: "Client win: Ruby (62k views)" },
  { id: "sa2", handle: "DP Performance", platform: "YouTube", followers: 19850, growthPct: 1.1, topPost: "Protein guide (41k views)" },
  { id: "sa3", handle: "@dpperformance", platform: "TikTok", followers: 12400, growthPct: 5.8, topPost: "Cut myths (88k views)" },
];
export function getSocialAccounts() {
  return SOCIAL_ACCOUNTS;
}

export type Ambassador = { id: string; handle: string; tier: "Gold" | "Silver" | "Bronze"; referrals: number; closed: number; commission: number; status: "active" | "paused" };
const AMBASSADORS: Ambassador[] = [
  { id: "am1", handle: "@mia.lifts", tier: "Gold", referrals: 18, closed: 7, commission: 1400, status: "active" },
  { id: "am2", handle: "@coach.tom", tier: "Silver", referrals: 9, closed: 3, commission: 600, status: "active" },
  { id: "am3", handle: "@grace.fit", tier: "Bronze", referrals: 4, closed: 1, commission: 200, status: "paused" },
];
export function getAmbassadors() {
  return AMBASSADORS;
}

export type TeamMember = { id: string; name: string; role: string; access: string; status: "active" | "invited" };
const TEAM: TeamMember[] = [
  { id: "tm1", name: "Daniel Price", role: "Owner", access: "Owner", status: "active" },
  { id: "tm2", name: "Angus", role: "Head Coach", access: "Coach", status: "active" },
  { id: "tm3", name: "Sarah Bennett", role: "Coach", access: "Coach", status: "active" },
  { id: "tm4", name: "Marcus Lee", role: "Coach", access: "Coach", status: "active" },
  { id: "tm5", name: "Priya Nair", role: "Coach", access: "Coach", status: "active" },
  { id: "tm6", name: "Connor Walsh", role: "Coach", access: "Coach", status: "active" },
  { id: "tm7", name: "Lilli", role: "Sales / Closer", access: "Sales", status: "active" },
  { id: "tm8", name: "Lucas", role: "Sales / Setter", access: "Sales", status: "active" },
  { id: "tm9", name: "Brooke", role: "Content & Transformations", access: "VA", status: "active" },
  { id: "tm10", name: "Mykael", role: "VA", access: "VA", status: "active" },
  { id: "tm11", name: "Jameela", role: "VA", access: "VA", status: "invited" },
];
export function getTeam() {
  // R9-1: the seeded staff roster is DP's real team. A rebranded deploy
  // shows its live Logins section and an honest empty members table instead.
  return IS_DP ? TEAM : [];
}

export type Integration = { id: string; name: string; category: string; connected: boolean };
const INTEGRATIONS: Integration[] = [
  { id: "ig1", name: "Stripe", category: "Payments", connected: false },
  { id: "ig2", name: "GoHighLevel", category: "CRM", connected: false },
  { id: "ig3", name: "Calendly", category: "Scheduling", connected: false },
  { id: "ig4", name: "Zoom", category: "Calls", connected: false },
  { id: "ig5", name: "WhatsApp", category: "Messaging", connected: false },
  { id: "ig6", name: "Typeform", category: "Forms", connected: false },
  { id: "ig7", name: "ManyChat", category: "Messaging", connected: false },
  { id: "ig8", name: "Google Calendar", category: "Scheduling", connected: false },
];
export function getIntegrations() {
  return INTEGRATIONS;
}
