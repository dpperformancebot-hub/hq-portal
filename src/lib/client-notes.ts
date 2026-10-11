// Read layer for HQ-owned client notes (client_notes table). Server-only:
// uses the service-role dbAdmin client. Returns [] when persistence is off or
// the table is not yet created (the migration is owner-gated), so callers
// render an empty notes panel rather than erroring.

import { dbAdmin, persistenceEnabled } from "@/lib/db/client";

export type ClientNote = {
  id: string;
  clientId: string;
  coachId: string | null;
  authorName: string | null;
  body: string;
  createdAt: string;
};

export async function listClientNotes(clientId: string): Promise<ClientNote[]> {
  if (!clientId || !persistenceEnabled()) return [];
  try {
    const { data, error } = await dbAdmin()
      .from("client_notes")
      .select("id,client_id,coach_id,author_name,body,created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data.map((r) => ({
      id: r.id as string,
      clientId: r.client_id as string,
      coachId: (r.coach_id as string | null) ?? null,
      authorName: (r.author_name as string | null) ?? null,
      body: r.body as string,
      createdAt: r.created_at as string,
    }));
  } catch {
    // Table not present yet (migration not applied): treat as no notes.
    return [];
  }
}
