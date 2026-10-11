import { describe, expect, it } from "vitest";
import { importScopeFor, mayTouch, visibleClients } from "@/lib/import/scope";
import type { AccessIdentity } from "@/lib/access-policy";

const id = (over: Partial<AccessIdentity>): AccessIdentity => ({
  role: "coach", realRole: "coach", isHeadCoach: false, linkedCoachId: null, ...over,
});

const CLIENTS = [
  { id: "a", coachId: "coach-1" },
  { id: "b", coachId: "coach-2" },
  { id: "c", coachId: null },
];

describe("who may import what", () => {
  it("gives owner, admin and ops_manager every client", () => {
    for (const who of [
      id({ role: "owner", realRole: "owner" }),
      id({ role: "admin", realRole: "admin" }),
      id({ role: "ops_manager", realRole: "ops_manager" }),
    ]) {
      expect(importScopeFor(who)).toEqual({ kind: "all" });
      expect(visibleClients(importScopeFor(who), CLIENTS)).toHaveLength(3);
    }
  });

  it("keeps an owner's power while they are viewing as someone else", () => {
    expect(importScopeFor(id({ role: "coach", realRole: "owner", linkedCoachId: "coach-1" }))).toEqual({ kind: "all" });
  });

  it("limits a coach to their own roster", () => {
    const scope = importScopeFor(id({ role: "coach", linkedCoachId: "coach-1" }));
    expect(scope).toEqual({ kind: "own", coachId: "coach-1" });
    expect(visibleClients(scope, CLIENTS).map((c) => c.id)).toEqual(["a"]);
  });

  it("limits the HEAD coach the same way: oversight is not bulk write", () => {
    const scope = importScopeFor(id({ role: "coach", isHeadCoach: true, linkedCoachId: "coach-1" }));
    expect(scope).toEqual({ kind: "own", coachId: "coach-1" });
    expect(mayTouch(scope, "coach-2")).toBe(false);
  });

  it("gives an unlinked coach nothing, with a reason", () => {
    const scope = importScopeFor(id({ role: "coach", linkedCoachId: null }));
    expect(scope.kind).toBe("none");
    expect(visibleClients(scope, CLIENTS)).toEqual([]);
  });

  it("gives sales, va and ambassador_mgr nothing", () => {
    for (const role of ["sales", "va", "ambassador_mgr"] as const) {
      expect(importScopeFor(id({ role, realRole: role })).kind).toBe("none");
    }
  });
});

describe("mayTouch is the write gate", () => {
  it("lets a coach touch only their own, never an unassigned client", () => {
    const scope = importScopeFor(id({ role: "coach", linkedCoachId: "coach-1" }));
    expect(mayTouch(scope, "coach-1")).toBe(true);
    expect(mayTouch(scope, "coach-2")).toBe(false);
    expect(mayTouch(scope, null)).toBe(false);
  });

  it("lets the all-scope touch anyone, including unassigned", () => {
    expect(mayTouch({ kind: "all" }, null)).toBe(true);
    expect(mayTouch({ kind: "all" }, "coach-2")).toBe(true);
  });

  it("never lets a none-scope touch anything", () => {
    expect(mayTouch({ kind: "none", reason: "x" }, "coach-1")).toBe(false);
  });
});
