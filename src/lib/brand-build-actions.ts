"use server";

// HQ-native create for the Building the Brand (brand_build_tasks) and Building
// the Team (hires) stores, migration 20260630000002. Server-side only: every
// write goes through the service-role dbAdmin() client and is gated by
// persistenceEnabled(), so the actions no-op with an honest message until the
// owner flips HQ_PERSISTENCE.
//
// Both tables are internal planning lists with no outbound path: they contact
// nobody. Do NOT add any send/outreach here. assignee_name / candidate are
// free text (no Clerk login user rows needed); status / stage default to the
// first column so a new card opens at the start of its board.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import type { BuildTask, Hire } from "@/lib/seed";
import { assertBrandManager } from "@/lib/role-server";

const BRAND_PATH = "/building-the-brand";
const TEAM_PATH = "/building-the-team";

type Result<T> = { ok: boolean; error?: string; data?: T };

const OFF: Result<never> = {
  ok: false,
  error: "Persistence is off. Saving goes live with the database.",
};

const TASK_STATUSES: BuildTask["status"][] = ["to-do", "in progress", "done"];
const HIRE_STAGES: Hire["stage"][] = ["Sourcing", "Interviewing", "Offer", "Hired"];

// --- brand_build_tasks ----------------------------------------------------

export async function createBrandBuildTaskAction(input: {
  title: string;
  status: BuildTask["status"];
  assignee: string;
}): Promise<Result<BuildTask>> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!persistenceEnabled()) return OFF;
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Task title is required." };
  const status = TASK_STATUSES.includes(input.status) ? input.status : "to-do";
  const assignee = input.assignee.trim() || "Unassigned";
  const { data, error } = await dbAdmin()
    .from("brand_build_tasks")
    .insert({ title, status, assignee_name: assignee })
    .select("id,title,status,assignee_name")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not add task." };
  const r = data as { id: string; title: string; status: BuildTask["status"]; assignee_name: string | null };
  revalidatePath(BRAND_PATH);
  return { ok: true, data: { id: r.id, title: r.title, status: r.status, assignee: r.assignee_name ?? "Unassigned" } };
}

// --- hires ----------------------------------------------------------------

export async function createHireAction(input: {
  role: string;
  candidate: string;
  stage: Hire["stage"];
}): Promise<Result<Hire>> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!persistenceEnabled()) return OFF;
  const role = input.role.trim();
  if (!role) return { ok: false, error: "Role is required." };
  const stage = HIRE_STAGES.includes(input.stage) ? input.stage : "Sourcing";
  const { data, error } = await dbAdmin()
    .from("hires")
    .insert({ role, candidate: input.candidate.trim() || null, stage })
    .select("id,role,candidate,stage")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not add role." };
  const r = data as { id: string; role: string; candidate: string | null; stage: Hire["stage"] };
  revalidatePath(TEAM_PATH);
  return { ok: true, data: { id: r.id, role: r.role, candidate: r.candidate ?? "", stage: r.stage } };
}
