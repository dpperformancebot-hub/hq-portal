import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared, mutable test state for the mocked persistence + cache layers. Created
// via vi.hoisted so it exists before the vi.mock factories run.
const h = vi.hoisted(() => ({
  persistence: true,
  // What the awaited Supabase chain resolves to. Default: one matched row.
  queryResult: { data: [{ id: "t1" }], error: null } as { data: unknown; error: unknown },
  // What maybeSingle() resolves to (the send-back coach ownership lookup).
  singleResult: { data: { coach_id: "co-1" }, error: null } as { data: unknown; error: unknown },
  // The call log of the last dbAdmin() query chain, for asserting the guard.
  calls: [] as Array<[string, ...unknown[]]>,
  revalidated: [] as string[],
  // Session identity for the send-back access rules (A9).
  identity: {
    role: "owner",
    realRole: "owner",
    linkedCoachId: null as string | null,
    impersonating: false,
    isHeadCoach: false,
    realIsHeadCoach: false,
    displayName: null as string | null,
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (p: string) => {
    h.revalidated.push(p);
  },
}));

vi.mock("@/lib/role-server", () => ({
  getServerIdentity: () => Promise.resolve(h.identity),
}));

vi.mock("@/lib/db/client", () => ({
  persistenceEnabled: () => h.persistence,
  dbAdmin: () => {
    const calls: Array<[string, ...unknown[]]> = [];
    h.calls = calls;
    // A chainable, awaitable query-builder stub. Every method records its call
    // and returns the builder; awaiting the builder resolves to queryResult.
    const builder: Record<string, unknown> = {
      from: (t: string) => (calls.push(["from", t]), builder),
      update: (v: unknown) => (calls.push(["update", v]), builder),
      eq: (c: string, v: unknown) => (calls.push(["eq", c, v]), builder),
      in: (c: string, v: unknown) => (calls.push(["in", c, v]), builder),
      select: (c: string) => (calls.push(["select", c]), builder),
      maybeSingle: () => (calls.push(["maybeSingle"]), Promise.resolve(h.singleResult)),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(h.queryResult).then(res, rej),
    };
    return builder;
  },
}));

import { advanceTransformationAction, sendBackTransformationAction } from "@/lib/transformations-actions";

beforeEach(() => {
  h.persistence = true;
  h.queryResult = { data: [{ id: "t1" }], error: null };
  h.singleResult = { data: { coach_id: "co-1" }, error: null };
  h.calls = [];
  h.revalidated.length = 0;
  h.identity = {
    role: "owner",
    realRole: "owner",
    linkedCoachId: null,
    impersonating: false,
    isHeadCoach: false,
    realIsHeadCoach: false,
    displayName: null,
  };
});

describe("advanceTransformationAction guards", () => {
  it("rejects a missing id without touching the datastore", async () => {
    const r = await advanceTransformationAction("", "draft");
    expect(r).toEqual({ ok: false, error: "id required" });
    expect(h.calls).toHaveLength(0);
  });

  it("refuses to advance past the terminal posted stage", async () => {
    const r = await advanceTransformationAction("t1", "posted");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Already at the final stage");
    expect(h.calls).toHaveLength(0);
  });

  it("no-ops with a clear message when persistence is off", async () => {
    h.persistence = false;
    const r = await advanceTransformationAction("t1", "draft");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/HQ_PERSISTENCE=true/);
    expect(h.calls).toHaveLength(0); // never reached dbAdmin
    expect(h.revalidated).toHaveLength(0);
  });
});

describe("advanceTransformationAction happy path", () => {
  it("derives the next stage from `from` and writes it, conditioned on the current stage", async () => {
    const r = await advanceTransformationAction("t1", "draft");
    expect(r).toEqual({ ok: true, status: "coach_approved" });

    // Derived next stage is what gets written (never trusted from the client).
    const update = h.calls.find((c) => c[0] === "update")?.[1] as { status: string };
    expect(update.status).toBe("coach_approved");

    // Race-safety guard: the update is conditioned on the row STILL being at
    // `from` (eq status draft) in addition to the id match. Without this guard
    // two concurrent callers could double-advance the same card.
    expect(h.calls).toContainEqual(["eq", "id", "t1"]);
    expect(h.calls).toContainEqual(["eq", "status", "draft"]);

    // Revalidated the screens that render transformation status.
    expect(h.revalidated).toContain("/results-tracker");
    expect(h.revalidated).toContain("/results");
  });

  it("stamps posted_at only on the final move to posted", async () => {
    const r = await advanceTransformationAction("t1", "scheduled");
    expect(r).toEqual({ ok: true, status: "posted" });
    const update = h.calls.find((c) => c[0] === "update")?.[1] as { status: string; posted_at?: string };
    expect(update.status).toBe("posted");
    expect(update.posted_at).toBeTypeOf("string");
  });

  it("does not stamp posted_at on a non-terminal advance", async () => {
    await advanceTransformationAction("t1", "coach_approved");
    const update = h.calls.find((c) => c[0] === "update")?.[1] as { posted_at?: string };
    expect(update.posted_at).toBeUndefined();
  });
});

describe("advanceTransformationAction race + error handling", () => {
  it("reports STALE when the conditional update matches no row (someone else advanced it)", async () => {
    h.queryResult = { data: [], error: null }; // guard matched nothing
    const r = await advanceTransformationAction("t1", "draft");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/moved on already/);
    // A stale no-op must NOT revalidate (nothing changed).
    expect(h.revalidated).toHaveLength(0);
  });

  it("surfaces a datastore error message", async () => {
    h.queryResult = { data: null, error: { message: "db exploded" } };
    const r = await advanceTransformationAction("t1", "draft");
    expect(r).toEqual({ ok: false, error: "db exploded" });
    expect(h.revalidated).toHaveLength(0);
  });
});

describe("sendBackTransformationAction (A9)", () => {
  it("requires a non-empty reason", async () => {
    const r = await sendBackTransformationAction("t1", "coach_approved", "   ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/reason/i);
    expect(h.calls).toHaveLength(0);
  });

  it("refuses to send back a draft or posted card", async () => {
    for (const from of ["draft", "posted"] as const) {
      const r = await sendBackTransformationAction("t1", from, "why");
      expect(r.ok).toBe(false);
    }
    expect(h.calls).toHaveLength(0);
  });

  it("owner sends back one stage with the reason stamped, guarded on the current stage", async () => {
    const r = await sendBackTransformationAction("t1", "admin_approved", "photos are wrong");
    expect(r).toEqual({ ok: true, status: "coach_approved" });
    const update = h.calls.find((c) => c[0] === "update")?.[1] as {
      status: string;
      sent_back_reason: string;
    };
    expect(update.status).toBe("coach_approved");
    expect(update.sent_back_reason).toBe("photos are wrong");
    expect(h.calls).toContainEqual(["eq", "status", "admin_approved"]);
    expect(h.revalidated).toContain("/results-tracker");
  });

  it("rejects a plain coach for stages beyond their own approval", async () => {
    h.identity = { ...h.identity, role: "coach", realRole: "coach", linkedCoachId: "co-1" };
    const r = await sendBackTransformationAction("t1", "admin_approved", "why");
    expect(r.ok).toBe(false);
    expect(h.calls).toHaveLength(0);
  });

  it("lets a plain coach un-approve their OWN coach_approved card only", async () => {
    h.identity = { ...h.identity, role: "coach", realRole: "coach", linkedCoachId: "co-1" };
    const ok = await sendBackTransformationAction("t1", "coach_approved", "resubmitting");
    expect(ok).toEqual({ ok: true, status: "draft" });

    h.identity = { ...h.identity, linkedCoachId: "co-OTHER" };
    const denied = await sendBackTransformationAction("t1", "coach_approved", "nope");
    expect(denied.ok).toBe(false);
  });

  it("reports STALE when the guard matches nothing", async () => {
    h.queryResult = { data: [], error: null };
    const r = await sendBackTransformationAction("t1", "scheduled", "hold on");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/moved on/i);
  });
});
