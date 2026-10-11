import { beforeEach, describe, expect, it, vi } from "vitest";

// R19-2c: removing a coach. The rules that matter here are the ones that stop
// a half-removed coach existing, and the ones that stop a removal happening
// while people still depend on it.

const h = vi.hoisted(() => ({
  persistence: true,
  realRole: "owner" as string,
  role: "owner" as string,
  linkedCoachId: null as string | null,
  coach: { id: "c1", name: "Nina Hart", role: "coach", is_active: true, max_capacity: 70 } as Record<string, unknown> | null,
  coaches: [] as Record<string, unknown>[],
  clients: [] as Record<string, unknown>[],
  inviteEmail: "nina@example.com" as string | null,
  clerk: { status: "revoked", invitationRevoked: true } as Record<string, unknown>,
  restore: { status: "restored" } as Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/role-server", () => ({
  getServerIdentity: () =>
    Promise.resolve({ role: h.role, realRole: h.realRole, linkedCoachId: h.linkedCoachId, impersonating: false, isHeadCoach: false }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/clerk-invites", () => ({
  revokeClerkAccess: () => Promise.resolve(h.clerk),
  restoreClerkAccess: () => Promise.resolve(h.restore),
}));
vi.mock("@/lib/db/client", () => ({
  persistenceEnabled: () => h.persistence,
  dbAdmin: () => {
    let table = "";
    const b: Record<string, unknown> = {
      from: (t: string) => ((table = t), b),
      select: () => b,
      order: () => b,
      range: () => b,
      eq: () => b,
      neq: () => b,
      gte: () => b,
      in: () => b,
      maybeSingle: () =>
        Promise.resolve({
          data: table === "coaches" ? h.coach : table === "invites" ? (h.inviteEmail ? { email: h.inviteEmail } : null) : null,
          error: null,
        }),
      update: (v: Record<string, unknown>) => (h.updates.push({ table, ...v }), b),
      insert: (v: Record<string, unknown>) => (h.events.push({ table, ...v }), b),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({
          data: table === "clients" ? h.clients : table === "coaches" ? h.coaches : [],
          error: null,
          count: 0,
        }).then(res, rej),
    };
    return b;
  },
}));

import { coachRemovalPrecheckAction, deactivateCoachAction, reactivateCoachAction } from "@/lib/coach-remove-actions";

const withClients = (active: number, paused = 0) => [
  ...Array.from({ length: active }, (_, i) => ({ id: `a${i}`, name: `Active ${i}`, status: "active", coach_id: "c1" })),
  ...Array.from({ length: paused }, (_, i) => ({ id: `p${i}`, name: `Paused ${i}`, status: "paused", coach_id: "c1" })),
];

beforeEach(() => {
  h.persistence = true;
  h.realRole = "owner"; h.role = "owner"; h.linkedCoachId = null;
  h.coach = { id: "c1", name: "Nina Hart", role: "coach", is_active: true, max_capacity: 70 };
  h.coaches = [
    { id: "c1", name: "Nina Hart", role: "coach", is_active: true, max_capacity: 70 },
    { id: "c2", name: "Sam Reed", role: "coach", is_active: true, max_capacity: 70 },
    { id: "c3", name: "Head Person", role: "head_coach", is_active: true, max_capacity: 70 },
  ];
  h.clients = [];
  h.inviteEmail = "nina@example.com";
  h.clerk = { status: "revoked", invitationRevoked: true };
  h.restore = { status: "restored" };
  h.updates = []; h.events = [];
});

describe("removal is blocked while people still depend on the coach", () => {
  it("refuses while active clients remain, and says how many", async () => {
    h.clients = withClients(3);
    const r = await deactivateCoachAction("c1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/3 active clients/);
    expect(h.updates.filter((u) => u.table === "coaches")).toHaveLength(0);
  });

  it("refuses while PAUSED clients remain: a paused client is still someone's", async () => {
    h.clients = withClients(0, 2);
    const r = await deactivateCoachAction("c1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/2 paused clients/);
  });

  it("goes through once the roster is empty", async () => {
    h.clients = [];
    const r = await deactivateCoachAction("c1");
    expect(r.ok).toBe(true);
    expect(h.updates).toContainEqual({ table: "coaches", is_active: false });
  });

  it("does not count cancelled clients as a blocker", async () => {
    h.clients = [{ id: "x", name: "Gone", status: "cancelled", coach_id: "c1" }];
    const r = await deactivateCoachAction("c1");
    expect(r.ok).toBe(true);
  });
});

describe("the two people rules", () => {
  it("nobody can remove themselves", async () => {
    h.linkedCoachId = "c1";
    const r = await deactivateCoachAction("c1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/your own coach record/i);
  });

  it("refuses the LAST head coach until someone else is promoted", async () => {
    h.coach = { id: "c3", name: "Head Person", role: "head_coach", is_active: true, max_capacity: 70 };
    h.coaches = [{ id: "c3", name: "Head Person", role: "head_coach", is_active: true, max_capacity: 70 }];
    const r = await deactivateCoachAction("c3");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/only head coach/i);
  });

  it("allows a head coach out once a second one exists", async () => {
    h.coach = { id: "c3", name: "Head Person", role: "head_coach", is_active: true, max_capacity: 70 };
    h.coaches = [
      { id: "c3", name: "Head Person", role: "head_coach", is_active: true, max_capacity: 70 },
      { id: "c4", name: "Other Head", role: "head_coach", is_active: true, max_capacity: 70 },
    ];
    const r = await deactivateCoachAction("c3");
    expect(r.ok).toBe(true);
  });

  it("refuses ops_manager and the head coach, per the approved matrix", async () => {
    for (const role of ["ops_manager", "coach", "va", "sales"]) {
      h.realRole = role; h.role = role;
      const r = await deactivateCoachAction("c1");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/only the owner or an admin/i);
    }
    expect(h.updates).toHaveLength(0);
  });
});

describe("a Clerk failure leaves the coach fully ACTIVE", () => {
  it("aborts rather than marking a coach removed who can still sign in", async () => {
    h.clerk = { status: "failed", error: "clerk unreachable" };
    const r = await deactivateCoachAction("c1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/still fully active/i);
      expect(r.error).toMatch(/clerk unreachable/);
    }
    // The half-removed state this ordering exists to prevent.
    expect(h.updates.filter((u) => u.table === "coaches")).toHaveLength(0);
  });

  it("still removes a coach who never had a login at all", async () => {
    h.inviteEmail = null;
    const r = await deactivateCoachAction("c1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.clerk.status).toBe("nothing_to_do");
  });
});

describe("audit and reactivation", () => {
  it("writes an audit row with the before and after", async () => {
    await deactivateCoachAction("c1");
    const ev = h.events.find((e) => e.action === "coach_deactivated");
    expect(ev).toBeDefined();
    expect((ev as { payload: Record<string, unknown> }).payload).toMatchObject({
      coach_id: "c1", name: "Nina Hart", from: { is_active: true }, to: { is_active: false }, by: "owner",
    });
  });

  it("reactivate restores the login and flips the flag back", async () => {
    h.coach = { id: "c1", name: "Nina Hart", role: "coach", is_active: false, max_capacity: 70 };
    const r = await reactivateCoachAction("c1");
    expect(r.ok).toBe(true);
    expect(h.updates).toContainEqual({ table: "coaches", is_active: true });
    expect(h.events.some((e) => e.action === "coach_reactivated")).toBe(true);
  });

  it("refuses to remove someone already removed", async () => {
    h.coach = { id: "c1", name: "Nina Hart", role: "coach", is_active: false, max_capacity: 70 };
    const r = await deactivateCoachAction("c1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already removed/i);
  });
});

describe("the pre-check screen", () => {
  it("reports the counts and marks full coaches so they cannot be moved to", async () => {
    h.clients = [
      ...withClients(2, 1),
      ...Array.from({ length: 70 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, status: "active", coach_id: "c2" })),
    ];
    const r = await coachRemovalPrecheckAction("c1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.activeClients).toBe(2);
    expect(r.data.pausedClients).toBe(1);
    expect(r.data.clients).toHaveLength(3);
    expect(r.data.blockers.length).toBeGreaterThan(0);
    const sam = r.data.targets.find((t) => t.id === "c2");
    expect(sam?.full).toBe(true); // 70 of 70
  });
});
