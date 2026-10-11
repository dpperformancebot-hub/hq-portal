// HQ-native tasks, persisted in Supabase. Read layer only (the writes live in
// src/lib/tasks-actions.ts). Server-side only (service-role client); call from
// server components. Assignment is by name (tasks.assignee_name): the picker
// offers the owner + active coaches, no Clerk dependency. The legacy
// assigned_to -> users join stays as a fallback for assigneeName.
//
// Phase C: tasks are a status kanban (todo/in_progress/blocked/done/approved)
// with an opened_by stamp. Legacy 'open' rows read as "todo". The opened_by
// column arrives with migration 20260804000002; until it is applied the
// select falls back to the legacy column list.

import { dbAdmin } from "@/lib/db/client";
import { BRAND } from "@/lib/brand";
import type { Task, TaskStatus } from "@/lib/seed/types";
import {
  buildTaskDirectory,
  type DirectoryCoachRow,
  type DirectoryEntry,
  type DirectoryInviteRow,
  type DirectoryUserRow,
} from "@/lib/task-assignees";

type TaskRow = {
  id: string;
  title: string;
  type: string;
  due_date: string | null;
  status: string;
  assigned_to: string | null;
  assignee_name: string | null;
  created_at?: string | null;
  opened_by?: string | null;
  // R6-1 taskboard v2 columns (migration 20260808000001); absent until applied.
  template?: string | null;
  fields?: Record<string, string> | null;
  blocked_reason?: string | null;
  completed_at?: string | null;
  activity?: { who: string; what: string; when: string }[] | null;
  is_new?: boolean | null;
  users: { name: string } | null; // embedded via the assigned_to FK
};

const LEGACY_COLS = "id,title,type,due_date,status,assigned_to,assignee_name,created_at,users(name)";
const C2_COLS = `${LEGACY_COLS},opened_by`;
const COLS = `${C2_COLS},template,fields,blocked_reason,completed_at,activity,is_new`;

const STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked", "done", "approved"];

function toStatus(raw: string): TaskStatus {
  if (raw === "open") return "todo";
  return (STATUSES as string[]).includes(raw) ? (raw as TaskStatus) : "todo";
}

function toTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    assigneeName: r.assignee_name ?? r.users?.name ?? "Unassigned",
    type: r.type,
    dueDate: r.due_date,
    status: toStatus(r.status),
    assignedTo: r.assigned_to,
    openedBy: r.opened_by ?? null,
    createdAt: r.created_at ? r.created_at.slice(0, 10) : null,
    template: r.template ?? null,
    fields: r.fields ?? null,
    blockedReason: r.blocked_reason ?? null,
    completedAt: r.completed_at ?? null,
    activity: Array.isArray(r.activity) ? r.activity : [],
    isNew: r.is_new ?? false,
  };
}

export async function listTasks(): Promise<Task[]> {
  const primary = await dbAdmin()
    .from("tasks")
    .select(COLS)
    .order("due_date", { ascending: true, nullsFirst: false });
  // Fallback chain: v2 columns (20260808000001) -> C2 opened_by
  // (20260804000002) -> legacy.
  const c2 = primary.error
    ? await dbAdmin().from("tasks").select(C2_COLS).order("due_date", { ascending: true, nullsFirst: false })
    : primary;
  const res = c2.error
    ? await dbAdmin().from("tasks").select(LEGACY_COLS).order("due_date", { ascending: true, nullsFirst: false })
    : c2;
  return ((res.data ?? []) as unknown as TaskRow[]).map(toTask);
}

export type TaskAssignee = {
  id: string;
  name: string;
  /** Picker hint, e.g. "Coach · not signed in yet". Optional for old callers. */
  detail?: string;
};

/** Every assignable person on this brand's team, deduped (see
 *  src/lib/task-assignees.ts): owner, active coaches, pending/claimed
 *  non-revoked invites and active logins, so invitees are assignable before
 *  their first sign-in. select("*") on invites/users keeps optional columns
 *  (clerk_status, is_active) tolerant of an unapplied migration. Each source
 *  degrades to empty on error rather than failing the board. */
export async function listTaskDirectory(): Promise<DirectoryEntry[]> {
  const db = dbAdmin();
  const [coaches, invites, users] = await Promise.all([
    db.from("coaches").select("id,name,role,is_active"),
    db.from("invites").select("*"),
    db.from("users").select("*"),
  ]);
  return buildTaskDirectory({
    ownerName: BRAND.ownerName,
    coaches: ((coaches.error ? [] : coaches.data) ?? []) as DirectoryCoachRow[],
    invites: ((invites.error ? [] : invites.data) ?? []) as DirectoryInviteRow[],
    users: ((users.error ? [] : users.data) ?? []) as DirectoryUserRow[],
  });
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  ops_manager: "Ops manager",
  ambassador_mgr: "Ambassador manager",
  coach: "Coach",
  sales: "Sales",
  va: "VA",
};

/** Directory rows -> picker options (value = canonical name). */
export function toTaskAssignees(entries: DirectoryEntry[]): TaskAssignee[] {
  return entries.map((e) => {
    const role = e.role === "coach" && e.isHeadCoach ? "Head coach" : ROLE_LABEL[e.role] ?? e.role;
    const waiting = e.role !== "owner" && !e.signedIn ? " · not signed in yet" : "";
    return { id: e.name, name: e.name, detail: `${role}${waiting}` };
  });
}

/** The head coach's display name (ticket routing target for coach-submitted
 *  tickets, C3). Null when no head coach row exists. */
export async function headCoachName(): Promise<string | null> {
  const { data } = await dbAdmin()
    .from("coaches")
    .select("name")
    .eq("role", "head_coach")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return (data?.name as string | undefined) ?? null;
}
