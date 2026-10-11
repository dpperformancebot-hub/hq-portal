import { describe, expect, it } from "vitest";
import {
  canAccessCoachData,
  canApproveAccessRequests,
  canAssignClients,
  canEditStartDate,
  canViewCoachOverview,
  grantableRoles,
  scopeClientsForIdentity,
  canEditClientRate,
  canGrantRoles,
  canImpersonate,
  canLogCheckIn,
  canManageBrandContent,
  canViewAmbassadors,
  canViewCoachPay,
  canViewFinancials,
  canViewSalesPerformance,
  type AccessIdentity,
} from "./access-policy";
import type { Role } from "./navigation";

// R11 adversarial access matrix. Every role x every power, asserted. A change
// that widens any cell fails here.

const id = (role: Role, over: Partial<AccessIdentity> = {}): AccessIdentity => ({
  role,
  realRole: role,
  isHeadCoach: false,
  linkedCoachId: null,
  ...over,
});

const ALL: Role[] = ["owner", "coach", "sales", "va", "admin", "ops_manager", "ambassador_mgr"];

// Expected ALLOW sets per power (everyone else must be denied).
const MATRIX: { power: string; fn: (i: AccessIdentity) => boolean; allow: Role[] }[] = [
  { power: "grant roles / manage logins", fn: canGrantRoles, allow: ["owner"] },
  { power: "impersonate", fn: canImpersonate, allow: ["owner"] },
  { power: "edit client rate", fn: canEditClientRate, allow: ["owner"] },
  { power: "view financials", fn: canViewFinancials, allow: ["owner", "admin"] },
  { power: "view sales performance", fn: canViewSalesPerformance, allow: ["owner", "admin", "sales"] },
  { power: "manage brand/content", fn: canManageBrandContent, allow: ["owner", "admin", "ops_manager"] },
  // R16-4. A plain coach is denied here; the head-coach case is covered below.
  { power: "assign clients to a coach", fn: canAssignClients, allow: ["owner", "admin", "ops_manager"] },
  { power: "open a coach overview", fn: canViewCoachOverview, allow: ["owner", "admin", "ops_manager"] },
  // R17-1c. Narrower than assigning: the head coach is deliberately excluded.
  { power: "edit a client start date", fn: canEditStartDate, allow: ["owner", "admin", "ops_manager"] },
];

describe("R11 role x power matrix", () => {
  for (const { power, fn, allow } of MATRIX) {
    for (const role of ALL) {
      const expected = allow.includes(role);
      it(`${role} ${expected ? "CAN" : "cannot"} ${power}`, () => {
        expect(fn(id(role))).toBe(expected);
      });
    }
  }
});

describe("owner-only powers key off the REAL role (impersonation-safe)", () => {
  it("an owner impersonating a coach KEEPS owner powers", () => {
    const owner = id("coach", { realRole: "owner", linkedCoachId: "co-x" });
    expect(canGrantRoles(owner)).toBe(true);
    expect(canImpersonate(owner)).toBe(true);
    expect(canViewFinancials(owner)).toBe(true);
  });
  it("a forged coach cookie without a real owner role gets nothing", () => {
    const forged = id("coach", { realRole: "coach", linkedCoachId: "co-x" });
    expect(canGrantRoles(forged)).toBe(false);
    expect(canImpersonate(forged)).toBe(false);
    expect(canViewFinancials(forged)).toBe(false);
  });
  it("admin cannot grant roles or impersonate (standing rule)", () => {
    expect(canGrantRoles(id("admin"))).toBe(false);
    expect(canImpersonate(id("admin"))).toBe(false);
    expect(canEditClientRate(id("admin"))).toBe(false);
  });
});

describe("ops_manager is money-blind", () => {
  const om = id("ops_manager");
  it("cannot view financials", () => expect(canViewFinancials(om)).toBe(false));
  it("cannot view sales performance", () => expect(canViewSalesPerformance(om)).toBe(false));
  it("CAN manage brand/content", () => expect(canManageBrandContent(om)).toBe(true));
});

describe("coach data scoping", () => {
  const mine = "co-1";
  const other = "co-2";
  const plain = id("coach", { linkedCoachId: mine });
  const head = id("coach", { linkedCoachId: mine, isHeadCoach: true });

  it("plain coach reaches own roster", () => expect(canAccessCoachData(plain, mine)).toBe(true));
  it("plain coach CANNOT reach another coach's roster", () => expect(canAccessCoachData(plain, other)).toBe(false));
  it("plain coach with a null target is denied", () => expect(canAccessCoachData(plain, null)).toBe(false));
  it("head coach reaches any roster", () => {
    expect(canAccessCoachData(head, mine)).toBe(true);
    expect(canAccessCoachData(head, other)).toBe(true);
  });
  it("owner/admin/va reach any roster", () => {
    for (const r of ["owner", "admin", "va"] as Role[]) {
      expect(canAccessCoachData(id(r), other)).toBe(true);
    }
  });
  it("sales / ops_manager / ambassador_mgr have NO coach-data surface", () => {
    for (const r of ["sales", "ops_manager", "ambassador_mgr"] as Role[]) {
      expect(canAccessCoachData(id(r), other)).toBe(false);
    }
  });
});

describe("coach pay: own only, head coach sees none", () => {
  const mine = "co-1";
  const other = "co-2";
  it("plain coach sees own pay only", () => {
    const plain = id("coach", { linkedCoachId: mine });
    expect(canViewCoachPay(plain, mine)).toBe(true);
    expect(canViewCoachPay(plain, other)).toBe(false);
  });
  it("HEAD coach sees NO pay, not even another coach's (fairness rule)", () => {
    const head = id("coach", { linkedCoachId: mine, isHeadCoach: true });
    expect(canViewCoachPay(head, other)).toBe(false);
    expect(canViewCoachPay(head, mine)).toBe(false);
  });
  it("va and ops_manager see no coach pay", () => {
    expect(canViewCoachPay(id("va"), mine)).toBe(false);
    expect(canViewCoachPay(id("ops_manager"), mine)).toBe(false);
  });
  it("owner + admin see all pay", () => {
    expect(canViewCoachPay(id("owner"), other)).toBe(true);
    expect(canViewCoachPay(id("admin"), other)).toBe(true);
  });
  it("an impersonating owner still sees pay (real role)", () => {
    expect(canViewCoachPay(id("coach", { realRole: "owner", linkedCoachId: mine }), other)).toBe(true);
  });
});

describe("check-in logging scope", () => {
  const mine = "co-1";
  const other = "co-2";
  it("plain coach logs own roster only", () => {
    const plain = id("coach", { linkedCoachId: mine });
    expect(canLogCheckIn(plain, mine)).toBe(true);
    expect(canLogCheckIn(plain, other)).toBe(false);
  });
  it("head coach / owner / va / admin log anyone", () => {
    expect(canLogCheckIn(id("coach", { linkedCoachId: mine, isHeadCoach: true }), other)).toBe(true);
    for (const r of ["owner", "va", "admin"] as Role[]) expect(canLogCheckIn(id(r), other)).toBe(true);
  });
  it("sales / ops_manager / ambassador_mgr cannot log check-ins", () => {
    for (const r of ["sales", "ops_manager", "ambassador_mgr"] as Role[]) {
      expect(canLogCheckIn(id(r), other)).toBe(false);
    }
  });
});

describe("R11 regression: ambassador_mgr keeps her one screen", () => {
  it("ambassador_mgr CAN view ambassadors", () => {
    expect(canViewAmbassadors(id("ambassador_mgr"))).toBe(true);
  });
  it("but still cannot manage brand content or see money", () => {
    expect(canManageBrandContent(id("ambassador_mgr"))).toBe(false);
    expect(canViewFinancials(id("ambassador_mgr"))).toBe(false);
  });
  it("coach cannot view ambassadors", () => {
    expect(canViewAmbassadors(id("coach", { linkedCoachId: "co-1" }))).toBe(false);
  });
});

// R13-2: access-request approval matrix.
describe("canApproveAccessRequests / grantableRoles", () => {
  it("owner, admin and the head coach approve; nobody else", () => {
    for (const r of ALL) {
      expect(canApproveAccessRequests(id(r))).toBe(r === "owner" || r === "admin");
    }
    expect(canApproveAccessRequests(id("coach", { isHeadCoach: true }))).toBe(true);
    // Effective-only elevation (impersonated coach) never approves.
    expect(canApproveAccessRequests(id("coach", { realRole: "va", isHeadCoach: true }))).toBe(false);
  });
  it("caps what each approver may grant", () => {
    expect(grantableRoles(id("owner"))).toContain("owner");
    expect(grantableRoles(id("admin"))).not.toContain("owner");
    expect(grantableRoles(id("admin"))).toContain("coach");
    expect(grantableRoles(id("coach", { isHeadCoach: true }))).toEqual(["coach"]);
    expect(grantableRoles(id("coach"))).toEqual([]);
    expect(grantableRoles(id("va"))).toEqual([]);
  });
});

// SEC-AUDIT P0 (2026-09-06): cross-coach client isolation, the pure rule
// every client-returning server action must use.
describe("scopeClientsForIdentity", () => {
  const clients = [
    { id: "a", coachId: "co1" },
    { id: "b", coachId: "co2" },
    { id: "u", coachId: null },
  ];
  it("a plain coach only ever gets their own roster", () => {
    expect(scopeClientsForIdentity(id("coach", { linkedCoachId: "co1" }), clients).map((c) => c.id)).toEqual(["a"]);
    expect(scopeClientsForIdentity(id("coach", { linkedCoachId: "co2" }), clients).map((c) => c.id)).toEqual(["b"]);
  });
  it("an unlinked coach, sales and ambassador_mgr get nothing", () => {
    expect(scopeClientsForIdentity(id("coach"), clients)).toEqual([]);
    expect(scopeClientsForIdentity(id("sales"), clients)).toEqual([]);
    expect(scopeClientsForIdentity(id("ambassador_mgr"), clients)).toEqual([]);
  });
  it("all-client roles and the head coach get everyone, unassigned included", () => {
    for (const r of ["owner", "admin", "ops_manager", "va"] as const) {
      expect(scopeClientsForIdentity(id(r), clients)).toHaveLength(3);
    }
    expect(scopeClientsForIdentity(id("coach", { isHeadCoach: true, linkedCoachId: "co1" }), clients)).toHaveLength(3);
  });
  it("a forged linkedCoachId on a non-coach role grants nothing", () => {
    expect(scopeClientsForIdentity(id("sales", { linkedCoachId: "co1" }), clients)).toEqual([]);
  });
});

describe("R16-4: assigning clients and opening a coach overview", () => {
  it("lets Jameela (admin) and Mykael (ops_manager) do both", () => {
    for (const role of ["admin", "ops_manager"] as Role[]) {
      expect(canAssignClients(id(role))).toBe(true);
      expect(canViewCoachOverview(id(role))).toBe(true);
    }
  });

  it("lets the head coach assign, impersonating or not", () => {
    expect(canAssignClients(id("coach", { isHeadCoach: true, linkedCoachId: "co-angus" }))).toBe(true);
  });

  it("lets the head coach open an overview only on their OWN login", () => {
    const headCoach = id("coach", { isHeadCoach: true, realIsHeadCoach: true, linkedCoachId: "co-angus" });
    expect(canViewCoachOverview(headCoach)).toBe(true);
    // An owner viewing as the head coach is still the owner, so they keep it
    // via realRole; a head coach cannot ride someone else's session into it.
    expect(canViewCoachOverview({ ...headCoach, impersonating: true })).toBe(false);
    expect(canViewCoachOverview({ ...headCoach, realIsHeadCoach: false })).toBe(false);
  });

  it("denies a plain coach both, even with a linked roster", () => {
    const coach = id("coach", { linkedCoachId: "co-darcy" });
    expect(canAssignClients(coach)).toBe(false);
    expect(canViewCoachOverview(coach)).toBe(false);
  });

  it("denies sales, va and the ambassador manager both", () => {
    for (const role of ["sales", "va", "ambassador_mgr"] as Role[]) {
      expect(canAssignClients(id(role))).toBe(false);
      expect(canViewCoachOverview(id(role))).toBe(false);
    }
  });

  it("keeps both for an owner impersonating a coach (REAL role wins)", () => {
    const owner = id("coach", { realRole: "owner", linkedCoachId: "co-x", impersonating: true });
    expect(canAssignClients(owner)).toBe(true);
    expect(canViewCoachOverview(owner)).toBe(true);
  });

  it("gives a forged coach cookie nothing", () => {
    const forged = id("coach", { realRole: "coach", linkedCoachId: "co-x" });
    expect(canAssignClients(forged)).toBe(false);
    expect(canViewCoachOverview(forged)).toBe(false);
  });
});

describe("R17-1c: editing a client start date", () => {
  it("is open to the owner, Jameela (admin) and Mykael (ops_manager)", () => {
    for (const role of ["owner", "admin", "ops_manager"] as Role[]) {
      expect(canEditStartDate(id(role))).toBe(true);
    }
  });

  it("is NOT open to the head coach, unlike assigning clients", () => {
    const headCoach = id("coach", { isHeadCoach: true, realIsHeadCoach: true, linkedCoachId: "co-angus" });
    expect(canAssignClients(headCoach)).toBe(true);
    expect(canEditStartDate(headCoach)).toBe(false);
  });

  it("is not open to a plain coach, sales, va or the ambassador manager", () => {
    expect(canEditStartDate(id("coach", { linkedCoachId: "co-darcy" }))).toBe(false);
    for (const role of ["sales", "va", "ambassador_mgr"] as Role[]) {
      expect(canEditStartDate(id(role))).toBe(false);
    }
  });

  it("survives impersonation for the owner, and a forged cookie gains nothing", () => {
    expect(canEditStartDate(id("coach", { realRole: "owner", linkedCoachId: "co-x", impersonating: true }))).toBe(true);
    expect(canEditStartDate(id("coach", { realRole: "coach", linkedCoachId: "co-x" }))).toBe(false);
  });
});
