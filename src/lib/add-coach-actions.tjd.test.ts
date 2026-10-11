import { beforeEach, describe, expect, it, vi } from "vitest";

// The weeks-paid half of R19-2b. BRAND resolves once at module load, so the
// TJD rule needs its own file with the brand mocked; the DP cases live in
// add-coach-actions.test.ts.

const h = vi.hoisted(() => ({
  coaches: [] as { id: string; name: string; is_active: boolean }[],
  invites: [] as { email: string; name: string }[],
  upserted: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/brand", async (orig) => {
  const real = (await orig()) as { BRANDS: Record<string, unknown> };
  return { ...real, BRAND: real.BRANDS.tjd, IS_DP: false };
});

vi.mock("@/lib/role-server", () => ({
  getServerIdentity: () =>
    Promise.resolve({ role: "owner", realRole: "owner", linkedCoachId: null, impersonating: false, isHeadCoach: false }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/clerk-invites", () => ({
  sendClerkInvitation: () => Promise.resolve({ status: "sent", invitationId: "inv_1" }),
  resendClerkInvitation: () => Promise.resolve({ status: "sent", invitationId: "inv_1" }),
}));
vi.mock("@/lib/db/client", () => ({
  persistenceEnabled: () => true,
  dbAdmin: () => {
    let table = "";
    const b: Record<string, unknown> = {
      from: (t: string) => ((table = t), b),
      select: () => b,
      order: () => b,
      eq: () => b,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: { id: "new-coach-id" }, error: null }),
      update: () => b,
      upsert: (v: Record<string, unknown>) => (h.upserted.push({ table, ...v }), b),
      insert: (v: Record<string, unknown>) => (h.inserted.push({ table, ...v }), b),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: table === "invites" ? h.invites : h.coaches, error: null }).then(res, rej),
    };
    return b;
  },
}));

import { addCoachAction } from "@/lib/add-coach-actions";

const base = { name: "Nina Hart", email: "nina@example.com", headCoach: false, capacity: 70, startDate: null };
const card = {
  model: "weeks-paid" as const,
  brandWeekly: 60, brandFortnightly: 45, referralWeekly: 80, referralFortnightly: 61.25,
};

beforeEach(() => {
  h.coaches = []; h.invites = []; h.upserted = []; h.inserted = [];
});

describe("TJD: a coach cannot exist without a rate card", () => {
  it("refuses with no pay setup at all", async () => {
    const r = await addCoachAction({ ...base });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/rate card/i);
    expect(h.inserted.filter((i) => i.table === "coaches")).toHaveLength(0);
  });

  it("refuses a DP-shaped pay setup on a weeks-paid brand", async () => {
    const r = await addCoachAction({ ...base, pay: { model: "checkin-codes", weeklyRate: 25, fortnightlyRate: 15 } });
    expect(r.ok).toBe(false);
  });

  it("refuses an all-zero card, which would invoice nothing forever", async () => {
    const r = await addCoachAction({
      ...base,
      pay: { ...card, brandWeekly: 0, brandFortnightly: 0, referralWeekly: 0, referralFortnightly: 0 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/zero/i);
  });

  it("refuses a negative rate", async () => {
    const r = await addCoachAction({ ...base, pay: { ...card, referralWeekly: -1 } });
    expect(r.ok).toBe(false);
  });

  it("creates the coach AND writes the rate card when the card is given", async () => {
    const r = await addCoachAction({ ...base, pay: card });
    expect(r.ok).toBe(true);
    const rates = h.upserted.find((u) => u.table === "coach_pay_rates");
    expect(rates).toMatchObject({
      coach_id: "new-coach-id", brand_weekly: 60, brand_fortnightly: 45,
      referral_weekly: 80, referral_fortnightly: 61.25,
    });
  });

  it("does not put DP's rate columns on the coach row", async () => {
    await addCoachAction({ ...base, pay: card });
    const coachRow = h.inserted.find((i) => i.table === "coaches");
    expect(coachRow).toBeDefined();
    expect(coachRow).not.toHaveProperty("weekly_rate");
  });
});
