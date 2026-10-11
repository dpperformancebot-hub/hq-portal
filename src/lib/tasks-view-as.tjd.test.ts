import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerIdentity } from "@/lib/role-server";
import { buildTaskDirectory } from "@/lib/task-assignees";

// TJD view-as (Brand.viewAsIsExactCoachView = true): an owner viewing as a
// coach or head coach gets THAT person's task assignment rights, server-side.
// DP keeps the owner's rights (see tasks-assign-actions.test.ts).
//
// Server-side enforcement of the task assignment rule (2026-10-08). The
// picker is cosmetic; createTemplateTaskAction / createTaskAction /
// updateTaskAction must refuse an assignee the caller may not pick, accept
// not-yet-signed-in coaches and invitees, and store the canonical name with
// assigned_to set only when a users row exists. No outbound message is added:
// the only side effect is the pre-existing internal notification row.

const h = vi.hoisted(() => ({
  identity: null as unknown as ServerIdentity,
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  notifications: [] as { recipientName: string; type: string }[],
  taskRow: { opened_by: "Toby", assignee_name: "Toby", assigned_to: null } as Record<string, unknown> | null,
}));

const COACHES = [
  { id: "c-caleb", name: "Caleb", role: "head_coach", is_active: true },
  { id: "c-emery", name: "Emery Hart", role: "coach", is_active: true },
  { id: "c-kai", name: "kai testing", role: "coach", is_active: false },
];
const COACH_NAME: Record<string, string> = { "c-caleb": "Caleb", "c-emery": "Emery Hart" };

vi.mock("@/lib/brand", async (orig) => {
  const real = (await orig()) as { BRANDS: Record<string, unknown> };
  return { ...real, BRAND: real.BRANDS.tjd, BRAND_KEY: "tjd", IS_DP: false };
});
vi.mock("@/lib/role-server", () => ({ getServerIdentity: () => Promise.resolve(h.identity) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/notify", () => ({
  insertNotification: (n: { recipientName: string; type: string }) => {
    h.notifications.push(n);
    return Promise.resolve({ stored: true, slack: false });
  },
}));
vi.mock("@/lib/tasks", () => ({
  headCoachName: () => Promise.resolve("Caleb"),
  listTaskDirectory: () =>
    Promise.resolve(
      buildTaskDirectory({
        ownerName: "Toby",
        coaches: COACHES,
        invites: [
          { name: "Emery Hart", role: "coach", linked_coach_id: "c-emery", claimed_at: null, clerk_status: "sent" },
          { name: "Jamila Rahman", role: "va", linked_coach_id: null, claimed_at: null, clerk_status: "sent" },
          { name: "Revoked Person", role: "sales", linked_coach_id: null, claimed_at: null, clerk_status: "revoked" },
        ],
        users: [{ id: "u-caleb", name: "Caleb Smith", role: "coach", linked_coach_id: "c-caleb", is_active: true }],
      }),
    ),
}));

// Minimal table-aware Supabase fake: coaches name lookup, tasks insert/select/update.
vi.mock("@/lib/db/client", () => ({
  persistenceEnabled: () => true,
  dbAdmin: () => {
    let table = "";
    let verb = "";
    let payload: Record<string, unknown> | null = null;
    const eqs: Record<string, unknown> = {};
    const result = () => {
      if (table === "coaches") return { data: { name: COACH_NAME[eqs.id as string] ?? null }, error: null };
      if (table === "tasks" && verb === "insert") return { data: { id: "t-new" }, error: null };
      if (table === "tasks" && verb === "update") return { data: [{ id: "t1" }], error: null };
      if (table === "tasks") return { data: h.taskRow, error: null };
      if (table === "users") return { data: null, error: null };
      return { data: null, error: null };
    };
    const b: Record<string, unknown> = {
      from: (t: string) => ((table = t), b),
      select: () => ((verb = verb || "select"), b),
      insert: (row: Record<string, unknown>) => ((verb = "insert"), (payload = row), h.inserts.push(row), b),
      update: (row: Record<string, unknown>) => ((verb = "update"), (payload = row), h.updates.push(row), b),
      delete: () => ((verb = "delete"), b),
      eq: (c: string, v: unknown) => ((eqs[c] = v), b),
      is: () => b,
      order: () => b,
      limit: () => b,
      single: () => Promise.resolve(result()),
      maybeSingle: () => Promise.resolve(result()),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
    };
    void payload;
    return b;
  },
}));

import { createTaskAction, createTemplateTaskAction } from "@/lib/tasks-actions";
import { BRAND } from "@/lib/brand";

const ident = (over: Partial<ServerIdentity>): ServerIdentity => ({
  role: "owner",
  realRole: "owner",
  displayName: null,
  linkedCoachId: null,
  impersonating: false,
  isHeadCoach: false,
  realIsHeadCoach: false,
  userId: null,
  ...over,
});


const general = (assigneeName: string) =>
  createTemplateTaskAction({ template: "general", fields: { brief: "Do the thing", timeline: "2026-10-20" }, assigneeName });

const OWNER_AS_COACH = ident({ role: "coach", realRole: "owner", impersonating: true, linkedCoachId: "c-emery", displayName: "Toby Owner", userId: "u-toby" });
const OWNER_AS_HEAD_COACH = ident({ role: "coach", realRole: "owner", impersonating: true, linkedCoachId: "c-caleb", isHeadCoach: true, displayName: "Toby Owner", userId: "u-toby" });

beforeEach(() => {
  h.inserts = [];
  h.updates = [];
  h.notifications = [];
  h.taskRow = { opened_by: "Toby", assignee_name: "Toby", assigned_to: null };
});

describe("TJD: owner viewing as a coach gets exactly the coach's task rights", () => {
  it("brand flag is on for TJD", () => {
    expect(BRAND.viewAsIsExactCoachView).toBe(true);
  });

  it("owner as plain coach: cannot raise a picked-routing template (a coach cannot)", async () => {
    h.identity = OWNER_AS_COACH;
    expect(await general("Jamila Rahman")).toMatchObject({ ok: false, error: expect.stringMatching(/cannot raise/) });
    expect(h.inserts).toHaveLength(0);
  });

  it("owner as plain coach: assigns like the coach (self or owner/staff, never another coach), stamped as the coach", async () => {
    h.identity = OWNER_AS_COACH;
    expect(await createTaskAction({ title: "Sideways", type: "Ops", dueDate: null, assigneeName: "Caleb" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/yourself or to the owner and staff/),
    });
    expect(await createTaskAction({ title: "Mine", type: "Today", dueDate: null, assigneeName: "Emery Hart" })).toMatchObject({ ok: true });
    expect(h.inserts[0]).toMatchObject({ assignee_name: "Emery Hart", opened_by: "Emery Hart" });
  });

  it("owner as head coach: coaches only, like the head coach", async () => {
    h.identity = OWNER_AS_HEAD_COACH;
    expect(await general("Emery Hart")).toMatchObject({ ok: true, data: { assignedTo: "Emery Hart" } });
    expect(h.inserts[0]).toMatchObject({ opened_by: "Caleb" });
    expect(await general("Jamila Rahman")).toMatchObject({ ok: false, error: expect.stringMatching(/coaches only/) });
    expect(await general(BRAND.ownerName)).toMatchObject({ ok: false });
  });

  it("the owner as themselves keeps full rights on TJD", async () => {
    h.identity = ident({ userId: "u-toby" });
    expect(await general("Jamila Rahman")).toMatchObject({ ok: true });
    expect(await createTaskAction({ title: "x", type: "Ops", dueDate: null, assigneeName: "Caleb" })).toMatchObject({ ok: true });
  });
});
