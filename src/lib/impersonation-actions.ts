"use server";

// Admin "Open their portal": an owner or head coach views a coach's portal
// exactly as that coach sees it. Enforced server-side so it works under real
// Clerk auth (the dev cookie + setRole path is inert once the role is
// server-locked).
//
// Security: only a REAL owner or REAL head coach may start impersonation.
// getServerIdentity keeps realRole/realIsHeadCoach stable while already
// impersonating, so re-clicking is safe; a plain coach (or a forged cookie on
// a plain-coach session) is rejected there and here.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerIdentity } from "@/lib/role-server";

const IMPERSONATE_COOKIE = "hq-impersonate-coach";
// Where to send the owner when they exit: the page they were on when they
// clicked "Open their portal", so exiting is a true round-trip.
const RETURN_COOKIE = "hq-impersonate-return";
const COOKIE_OPTS = {
  path: "/",
  maxAge: 60 * 60 * 8, // 8 hours
  sameSite: "lax",
  httpOnly: true,
} as const;

// Only honour an internal, same-origin path on exit (defends against an open
// redirect if the cookie were ever tampered with).
function safeReturnPath(value: string | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export async function startImpersonation(coachId: string, returnTo: string): Promise<void> {
  const id = await getServerIdentity();
  // OWNER-ONLY (2026-07-11): the head coach reviews coaches via the read-only
  // overview (/coach-overview/[coachId]), never inside their portal.
  if (id.realRole !== "owner" || !coachId) return;
  const jar = await cookies();
  jar.set(IMPERSONATE_COOKIE, coachId, COOKIE_OPTS);
  const back = safeReturnPath(returnTo);
  if (back) jar.set(RETURN_COOKIE, back, COOKIE_OPTS);
  else jar.delete(RETURN_COOKIE);
  redirect("/dashboard");
}

export async function stopImpersonation(): Promise<void> {
  // Resolve the real identity BEFORE clearing the cookie: the exit fallback
  // differs (owner -> Coach Overview, head coach -> their own dashboard).
  const id = await getServerIdentity();
  const jar = await cookies();
  const back = safeReturnPath(jar.get(RETURN_COOKIE)?.value);
  jar.delete(IMPERSONATE_COOKIE);
  jar.delete(RETURN_COOKIE);
  redirect(back ?? (id.realRole === "owner" ? "/coach-overview" : "/dashboard"));
}
