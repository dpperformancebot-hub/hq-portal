// Global search index for the Cmd+K palette. Loaded once on first open and
// filtered client-side. Behind the same gate/auth as the rest of the HQ (the
// browser carries the gate cookie / Clerk session), so no extra auth here.

import { NextResponse } from "next/server";
import { buildSearchIndex } from "@/lib/search-index";
import { getServerIdentity } from "@/lib/role-server";

export async function GET() {
  // SEC-AUDIT P0-2: the full identity (not just the role) drives entity
  // scoping, so a plain coach only ever gets their own roster back.
  const identity = await getServerIdentity();
  const items = await buildSearchIndex({
    role: identity.role,
    realRole: identity.realRole,
    isHeadCoach: identity.isHeadCoach,
    linkedCoachId: identity.linkedCoachId,
  });
  return NextResponse.json({ items });
}
