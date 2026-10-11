// Brand-specific values. One codebase, rebranded per client. The active brand
// is selected by NEXT_PUBLIC_BRAND (default "dp"); each per-client deploy sets
// it, e.g. Toby's TJD Fit deploy sets NEXT_PUBLIC_BRAND=tjd, and the whole app
// reskins. This is the single source of truth for brand identity; never
// hardcode these in components. Colours live in the theme (globals.css tokens).

import type { LeadStage } from "@/lib/seed/types";

export type Brand = {
  name: string;
  /** Short label under the logo. */
  tagline: string;
  /** Initials shown in the profile/logo avatar. */
  initials: string;
  /** Owner first name, used in greetings (e.g. the Daily Digest). */
  ownerFirstName: string;
  /** Full owner name, used where a task/record is attributed to the owner
   *  (e.g. the Tasks assignee list / "Mine" filter). */
  ownerName: string;
  /** Owner email shown in the Daily Digest header. */
  ownerEmail: string;
  /** Primary social handle, used as a seed/display default. */
  handle: string;
  /** Logo image path under /public (e.g. /brands/dp.png). The sidebar shows
   *  it top-left and falls back to the initials block if the file is absent. */
  logoSrc?: string;
  /** Coach fee deducted from each coach's payout gross on Financials, as a
   *  fraction (0.1 = 10%). PLACEHOLDER (V2-02): this deduction predates the
   *  owner's payroll rules and Dan has not confirmed what it represents. It is
   *  labelled in the UI; set to 0 to remove the deduction (the Fee column
   *  hides itself). */
  coachFeePct: number;
  /** This brand's GHL sub-account (location) id. The env var GHL_LOCATION_ID
   *  still wins when set; this is the per-brand fallback so a deploy missing
   *  the env var reads its OWN sub-account, never another client's. Location
   *  ids are routing identifiers (they appear in webhook URLs), not secrets. */
  ghlLocationId: string;
  /** R5-1/R6-3 journey tracker shape: an explicit per-brand column list.
   *  Each range is inclusive; from === to renders a single-week column
   *  (Dan's W4 and W52 islands); to null = open-ended final bucket.
   *  w12PifOnly: the W12 review-call tick shows on PIF clients only. */
  journey: {
    ranges: { from: number; to: number | null }[];
    w12PifOnly: boolean;
  };
  /** Pipeline stages in funnel order, per brand (Dan's spec adds stages TJD
   *  does not have). Drives the Kanban columns, table stage sort/presets and
   *  funnel derivations; the GHL stage mapping collapses a stage a brand
   *  does not list (see mapOpportunitiesToLeads). */
  pipelineStages: LeadStage[];
  /** R9-1: per-brand payroll facts (previously Dan-global hardcodes that TJD
   *  silently inherited). TJD currently carries DAN'S VALUES as an explicit
   *  interim: Toby has not supplied his own rules yet, and the flag on his
   *  entry marks that. Rates themselves ($25/$15) live on each coaches row. */
  pay: {
    /** Day of month pay lands, covering the PRIOR month. */
    paydayDayOfMonth: number;
    /** One-off bonus per client onboarded. */
    setupBonus: number;
    /** Retention bonus per full 10 weeks a client is retained. */
    retentionBonusPer10Weeks: number;
    /** R10: false until this brand's owner confirms the values above are
     *  THEIR rules. Unconfirmed brands render honest "rates not set" states
     *  on pay surfaces instead of confident numbers. */
    confirmed: boolean;
    /**
     * R18: which payroll ENGINE this brand runs on. The two are genuinely
     * different businesses, not a setting apart:
     *   "checkin-codes" (DP) pays per weekly check-in code, with setup and
     *     retention bonuses. See coach-config PAY_RULES.
     *   "weeks-paid" (TJD) pays weeks the client actually PAID for, times a
     *     per-coach rate that differs for brand vs referral clients, with no
     *     bonuses. See src/lib/pay/tjd-pay.ts and the owner's Coach Rates SOP.
     * Nothing in one engine is reachable from the other brand.
     */
    model: "checkin-codes" | "weeks-paid";
    /**
     * Whether a COACH login (plain or head coach) sees any pay at all: the
     * My Pay screen and nav item, the dashboard pay card and pay trend, and
     * their own rate on the coach card. false = pay is owner/admin business
     * only on this brand; the owner and admin keep full pay and payroll
     * access, including while viewing the portal as a coach. Enforced in
     * access-policy (payVisibleToViewer) and stripped server-side before data
     * crosses to the client, never just hidden in render.
     *   DP: true (coaches see their own pay, unchanged).
     *   TJD: false (owner decision: coaches do not see pay).
     */
    coachCanSeePay: boolean;
    // TJD's default coach rate card is NOT here: this file ships in the
    // client bundle to every login, so it lives server-only in
    // src/lib/pay/default-rate-card.ts (coaches never receive a pay figure).
  };
  /** How this brand's GHL contacts map to the client roster. DP and TJD have
   *  genuinely different GHL data shapes (DP: a Status custom field + Assigned
   *  Coach populated in GHL; TJD: contacts carry a `client` tag with coach and
   *  rate owned in the HQ, not GHL), so the sync reads this instead of guessing. */
  roster: {
    /** First name (lowercased) of the coach the GHL sync elevates to
     *  head_coach, or null when the tier is managed purely in the portal
     *  (Team screen star). DP: Angus comes named from GHL; TJD: null. */
    headCoachFirstName: string | null;
    /** Treat a contact tagged `client` (with no Status field) as an active
     *  client. TJD only. DP stays status-only so its lead contacts that happen
     *  to carry a `client` tag are never pulled into the roster. */
    clientTag: boolean;
    /** coach_id + weekly_rate are HQ-owned (set in the portal / bootstrap
     *  import), not projected from GHL, so the sync must NOT overwrite them.
     *  TJD only. DP keeps projecting both from its GHL fields. */
    ownFieldsInHq: boolean;
  };
  /**
   * Seconds a server-side Supabase read may be served from Next's Data Cache
   * (dbAdmin in src/lib/db/client.ts). 0 = never cached, every read is fresh.
   *
   * The cache is stale-while-revalidate and survives deploys on Vercel, so
   * the FIRST read after a quiet spell returns whatever was cached last, which
   * can be hours old. On TJD that showed a coach's pre-import roster after a
   * bulk import, and sent a freshly invited owner to /no-access because the
   * invite lookup replayed a list from before the invite existed.
   *   DP: 30 (776 clients plus >24k leads, ~3s uncached).
   *   TJD: 0 (~200 clients, ~1.7k leads, cheap to read fresh).
   */
  dbReadCacheSeconds: number;
  /**
   * When the owner views the portal as a coach ("view as"), does the portal
   * show EXACTLY that coach's view, with every owner-only control hidden and
   * refused? Owner-only powers otherwise follow the REAL role, so an owner
   * inside a coach portal keeps them.
   *   DP: false (unchanged: Dan keeps owner controls while impersonating).
   *   TJD: true (owner decision: view-as is the coach view, nothing more).
   * Read by access-policy predicates (e.g. canOwnerReviewAudits).
   */
  viewAsIsExactCoachView: boolean;
  /** R16-7: engagement policy knobs Dan / Toby set per brand. */
  engagement: {
    /** Who ticks the "FB form sent" column. "coach": coaches own it and the
     *  VA sees it read-only as coach-managed (DP since 2026-09). "va": the VA
     *  ticks it (TJD, unchanged). */
    fbFormOwner: "coach" | "va";
    /** Cap on the PIF milestone-call ladder: milestones beyond this week are
     *  not generated. null = today's rule (W14 then every 16 weeks, forever).
     *  Dan's call is pending; DP stays null until he picks. */
    milestoneCallsAfterWeek: number | null;
    /** R17-3: roles the Engagement screen is offered to. Jameela reports it
     *  duplicates Renewals for her and that FB forms are coach-managed, so DP
     *  can drop `va` and `ops_manager` from this list in one line once Dan
     *  decides. Left complete for now: the screen is NOT deleted. */
    visibleTo: Role[];
  };
  /** R16-8: Academy access overrides. */
  academy: {
    /** coaches.id values that open the WHOLE course regardless of stage
     *  progression (owner decision, per brand). Everyone else keeps the
     *  sequential unlock: module 1 plus each module whose predecessor is
     *  fully complete. An allowlisted coach still tracks lessons normally,
     *  so the Coach Performance tracker keeps showing their real stage. */
    fullAccessCoachIds: string[];
  };
};

import type { Role } from "@/lib/navigation";

// Per-client brand configs. Add a client here, then set NEXT_PUBLIC_BRAND to its
// key on that client's deploy. TJD Fit values are placeholders pending Toby's
// real email/handle.
/** Exported so the brand-parity test can compare the two configs directly,
 *  without depending on which brand the process happens to be built as. */
export const BRANDS: Record<string, Brand> = {
  dp: {
    name: "DP Performance",
    tagline: "HQ",
    initials: "DP",
    ownerFirstName: "Daniel",
    ownerName: "Daniel Price",
    ownerEmail: "owner@dpperformance.com",
    handle: "@dpperformance",
    logoSrc: "/brands/dp.svg",
    // Dan confirmed (2026-08-07) the historical 10% was a mistake, not a real
    // payroll rule: 0 removes the deduction and hides the Fee column.
    coachFeePct: 0,
    ghlLocationId: "R99JktDA6ajZeTWo4YPu",
    // R6-3: Dan's confirmed column list (W4 = feedback-form trigger week,
    // W52 = year milestone).
    journey: {
      ranges: [
        { from: 1, to: 3 },
        { from: 4, to: 4 },
        { from: 5, to: 8 },
        { from: 9, to: 12 },
        { from: 13, to: 16 },
        { from: 17, to: 24 },
        { from: 25, to: 34 },
        { from: 35, to: 44 },
        { from: 45, to: 51 },
        { from: 52, to: 52 },
        { from: 53, to: 70 },
        { from: 71, to: 90 },
        { from: 91, to: null },
      ],
      w12PifOnly: true,
    },
    // Dan's spec 2026-08-09: "Call Offered" sits between In Conversation
    // (Contacted) and Call Booked.
    pipelineStages: [
      "New Enquiry",
      "Contacted",
      "Call Offered",
      "Call Booked",
      "Call Taken",
      "Follow-Up",
      "New Client Processing",
      "Submitted",
      "Lost",
    ],
    pay: { paydayDayOfMonth: 5, setupBonus: 50, retentionBonusPer10Weeks: 50, confirmed: true, model: "checkin-codes", coachCanSeePay: true },
    roster: { clientTag: false, ownFieldsInHq: false, headCoachFirstName: "angus" },
    dbReadCacheSeconds: 30,
    viewAsIsExactCoachView: false,
    engagement: {
      fbFormOwner: "coach",
      milestoneCallsAfterWeek: null,
      visibleTo: ["owner", "admin", "ops_manager", "va", "coach"],
    },
    // Angus (head coach). Confirmed against DP coaches by name 2026-09-22:
    // role head_coach, active, 58 active clients, one linked login.
    academy: { fullAccessCoachIds: ["a8b305b6-b018-40ae-a650-0ccffa77e422"] },
  },
  tjd: {
    name: "TJD Fit",
    tagline: "HQ",
    initials: "TJD",
    ownerFirstName: "Toby",
    ownerName: "Toby",
    ownerEmail: "owner@tjdfit.com",
    handle: "@tjdfit",
    logoSrc: "/brands/tjd.png",
    // Same placeholder origin as DP's; no confirmed fee rule for Toby either.
    coachFeePct: 0,
    ghlLocationId: "f80Utr8WEschm7sPt526",
    // Toby's interim shape (single weeks early, 52+ for year gifts);
    // replace with his exact list when he sends it (R5-1/R6-3).
    journey: {
      ranges: [
        ...Array.from({ length: 15 }, (_, i) => ({ from: i + 1, to: i + 1 })),
        { from: 16, to: 24 },
        { from: 25, to: 52 },
        { from: 53, to: null },
      ],
      w12PifOnly: true,
    },
    // Toby's pipeline keeps the classic shape (no Call Offered stage).
    pipelineStages: [
      "New Enquiry",
      "Contacted",
      "Call Booked",
      "Call Taken",
      "Follow-Up",
      "New Client Processing",
      "Submitted",
      "Lost",
    ],
    // ⚠ INTERIM: Dan's payroll values. Toby has not supplied TJD's own
    // payday/bonus rules; replace these when he does (R9-1 flag).
    // R18: TJD's payroll is nothing like DP's. Coaches are paid on WEEKS PAID
    // at a per-coach rate that doubles up for referral clients, with no setup
    // or retention bonus, per the owner's Coach Rates SOP (2026). The bonus
    // fields below stay at 0 because this engine does not use them.
    pay: {
      paydayDayOfMonth: 5,
      setupBonus: 0,
      retentionBonusPer10Weeks: 0,
      confirmed: true,
      model: "weeks-paid",
      // Pay is owner/admin only on TJD: coaches never see My Pay or any pay
      // figure. Owner and admin keep it, including while viewing as a coach.
      coachCanSeePay: false,
      // Default rate card: server-only, see src/lib/pay/default-rate-card.ts.
    },
    roster: { clientTag: true, ownFieldsInHq: true, headCoachFirstName: null },
    dbReadCacheSeconds: 0,
    viewAsIsExactCoachView: true,
    engagement: {
      fbFormOwner: "va",
      milestoneCallsAfterWeek: null,
      visibleTo: ["owner", "admin", "ops_manager", "va", "coach"],
    },
    academy: { fullAccessCoachIds: [] },
  },
};

export const BRAND_KEY = (process.env.NEXT_PUBLIC_BRAND ?? "dp").toLowerCase();

export const BRAND: Brand = BRANDS[BRAND_KEY] ?? BRANDS.dp;

/** True only for the DP deploy. Gates DP-authored built-in content (the coach
 *  Academy, Dan's SOPs, quizzes, recipe library, DP social/sales fixtures) so
 *  a rebranded deploy (e.g. TJD) starts as a clean slate the owner fills, while
 *  DP keeps everything. Reversible: no data is deleted, only brand-gated. */
export const IS_DP = BRAND_KEY === "dp";
