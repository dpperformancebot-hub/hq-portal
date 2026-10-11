"use server";

// R12-1: data for the half-screen client slide-over. Coaches open a client
// from the Check-ins grid, My Clients or Results WITHOUT navigating away, so
// closing returns them exactly where they were (the old behaviour dumped them
// on /my-clients). Scope is re-derived server-side: getCoachClientDetail
// returns null unless the client is on this coach's roster (head coach and
// owner see any), so a guessed clientId leaks nothing.

import { getCoachClientDetail } from "@/lib/data";
import { listClientSummaries } from "@/lib/check-in-summaries";
import { getServerIdentity } from "@/lib/role-server";
import type { ClientDetailData } from "@/lib/data";
import type { CheckInSummary } from "@/lib/check-in-summaries";

export type ClientPanelData = {
  detail: ClientDetailData;
  summaries: CheckInSummary[];
  canEditCheckIns: boolean;
};

export async function getClientPanelAction(clientId: string): Promise<ClientPanelData | null> {
  if (!clientId) return null;
  const identity = await getServerIdentity();
  const detail = await getCoachClientDetail(clientId, identity.linkedCoachId, identity);
  if (!detail) return null;
  const summaries = await listClientSummaries(clientId, identity);
  // Mirrors the check-ins grid rule (CHECKIN_EDITS_ADMIN_ONLY); the write
  // actions re-check regardless.
  const adminOnly = process.env.CHECKIN_EDITS_ADMIN_ONLY === "true";
  const canEditCheckIns = !adminOnly || identity.isHeadCoach || identity.realRole === "owner";
  return { detail, summaries, canEditCheckIns };
}
