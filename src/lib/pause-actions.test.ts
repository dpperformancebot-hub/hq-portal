import { beforeEach, describe, expect, it, vi } from "vitest";

// R16-3: the two failure paths Jameela hit on the pause board.
//   (a) a derived row (Paused status, no client_pauses record) showed the
//       typed end date without writing anything;
//   (b) after the first save the row kept its fake "derived-<clientId>" id,
//       so the next edit updated nothing and still looked saved.
const h = vi.hoisted(() => ({
  persistence: true,
  calls: [] as Array<[string, ...unknown[]]>,
  insertResult: { data: { id: "11111111-2222-4333-8444-555555555555" }, error: null } as { data: unknown; error: unknown },
  updateResult: { data: [{ id: "x" }], error: null } as { data: unknown; error: unknown },
  revalidated: [] as string[],
}));

vi.mock("@/lib/role-server", () => ({
  getServerIdentity: () =>
    Promise.resolve({ role: "owner", realRole: "owner", linkedCoachId: null, impersonating: false, isHeadCoach: false, realIsHeadCoach: false }),
}));
vi.mock("@/lib/navigation", () => ({ isOpsRole: (r: string) => r === "va" || r === "ops_manager" }));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { h.revalidated.push(p); } }));
vi.mock("@/lib/db/client", () => ({
  persistenceEnabled: () => h.persistence,
  dbAdmin: () => {
    let mode: "insert" | "update" = "update";
    const b: Record<string, unknown> = {
      from: (t: string) => (h.calls.push(["from", t]), b),
      insert: (v: unknown) => ((mode = "insert"), h.calls.push(["insert", v]), b),
      update: (v: unknown) => ((mode = "update"), h.calls.push(["update", v]), b),
      eq: (c: string, v: unknown) => (h.calls.push(["eq", c, v]), b),
      select: (c: string) => (h.calls.push(["select", c]), b),
      single: () => (h.calls.push(["single"]), b),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(mode === "insert" ? h.insertResult : h.updateResult).then(res, rej),
    };
    return b;
  },
}));

import { createPauseAction, updatePauseAction } from "./pause-actions";

beforeEach(() => {
  h.calls = [];
  h.revalidated = [];
  h.persistence = true;
  h.updateResult = { data: [{ id: "x" }], error: null };
});

describe("updatePauseAction (R16-3 b)", () => {
  it("refuses a derived placeholder id without touching the database", async () => {
    const res = await updatePauseAction({ id: "derived-71fec903-dc31-492b-b4e3-aad2b581aaf8", pauseEnd: "2026-10-01" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not been saved/i);
    expect(h.calls).toEqual([]);
  });
  it("refuses a local- placeholder id the same way", async () => {
    const res = await updatePauseAction({ id: "local-0", cancelledInKahunas: true });
    expect(res.ok).toBe(false);
    expect(h.calls).toEqual([]);
  });
  it("writes pause_end for a real id and reports the touched row", async () => {
    const res = await updatePauseAction({ id: "e7cabfcb-0da3-4a5b-8d4f-c3650e163247", pauseEnd: "2026-10-01" });
    expect(res.ok).toBe(true);
    expect(h.calls).toContainEqual(["update", { pause_end: "2026-10-01" }]);
    expect(h.calls).toContainEqual(["eq", "id", "e7cabfcb-0da3-4a5b-8d4f-c3650e163247"]);
    expect(h.revalidated).toContain("/pauses");
  });
  it("fails visibly when the update matched no row", async () => {
    h.updateResult = { data: [], error: null };
    const res = await updatePauseAction({ id: "e7cabfcb-0da3-4a5b-8d4f-c3650e163247", pauseEnd: "2026-10-01" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no longer exists/i);
  });
});

describe("createPauseAction (R16-3 a)", () => {
  it("returns the real row id so the board can replace the derived placeholder", async () => {
    const res = await createPauseAction({ clientId: "71fec903-dc31-492b-b4e3-aad2b581aaf8", pauseStart: "2026-09-14", pauseEnd: null });
    expect(res.ok).toBe(true);
    expect(res.id).toBe("11111111-2222-4333-8444-555555555555");
    expect(h.calls).toContainEqual(["insert", { client_id: "71fec903-dc31-492b-b4e3-aad2b581aaf8", pause_start: "2026-09-14", pause_end: null }]);
  });
  it("still requires a start date: an end date alone is never persisted", async () => {
    const res = await createPauseAction({ clientId: "71fec903-dc31-492b-b4e3-aad2b581aaf8", pauseStart: "", pauseEnd: "2026-10-01" });
    expect(res.ok).toBe(false);
    expect(h.calls).toEqual([]);
  });
});
