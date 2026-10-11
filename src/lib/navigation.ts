import { BRAND } from "@/lib/brand";
import { payVisibleToViewer } from "@/lib/access-policy";
// Role-based navigation + route architecture.
// Role is a property on the user. This config maps role -> { navGroups,
// defaultRoute }. Owner gets the full nav; the others are reduced scaffolds
// (their screens are built in M6). Slugs map 1:1 to routes under the (hq)
// shell, e.g. slug "client-database" -> /client-database.
//
// Login roles are: owner, coach, sales, va (4). Ambassador is NOT a login
// role; ambassadors do not log in and have no portal. The Ambassadors screen
// (BRAND group) is an owner-facing, view-only data area.

export type Role = "owner" | "coach" | "va" | "sales" | "admin" | "ops_manager" | "ambassador_mgr";

export const ROLES: Role[] = ["owner", "coach", "va", "sales", "admin", "ops_manager", "ambassador_mgr"];

/** R6-4: roles with ops-level write access (everywhere the VA can write).
 *  admin = Jameela (full access); ops_manager = Mykael (everything except
 *  financials/MRR/sales). Owner is checked separately via realRole. */
export const OPS_ROLES: Role[] = ["va", "admin", "ops_manager"];
export const isOpsRole = (role: string | null | undefined): boolean =>
  OPS_ROLES.includes((role ?? "") as Role);

export type NavItem = { label: string; slug: string; icon: string };
export type NavGroup = { label: string; items: NavItem[] };

const OWNER_NAV: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { label: "Dashboard", slug: "dashboard", icon: "dashboard" },
      { label: "Inbox", slug: "inbox", icon: "message" },
      { label: "Tasks", slug: "tasks", icon: "clipboard" },
      { label: "Sales Dashboard", slug: "sales-dashboard", icon: "trending_up" },
      { label: "VA Dashboard", slug: "va-dashboard", icon: "clipboard" },
      { label: "Client Database", slug: "client-database", icon: "clients" },
      { label: "Client Journey Tracker", slug: "client-journey", icon: "target" },
      // R16-5c (Dan: "a tab for that"): lands on the Journey Tracker with the
      // Unassigned filter preselected. Real route: /assign-clients redirects.
      { label: "Assign clients", slug: "assign-clients", icon: "clients" },
      { label: "Renewals", slug: "renewals", icon: "calendar" },
      { label: "Pauses", slug: "pauses", icon: "calendar" },
      { label: "Engagement", slug: "engagement", icon: "target" },
      { label: "Coach Overview", slug: "coach-overview", icon: "user" },
      // R7-1: manager side of Weekly Capacity (Results + Capacity log).
      { label: "Weekly Capacity", slug: "capacity", icon: "calendar" },
      // R2-2 (2026-08-07): Onboarding is the head coach's tracker; it lives in
      // the head-coach Oversight group only. The owner keeps ROUTE access
      // (RouteGuard exempts owner) but no nav item, per Dan.
      { label: "Client Audits", slug: "client-audits", icon: "audits" },
      { label: "Coach Performance", slug: "coach-performance", icon: "scale" },
      { label: "Results Tracker", slug: "results-tracker", icon: "image" },
      { label: "Pipeline (CRM)", slug: "pipeline", icon: "filter" },
      { label: "Financials", slug: "financials", icon: "dollar" },
      // R19-5: TJD only. DP pays from check-in codes and has no weeks to tick,
      // so the screen is filtered out below rather than rendering an empty grid.
      { label: "Payroll", slug: "payroll", icon: "dollar" },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Daily Digest", slug: "daily-digest", icon: "bell" },
      { label: "Analytics", slug: "analytics", icon: "bar_chart" },
      { label: "Reports", slug: "reports", icon: "file" },
      { label: "Sales Performance", slug: "sales-performance", icon: "trending_up" },
    ],
  },
  {
    label: "Brand",
    items: [
      { label: "Brand", slug: "brand", icon: "star" },
      { label: "Building the Brand", slug: "building-the-brand", icon: "brush" },
      { label: "Building the Team", slug: "building-the-team", icon: "briefcase" },
      { label: "Calendar", slug: "calendar", icon: "calendar" },
      { label: "Call Calendar", slug: "call-calendar", icon: "video" },
      { label: "Content Planner", slug: "content-planner", icon: "layers" },
      { label: "Content & Collaborations", slug: "content-collaborations", icon: "copy" },
      { label: "Marketing & Campaigns", slug: "marketing-campaigns", icon: "megaphone" },
      { label: "Social Media", slug: "social-media", icon: "share2" },
      { label: "Ambassadors", slug: "ambassadors", icon: "award" },
      { label: "Referrals", slug: "referrals", icon: "gift" },
    ],
  },
  {
    label: "Automations",
    items: [{ label: "Automations", slug: "automations", icon: "cpu" }],
  },
  {
    label: "Documents",
    items: [
      { label: "Brand Assets", slug: "brand-assets", icon: "folder" },
      { label: "SOPs", slug: "sops", icon: "book" },
      { label: "Contracts", slug: "contracts", icon: "note" },
      { label: "Brief", slug: "brief", icon: "file" },
      { label: "Merch", slug: "merch", icon: "gift" },
    ],
  },
  {
    label: "Team & Settings",
    items: [
      { label: "Team", slug: "team", icon: "clients" },
      // R13-2: approve sign-ins that matched no invite (owner, admin, head coach).
      { label: "Access requests", slug: "access-requests", icon: "user" },
      { label: "Settings", slug: "settings", icon: "settings" },
    ],
  },
];

const COACH_NAV: NavGroup[] = [
  {
    label: "Coach",
    items: [
      { label: "Dashboard", slug: "dashboard", icon: "dashboard" },
      { label: "My Clients", slug: "my-clients", icon: "clients" },
      { label: "Check-ins", slug: "check-ins", icon: "checkins" },
      // R3-1: standalone capacity tab (Friday routine), replaces the popup.
      { label: "My Capacity", slug: "capacity", icon: "calendar" },
      // R13-7 (Dan, 2026-09-05): Pauses + Engagement are admin tools, so they
      // are OUT of the plain coach nav (RouteGuard denies the URLs too). The
      // head coach keeps them via the Oversight group below.
      { label: "Results", slug: "results", icon: "image" },
      { label: "Client Audits", slug: "client-audits", icon: "audits" },
      { label: "Tasks", slug: "tasks", icon: "clipboard" },
      { label: "Recipe Index", slug: "recipes", icon: "chef" },
      { label: "SOPs", slug: "sops", icon: "book" },
      { label: "Calendar", slug: "calendar", icon: "calendar" },
    ],
  },
  {
    // Coach toolset (BUILD-SPEC M6): coach-facing only, never the owner nav.
    // Screens are "Coming next" placeholders until built.
    label: "Toolset",
    items: [
      { label: "My Pay", slug: "my-pay", icon: "dollar" },
      { label: "Quizzes", slug: "quizzes", icon: "clipboard" },
      { label: "Academy", slug: "academy", icon: "book" },
      { label: "Calculators", slug: "calculators", icon: "scale" },
      { label: "Coach Assistant", slug: "coach-assistant", icon: "cpu" },
      { label: "Loom Summaries", slug: "loom-summary", icon: "video" },
      // R3-3: feedback into the portal (replaces the Slack/Typeform flow).
      { label: "Feedback", slug: "feedback", icon: "megaphone" },
    ],
  },
];

const VA_NAV: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { label: "Dashboard", slug: "dashboard", icon: "dashboard" },
      { label: "Client Database", slug: "client-database", icon: "clients" },
      { label: "Pipeline", slug: "pipeline", icon: "filter" },
      { label: "Client Audits", slug: "client-audits", icon: "audits" },
      // G1/D5: the VA works the re-sign call list (renewal notes are VA-editable).
      { label: "Renewals", slug: "renewals", icon: "calendar" },
      { label: "Pauses", slug: "pauses", icon: "calendar" },
      { label: "Engagement", slug: "engagement", icon: "target" },
      { label: "Calendar", slug: "calendar", icon: "calendar" },
      { label: "Tasks", slug: "tasks", icon: "clipboard" },
    ],
  },
];

const SALES_NAV: NavGroup[] = [
  {
    label: "Sales",
    items: [
      { label: "Dashboard", slug: "dashboard", icon: "dashboard" },
      { label: "Lead Pipeline", slug: "pipeline", icon: "filter" },
      { label: "Call Calendar", slug: "call-calendar", icon: "video" },
      { label: "Sales Performance", slug: "sales-performance", icon: "trending_up" },
    ],
  },
];

// Head-coach elevation (coaches.role = 'head_coach', e.g. Angus): the coach
// nav PLUS coaching oversight across all coaches. Client Audits is already in
// the coach nav (it widens to all-coach data server-side). Onboarding lives
// HERE, not in the coach nav (owner rule 2026-07-24: owner + head coach only;
// the route is also blocked server-side in its page). Deliberately NO pay or
// financial screens: head coach never sees money.
const HEAD_COACH_OVERSIGHT: NavGroup = {
  label: "Oversight",
  items: [
    { label: "Onboarding", slug: "onboarding", icon: "clipboard" },
    { label: "Coach Performance", slug: "coach-performance", icon: "scale" },
    { label: "Client Database", slug: "client-database", icon: "clients" },
    { label: "Coach Overview", slug: "coach-overview", icon: "user" },
    { label: "Pauses", slug: "pauses", icon: "calendar" },
    { label: "Engagement", slug: "engagement", icon: "target" },
    { label: "Access requests", slug: "access-requests", icon: "user" },
  ],
};

const HEAD_COACH_NAV: NavGroup[] = [...COACH_NAV, HEAD_COACH_OVERSIGHT];

// R6-4: Mykael (ops_manager) sees everything EXCEPT financials/MRR/sales.
// Money values elsewhere render digit-masked (forced Sensitive). Taskboard is
// his landing page.
const OPS_MANAGER_EXCLUDED = new Set(["financials", "sales-dashboard", "sales-performance", "access-requests"]);
const OPS_MANAGER_NAV: NavGroup[] = OWNER_NAV.map((g) => ({
  ...g,
  items: g.items.filter((i) => !OPS_MANAGER_EXCLUDED.has(i.slug)),
})).filter((g) => g.items.length > 0);

// R6-4: Ruby (ambassador manager) gets the Ambassadors area only. Her four
// tabs land inside it once her sheet arrives (spec-only until then).
const AMBASSADOR_MGR_NAV: NavGroup[] = [
  { label: "Ambassadors", items: [{ label: "Ambassadors", slug: "ambassadors", icon: "award" }] },
];

export const ROLE_CONFIG: Record<Role, { navGroups: NavGroup[]; defaultRoute: string }> = {
  owner: { navGroups: OWNER_NAV, defaultRoute: "/dashboard" },
  // R6-4: Jameela = full access (owner nav; owner-only WRITES still gate on
  // realRole === "owner", so brand-owner actions stay Dan's).
  admin: { navGroups: OWNER_NAV, defaultRoute: "/dashboard" },
  ops_manager: { navGroups: OPS_MANAGER_NAV, defaultRoute: "/tasks" },
  ambassador_mgr: { navGroups: AMBASSADOR_MGR_NAV, defaultRoute: "/ambassadors" },
  coach: { navGroups: COACH_NAV, defaultRoute: "/dashboard" },
  va: { navGroups: VA_NAV, defaultRoute: "/dashboard" },
  sales: { navGroups: SALES_NAV, defaultRoute: "/dashboard" },
};

/** The role + head-coach slice of ServerIdentity that navigation needs.
 *  Kept structural (not imported from role-server) so this module stays
 *  client-safe. */
export type NavIdentity = {
  role: Role;
  isHeadCoach?: boolean;
  /** The REAL signed-in role, before impersonation. Defaults to `role`.
   *  Pay items need both: on a brand where coaches do not see pay (TJD) an
   *  owner viewing as a coach (role "coach", realRole "owner") gets exactly
   *  the coach nav, no My Pay; a forged coach realRole never grants it. */
  realRole?: Role;
};

/** Coach-nav screens that show the coach's pay. Hidden for anyone the brand's
 *  pay rule (Brand.pay.coachCanSeePay, see payVisibleToViewer) keeps away
 *  from pay. /my-pay is also redirected server-side in its page. */
const COACH_PAY_SLUGS = new Set(["my-pay"]);

function forPayViewer(groups: NavGroup[], identity: NavIdentity): NavGroup[] {
  if (payVisibleToViewer({ realRole: identity.realRole ?? identity.role, role: identity.role })) return groups;
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !COACH_PAY_SLUGS.has(i.slug)) }))
    .filter((g) => g.items.length > 0);
}

/** R19-5: Payroll is the weeks-paid ticking screen and exists on TJD only.
 *  On DP it would render a grid with no weeks to tick, so it is removed from
 *  the nav rather than left to disappoint. Imported lazily-ish at module level
 *  is fine: BRAND is a constant resolved at build time. */
const BRAND_ONLY_SLUGS: Record<string, "weeks-paid" | "checkin-codes"> = { payroll: "weeks-paid" };

function forBrand(groups: NavGroup[]): NavGroup[] {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !BRAND_ONLY_SLUGS[i.slug] || BRAND_ONLY_SLUGS[i.slug] === BRAND.pay.model) }))
    .filter((g) => g.items.length > 0);
}

/** A role's nav as that role signed in directly (no impersonation). */
export function getNavGroups(role: Role): NavGroup[] {
  return forPayViewer(forBrand(ROLE_CONFIG[role].navGroups), { role });
}

/** Identity-aware nav: a head coach gets the coach nav plus the Oversight
 *  group; every other identity gets exactly their role's nav. Pay items are
 *  filtered on the real AND effective role (TJD: an owner viewing as a coach
 *  loses My Pay, exactly like the coach; DP: unchanged). */
export function getNavGroupsFor(identity: NavIdentity): NavGroup[] {
  const groups =
    identity.role === "coach" && identity.isHeadCoach ? HEAD_COACH_NAV : ROLE_CONFIG[identity.role].navGroups;
  return forPayViewer(forBrand(groups), identity);
}

export function getDefaultRoute(role: Role): string {
  return ROLE_CONFIG[role].defaultRoute;
}

/** Slugs visible to a role (without leading slash). */
export function visibleSlugs(role: Role): Set<string> {
  return slugsOf(getNavGroups(role));
}

/** Identity-aware slug scope (head coach includes the Oversight screens). */
export function visibleSlugsFor(identity: NavIdentity): Set<string> {
  return slugsOf(getNavGroupsFor(identity));
}

function slugsOf(groups: NavGroup[]): Set<string> {
  const slugs = new Set<string>();
  for (const group of groups) {
    for (const item of group.items) slugs.add(item.slug);
  }
  return slugs;
}

// slug -> human label across every role (superset), for placeholder titles.
const TITLE_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const role of ROLES) {
    for (const group of ROLE_CONFIG[role].navGroups) {
      for (const item of group.items) map[item.slug] = item.label;
    }
  }
  return map;
})();

export function titleForSlug(slug: string): string {
  if (TITLE_MAP[slug]) return TITLE_MAP[slug];
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
