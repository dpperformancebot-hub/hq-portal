"use server";

// HQ-native CRUD for the Content Planner (content_posts) and Collaborations
// (collaborations) stores. Server-side only: every write goes through the
// service-role dbAdmin() client and is gated by persistenceEnabled(), so the
// actions no-op with an honest message until the owner flips HQ_PERSISTENCE.
//
// These tables are internal planning data with no outbound path: they contact
// nobody. Do NOT add any send/outreach here.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import type { Collaboration, ContentPost, PostType } from "@/lib/seed";
import { assertBrandManager } from "@/lib/role-server";

const PLANNER_PATH = "/content-planner";
const COLLAB_PATH = "/content-collaborations";

const POST_TYPES: PostType[] = ["Reel", "Post", "Story", "YouTube", "Email"];
const COLLAB_STATUSES: Collaboration["status"][] = ["planned", "to-do", "done"];

type Result<T> = { ok: boolean; error?: string; data?: T };

const OFF: Result<never> = {
  ok: false,
  error: "Persistence is off. Saving goes live with the database.",
};

const clampDay = (day: number) => Math.max(0, Math.min(6, Math.round(day)));

// --- content_posts --------------------------------------------------------

export async function createContentPost(input: {
  account: string;
  day: number;
  type: PostType;
  title: string;
}): Promise<Result<ContentPost>> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!persistenceEnabled()) return OFF;
  const title = input.title.trim();
  const account = input.account.trim();
  if (!title) return { ok: false, error: "Post title is required." };
  if (!account) return { ok: false, error: "Account is required." };
  const type = POST_TYPES.includes(input.type) ? input.type : "Post";
  const { data, error } = await dbAdmin()
    .from("content_posts")
    .insert({ account, day: clampDay(input.day), type, title })
    .select("id,account,day,type,title")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not add post." };
  revalidatePath(PLANNER_PATH);
  return { ok: true, data: data as ContentPost };
}

export async function updateContentPost(
  id: string,
  patch: { account?: string; day?: number; type?: PostType; title?: string },
): Promise<Result<ContentPost>> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!persistenceEnabled()) return OFF;
  const fields: Record<string, unknown> = {};
  if (patch.account !== undefined) {
    const account = patch.account.trim();
    if (!account) return { ok: false, error: "Account is required." };
    fields.account = account;
  }
  if (patch.day !== undefined) fields.day = clampDay(patch.day);
  if (patch.type !== undefined) fields.type = POST_TYPES.includes(patch.type) ? patch.type : "Post";
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) return { ok: false, error: "Post title is required." };
    fields.title = title;
  }
  if (Object.keys(fields).length === 0) return { ok: false, error: "Nothing to update." };
  const { data, error } = await dbAdmin()
    .from("content_posts")
    .update(fields)
    .eq("id", id)
    .select("id,account,day,type,title")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not update post." };
  revalidatePath(PLANNER_PATH);
  return { ok: true, data: data as ContentPost };
}

export async function deleteContentPost(id: string): Promise<Result<never>> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!persistenceEnabled()) return OFF;
  const { error } = await dbAdmin().from("content_posts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PLANNER_PATH);
  return { ok: true };
}

// --- collaborations -------------------------------------------------------

export async function createCollaboration(input: {
  title: string;
  assignee: string;
  status: Collaboration["status"];
}): Promise<Result<Collaboration>> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!persistenceEnabled()) return OFF;
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };
  const status = COLLAB_STATUSES.includes(input.status) ? input.status : "planned";
  const { data, error } = await dbAdmin()
    .from("collaborations")
    .insert({ title, assignee: input.assignee.trim() || "Unassigned", status })
    .select("id,title,assignee,status")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not add collaboration." };
  revalidatePath(COLLAB_PATH);
  return { ok: true, data: data as Collaboration };
}

export async function updateCollaboration(
  id: string,
  patch: { title?: string; assignee?: string; status?: Collaboration["status"] },
): Promise<Result<Collaboration>> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!persistenceEnabled()) return OFF;
  const fields: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) return { ok: false, error: "Title is required." };
    fields.title = title;
  }
  if (patch.assignee !== undefined) fields.assignee = patch.assignee.trim() || "Unassigned";
  if (patch.status !== undefined) {
    fields.status = COLLAB_STATUSES.includes(patch.status) ? patch.status : "planned";
  }
  if (Object.keys(fields).length === 0) return { ok: false, error: "Nothing to update." };
  const { data, error } = await dbAdmin()
    .from("collaborations")
    .update(fields)
    .eq("id", id)
    .select("id,title,assignee,status")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not update collaboration." };
  revalidatePath(COLLAB_PATH);
  return { ok: true, data: data as Collaboration };
}

export async function deleteCollaboration(id: string): Promise<Result<never>> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!persistenceEnabled()) return OFF;
  const { error } = await dbAdmin().from("collaborations").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(COLLAB_PATH);
  return { ok: true };
}
