"use server";

// HQ-native client notes CRUD (the client_notes table). Internal ops notes a
// coach or owner writes on a client; they contact nobody, so there is NO
// outbound path here (do not add a send). Every write goes through the
// service-role dbAdmin() client and is gated by persistenceEnabled(); the
// author (and coach scope) is derived server-side from the signed-in identity,
// never trusted from the client.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";

type Result<T = never> = { ok: boolean; error?: string; data?: T };

const OFF: Result = {
  ok: false,
  error: "Persistence is off. Notes go live with the database.",
};
// The client_notes migration (20260630000001) is owner-gated; until applied,
// inserts hit a missing relation. Translate that into an honest message.
const NO_TABLE =
  "Client notes need a one-time database migration the owner must apply (20260630000001). It is written, not yet applied.";

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "42P01" || /relation .*client_notes.* does not exist/i.test(error?.message ?? "");
}

function revalidateClient(clientId: string) {
  revalidatePath(`/client-database/${clientId}`);
  revalidatePath(`/my-clients/${clientId}`);
}

// The display name + coach scope for the current writer. Owner -> "Owner", null
// coach. Coach (or owner impersonating a coach) -> the coach's name + id.
async function author(): Promise<{ name: string; coachId: string | null }> {
  const id = await getServerIdentity();
  if (id.role === "coach" && id.linkedCoachId) {
    const { data } = await dbAdmin().from("coaches").select("name").eq("id", id.linkedCoachId).maybeSingle();
    return { name: (data?.name as string | undefined) ?? "Coach", coachId: id.linkedCoachId };
  }
  return { name: "Owner", coachId: null };
}

export async function createClientNoteAction(input: {
  clientId: string;
  body: string;
}): Promise<Result<{ id: string }>> {
  if (!input.clientId) return { ok: false, error: "clientId required" };
  if (!persistenceEnabled()) return OFF;
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Note can't be empty." };
  // Roster scope (2026-07-11 audit): a plain coach only writes notes on their
  // own clients; head coach, owner, and VA may note anyone.
  const identity = await getServerIdentity();
  if (identity.role === "coach" && !identity.isHeadCoach) {
    const { data: client } = await dbAdmin()
      .from("clients")
      .select("coach_id")
      .eq("id", input.clientId)
      .maybeSingle();
    if (!client || client.coach_id !== identity.linkedCoachId) {
      return { ok: false, error: "That client is not on your roster." };
    }
  }
  const who = await author();
  const { data, error } = await dbAdmin()
    .from("client_notes")
    .insert({ client_id: input.clientId, coach_id: who.coachId, author_name: who.name, body })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: isMissingTable(error) ? NO_TABLE : error?.message ?? "Could not save note." };
  revalidateClient(input.clientId);
  return { ok: true, data: { id: data.id as string } };
}

export async function deleteClientNoteAction(id: string, clientId: string): Promise<Result> {
  if (!id) return { ok: false, error: "id required" };
  if (!persistenceEnabled()) return OFF;
  // Ownership gate (2026-07-11 audit): a plain coach may only delete their
  // OWN notes; owner and head coach may delete any (moderation).
  const identity = await getServerIdentity();
  if (identity.realRole !== "owner" && !identity.isHeadCoach) {
    if (identity.role !== "coach" || !identity.linkedCoachId) {
      return { ok: false, error: "You do not have access to delete notes." };
    }
    const { data: note } = await dbAdmin().from("client_notes").select("coach_id").eq("id", id).maybeSingle();
    if (!note || note.coach_id !== identity.linkedCoachId) {
      return { ok: false, error: "You can only delete your own notes." };
    }
  }
  const { error } = await dbAdmin().from("client_notes").delete().eq("id", id);
  if (error) return { ok: false, error: isMissingTable(error) ? NO_TABLE : error.message };
  if (clientId) revalidateClient(clientId);
  return { ok: true };
}
