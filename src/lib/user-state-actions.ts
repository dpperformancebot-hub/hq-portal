"use server";

// Per-LOGIN portal state (2026-07-02, owner request: portal state must follow
// the login, not the browser). Generic jsonb key/value on the user_state
// table (migration 20260702000001). Used for quiz best scores and recipe
// favourites; extend with new state_keys freely.
//
// Best-effort by design: callers keep localStorage as the working fallback,
// so a missing table (migration not applied) or persistence-off environment
// degrades silently to the old behaviour. Internal state only, NO outbound
// path. The user key is resolved SERVER-side (never trusted from the client):
// the Clerk user id in clerk mode, else a dev-preview scope.

import { cookies } from "next/headers";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { clerkAuthEnabled } from "@/lib/role-server";

type Result = { ok: boolean; error?: string };

async function userKey(): Promise<string | null> {
  if (clerkAuthEnabled()) {
    try {
      const { auth } = await import("@clerk/nextjs/server");
      const { userId } = await auth();
      return userId ?? null;
    } catch {
      return null;
    }
  }
  const jar = await cookies();
  return `dev:${jar.get("hq-dev-role")?.value ?? "owner"}`;
}

/** Read one state value for the signed-in user. null = nothing stored (or
 *  persistence off / migration not applied); callers fall back to local. */
export async function getUserStateAction(stateKey: string): Promise<unknown | null> {
  if (!stateKey || !persistenceEnabled()) return null;
  try {
    const key = await userKey();
    if (!key) return null;
    const { data, error } = await dbAdmin()
      .from("user_state")
      .select("value")
      .eq("user_key", key)
      .eq("state_key", stateKey)
      .maybeSingle();
    if (error || !data) return null;
    return data.value;
  } catch {
    return null;
  }
}

/** Upsert one state value for the signed-in user. */
export async function setUserStateAction(stateKey: string, value: unknown): Promise<Result> {
  if (!stateKey) return { ok: false, error: "stateKey required" };
  if (!persistenceEnabled()) return { ok: false, error: "off" };
  try {
    const key = await userKey();
    if (!key) return { ok: false, error: "no user" };
    const { error } = await dbAdmin()
      .from("user_state")
      .upsert({ user_key: key, state_key: stateKey, value }, { onConflict: "user_key,state_key" });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}
