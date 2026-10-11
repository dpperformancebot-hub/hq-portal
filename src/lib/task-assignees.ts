// Task assignee directory + "is this task mine" matching (2026-10-08).
//
// WHY: the taskboard stores assignment as a NAME (tasks.assignee_name), with
// the assigned_to -> users.id FK optional. The picker used to offer only the
// viewer (coach board) or the owner + coaches (owner board), so staff who had
// been invited but had not signed in yet (no users row) could never be given
// work. This module builds ONE directory from every source of "a person on
// this brand's team":
//
//   - the brand owner (BRAND.ownerName),
//   - every ACTIVE coach (coaches.is_active),
//   - every invite that is pending OR claimed and not revoked
//     (invites.clerk_status <> 'revoked'; a deleted invite is simply absent),
//   - every users row that is not deactivated (users.is_active <> false),
//
// deduped so one person is one row: a coach is keyed by coaches.id (their
// invite and users row fold into it), anyone else by normalised name. A
// coach-linked invite or login whose coach is inactive (e.g. the "kai testing"
// test coach) is dropped with it.
//
// Assigning stores assignee_name = the directory row's canonical name and
// assigned_to = the users.id when that person already has a login (else
// null). "My tasks" then matches the viewer's users id OR any of their names
// (linked coach name, users/invite name), normalised, so a task assigned
// before someone's first sign-in is waiting on their board when they arrive:
// the claim flow (role-server) creates their users row with the invite's name.
// No schema change.
//
// Pure and client-safe (no db, no server imports): the tasks page, the task
// server actions and the unit tests all call the same functions.

import type { TaskRole } from "@/lib/task-templates";
import { BRAND } from "@/lib/brand";

/** Lowercase, trim, collapse internal whitespace. "  Caleb  Smith " -> "caleb smith". */
export function normaliseName(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Role of a directory row: the portal login roles. */
export type StaffRole = "owner" | "admin" | "ops_manager" | "ambassador_mgr" | "coach" | "sales" | "va";

export type DirectoryEntry = {
  /** Canonical display name, stored as tasks.assignee_name. */
  name: string;
  role: StaffRole;
  /** coaches.id for a coach row, else null. */
  coachId: string | null;
  isHeadCoach: boolean;
  /** users.id once this person has signed in, else null. */
  userId: string | null;
  /** Every name this person is known by (coach row, invite, users row), normalised. */
  aliases: string[];
  /** True when a users row exists (has signed in at least once). */
  signedIn: boolean;
};

export type DirectoryCoachRow = { id: string; name: string; role?: string | null; is_active?: boolean | null };
export type DirectoryInviteRow = {
  id?: string;
  name: string;
  role: string;
  linked_coach_id?: string | null;
  claimed_at?: string | null;
  clerk_status?: string | null;
};
export type DirectoryUserRow = {
  id: string;
  name: string;
  role: string;
  linked_coach_id?: string | null;
  is_active?: boolean | null;
};

const STAFF_ROLES: StaffRole[] = ["owner", "admin", "ops_manager", "ambassador_mgr", "coach", "sales", "va"];
const asStaffRole = (r: string): StaffRole | null => ((STAFF_ROLES as string[]).includes(r) ? (r as StaffRole) : null);

/** Build the deduped assignee directory. Order: owner first, then by name. */
export function buildTaskDirectory(input: {
  ownerName: string;
  coaches: DirectoryCoachRow[];
  invites?: DirectoryInviteRow[];
  users?: DirectoryUserRow[];
}): DirectoryEntry[] {
  const byCoach = new Map<string, DirectoryEntry>();
  const byName = new Map<string, DirectoryEntry>();

  const addAlias = (e: DirectoryEntry, name: string) => {
    const k = normaliseName(name);
    if (k && !e.aliases.includes(k)) e.aliases.push(k);
    if (k && !byName.has(k)) byName.set(k, e);
  };

  const owner: DirectoryEntry = {
    name: input.ownerName,
    role: "owner",
    coachId: null,
    isHeadCoach: false,
    userId: null,
    aliases: [],
    signedIn: false,
  };
  addAlias(owner, input.ownerName);

  const activeCoach = new Map<string, DirectoryCoachRow>();
  for (const c of input.coaches) {
    if (c.is_active === false || !c.name?.trim()) continue;
    activeCoach.set(c.id, c);
    const e: DirectoryEntry = {
      name: c.name.trim(),
      role: "coach",
      coachId: c.id,
      isHeadCoach: c.role === "head_coach",
      userId: null,
      aliases: [],
      signedIn: false,
    };
    byCoach.set(c.id, e);
    addAlias(e, c.name);
  }

  // A person (invite or login) folds into an existing row when they are the
  // same coach, or share a normalised name; otherwise they become a new row.
  const fold = (p: { name: string; role: string; linkedCoachId: string | null; userId: string | null }) => {
    const role = asStaffRole(p.role);
    if (!role || !p.name?.trim()) return;
    if (role === "coach") {
      // A coach login/invite is only assignable through an ACTIVE coach row.
      if (!p.linkedCoachId || !activeCoach.has(p.linkedCoachId)) return;
      const e = byCoach.get(p.linkedCoachId)!;
      addAlias(e, p.name);
      if (p.userId) {
        e.userId = e.userId ?? p.userId;
        e.signedIn = true;
      }
      return;
    }
    const k = normaliseName(p.name);
    const existing = byName.get(k);
    if (existing) {
      if (p.userId && !existing.userId) {
        existing.userId = p.userId;
        existing.signedIn = true;
      }
      return;
    }
    const e: DirectoryEntry = {
      name: p.name.trim(),
      role,
      coachId: null,
      isHeadCoach: false,
      userId: p.userId,
      aliases: [],
      signedIn: !!p.userId,
    };
    addAlias(e, p.name);
  };

  for (const u of input.users ?? []) {
    if (u.is_active === false) continue;
    fold({ name: u.name, role: u.role, linkedCoachId: u.linked_coach_id ?? null, userId: u.id });
  }
  for (const inv of input.invites ?? []) {
    if ((inv.clerk_status ?? "").toLowerCase() === "revoked") continue;
    fold({ name: inv.name, role: inv.role, linkedCoachId: inv.linked_coach_id ?? null, userId: null });
  }

  const seen = new Set<DirectoryEntry>();
  const all: DirectoryEntry[] = [];
  for (const e of [owner, ...byCoach.values(), ...byName.values()]) {
    if (seen.has(e)) continue;
    seen.add(e);
    all.push(e);
  }
  const [first, ...rest] = all;
  return [first, ...rest.sort((a, b) => a.name.localeCompare(b.name))];
}

// --- Who may assign to whom. -----------------------------------------------

/** The assigner's task tier (TaskRole) plus who they are, so "self" is known. */
export type AssignerIdentity = {
  role: TaskRole;
  /** The assigner's linked coaches.id, when they are a coach. */
  coachId: string | null;
  /** Every name the assigner goes by (normalised or not). */
  names: string[];
};

/** Is this directory row the assigner themselves? */
export function isSelf(assigner: AssignerIdentity, target: DirectoryEntry): boolean {
  if (assigner.coachId && target.coachId === assigner.coachId) return true;
  const mine = new Set(assigner.names.map(normaliseName).filter(Boolean));
  return target.aliases.some((a) => mine.has(a));
}

/**
 * Task assignment rule (enforced server-side in tasks-actions, mirrored by
 * the picker):
 *   owner tier (owner, ops_manager) and head_of_ops (admin): anyone.
 *   head_coach: the coaching team (any active coach, themselves included).
 *   coach, va, sales: themselves, or owner/staff (anyone who is not a coach).
 * Template creation rights (creatableBy) are checked separately.
 */
export function canAssignTaskTo(assigner: AssignerIdentity, target: DirectoryEntry): boolean {
  if (assigner.role === "owner" || assigner.role === "head_of_ops") return true;
  if (assigner.role === "head_coach") return target.role === "coach";
  return isSelf(assigner, target) || target.role !== "coach";
}

/** The picker list for this assigner (directory order kept). */
export function assignableFor(directory: DirectoryEntry[], assigner: AssignerIdentity): DirectoryEntry[] {
  return directory.filter((e) => canAssignTaskTo(assigner, e));
}

/** Resolve a picked/typed assignee against the directory and the rule.
 *  Accepts the assigner's own name even when it is not in the directory (a
 *  dev-preview or not-yet-linked login adding to their own Today list). */
export function resolveAssignee(
  directory: DirectoryEntry[],
  assigner: AssignerIdentity,
  wanted: string,
): { ok: true; name: string; userId: string | null } | { ok: false; error: string } {
  const k = normaliseName(wanted);
  if (!k) return { ok: false, error: "Pick who this goes to." };
  const entry = directory.find((e) => e.aliases.includes(k));
  if (!entry) {
    if (assigner.names.some((n) => normaliseName(n) === k)) return { ok: true, name: wanted.trim(), userId: null };
    return { ok: false, error: `"${wanted.trim()}" is not an active team member. Pick someone from the list.` };
  }
  if (!canAssignTaskTo(assigner, entry)) {
    return {
      ok: false,
      error:
        assigner.role === "head_coach"
          ? "A head coach can assign tasks to coaches only."
          : "You can assign tasks to yourself or to the owner and staff only.",
    };
  }
  return { ok: true, name: entry.name, userId: entry.userId };
}

// --- "My tasks" matching. ---------------------------------------------------

/** Who the viewer is, for matching tasks to them. */
export type ViewerKeys = { userId?: string | null; names: string[] };

export function isTaskAssignedTo(
  task: { assigneeName: string; assignedTo?: string | null },
  viewer: ViewerKeys,
): boolean {
  if (viewer.userId && task.assignedTo && task.assignedTo === viewer.userId) return true;
  const k = normaliseName(task.assigneeName);
  return !!k && viewer.names.some((n) => normaliseName(n) === k);
}

export function isTaskOpenedBy(task: { openedBy?: string | null }, viewer: ViewerKeys): boolean {
  const k = normaliseName(task.openedBy);
  return !!k && viewer.names.some((n) => normaliseName(n) === k);
}

/** Map a server identity onto the taskboard tier (README semantics: admin =
 *  head_of_ops; ops_manager and the REAL owner = owner tier; va receives).
 *
 *  View-as (owner impersonating a coach): on a brand where view-as is exactly
 *  the coach's view (TJD, Brand.viewAsIsExactCoachView) the owner gets THAT
 *  coach's tier, so the picker list, template rights and the server-side
 *  assignment rule are the coach's / head coach's. DP keeps today's
 *  behaviour: the real owner keeps the owner tier while viewing as a coach.
 *  The flag is a parameter so both brands are testable in one process. */
export function taskRoleFor(
  id: { role: string; realRole: string; isHeadCoach: boolean; impersonating?: boolean },
  viewAsIsExactCoachView: boolean = BRAND.viewAsIsExactCoachView,
): TaskRole {
  const viewingAsCoach = !!id.impersonating && id.role === "coach";
  if (viewingAsCoach && viewAsIsExactCoachView) return id.isHeadCoach ? "head_coach" : "coach";
  if (id.realRole === "owner" || id.role === "ops_manager") return "owner";
  if (id.role === "coach") return id.isHeadCoach ? "head_coach" : "coach";
  if (id.role === "admin") return "head_of_ops";
  if (id.role === "va") return "va";
  return "sales";
}

// --- "Today I will" card (dashboard). --------------------------------------
// Same matcher as the Tasks board's "My tasks": users.id or any of the
// viewer's names, normalised.

type TodayTask = { type: string; status: string; dueDate: string | null; assigneeName: string; assignedTo?: string | null };
const isDoneStatus = (s: string) => s === "done" || s === "approved";

/** The viewer's "Today" rows due on `today`. */
export function selectTodayItems<T extends TodayTask>(tasks: T[], viewer: ViewerKeys, today: string): T[] {
  return tasks.filter((t) => t.type === "Today" && t.dueDate === today && isTaskAssignedTo(t, viewer));
}

/** Up to `limit` not-done taskboard items for the viewer (soonest due first),
 *  optionally including unowned rows (owner / VA boards only). */
export function selectTodaySuggestions<T extends TodayTask>(
  tasks: T[],
  viewer: ViewerKeys,
  opts: { includeUnassigned?: boolean; limit?: number; isDone?: (t: T) => boolean } = {},
): T[] {
  const done = opts.isDone ?? ((t: T) => isDoneStatus(t.status));
  return tasks
    .filter(
      (t) =>
        t.type !== "Today" &&
        !done(t) &&
        (isTaskAssignedTo(t, viewer) || (!!opts.includeUnassigned && t.assigneeName === "Unassigned")),
    )
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .slice(0, opts.limit ?? 3);
}
