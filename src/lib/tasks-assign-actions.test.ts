import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerIdentity } from "@/lib/role-server";
import { buildTaskDirectory } from "@/lib/task-assignees";

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

import { createTaskAction, createTemplateTaskAction, updateTaskAction } from "@/lib/tasks-actions";
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

const OWNER = ident({});
const ADMIN = ident({ role: "admin", realRole: "admin", displayName: "Jameela Ops" });
const HEAD_COACH = ident({ role: "coach", realRole: "coach", linkedCoachId: "c-caleb", isHeadCoach: true, realIsHeadCoach: true, displayName: "Caleb Smith", userId: "u-caleb" });
const COACH = ident({ role: "coach", realRole: "coach", linkedCoachId: "c-emery", displayName: "Emery Hart" });

const general = (assigneeName: string) =>
  createTemplateTaskAction({ template: "general", fields: { brief: "Do the thing", timeline: "2026-10-20" }, assigneeName });

beforeEach(() => {
  h.inserts = [];
  h.updates = [];
  h.notifications = [];
  h.taskRow = { opened_by: "Toby", assignee_name: "Toby", assigned_to: null };
});

describe("createTemplateTaskAction: picked assignee is enforced server-side", () => {
  it("owner can assign to a not-yet-signed-in invitee: canonical name, assigned_to left null", async () => {
    h.identity = OWNER;
    const res = await general("  jamila rahman ");
    expect(res).toMatchObject({ ok: true, data: { assignedTo: "Jamila Rahman" } });
    expect(h.inserts[0]).toMatchObject({ assignee_name: "Jamila Rahman", opened_by: BRAND.ownerName });
    expect(h.inserts[0]).not.toHaveProperty("assigned_to");
    // Only the pre-existing internal notification row, nothing new.
    expect(h.notifications).toEqual([expect.objectContaining({ recipientName: "Jamila Rahman", type: "task_assigned" })]);
  });

  it("owner assigning to a signed-in coach also stores assigned_to = users.id", async () => {
    h.identity = OWNER;
    const res = await general("Caleb Smith");
    expect(res).toMatchObject({ ok: true, data: { assignedTo: "Caleb" } });
    expect(h.inserts[0]).toMatchObject({ assignee_name: "Caleb", assigned_to: "u-caleb" });
  });

  it("DP: owner viewing as a head coach or plain coach keeps owner assignment rights", async () => {
    expect(BRAND.viewAsIsExactCoachView).toBe(false);
    h.identity = ident({ role: "coach", realRole: "owner", impersonating: true, linkedCoachId: "c-caleb", isHeadCoach: true });
    expect(await general("Jamila Rahman")).toMatchObject({ ok: true });
    h.identity = ident({ role: "coach", realRole: "owner", impersonating: true, linkedCoachId: "c-emery" });
    expect(await general("Caleb")).toMatchObject({ ok: true });
    expect(await createTaskAction({ title: "x", type: "Ops", dueDate: null, assigneeName: "Caleb" })).toMatchObject({ ok: true });
    // Stamped as the owner, as before on DP.
    expect(h.inserts.every((r) => r.opened_by === BRAND.ownerName)).toBe(true);
  });

  it("admin can assign to a not-yet-signed-in coach", async () => {
    h.identity = ADMIN;
    expect(await general("Emery Hart")).toMatchObject({ ok: true, data: { assignedTo: "Emery Hart" } });
  });

  it("head coach can assign to coaches but not to the owner or staff", async () => {
    h.identity = HEAD_COACH;
    expect(await general("Emery Hart")).toMatchObject({ ok: true });
    h.inserts = [];
    expect(await general("Toby")).toMatchObject({ ok: false, error: expect.stringMatching(/coaches only/) });
    expect(await general("Jamila Rahman")).toMatchObject({ ok: false });
    expect(h.inserts).toHaveLength(0);
  });

  it("refuses inactive coaches, revoked invites and strangers", async () => {
    h.identity = OWNER;
    for (const who of ["kai testing", "Revoked Person", "Somebody Random"]) {
      expect(await general(who)).toMatchObject({ ok: false, error: expect.stringMatching(/not an active team member/) });
    }
    expect(h.inserts).toHaveLength(0);
  });
});

describe("createTaskAction / updateTaskAction: same rule", () => {
  it("a coach may add a task for themselves or the owner, never another coach", async () => {
    h.identity = COACH;
    expect(await createTaskAction({ title: "Mine", type: "Today", dueDate: null, assigneeName: "Emery Hart" })).toMatchObject({ ok: true });
    expect(await createTaskAction({ title: "Up", type: "Ops", dueDate: null, assigneeName: "Toby" })).toMatchObject({ ok: true });
    expect(await createTaskAction({ title: "Sideways", type: "Ops", dueDate: null, assigneeName: "Caleb" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/yourself or to the owner and staff/),
    });
    expect(h.inserts.map((r) => r.assignee_name)).toEqual(["Emery Hart", "Toby"]);
  });

  it("reassigning via updateTaskAction is checked too", async () => {
    h.identity = HEAD_COACH; // privileged on task access, coaches-only for assignment
    expect(await updateTaskAction("t1", { assigneeName: "Toby" })).toMatchObject({ ok: false });
    expect(h.updates).toHaveLength(0);
    expect(await updateTaskAction("t1", { assigneeName: "emery hart" })).toMatchObject({ ok: true });
    expect(h.updates[0]).toMatchObject({ assignee_name: "Emery Hart", assigned_to: null });
  });

  it("an invitee who has since signed in can act on a task assigned to them by name", async () => {
    h.taskRow = { opened_by: "Toby", assignee_name: "Jamila Rahman", assigned_to: null };
    h.identity = ident({ role: "va", realRole: "va", displayName: "jamila  rahman", userId: "u-jamila" });
    expect(await updateTaskAction("t1", { title: "Renamed" })).toMatchObject({ ok: true });
    h.identity = ident({ role: "va", realRole: "va", displayName: "Someone Else", userId: "u-x" });
    expect(await updateTaskAction("t1", { title: "Nope" })).toMatchObject({ ok: false });
  });
});
