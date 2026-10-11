// Central access policy (R11 adversarial audit). Pure decision functions so
// the full role matrix is unit-testable and every server action / page reads
// the SAME rule instead of re-deriving it ad hoc. Nav hiding is cosmetic;
// THIS is the enforcement contract. Every function takes the minimal identity
// facts it needs and returns a boolean — no IO, no cookies, no db.

import { BRAND } from "@/lib/brand";
import type { Role } from "@/lib/navigation";

/** The identity facts any policy decision can depend on. Mirrors the load-
 *  bearing fields of ServerIdentity so callers pass the real thing. */
export type AccessIdentity = {
  /** Effective role (may be "coach" while an owner impersonates). */
  role: Role;
  /** The REAL signed-in role, before impersonation. Owner-only powers key
   *  off this so an impersonating owner keeps them and a forged coach cookie
   *  never grants them. */
  realRole: Role;
  /** Effective head-coach elevation. */
  isHeadCoach: boolean;
  /** coaches.id the login is bound to (own-roster scoping). */
  linkedCoachId: string | null;
  /** Head-coach elevation on the REAL login, before impersonation. Optional:
   *  only the decisions that must survive impersonation read it. */
  realIsHeadCoach?: boolean;
  /** True while an owner is viewing the portal as someone else. */
  impersonating?: boolean;
};

// --- Owner-only powers: gated on the REAL role, never the effective one. ----

/** Grant/revoke roles, manage logins, promote head coach. Owner ONLY — an
 *  admin explicitly cannot (standing rule since R6-4). */
export const canGrantRoles = (id: AccessIdentity): boolean => id.realRole === "owner";

/** R13-2 (owner decision 2026-09-05): approve a pending access request
 *  (which creates the users row). Owner, head of ops (admin) and the head
 *  coach. Keyed on the REAL role so an impersonating owner keeps it and a
 *  forged cookie never gains it. Narrower than canGrantRoles on purpose:
 *  what each approver may GRANT is capped by grantableRoles below. */
export const canApproveAccessRequests = (id: AccessIdentity): boolean =>
  id.realRole === "owner" || id.realRole === "admin" || (id.realRole === "coach" && id.isHeadCoach);

/** Roles an approver may hand out. Owner: everything. Admin: everything but
 *  owner. Head coach: coach only (their remit is the coaching team). Anyone
 *  else: nothing. */
export const grantableRoles = (id: AccessIdentity): Role[] => {
  if (id.realRole === "owner") return [...ALL_ROLES];
  if (id.realRole === "admin") return ALL_ROLES.filter((r) => r !== "owner");
  if (id.realRole === "coach" && id.isHeadCoach) return ["coach"];
  return [];
};

const ALL_ROLES: Role[] = ["owner", "admin", "ops_manager", "ambassador_mgr", "coach", "sales", "va"];

/** Enter another user's portal (impersonation). Owner ONLY. */
export const canImpersonate = (id: AccessIdentity): boolean => id.realRole === "owner";

/** R4-5 owner spot-review on a client audit ("Owner review": 1-3 rating +
 *  notes, the "Daniel Reviews" sheet). It is the owner/admin's QA verdict ON
 *  the coach, so it is never a coach control:
 *    - real owner or admin, acting as themselves: yes
 *    - coach and head coach (any brand): no, they are the ones reviewed
 *    - owner viewing as a coach: no on a brand where view-as is exactly the
 *      coach view (TJD, Brand.viewAsIsExactCoachView); DP keeps its existing
 *      behaviour (the real owner keeps owner controls while impersonating).
 *  Needs BOTH roles: realRole so a forged coach cookie never grants it, the
 *  effective role (and the impersonating flag) so view-as hides it. The flag
 *  is a parameter so the TJD matrix is testable without rebuilding as TJD.
 *  The UI hides the control AND setOwnerReview refuses with the same rule. */
export const canOwnerReviewAudits = (
  id: Pick<AccessIdentity, "realRole" | "role" | "impersonating">,
  viewAsIsExactCoachView: boolean = BRAND.viewAsIsExactCoachView,
): boolean => {
  if (id.realRole !== "owner" && id.realRole !== "admin") return false;
  const actingAsThemselves = id.role === id.realRole && !id.impersonating;
  if (actingAsThemselves) return true;
  // Viewing as someone else: only DP's real owner keeps the control.
  return !viewAsIsExactCoachView && id.realRole === "owner";
};

/** Edit a client's billing rate (owner-only inline editor). */
export const canEditClientRate = (id: AccessIdentity): boolean => id.realRole === "owner";

// --- Money / financial surfaces. --------------------------------------------

/** /financials, MRR, cash, coach payouts. Owner + admin (full access).
 *  ops_manager is deliberately EXCLUDED (money-blind); sales/va/coach never.
 *  TJD: the owner viewing as a coach is refused too (moneyHiddenFromViewer),
 *  exactly as the coach would be. DP unchanged. */
export const canViewFinancials = (id: AccessIdentity): boolean =>
  (id.realRole === "owner" || id.role === "owner" || id.role === "admin") && !moneyHiddenFromViewer(id);

/** Sales dashboards + performance. Owner + admin + sales. ops_manager excluded.
 *  TJD: refused while the owner views as a coach (moneyHiddenFromViewer). */
export const canViewSalesPerformance = (id: AccessIdentity): boolean =>
  (id.realRole === "owner" || id.role === "owner" || id.role === "admin" || id.role === "sales") &&
  !moneyHiddenFromViewer(id);

// --- Brand / content / ops management (owner-nav screens minus money). ------
// sops, brand-assets, contracts, brief, merch, content, collaborations,
// marketing, campaigns, lead-magnets, reports, automations, brand-build.
// In-nav for owner/admin/ops_manager; NOT for coach/sales/va/ambassador_mgr.
// TJD: refused while the owner views as a coach (moneyHiddenFromViewer). Many
// of these screens carry $ figures (contracts, merch, reports), and the coach
// view is exactly what the coach sees, who is refused them. DP unchanged.
export const canManageBrandContent = (id: AccessIdentity): boolean =>
  (id.realRole === "owner" || id.role === "owner" || id.role === "admin" || id.role === "ops_manager") &&
  !moneyHiddenFromViewer(id);

// --- Coach data scoping. ----------------------------------------------------

/** May this identity read/write a specific coach's roster data (clients,
 *  check-ins, pay)? Own roster for a plain coach; any for head coach / owner /
 *  admin / va (ops). sales/ambassador_mgr: no coach-data surface. */
/** R16-4b: who may hand a client to a coach. Owner (real role, so
 *  impersonation keeps working), Jameela (admin), Mykael (ops_manager, per
 *  R6-4 "everything except money") and the head coach (R6-4: the unassigned
 *  queue lives on Angus's taskboard). Never sales, va, ambassador_mgr, or a
 *  plain coach. Assignment moves no money, so ops_manager is in. */
export const canAssignClients = (id: AccessIdentity): boolean =>
  id.realRole === "owner" ||
  id.role === "admin" ||
  id.role === "ops_manager" ||
  (id.role === "coach" && !!id.isHeadCoach);

/** R16-4a: who may open the read-only per-coach overview (performance, no
 *  pay). Owner, admin, ops_manager, and the head coach when not impersonating.
 *  Pay is stripped on that page for everyone but the owner, so ops_manager
 *  stays money-blind. */
export const canViewCoachOverview = (id: AccessIdentity): boolean =>
  id.realRole === "owner" ||
  id.role === "admin" ||
  id.role === "ops_manager" ||
  (!!id.realIsHeadCoach && !id.impersonating);

/** R17-1c: who may set or clear a client's start date
 *  (clients.start_date_override). Owner on the REAL role so an impersonating
 *  owner keeps it, Jameela (admin) and Mykael (ops_manager), who are the
 *  people who actually chase the real date. Deliberately NOT the head coach
 *  and NOT coaches: a start date moves week number, journey stage, renewals
 *  and engagement milestones, and sits next to pay. */
export const canEditStartDate = (id: AccessIdentity): boolean =>
  id.realRole === "owner" || id.role === "admin" || id.role === "ops_manager";

export const canAccessCoachData = (id: AccessIdentity, targetCoachId: string | null): boolean => {
  if (id.realRole === "owner" || id.role === "owner" || id.role === "admin" || id.role === "va") return true;
  if (id.role === "coach") {
    if (id.isHeadCoach) return true; // head coach sees the whole team
    return targetCoachId != null && targetCoachId === id.linkedCoachId; // own roster only
  }
  return false; // sales, ops_manager, ambassador_mgr have no coach-data surface
};

/** Brand-level pay visibility for whoever is looking (Brand.pay.coachCanSeePay).
 *  On a brand where coaches see pay (DP) this is always true and every other
 *  pay rule decides as before. On a brand where they do not (TJD) only the
 *  REAL owner or admin passes, and only while NOT viewing the portal as a
 *  coach: "view as coach" on TJD shows exactly what that coach sees, so an
 *  owner whose effective role is "coach" gets no pay either. A coach or head
 *  coach never gets it. Needs BOTH roles: realRole so a forged coach cookie
 *  cannot grant it, the effective role so impersonation shows the coach's
 *  view. The flag is a parameter so the TJD matrix is testable without
 *  rebuilding the process as TJD. */
export const payVisibleToViewer = (
  id: Pick<AccessIdentity, "realRole" | "role">,
  coachCanSeePay: boolean = BRAND.pay.coachCanSeePay,
): boolean => coachCanSeePay || ((id.realRole === "owner" || id.realRole === "admin") && id.role !== "coach");

/** Money-blind COACH viewer (Brand.pay.coachCanSeePay = false, TJD): true when
 *  the REAL signed-in person is a coach (plain or head coach), OR the owner is
 *  viewing the portal as a coach (effective role "coach"), on a brand where
 *  coaches see no pay. Every client price, rate, revenue or other $ figure is
 *  stripped from what such a viewer's pages, server actions and API routes
 *  return, and the owner-only money screens (payroll, financials, rate card)
 *  refuse them. Narrower than !payVisibleToViewer on purpose: the VA, ops
 *  manager and sales keep whatever money access they had, this rule is about
 *  the coach view. The owner sees money only when NOT viewing as someone.
 *  Always false on DP (flag true), so DP is unchanged. */
export const moneyHiddenFromViewer = (
  id: Pick<AccessIdentity, "realRole" | "role">,
  coachCanSeePay: boolean = BRAND.pay.coachCanSeePay,
): boolean => !coachCanSeePay && (id.realRole === "coach" || id.role === "coach");

/** May this identity see ANY coach's PAY (rates/payout)? A coach only ever
 *  sees their own (and only on a brand where coaches see pay); a head coach
 *  sees team performance but NEVER pay; owner + admin see all. This is the
 *  rule behind the pay-rate stripping. */
export const canViewCoachPay = (
  id: AccessIdentity,
  targetCoachId: string | null,
  coachCanSeePay: boolean = BRAND.pay.coachCanSeePay,
): boolean => {
  // TJD: the owner viewing as a coach sees exactly the coach's (pay-free) view.
  if (moneyHiddenFromViewer(id, coachCanSeePay)) return false;
  if (id.realRole === "owner" || id.role === "owner" || id.role === "admin") return true;
  if (id.role === "coach" && !id.isHeadCoach)
    return payVisibleToViewer(id, coachCanSeePay) && targetCoachId != null && targetCoachId === id.linkedCoachId;
  return false; // head coach: performance yes, pay no. va/sales/ops_manager: no.
};

/** Log or correct a weekly check-in for a coach's client. Same scope as
 *  coach-data, plus the CHECKIN_EDITS_ADMIN_ONLY config lock handled at the
 *  call site (which further restricts plain coaches when flipped). */
export const canLogCheckIn = (id: AccessIdentity, targetCoachId: string | null): boolean => {
  if (id.realRole === "owner" || id.role === "owner" || id.role === "va" || id.role === "admin") return true;
  if (id.role === "coach") return id.isHeadCoach || (targetCoachId != null && targetCoachId === id.linkedCoachId);
  return false;
};

/** Human-readable denial the actions return, so a probing caller gets an
 *  honest 403-equivalent rather than a silent no-op or a leak. */
export const DENY = {
  brand: "You do not have access to manage brand or content here.",
  financials: "Financials are restricted to the owner and admin.",
  ownerOnly: "Only the owner can do this.",
  coachData: "That data is outside your roster.",
} as const;

// --- Page-level allowlists (R11). ------------------------------------------
// The audit found ~30 pages with NO server-side role guard, several rendering
// money or all-client PII (daily digest, client database, pipeline, inbox,
// sales dashboard). Nav hiding + the client RouteGuard do NOT stop the RSC
// payload being streamed. These allowlists are the server-side answer.

/** All-client PII surfaces: client database, pipeline, inbox, results
 *  tracker, analytics. Ops + owner + admin; sales gets pipeline/inbox (their
 *  job) but coaches must stay on their own roster screens. */
export const canViewAllClientData = (id: AccessIdentity): boolean =>
  id.realRole === "owner" ||
  id.role === "owner" ||
  id.role === "admin" ||
  id.role === "ops_manager" ||
  id.role === "va" ||
  (id.role === "coach" && id.isHeadCoach);

/** SEC-AUDIT 2026-09-06: scope a client list to what this identity may see.
 *  All-client roles get everything; a plain coach gets their own roster
 *  only; everyone else (sales, ambassador_mgr, unlinked coach) gets nothing.
 *  Pure, so the cross-coach isolation is unit-tested; every server action
 *  that returns client rows to a caller must go through this. */
export const scopeClientsForIdentity = <T extends { coachId: string | null }>(
  id: AccessIdentity,
  clients: T[],
): T[] => {
  if (canViewAllClientData(id)) return clients;
  if (id.role === "coach" && id.linkedCoachId) return clients.filter((c) => c.coachId === id.linkedCoachId);
  return [];
};

/** Lead/CRM surfaces (pipeline, inbox): the above plus sales. */
export const canViewLeadData = (id: AccessIdentity): boolean =>
  canViewAllClientData(id) || id.role === "sales";

/** The coach's own pay screen. Coaches (own data) + owner (incl. while
 *  impersonating). Explicitly NOT sales/va/ops_manager/ambassador_mgr, who
 *  have no pay identity and previously fell through to a coach fallback.
 *  On a brand where coaches do not see pay (TJD), coaches and head coaches
 *  are out too, and so is the owner while viewing as a coach (the coach view
 *  is exactly what the coach sees); the owner not viewing as anyone keeps it.
 *  DP (flag true): unchanged, the owner keeps it while impersonating. */
export const canViewOwnPayScreen = (
  id: AccessIdentity,
  coachCanSeePay: boolean = BRAND.pay.coachCanSeePay,
): boolean =>
  !moneyHiddenFromViewer(id, coachCanSeePay) &&
  ((id.role === "coach" && payVisibleToViewer(id, coachCanSeePay)) || id.realRole === "owner");

/** Check-ins screens: coach-data roles only. */
export const canViewCheckInScreens = (id: AccessIdentity): boolean =>
  id.role === "coach" || id.realRole === "owner" || id.role === "owner" || id.role === "admin" || id.role === "va";

/** The Ambassadors area. Brand managers PLUS ambassador_mgr, whose entire
 *  portal is this one screen (Ruby). Guarding it with canManageBrandContent
 *  would lock her out of everything. */
export const canViewAmbassadors = (id: AccessIdentity): boolean =>
  canManageBrandContent(id) || id.role === "ambassador_mgr";
