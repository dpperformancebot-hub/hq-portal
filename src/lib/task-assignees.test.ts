import { describe, expect, it } from "vitest";
import {
  assignableFor,
  buildTaskDirectory,
  canAssignTaskTo,
  isTaskAssignedTo,
  isTaskOpenedBy,
  normaliseName,
  resolveAssignee,
  selectTodayItems,
  selectTodaySuggestions,
  taskRoleFor,
  type AssignerIdentity,
  type DirectoryEntry,
} from "@/lib/task-assignees";

// 2026-10-08: the /tasks assignee picker listed only people with a users row
// (on a coach board: only the coach). It must offer every ACTIVE coach and
// every pending/claimed invitee before they ever sign in, deduped, minus
// deactivated coaches and revoked invites, and the "my tasks" filter must
// pick the task up once the person's users row exists.

const COACHES = [
  { id: "c-caleb", name: "Caleb", role: "head_coach", is_active: true },
  { id: "c-emery", name: "Emery Hart", role: "coach", is_active: true },
  { id: "c-new", name: "Jordan New", role: "coach", is_active: true }, // never signed in, no invite yet
  { id: "c-kai", name: "kai testing", role: "coach", is_active: false }, // test coach, deactivated
  { id: "c-gone", name: "Old Coach", role: "coach", is_active: false },
];

const INVITES = [
  // Coach with BOTH a coach row and an invite (claimed): one row, not two.
  { id: "i1", name: "Caleb Smith", role: "coach", linked_coach_id: "c-caleb", claimed_at: "2026-10-01", clerk_status: "accepted" },
  // Coach invited, pending (no login yet).
  { id: "i2", name: "Emery Hart", role: "coach", linked_coach_id: "c-emery", claimed_at: null, clerk_status: "sent" },
  // Staff invited, pending: no coach row, no users row.
  { id: "i3", name: "Jamila Rahman", role: "va", linked_coach_id: null, claimed_at: null, clerk_status: "sent" },
  { id: "i4", name: "Jameela Ops", role: "admin", linked_coach_id: null, claimed_at: null, clerk_status: null },
  // Revoked invite: excluded.
  { id: "i5", name: "Revoked Person", role: "sales", linked_coach_id: null, claimed_at: null, clerk_status: "revoked" },
  // Invite for the deactivated test coach: excluded with the coach.
  { id: "i6", name: "kai testing", role: "coach", linked_coach_id: "c-kai", claimed_at: null, clerk_status: "sent" },
];

const USERS = [
  { id: "u-caleb", name: "Caleb Smith", role: "coach", linked_coach_id: "c-caleb", is_active: true },
  { id: "u-toby", name: "Toby", role: "owner", linked_coach_id: null, is_active: true },
  { id: "u-old", name: "Old Coach", role: "coach", linked_coach_id: "c-gone", is_active: false },
  { id: "u-off", name: "Deactivated Staff", role: "sales", linked_coach_id: null, is_active: false },
];

const dir = () => buildTaskDirectory({ ownerName: "Toby", coaches: COACHES, invites: INVITES, users: USERS });
const names = (d: DirectoryEntry[]) => d.map((e) => e.name);
const byName = (d: DirectoryEntry[], n: string) => d.find((e) => e.name === n)!;

describe("buildTaskDirectory", () => {
  it("lists every active coach and every pending/claimed invitee before they sign in", () => {
    const d = dir();
    expect(names(d)).toEqual(
      expect.arrayContaining(["Toby", "Caleb", "Emery Hart", "Jordan New", "Jamila Rahman", "Jameela Ops"]),
    );
    expect(byName(d, "Jordan New").signedIn).toBe(false);
    expect(byName(d, "Jamila Rahman")).toMatchObject({ role: "va", signedIn: false, userId: null });
    expect(byName(d, "Jameela Ops").role).toBe("admin");
  });

  it("owner first, rest alphabetical", () => {
    const d = dir();
    expect(d[0].name).toBe("Toby");
    const rest = names(d).slice(1);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
  });

  it("excludes deactivated coaches (kai testing), their invites/logins, revoked invites and inactive users", () => {
    const n = names(dir()).map(normaliseName);
    expect(n).not.toContain("kai testing");
    expect(n).not.toContain("old coach");
    expect(n).not.toContain("revoked person");
    expect(n).not.toContain("deactivated staff");
  });

  it("dedupes a coach who has a coach row, an invite and a login into ONE row", () => {
    const d = dir();
    const calebs = d.filter((e) => e.coachId === "c-caleb");
    expect(calebs).toHaveLength(1);
    expect(calebs[0]).toMatchObject({ name: "Caleb", isHeadCoach: true, userId: "u-caleb", signedIn: true });
    expect(calebs[0].aliases).toEqual(expect.arrayContaining(["caleb", "caleb smith"]));
    expect(names(d).filter((x) => normaliseName(x).startsWith("caleb"))).toHaveLength(1);
    // Owner login folds into the owner row.
    expect(d.filter((e) => e.role === "owner")).toHaveLength(1);
    expect(byName(d, "Toby").userId).toBe("u-toby");
    // Emery: coach row + pending invite, same name, one row, not signed in.
    expect(d.filter((e) => normaliseName(e.name) === "emery hart")).toHaveLength(1);
  });
});

describe("canAssignTaskTo / assignableFor", () => {
  const d = dir();
  const owner: AssignerIdentity = { role: "owner", coachId: null, names: ["Toby"] };
  const admin: AssignerIdentity = { role: "head_of_ops", coachId: null, names: ["Jameela Ops"] };
  const headCoach: AssignerIdentity = { role: "head_coach", coachId: "c-caleb", names: ["Caleb"] };
  const coach: AssignerIdentity = { role: "coach", coachId: "c-emery", names: ["Emery Hart"] };

  it("owner and admin may assign to anyone", () => {
    expect(assignableFor(d, owner)).toHaveLength(d.length);
    expect(assignableFor(d, admin)).toHaveLength(d.length);
  });

  it("head coach may assign to coaches only (self included)", () => {
    const list = assignableFor(d, headCoach);
    expect(list.every((e) => e.role === "coach")).toBe(true);
    expect(names(list)).toEqual(expect.arrayContaining(["Caleb", "Emery Hart", "Jordan New"]));
    expect(canAssignTaskTo(headCoach, byName(d, "Toby"))).toBe(false);
  });

  it("plain coach may assign to themselves or owner/staff, never another coach", () => {
    const list = names(assignableFor(d, coach));
    expect(list).toEqual(expect.arrayContaining(["Emery Hart", "Toby", "Jamila Rahman", "Jameela Ops"]));
    expect(list).not.toContain("Caleb");
    expect(list).not.toContain("Jordan New");
  });

  it("resolveAssignee enforces the rule and refuses unknown/inactive people", () => {
    expect(resolveAssignee(d, coach, "Jordan New")).toMatchObject({ ok: false });
    expect(resolveAssignee(d, headCoach, "Jamila Rahman")).toMatchObject({ ok: false });
    expect(resolveAssignee(d, owner, "kai testing")).toMatchObject({ ok: false });
    expect(resolveAssignee(d, owner, "Revoked Person")).toMatchObject({ ok: false });
    expect(resolveAssignee(d, owner, "")).toMatchObject({ ok: false });
    // Canonical name stored; users.id only when they have signed in.
    expect(resolveAssignee(d, owner, "  jamila   RAHMAN ")).toEqual({ ok: true, name: "Jamila Rahman", userId: null });
    expect(resolveAssignee(d, owner, "Caleb Smith")).toEqual({ ok: true, name: "Caleb", userId: "u-caleb" });
    // A login's own name is always assignable to themselves.
    expect(resolveAssignee(d, { role: "va", coachId: null, names: ["Not Yet Listed"] }, "Not Yet Listed")).toMatchObject({ ok: true });
  });
});

describe("a task assigned before first login shows up once the users row exists", () => {
  it("invitee (staff): assigned by invite name, matched by the users row name after the claim", () => {
    const before = dir();
    const r = resolveAssignee(before, { role: "owner", coachId: null, names: ["Toby"] }, "Jamila Rahman");
    expect(r).toMatchObject({ ok: true, userId: null });
    const task = { assigneeName: r.ok ? r.name : "", assignedTo: r.ok ? r.userId : null, openedBy: "Toby" };

    // First sign-in: role-server claims the invite and creates users(name = invite name).
    const after = buildTaskDirectory({
      ownerName: "Toby",
      coaches: COACHES,
      invites: INVITES.map((i) => (i.id === "i3" ? { ...i, claimed_at: "2026-10-09" } : i)),
      users: [...USERS, { id: "u-jamila", name: "Jamila Rahman", role: "va", linked_coach_id: null, is_active: true }],
    });
    expect(byName(after, "Jamila Rahman")).toMatchObject({ userId: "u-jamila", signedIn: true });
    expect(isTaskAssignedTo(task, { userId: "u-jamila", names: ["Jamila Rahman"] })).toBe(true);
    expect(isTaskAssignedTo(task, { userId: "u-other", names: ["Someone Else"] })).toBe(false);
  });

  it("coach invitee: assigned to the coach row name, matched via the linked coach after login", () => {
    const r = resolveAssignee(dir(), { role: "owner", coachId: null, names: ["Toby"] }, "Jordan New");
    const task = { assigneeName: r.ok ? r.name : "", assignedTo: null };
    // The coach board matches on the linked coach's name plus the login's name.
    expect(isTaskAssignedTo(task, { userId: "u-jordan", names: ["Jordan New", "Jordan N."] })).toBe(true);
  });

  it("matches on users.id even when the name differs, and normalises names", () => {
    expect(isTaskAssignedTo({ assigneeName: "Caleb", assignedTo: "u-caleb" }, { userId: "u-caleb", names: ["Caleb Smith"] })).toBe(true);
    expect(isTaskAssignedTo({ assigneeName: "  caleb ", assignedTo: null }, { names: ["Caleb"] })).toBe(true);
    expect(isTaskOpenedBy({ openedBy: "EMERY  hart" }, { names: ["Emery Hart"] })).toBe(true);
    expect(isTaskAssignedTo({ assigneeName: "Unassigned", assignedTo: null }, { names: [""] })).toBe(false);
  });
});

describe("taskRoleFor", () => {
  it("maps identities onto the taskboard tiers", () => {
    expect(taskRoleFor({ role: "owner", realRole: "owner", isHeadCoach: false })).toBe("owner");
    expect(taskRoleFor({ role: "coach", realRole: "owner", isHeadCoach: false })).toBe("owner");
    expect(taskRoleFor({ role: "ops_manager", realRole: "ops_manager", isHeadCoach: false })).toBe("owner");
    expect(taskRoleFor({ role: "admin", realRole: "admin", isHeadCoach: false })).toBe("head_of_ops");
    expect(taskRoleFor({ role: "coach", realRole: "coach", isHeadCoach: true })).toBe("head_coach");
    expect(taskRoleFor({ role: "coach", realRole: "coach", isHeadCoach: false })).toBe("coach");
    expect(taskRoleFor({ role: "va", realRole: "va", isHeadCoach: false })).toBe("va");
    expect(taskRoleFor({ role: "sales", realRole: "sales", isHeadCoach: false })).toBe("sales");
  });
});

describe("taskRoleFor: view-as is gated on Brand.viewAsIsExactCoachView", () => {
  const ownerAsCoach = { role: "coach", realRole: "owner", isHeadCoach: false, impersonating: true };
  const ownerAsHead = { ...ownerAsCoach, isHeadCoach: true };

  it("TJD (flag true): owner viewing as a coach / head coach gets that tier and that picker list", () => {
    expect(taskRoleFor(ownerAsCoach, true)).toBe("coach");
    expect(taskRoleFor(ownerAsHead, true)).toBe("head_coach");
    const d = dir();
    const asHead = assignableFor(d, { role: taskRoleFor(ownerAsHead, true), coachId: "c-caleb", names: ["Caleb"] });
    expect(asHead.every((e) => e.role === "coach")).toBe(true);
    const asCoach = names(assignableFor(d, { role: taskRoleFor(ownerAsCoach, true), coachId: "c-emery", names: ["Emery Hart"] }));
    expect(asCoach).not.toContain("Caleb");
    expect(asCoach).toEqual(expect.arrayContaining(["Emery Hart", "Toby", "Jamila Rahman"]));
  });

  it("DP (flag false): owner viewing as a coach keeps the owner tier and the full list", () => {
    expect(taskRoleFor(ownerAsCoach, false)).toBe("owner");
    expect(taskRoleFor(ownerAsHead, false)).toBe("owner");
    const d = dir();
    expect(assignableFor(d, { role: taskRoleFor(ownerAsCoach, false), coachId: "c-emery", names: ["Toby"] })).toHaveLength(d.length);
  });

  it("not impersonating: unaffected by the flag", () => {
    expect(taskRoleFor({ role: "owner", realRole: "owner", isHeadCoach: false }, true)).toBe("owner");
    expect(taskRoleFor({ role: "coach", realRole: "coach", isHeadCoach: true }, true)).toBe("head_coach");
  });
});

describe("Today card uses the same matcher as the Tasks board", () => {
  const today = "2026-10-09";
  const tasks = [
    // Assigned by invite name before first login (assigned_to null).
    { id: "1", type: "Today", status: "todo", dueDate: today, assigneeName: "Jamila Rahman", assignedTo: null },
    // Assigned by users.id under an older name.
    { id: "2", type: "Today", status: "todo", dueDate: today, assigneeName: "J. Rahman", assignedTo: "u-jamila" },
    // Someone else's.
    { id: "3", type: "Today", status: "todo", dueDate: today, assigneeName: "Emery Hart", assignedTo: null },
    // Taskboard items for suggestions.
    { id: "4", type: "Ops", status: "todo", dueDate: "2026-10-12", assigneeName: "  jamila   rahman ", assignedTo: null },
    { id: "5", type: "Ops", status: "done", dueDate: "2026-10-10", assigneeName: "Jamila Rahman", assignedTo: null },
    { id: "6", type: "Ops", status: "todo", dueDate: "2026-10-11", assigneeName: "Unassigned", assignedTo: null },
  ];

  it("a task assigned by name before login shows on Today once the users row exists", () => {
    // Before login there is no viewer at all; after the claim the login is
    // users(id u-jamila, name = invite name).
    const viewer = { userId: "u-jamila", names: ["jamila rahman"] };
    expect(selectTodayItems(tasks, viewer, today).map((t) => t.id)).toEqual(["1", "2"]);
    expect(selectTodayItems(tasks, { userId: "u-x", names: ["Someone"] }, today)).toEqual([]);
  });

  it("suggestions: viewer's not-done board items by the same matcher, unassigned only when asked", () => {
    const viewer = { userId: "u-jamila", names: ["Jamila Rahman"] };
    expect(selectTodaySuggestions(tasks, viewer).map((t) => t.id)).toEqual(["4"]);
    expect(selectTodaySuggestions(tasks, viewer, { includeUnassigned: true }).map((t) => t.id)).toEqual(["6", "4"]);
  });
});
