"use server";

// HQ-native task CRUD (the tasks table). Every write goes through the
// service-role dbAdmin() client and is gated by persistenceEnabled(), so the
// actions no-op with an honest message until the owner flips HQ_PERSISTENCE.
//
// Tasks are an internal ops list with no outbound path: they contact nobody.
// Do NOT add any send/outreach here. Assignment is stored as assignee_name
// (text): the picker offers the team directory (listTaskDirectory: owner,
// active coaches, pending/claimed invitees, active logins), so it works before
// anyone has a login row. assigned_to (users.id) is set only when the assignee
// already has a users row; the assignee and the opener's rights are validated
// server-side (checkAssignee, src/lib/task-assignees.ts).
//
// Phase C: statuses are the kanban set (todo/in_progress/blocked/done/
// approved; legacy 'open' reads as todo). Every create stamps opened_by from
// the SESSION (never the client), and createTicketAction routes a ticket up
// the chain (C3): coach -> head coach, head coach -> owner, owner/VA -> owner.
// Pre-migration (20260804000002) the writes degrade honestly: new statuses
// report the missing migration, creates retry without the opened_by stamp.

import { revalidatePath } from "next/cache";
import { BRAND } from "@/lib/brand";
import { isOpsRole } from "@/lib/navigation";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";
import { headCoachName, listTaskDirectory } from "@/lib/tasks";
import {
  isTaskAssignedTo,
  isTaskOpenedBy,
  resolveAssignee,
  taskRoleFor,
  type AssignerIdentity,
} from "@/lib/task-assignees";
import { insertNotification } from "@/lib/notify";
import type { TaskStatus } from "@/lib/seed/types";

const PATH = "/tasks";
const STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked", "done", "approved"];

type Result<T = never> = { ok: boolean; error?: string; data?: T };

const OFF: Result = {
  ok: false,
  error: "Persistence is off. Saving tasks goes live with the database.",
};
const GONE = "This task is no longer in the datastore. Refresh to see the current list.";
const NEEDS_MIGRATION =
  "This needs a one-time database migration the owner must apply (20260804000002).";

const cleanType = (type: string | undefined) => type?.trim() || "Ops";

const isCheckViolation = (e: { code?: string; message?: string } | null) =>
  e?.code === "23514" || /tasks_status_check/i.test(e?.message ?? "");
const isMissingColumn = (e: { code?: string; message?: string } | null) =>
  e?.code === "42703" || /opened_by/i.test(e?.message ?? "");

/** The signed-in person's display name for the opened_by stamp: users.name in
 *  clerk mode, else the brand owner (dev preview default identity). Also
 *  returns what the assignment rule and "is this mine" matching need: the
 *  linked coach, the users.id, and every name this person goes by. */
async function resolveOpenerName(): Promise<{
  name: string;
  role: "owner" | "coach" | "head_coach" | "head_of_ops" | "va" | "sales";
  coachId: string | null;
  userId: string | null;
  names: string[];
}> {
  const id = await getServerIdentity();
  // README semantics: admin (Jameela) = head_of_ops; ops_manager maps to the
  // owner tier for template rights; va receives tasks and creates none.
  const role = taskRoleFor(id);
  const userId = id.userId ?? null;
  const coachId = id.role === "coach" ? id.linkedCoachId : null;
  // TJD view-as (Brand.viewAsIsExactCoachView): taskRoleFor already gave the
  // coach's tier, so the owner acts AS that coach here too (name, coachId),
  // and the assignment rule checks the coach's rights. DP: owner as before.
  const actsAsCoach = role === "coach" || role === "head_coach";
  if (id.realRole === "owner" && !actsAsCoach) {
    // Viewing as a coach: "mine" is still the owner's own tasks for the
    // permission checks (the real person acting), plus the display name.
    return { name: BRAND.ownerName, role, coachId, userId, names: [BRAND.ownerName, id.displayName ?? ""].filter(Boolean) };
  }
  if (id.role === "coach" && id.linkedCoachId) {
    const { data } = await dbAdmin()
      .from("coaches")
      .select("name")
      .eq("id", id.linkedCoachId)
      .maybeSingle();
    if (data?.name) {
      const name = data.name as string;
      // While impersonating, the owner's own login name/id are not the coach's.
      if (id.impersonating) return { name, role, coachId, userId: null, names: [name] };
      return { name, role, coachId, userId, names: [name, id.displayName ?? ""].filter(Boolean) };
    }
  }
  const name = id.displayName ?? "Team";
  return { name, role, coachId, userId, names: [name] };
}

/** Validate an assignee against the team directory and the assignment rule
 *  (task-assignees.canAssignTaskTo). Returns the canonical name to store and
 *  the users.id when that person already has a login. */
async function checkAssignee(
  opener: { role: AssignerIdentity["role"]; coachId: string | null; names: string[] },
  wanted: string,
): Promise<{ ok: true; name: string; userId: string | null } | { ok: false; error: string }> {
  const directory = await listTaskDirectory();
  return resolveAssignee(directory, { role: opener.role, coachId: opener.coachId, names: opener.names }, wanted);
}

async function insertTask(row: Record<string, unknown>): Promise<Result<{ id: string }>> {
  const withoutOpener = (r: Record<string, unknown>) => {
    const legacy = { ...r };
    delete legacy.opened_by;
    return legacy;
  };
  let { data, error } = await dbAdmin().from("tasks").insert(row).select("id").single();
  if (error && isMissingColumn(error)) {
    // opened_by column not migrated yet: create without the stamp.
    ({ data, error } = await dbAdmin().from("tasks").insert(withoutOpener(row)).select("id").single());
  }
  if (error && isCheckViolation(error)) {
    // 'todo' not in the legacy status check: store the legacy equivalent.
    ({ data, error } = await dbAdmin()
      .from("tasks")
      .insert({ ...row, status: "open" })
      .select("id")
      .single());
    if (error && isMissingColumn(error)) {
      ({ data, error } = await dbAdmin()
        .from("tasks")
        .insert({ ...withoutOpener(row), status: "open" })
        .select("id")
        .single());
    }
  }
  if (error || !data) return { ok: false, error: error?.message ?? "Could not add task." };
  revalidatePath(PATH);
  revalidatePath("/dashboard");
  return { ok: true, data: { id: data.id as string } };
}

export async function createTaskAction(input: {
  title: string;
  type: string;
  dueDate: string | null;
  assigneeName?: string | null;
}): Promise<Result<{ id: string }>> {
  if (!persistenceEnabled()) return OFF;
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Task title is required." };
  const opener = await resolveOpenerName();
  let assigneeName: string | null = null;
  let assignedTo: string | null = null;
  if (input.assigneeName?.trim()) {
    const who = await checkAssignee(opener, input.assigneeName);
    if (!who.ok) return { ok: false, error: who.error };
    assigneeName = who.name;
    assignedTo = who.userId;
  }
  return insertTask({
    title,
    type: cleanType(input.type),
    due_date: input.dueDate || null,
    assignee_name: assigneeName,
    ...(assignedTo ? { assigned_to: assignedTo } : {}),
    status: "todo",
    opened_by: opener.name,
  });
}

/** C3: submit a ticket. The assignee is DERIVED from the opener's role, never
 *  picked: coach tickets land on the head coach, head-coach tickets on the
 *  owner, everyone else's on the owner. */
export async function createTicketAction(input: {
  title: string;
  dueDate?: string | null;
}): Promise<Result<{ id: string; routedTo: string }>> {
  if (!persistenceEnabled()) return OFF;
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Ticket title is required." };
  const opener = await resolveOpenerName();
  let routedTo = BRAND.ownerName;
  if (opener.role === "coach") {
    routedTo = (await headCoachName()) ?? BRAND.ownerName;
  }
  const res = await insertTask({
    title,
    type: "Ticket",
    due_date: input.dueDate || null,
    assignee_name: routedTo,
    status: "todo",
    opened_by: opener.name,
  });
  if (!res.ok || !res.data) return { ok: false, error: res.error };
  return { ok: true, data: { id: res.data.id, routedTo } };
}

export async function updateTaskAction(
  id: string,
  patch: { title?: string; type?: string; dueDate?: string | null; assigneeName?: string | null },
): Promise<Result> {
  if (!id) return { ok: false, error: "id required" };
  if (!persistenceEnabled()) return OFF;
  const fields: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) return { ok: false, error: "Task title is required." };
    fields.title = title;
  }
  if (patch.type !== undefined) fields.type = cleanType(patch.type);
  if (patch.dueDate !== undefined) fields.due_date = patch.dueDate || null;
  if (patch.assigneeName !== undefined && !patch.assigneeName?.trim()) {
    fields.assignee_name = null;
    fields.assigned_to = null;
  }
  const reassign = patch.assigneeName?.trim() ? patch.assigneeName : null;
  if (Object.keys(fields).length === 0 && !reassign) return { ok: false, error: "Nothing to update." };
  const access = await assertTaskAccess(id, "edit");
  if (!access.ok) return access;
  if (reassign) {
    const who = await checkAssignee(await resolveOpenerName(), reassign);
    if (!who.ok) return { ok: false, error: who.error };
    fields.assignee_name = who.name;
    fields.assigned_to = who.userId;
  }
  const { data, error } = await dbAdmin().from("tasks").update(fields).eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: GONE };
  revalidatePath(PATH);
  return { ok: true };
}

export async function setTaskStatusAction(id: string, status: TaskStatus): Promise<Result> {
  if (!id) return { ok: false, error: "id required" };
  if (!STATUSES.includes(status)) return { ok: false, error: "invalid status" };
  if (!persistenceEnabled()) return OFF;
  const access = await assertTaskAccess(id, "edit");
  if (!access.ok) return access;
  let { data, error } = await dbAdmin().from("tasks").update({ status }).eq("id", id).select("id");
  if (error && isCheckViolation(error)) {
    // Legacy status constraint (pre-migration): todo maps to open; the other
    // new columns cannot be represented, say so honestly.
    if (status === "todo") {
      ({ data, error } = await dbAdmin()
        .from("tasks")
        .update({ status: "open" })
        .eq("id", id)
        .select("id"));
    } else if (status !== "done") {
      return { ok: false, error: NEEDS_MIGRATION };
    }
  }
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: GONE };
  // R6-1: completion stamp drives the 7-day archive window (best-effort:
  // the column arrives with migration 20260808000001), and the raiser gets a
  // notification row (mockup: "Complete notifies the raiser").
  if (status === "done") {
    await dbAdmin()
      .from("tasks")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", id)
      .then(() => {}, () => {});
    try {
      const { data: t } = await dbAdmin().from("tasks").select("title, opened_by, assignee_name").eq("id", id).maybeSingle();
      if (t?.opened_by && t.opened_by !== t.assignee_name) {
        await insertNotification({
          recipientName: t.opened_by as string,
          type: "task_completed",
          payload: { title: (t.title as string) ?? "", by: (t.assignee_name as string) ?? "" },
        });
      }
    } catch {
      /* best-effort */
    }
  }
  revalidatePath(PATH);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteTaskAction(id: string): Promise<Result> {
  if (!id) return { ok: false, error: "id required" };
  if (!persistenceEnabled()) return OFF;
  const access = await assertTaskAccess(id, "delete");
  if (!access.ok) return access;
  const { error } = await dbAdmin().from("tasks").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

// R5-2: pause/cancel task template. A coach files a pre-filled Pause or
// Cancel task for one of their clients; it AUTO-ASSIGNS to the VA (Jamila),
// who actions it in Newie + the training app and ticks it done. A Pause also
// creates the R4-1 pause-board row (best-effort: the task is the workflow
// record, the board row is the countdown view).
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function createPauseTicketAction(input: {
  kind: "Pause" | "Cancel";
  clientId: string;
  pauseStart: string;
  pauseEnd?: string | null;
  reason?: string;
}): Promise<Result<{ id: string; assignedTo: string }>> {
  if (input.kind !== "Pause" && input.kind !== "Cancel") return { ok: false, error: "Pick Pause or Cancel." };
  if (!input.clientId) return { ok: false, error: "Pick a client." };
  if (!ISO_DATE_RE.test(input.pauseStart)) return { ok: false, error: "A start date is required." };
  if (input.pauseEnd && !ISO_DATE_RE.test(input.pauseEnd)) return { ok: false, error: "End date must be a date." };
  const reason = (input.reason ?? "").trim().slice(0, 300);
  if (!persistenceEnabled()) return OFF;

  const identity = await getServerIdentity();
  const { data: client } = await dbAdmin()
    .from("clients")
    .select("name, coach_id")
    .eq("id", input.clientId)
    .maybeSingle();
  if (!client) return { ok: false, error: "Client not found." };
  const privileged =
    identity.realRole === "owner" || isOpsRole(identity.role) || (identity.role === "coach" && identity.isHeadCoach);
  if (!privileged) {
    if (identity.role !== "coach") return { ok: false, error: "No access." };
    if (client.coach_id !== identity.linkedCoachId) return { ok: false, error: "That client is not on your roster." };
  }

  // Route to the VA (Jamila); honest fallback to the owner when no VA login
  // exists yet.
  let assignedTo = BRAND.ownerName;
  const { data: va } = await dbAdmin().from("users").select("name").eq("role", "va").limit(1).maybeSingle();
  if (va?.name) assignedTo = va.name as string;

  const opener = await resolveOpenerName();
  const clientName = client.name as string;
  const window = `${input.pauseStart}${input.pauseEnd ? ` to ${input.pauseEnd}` : ""}`;
  const title = `${input.kind}: ${clientName} · ${window}${reason ? ` · ${reason}` : ""}`;

  const res = await insertTask({
    title,
    type: input.kind,
    status: "todo",
    assignee_name: assignedTo,
    opened_by: opener.name,
    due_date: input.pauseStart,
  });
  if (!res.ok || !res.data) return { ok: false, error: res.error ?? "Could not file the task." };

  // R4-1 tie-in: a Pause also lands on the pause board. Best-effort: the
  // board needs migration 20260807000002; the task alone still carries the
  // workflow if the table is absent.
  if (input.kind === "Pause") {
    try {
      await dbAdmin().from("client_pauses").insert({
        client_id: input.clientId,
        pause_start: input.pauseStart,
        pause_end: input.pauseEnd || null,
      });
      revalidatePath("/pauses");
    } catch {
      /* best-effort */
    }
  }

  return { ok: true, data: { id: res.data.id, assignedTo } };
}

// ---------------------------------------------------------------------------
// R6-1: taskboard v2 (Dan's mockup). Template-driven creation, blocked flow
// with a required reason, completion review/ack, and Jamila's escalation.
// Every v2 write appends to the activity log (audit trail for pause/cancel
// decisions). All degrade honestly pre-migration 20260808000001.

import { templateById, templateTitle, type TaskRole, type TemplateId } from "@/lib/task-templates";

const isMissingV2 = (error: { code?: string; message?: string } | null) =>
  error?.code === "42703" || /template|fields|blocked_reason|activity|is_new/i.test(error?.message ?? "");

async function taskRole(): Promise<{ role: TaskRole; name: string; names: string[]; userId: string | null }> {
  const opener = await resolveOpenerName();
  return { role: opener.role as TaskRole, name: opener.name, names: opener.names, userId: opener.userId };
}

/** SEC-AUDIT P1-5 (2026-09-06): the task mutations below resolved identity
 *  only to stamp the activity log, never to authorise, so any coach could
 *  edit, complete, block or delete ANY task by id. Rule:
 *    owner / head_of_ops (admin) / ops_manager / head coach  any task
 *    va                                                     tasks assigned to them, or they raised
 *    coach / sales                                          tasks they raised or are assigned
 *  Ownership is by name (the taskboard stamps opened_by / assignee_name with
 *  display names, not ids). Pre-v2 rows without opened_by fall back to the
 *  assignee only. A missing task is reported as GONE, not as a permission
 *  error, so the UI copy stays right. */
async function assertTaskAccess(
  id: string,
  mode: "edit" | "delete",
): Promise<{ ok: true; who: string; role: TaskRole } | { ok: false; error: string }> {
  const { role, name, names, userId } = await taskRole();
  const me = { userId, names };
  const privileged = role === "owner" || role === "head_of_ops" || role === "head_coach";
  const { data, error } = await dbAdmin()
    .from("tasks")
    .select("opened_by, assignee_name, assigned_to")
    .eq("id", id)
    .maybeSingle();
  if (error && isMissingColumn(error)) {
    // opened_by not migrated: only the assignee relation is knowable.
    const legacy = await dbAdmin().from("tasks").select("assignee_name, assigned_to").eq("id", id).maybeSingle();
    if (!legacy.data) return { ok: false, error: GONE };
    const mine = isTaskAssignedTo(
      { assigneeName: (legacy.data.assignee_name as string | null) ?? "", assignedTo: legacy.data.assigned_to as string | null },
      me,
    );
    if (privileged || (mode === "edit" && mine)) return { ok: true, who: name, role };
    return { ok: false, error: "That task is not yours to change." };
  }
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: GONE };
  if (privileged) return { ok: true, who: name, role };
  // Names match normalised, and a task assigned by users.id (assigned_to)
  // counts too, so work assigned before someone's first sign-in is theirs.
  const raised = isTaskOpenedBy({ openedBy: data.opened_by as string | null }, me);
  const assigned = isTaskAssignedTo(
    { assigneeName: (data.assignee_name as string | null) ?? "", assignedTo: data.assigned_to as string | null },
    me,
  );
  if (mode === "delete" ? raised : raised || assigned) return { ok: true, who: name, role };
  return { ok: false, error: mode === "delete" ? "Only the person who raised a task (or ops) can delete it." : "That task is not yours to change." };
}

const activityEntry = (who: string, what: string) => ({
  who,
  what,
  when: new Date().toISOString(),
});

async function appendActivity(id: string, who: string, what: string): Promise<void> {
  // Read-modify-write; concurrent edits may interleave but never drop the row.
  const { data } = await dbAdmin().from("tasks").select("activity").eq("id", id).maybeSingle();
  const log = Array.isArray(data?.activity) ? data?.activity : [];
  await dbAdmin()
    .from("tasks")
    .update({ activity: [...log, activityEntry(who, what)] })
    .eq("id", id);
}

/** R6-1: create a task from a template. Field validation and routing are
 *  server-side; client-name fields must match a real client (no typos, no
 *  orphans). */
export async function createTemplateTaskAction(input: {
  template: TemplateId;
  fields: Record<string, string>;
  /** Assignee for "picked"-routing templates; ignored for va-routed ones. */
  assigneeName?: string;
}): Promise<Result<{ id: string; assignedTo: string }>> {
  const tpl = templateById(input.template);
  if (!tpl) return { ok: false, error: "Unknown request type." };
  if (!persistenceEnabled()) return OFF;

  const { role, name: openerName } = await taskRole();
  if (!tpl.creatableBy.includes(role)) {
    return { ok: false, error: `Your role cannot raise a ${tpl.label.toLowerCase()}.` };
  }

  // Validate fields against the template skeleton; drop unknown keys.
  const fields: Record<string, string> = {};
  for (const f of tpl.fields) {
    const v = (input.fields[f.k] ?? "").trim().slice(0, 2000);
    if (f.required && !v) return { ok: false, error: `${f.label} is required.` };
    if (f.type === "date" && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return { ok: false, error: `${f.label} must be a date.` };
    }
    if (f.type === "select" && v && !(f.options ?? []).includes(v)) {
      return { ok: false, error: `${f.label}: pick one of the options.` };
    }
    if (v) fields[f.k] = v;
  }

  // Client fields must resolve to a real client (mockup rule: the picker
  // rejects free text so no orphaned records).
  const clientField = tpl.fields.find((f) => f.type === "client");
  if (clientField) {
    const wanted = fields[clientField.k];
    const { data: match } = await dbAdmin().from("clients").select("id").eq("name", wanted).limit(1).maybeSingle();
    if (!match) return { ok: false, error: `"${wanted}" is not in the client database. Add them there first.` };
  }

  // Routing: pause/cancel/admin go to the VA (Jamila); picked templates use
  // the chosen assignee (validated non-empty).
  let assignedTo = (input.assigneeName ?? "").trim();
  let assignedUserId: string | null = null;
  if (tpl.routing === "va") {
    assignedTo = BRAND.ownerName;
    const { data: va } = await dbAdmin().from("users").select("name").eq("role", "va").limit(1).maybeSingle();
    if (va?.name) assignedTo = va.name as string;
  } else if (!assignedTo) {
    return { ok: false, error: "Pick who this goes to." };
  } else {
    // Picked routing: the assignee must be a real, active team member (coach,
    // invitee or login) this opener may assign to. Stored as the canonical
    // name; assigned_to is set only when they already have a users row.
    const opener = await resolveOpenerName();
    const who = await checkAssignee(opener, assignedTo);
    if (!who.ok) return { ok: false, error: who.error };
    assignedTo = who.name;
    assignedUserId = who.userId;
  }

  const title = templateTitle(tpl, fields);
  const dueDate = fields.timeline ?? fields.start ?? fields.effective ?? fields.startDate ?? null;
  const row: Record<string, unknown> = {
    title,
    type: tpl.short,
    status: "todo",
    assignee_name: assignedTo,
    ...(assignedUserId ? { assigned_to: assignedUserId } : {}),
    opened_by: openerName,
    due_date: dueDate,
    template: tpl.id,
    fields,
    is_new: true,
    activity: [activityEntry(openerName, `raised the ${tpl.label.toLowerCase()}`)],
  };
  const res = await insertTask(row);
  if (!res.ok || !res.data) {
    // No silent legacy fallback (owner rule 2026-08-08): if the v2 columns
    // are missing, say so honestly instead of storing a degraded task.
    const missing = res.error && isMissingV2({ message: res.error });
    return {
      ok: false,
      error: missing
        ? "The taskboard needs a one-time database migration the owner must apply (20260808000001)."
        : res.error ?? "Could not raise the request.",
    };
  }

  // R6-5: dashboard-owned notification for the assignee (Slack delivery rides
  // the same row).
  await insertNotification({
    recipientName: assignedTo,
    type: "task_assigned",
    payload: { template: tpl.label, title, by: openerName },
  });

  // Pause requests also land on the R4-1 board (best-effort).
  if (tpl.id === "pause" && fields.client && fields.start) {
    try {
      const { data: client } = await dbAdmin().from("clients").select("id").eq("name", fields.client).limit(1).maybeSingle();
      if (client) {
        await dbAdmin().from("client_pauses").insert({
          client_id: client.id,
          pause_start: fields.start,
          pause_end: fields.end || null,
        });
        revalidatePath("/pauses");
      }
    } catch {
      /* best-effort */
    }
  }
  return { ok: true, data: { id: res.data.id, assignedTo } };
}

/** Blocked with a required reason (no silent blocking). */
export async function setBlockedAction(id: string, reason: string): Promise<Result> {
  const trimmed = reason.trim().slice(0, 500);
  if (!id || !trimmed) return { ok: false, error: "A blocked reason is required." };
  if (!persistenceEnabled()) return OFF;
  const access = await assertTaskAccess(id, "edit");
  if (!access.ok) return access;
  const name = access.who;
  let { error } = await dbAdmin().from("tasks").update({ status: "blocked", blocked_reason: trimmed }).eq("id", id);
  if (error && isMissingV2(error)) {
    ({ error } = await dbAdmin().from("tasks").update({ status: "blocked" }).eq("id", id));
  }
  if (error) return { ok: false, error: error.message };
  await appendActivity(id, name, `marked blocked: ${trimmed}`).catch(() => {});
  // R6-5: flag the block back to whoever raised the task.
  try {
    const { data: t } = await dbAdmin().from("tasks").select("title, opened_by").eq("id", id).maybeSingle();
    if (t?.opened_by) {
      await insertNotification({
        recipientName: t.opened_by as string,
        type: "task_blocked",
        payload: { title: (t.title as string) ?? "", by: name, reason: trimmed },
      });
    }
  } catch {
    /* best-effort */
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Unblock (optionally with a message back), returning to in-progress. */
export async function unblockAction(id: string, message?: string): Promise<Result> {
  if (!id) return { ok: false, error: "id required" };
  if (!persistenceEnabled()) return OFF;
  const access = await assertTaskAccess(id, "edit");
  if (!access.ok) return access;
  const name = access.who;
  let { error } = await dbAdmin().from("tasks").update({ status: "in_progress", blocked_reason: null }).eq("id", id);
  if (error && isMissingV2(error)) {
    ({ error } = await dbAdmin().from("tasks").update({ status: "in_progress" }).eq("id", id));
  }
  if (error) return { ok: false, error: error.message };
  const note = (message ?? "").trim().slice(0, 500);
  await appendActivity(id, name, note ? `unblocked: ${note}` : "unblocked").catch(() => {});
  revalidatePath(PATH);
  return { ok: true };
}

/** Raiser acknowledges a completion (the review strip's Clear): done ->
 *  approved, which drops it from the strip. */
export async function ackTaskAction(id: string): Promise<Result> {
  if (!id) return { ok: false, error: "id required" };
  if (!persistenceEnabled()) return OFF;
  const access = await assertTaskAccess(id, "edit");
  if (!access.ok) return access;
  const name = access.who;
  const { error } = await dbAdmin().from("tasks").update({ status: "approved" }).eq("id", id).eq("status", "done");
  if (error) return { ok: false, error: error.message };
  await appendActivity(id, name, "reviewed and cleared").catch(() => {});
  revalidatePath(PATH);
  return { ok: true };
}

/** Jamila escalates a pause/cancel to the owner with a note: reassigns (it
 *  leaves her board) and resets to not-started. Owner can also do it. */
export async function escalateTaskAction(id: string, note: string): Promise<Result> {
  const trimmed = note.trim().slice(0, 500);
  if (!id || !trimmed) return { ok: false, error: "An escalation note is required." };
  if (!persistenceEnabled()) return OFF;
  const { role, name } = await taskRole();
  // README: head_of_ops (Jameela) is the only escalator; owner is her backup.
  if (role !== "head_of_ops" && role !== "owner") {
    return { ok: false, error: "Only head of ops (or the owner) can escalate." };
  }
  const { data: task } = await dbAdmin().from("tasks").select("template").eq("id", id).maybeSingle();
  if (task && task.template && task.template !== "pause" && task.template !== "cancel") {
    return { ok: false, error: "Only pause/cancel requests escalate." };
  }
  const { error } = await dbAdmin()
    .from("tasks")
    .update({ status: "todo", assignee_name: BRAND.ownerName })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await appendActivity(id, name, `escalated to ${BRAND.ownerName}: ${trimmed}`).catch(() => {});
  // R6-5: the owner hears about escalations without opening the portal.
  try {
    const { data: t } = await dbAdmin().from("tasks").select("title").eq("id", id).maybeSingle();
    await insertNotification({
      recipientName: BRAND.ownerName,
      type: "task_escalated",
      payload: { title: (t?.title as string) ?? "", by: name, note: trimmed },
    });
  } catch {
    /* best-effort */
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Clear the "New" badge when the assignee opens the card. Fire-and-forget. */
export async function markTaskSeenAction(id: string): Promise<Result> {
  if (!id || !persistenceEnabled()) return { ok: true };
  const access = await assertTaskAccess(id, "edit");
  if (!access.ok) return { ok: true }; // fire-and-forget: silently ignore, never write
  await dbAdmin().from("tasks").update({ is_new: false }).eq("id", id).then(() => {}, () => {});
  return { ok: true };
}
