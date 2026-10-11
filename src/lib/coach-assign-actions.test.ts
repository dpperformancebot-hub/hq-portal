import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@/lib/seed/types";

const h = vi.hoisted(() => ({
  persistence: true,
  // Coach-assign awaits the chain at .eq()/.in(), so the result carries only
  // { error }. Default: a clean write.
  queryResult: { error: null } as { error: unknown },
  calls: [] as Array<[string, ...unknown[]]>,
  revalidated: [] as string[],
  clients: [] as Client[],
  // R19-1: what the pre-write read of clients.coach_id returns.
  beforeRows: [] as { id: string; coach_id: string | null }[],
  insertThrows: false,
  // assertOwner gates every write on the REAL role; owner by default so the
  // write-path tests exercise the datastore logic.
  realRole: "owner" as string,
}));

// The real getServerIdentity reads cookies(), which does not exist outside a
// request scope; the guard behaviour itself is what we control here.
vi.mock("@/lib/role-server", () => ({
  getServerIdentity: () =>
    Promise.resolve({
      role: h.realRole,
      realRole: h.realRole,
      linkedCoachId: null,
      impersonating: false,
      isHeadCoach: false,
      realIsHeadCoach: false,
    }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (p: string) => {
    h.revalidated.push(p);
  },
}));

// R19-1: an assignment is now three statements (read the previous coach_id,
// write the new one, insert the audit row), so the mock accumulates calls
// across dbAdmin() invocations instead of resetting on each one, and resolves
// per verb: a select yields { data }, an update yields { error }.
vi.mock("@/lib/db/client", () => ({
  persistenceEnabled: () => h.persistence,
  dbAdmin: () => {
    let verb = "";
    const builder: Record<string, unknown> = {
      from: (t: string) => (h.calls.push(["from", t]), builder),
      select: (v: unknown) => ((verb = "select"), h.calls.push(["select", v]), builder),
      update: (v: unknown) => ((verb = "update"), h.calls.push(["update", v]), builder),
      insert: (v: unknown) => {
        verb = "insert";
        h.calls.push(["insert", v]);
        if (h.insertThrows) throw new Error("audit insert failed");
        return builder;
      },
      eq: (c: string, v: unknown) => (h.calls.push(["eq", c, v]), builder),
      in: (c: string, v: unknown) => (h.calls.push(["in", c, v]), builder),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(
          verb === "select" ? { data: h.beforeRows, error: null } : h.queryResult,
        ).then(res, rej),
    };
    return builder;
  },
}));

vi.mock("@/lib/data", () => ({
  getClientsData: () => Promise.resolve(h.clients),
}));

import {
  assignClientsToCoachAction,
  assignCoachAction,
  listAssignableClientsAction,
} from "@/lib/coach-assign-actions";

const NO_DB_RE = /HQ_PERSISTENCE=true/;

beforeEach(() => {
  h.persistence = true;
  h.queryResult = { error: null };
  h.calls = [];
  h.revalidated.length = 0;
  h.clients = [];
  h.beforeRows = [{ id: "cl1", coach_id: null }];
  h.insertThrows = false;
  h.realRole = "owner";
});

describe("assignCoachAction", () => {
  it("requires a clientId", async () => {
    const r = await assignCoachAction("", "co1");
    expect(r).toEqual({ ok: false, error: "clientId required" });
    expect(h.calls).toHaveLength(0);
  });

  it("no-ops when persistence is off (HQ-owned write still needs the datastore)", async () => {
    h.persistence = false;
    const r = await assignCoachAction("cl1", "co1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(NO_DB_RE);
    expect(h.calls).toHaveLength(0);
  });

  it("rejects a plain coach session (write gate, audit 2026-07-02)", async () => {
    h.realRole = "coach";
    const r = await assignCoachAction("cl1", "co1");
    expect(r).toEqual({ ok: false, error: "You don't have access to assign clients." });
    expect(h.calls).toHaveLength(0);
  });

  // R16-4b: the gate now reads canAssignClients, so ops_manager gets through.
  it("lets an ops_manager session through to the write", async () => {
    h.realRole = "ops_manager";
    const r = await assignCoachAction("cl1", "co1");
    expect(r).toEqual({ ok: true, count: 1 });
    expect(h.calls).toContainEqual(["update", { coach_id: "co1" }]);
  });

  it("writes the coach link scoped to the one client and revalidates its detail route", async () => {
    const r = await assignCoachAction("cl1", "co1");
    expect(r).toEqual({ ok: true, count: 1 });
    expect(h.calls).toContainEqual(["from", "clients"]);
    expect(h.calls).toContainEqual(["update", { coach_id: "co1" }]);
    expect(h.calls).toContainEqual(["eq", "id", "cl1"]);
    expect(h.revalidated).toContain("/client-database/cl1");
  });

  it("clears the link when coachId is null", async () => {
    await assignCoachAction("cl1", null);
    expect(h.calls).toContainEqual(["update", { coach_id: null }]);
  });

  it("surfaces a datastore error", async () => {
    h.queryResult = { error: { message: "write failed" } };
    const r = await assignCoachAction("cl1", "co1");
    expect(r).toEqual({ ok: false, error: "write failed" });
    expect(h.revalidated).toHaveLength(0);
    // The failed write must not leave an audit row claiming it happened.
    expect(h.calls.filter((c) => c[0] === "insert")).toHaveLength(0);
  });

  // R19-1: recovering the 42 assignments the 1000-row cap nulled meant
  // reconstructing them from a notification and a task, because this action
  // wrote no audit trail. These tests pin the trail down.
  it("audits the change with the coach it had and the coach it got", async () => {
    h.beforeRows = [{ id: "cl1", coach_id: "old-coach" }];
    await assignCoachAction("cl1", "co1");
    const insert = h.calls.find((c) => c[0] === "insert");
    expect(insert).toBeDefined();
    expect((insert as [string, Record<string, unknown>[]])[1][0]).toMatchObject({
      action: "coach_assigned",
      payload: { client_id: "cl1", from: "old-coach", to: "co1", by: "owner" },
    });
  });

  it("records a clear as coach_unassigned, not coach_assigned", async () => {
    h.beforeRows = [{ id: "cl1", coach_id: "old-coach" }];
    await assignCoachAction("cl1", null);
    const insert = h.calls.find((c) => c[0] === "insert");
    expect((insert as [string, Record<string, unknown>[]])[1][0]).toMatchObject({
      action: "coach_unassigned",
      payload: { from: "old-coach", to: null },
    });
  });

  it("writes no audit row when the coach is unchanged (idempotent re-assign)", async () => {
    h.beforeRows = [{ id: "cl1", coach_id: "co1" }];
    const r = await assignCoachAction("cl1", "co1");
    expect(r).toEqual({ ok: true, count: 1 }); // still reports success
    expect(h.calls.filter((c) => c[0] === "insert")).toHaveLength(0);
  });

  it("still assigns when the audit insert throws", async () => {
    h.beforeRows = [{ id: "cl1", coach_id: null }];
    h.insertThrows = true;
    const r = await assignCoachAction("cl1", "co1");
    expect(r).toEqual({ ok: true, count: 1 });
    expect(h.revalidated).toContain("/client-database/cl1");
  });
});

describe("assignClientsToCoachAction", () => {
  it("requires a coachId", async () => {
    const r = await assignClientsToCoachAction(["cl1"], "");
    expect(r).toEqual({ ok: false, error: "coachId required" });
    expect(h.calls).toHaveLength(0);
  });

  it("rejects an empty selection (after dropping falsy ids)", async () => {
    const r = await assignClientsToCoachAction(["", ""], "co1");
    expect(r).toEqual({ ok: false, error: "Select at least one client" });
    expect(h.calls).toHaveLength(0);
  });

  it("no-ops when persistence is off", async () => {
    h.persistence = false;
    const r = await assignClientsToCoachAction(["cl1"], "co1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(NO_DB_RE);
    expect(h.calls).toHaveLength(0);
  });

  it("bulk-writes the filtered ids and reports their count", async () => {
    const r = await assignClientsToCoachAction(["cl1", "", "cl2"], "co1");
    expect(r).toEqual({ ok: true, count: 2 }); // falsy id dropped
    expect(h.calls).toContainEqual(["update", { coach_id: "co1" }]);
    expect(h.calls).toContainEqual(["in", "id", ["cl1", "cl2"]]);
  });

  it("surfaces a datastore error", async () => {
    h.queryResult = { error: { message: "bulk failed" } };
    const r = await assignClientsToCoachAction(["cl1"], "co1");
    expect(r).toEqual({ ok: false, error: "bulk failed" });
  });
});

describe("listAssignableClientsAction", () => {
  const mk = (id: string, name: string, status: Client["status"], coachId: string | null = null) =>
    ({ id, name, status, coachId }) as Client;

  const mk2 = (id: string, name: string, status: Client["status"], coachId: string | null, startDate: string, plan: Client["plan"] = "Weekly") =>
    ({ id, name, status, coachId, startDate, plan }) as Client;

  it("returns only active + paused clients, unassigned first then newest start (R16-4c)", async () => {
    h.clients = [
      mk2("3", "Zoe", "active", "co1", "2026-01-05"),
      mk2("1", "Alice", "paused", null, "2026-08-03", "Fortnightly"),
      mk2("4", "Cancelled Carl", "cancelled", null, "2026-09-01"),
      mk2("5", "Past Pat", "past", null, "2025-01-01"),
      mk2("2", "Bob", "active", null, "2026-09-14"),
    ];
    const out = await listAssignableClientsAction();
    expect(out.allowed).toBe(true);
    expect(out.clients.map((c) => c.name)).toEqual(["Bob", "Alice", "Zoe"]);
    // Projected to the lightweight picker shape, with start date + cadence.
    expect(out.clients[1]).toEqual({ id: "1", name: "Alice", coachId: null, status: "paused", startDate: "2026-08-03", plan: "Fortnightly" });
    expect(out.clients[2]).toEqual({ id: "3", name: "Zoe", coachId: "co1", status: "active", startDate: "2026-01-05", plan: "Weekly" });
  });

  it("returns an empty list (still allowed) when the roster has no assignable clients", async () => {
    h.clients = [mk("1", "Cancelled", "cancelled")];
    expect(await listAssignableClientsAction()).toEqual({ allowed: true, clients: [] });
  });

  // SEC-AUDIT P1-4: the read is gated like the writes. A coach (or sales/va)
  // calling the action directly must not receive the business roster; R16-4d:
  // the response says so, so the UI never renders "no clients" for them.
  it("returns allowed:false and nothing to a plain coach, sales or va session", async () => {
    h.clients = [mk("1", "Alice", "active", "co1"), mk("2", "Bob", "active", "co2")];
    for (const r of ["coach", "sales", "va"]) {
      h.realRole = r;
      expect(await listAssignableClientsAction()).toEqual({ allowed: false, clients: [] });
    }
    h.realRole = "owner";
    expect((await listAssignableClientsAction()).clients).toHaveLength(2);
  });
});
