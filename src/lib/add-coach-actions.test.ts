import { beforeEach, describe, expect, it, vi } from "vitest";

// R17-4. This action creates a coach record AND a login in one call, so the
// two things worth pinning are: who may call it, and that a near-miss spelling
// cannot quietly create a second coach (the failure that produced the
// duplicate Cody / Jake / Riley rows deleted in R14).

const h = vi.hoisted(() => ({
  persistence: true,
  realRole: "owner" as string,
  role: "owner" as string,
  invites: [] as { email: string; name: string }[],
  invite: { status: "sent", invitationId: "inv_1" } as Record<string, unknown>,
  coaches: [] as { id: string; name: string; is_active: boolean }[],
  inserted: [] as Record<string, unknown>[],
  updated: [] as Record<string, unknown>[],
  upserted: [] as Record<string, unknown>[],
  insertFails: false,
}));

vi.mock("@/lib/role-server", () => ({
  getServerIdentity: () =>
    Promise.resolve({
      role: h.role,
      realRole: h.realRole,
      linkedCoachId: null,
      impersonating: false,
      isHeadCoach: false,
      realIsHeadCoach: false,
    }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/db/client", () => ({
  persistenceEnabled: () => h.persistence,
  dbAdmin: () => {
    // Chainable stub, now TABLE AWARE. It used to resolve every select to the
    // coaches list whatever was asked for, so when the action gained a
    // duplicate-email read against invites it got coach rows back and refused
    // every creation. A mock that answers the wrong table is worse than no
    // mock: it fails the tests for a reason the production code does not have.
    let table = "";
    const rowsFor = () => (table === "invites" ? h.invites : h.coaches);
    const b: Record<string, unknown> = {
      from: (t: string) => ((table = t), b),
      select: () => b,
      order: () => b,
      eq: () => b,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () =>
        h.insertFails
          ? Promise.resolve({ data: null, error: { message: "insert blew up" } })
          : Promise.resolve({ data: { id: "new-coach-id" }, error: null }),
      update: (v: Record<string, unknown>) => (h.updated.push({ table, ...v }), b),
      upsert: (v: Record<string, unknown>) => (h.upserted.push({ table, ...v }), b),
      insert: (v: Record<string, unknown>) => (h.inserted.push({ table, ...v }), b),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rowsFor(), error: null }).then(res, rej),
    };
    return b;
  },
}));

// Clerk is a network call the creation must survive; h.invite is what it returns.
vi.mock("@/lib/clerk-invites", () => ({
  sendClerkInvitation: () => Promise.resolve(h.invite),
  resendClerkInvitation: () => Promise.resolve(h.invite),
}));

import { addCoachAction, nameSimilarity } from "./add-coach-actions";

const input = { name: "Perri", email: "perri@example.com", headCoach: false, capacity: 70, startDate: null };

beforeEach(() => {
  h.invites = [];
  h.invite = { status: "sent", invitationId: "inv_1" };
  h.persistence = true;
  h.realRole = "owner";
  h.role = "owner";
  h.coaches = [
    { id: "co-perry", name: "Perry", is_active: true },
    { id: "co-angus", name: "Angus", is_active: true },
  ];
  h.inserted = [];
  h.updated = [];
  h.upserted = [];
  h.insertFails = false;
});

describe("who may add a coach", () => {
  it("allows the owner and an admin", async () => {
    expect((await addCoachAction({ ...input, name: "Brand New" })).ok).toBe(true);
    h.realRole = "admin";
    h.role = "admin";
    expect((await addCoachAction({ ...input, name: "Another New" })).ok).toBe(true);
  });

  it("refuses ops_manager, va, sales and coaches, and writes nothing", async () => {
    for (const r of ["ops_manager", "va", "sales", "coach"]) {
      h.realRole = r;
      h.role = r;
      const res = await addCoachAction({ ...input, name: "Brand New" });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/owner or an admin/i);
    }
    expect(h.inserted).toHaveLength(0);
    expect(h.upserted).toHaveLength(0);
  });
});

describe("the near-match guard (R14's duplicate-coach bug)", () => {
  it("refuses a one-character miss and names the coach it means", async () => {
    const res = await addCoachAction(input);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.nearMatch?.name).toBe("Perry");
      expect(res.error).toMatch(/Did you mean "Perry"/);
    }
    expect(h.inserted).toHaveLength(0);
  });

  it("goes through once the owner confirms the new spelling", async () => {
    const res = await addCoachAction(input, true);
    expect(res.ok).toBe(true);
    expect(h.inserted.some((r) => r.table === "coaches" && r.name === "Perri")).toBe(true);
  });

  it("does not block a name that is genuinely different", async () => {
    const res = await addCoachAction({ ...input, name: "Siobhan" });
    expect(res.ok).toBe(true);
  });

  it("catches a one-letter miss that Dice alone scores BELOW 0.8", async () => {
    // The brief said Dice >= 0.8, but Perri/Perry is 0.75: a one-character
    // swap in a five-letter name shares only 3 of 4 bigrams. Short names are
    // where this guard matters most, so a single-edit rule runs alongside it.
    expect(await nameSimilarity("Perry", "perry")).toBe(1);
    expect(await nameSimilarity("Perri", "Perry")).toBeCloseTo(0.75, 2);
    expect(await nameSimilarity("Perry", "Angus")).toBeLessThan(0.8);
  });

  it("still refuses other one-character misses on real coach names", async () => {
    for (const typo of ["Angue", "Angu", "Perrry"]) {
      const res = await addCoachAction({ ...input, name: typo });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.nearMatch).toBeTruthy();
    }
  });

  it("does not fire on a genuinely short, different name", async () => {
    h.coaches = [{ id: "co-jo", name: "Jo", is_active: true }];
    expect((await addCoachAction({ ...input, name: "Bo" })).ok).toBe(true);
  });
});

describe("adopting an existing coach record", () => {
  it("links to the exact-name row instead of creating a second one", async () => {
    const res = await addCoachAction({ ...input, name: "Perry" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.coachId).toBe("co-perry");
      expect(res.linkedExisting).toBe(true);
    }
    expect(h.inserted.some((r) => r.table === "coaches")).toBe(false);
    expect(h.updated.some((r) => r.table === "coaches")).toBe(true);
  });

  it("matches case-insensitively, so PERRY does not make a twin", async () => {
    const res = await addCoachAction({ ...input, name: "  perry  " });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.linkedExisting).toBe(true);
  });

  it("always creates the linked invite, adopted or not", async () => {
    await addCoachAction({ ...input, name: "Perry" });
    const invite = h.upserted.find((r) => r.table === "invites");
    expect(invite).toMatchObject({ role: "coach", linked_coach_id: "co-perry", email: "perri@example.com" });
  });
});

describe("input validation", () => {
  it("rejects a blank name, a bad email and a nonsense capacity", async () => {
    expect((await addCoachAction({ ...input, name: "   " })).ok).toBe(false);
    expect((await addCoachAction({ ...input, name: "New", email: "nope" })).ok).toBe(false);
    expect((await addCoachAction({ ...input, name: "New", capacity: 0 })).ok).toBe(false);
    expect((await addCoachAction({ ...input, name: "New", startDate: "last tuesday" })).ok).toBe(false);
    expect(h.inserted).toHaveLength(0);
  });

  it("refuses when persistence is off", async () => {
    h.persistence = false;
    expect((await addCoachAction({ ...input, name: "New" })).ok).toBe(false);
  });
});

// R19-2b: the cases the owner asked to be covered before this ships.
describe("R19-2b creation guarantees", () => {
  const base = { name: "Nina Hart", email: "nina@example.com", headCoach: false, capacity: 70, startDate: null };

  it("happy path: creates the coach, the invite, and reports the email as sent", async () => {
    const r = await addCoachAction({ ...base });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.name).toBe("Nina Hart");
    expect(r.email).toBe("nina@example.com");
    expect(r.invite).toEqual({ status: "sent", invitationId: "inv_1" });
    expect(h.upserted.some((u) => u.table === "invites" && u.role === "coach")).toBe(true);
  });

  it("Clerk down: the coach is still created, and the failure is reported not swallowed", async () => {
    h.invite = { status: "failed", error: "clerk unreachable" };
    const r = await addCoachAction({ ...base });
    // The whole point: a network failure at the last step must not cost the
    // owner the coach record, and must not be reported as success either.
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.invite).toEqual({ status: "failed", error: "clerk unreachable" });
    expect(r.coachId).toBeTruthy();
  });

  it("refuses an email already invited to somebody else", async () => {
    h.invites = [{ email: "nina@example.com", name: "Someone Else" }];
    const r = await addCoachAction({ ...base });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/already invited/i);
    expect(h.inserted.filter((i) => i.table === "coaches")).toHaveLength(0);
  });

  it("allows re-running for the SAME person, so a half-finished onboarding repairs", async () => {
    h.invites = [{ email: "nina@example.com", name: "Nina Hart" }];
    const r = await addCoachAction({ ...base });
    expect(r.ok).toBe(true);
  });

  it("refuses a non-permitted role", async () => {
    h.realRole = "ops_manager";
    h.role = "ops_manager";
    const r = await addCoachAction({ ...base });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/only the owner or an admin/i);
    expect(h.inserted).toHaveLength(0);
  });
});
