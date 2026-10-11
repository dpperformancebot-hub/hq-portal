// A8: "Open their portal" opens in a NEW TAB. Server actions can only swap
// the current tab, so the button window.open()s this GET route instead: it
// re-validates the REAL owner (same rule as startImpersonation, which stays
// for the exit path), sets the impersonation cookies, and lands the new tab
// on the coach's dashboard. Non-owners get bounced with no cookie set.
//
// Honest limitation: impersonation is cookie-scoped (whole session), so the
// ORIGINAL tab also renders as the coach if the owner navigates it before
// exiting. The new tab keeps the owner's place; Exit to admin returns to
// returnTo exactly as before.

import { type NextRequest, NextResponse } from "next/server";
import { getServerIdentity } from "@/lib/role-server";

const IMPERSONATE_COOKIE = "hq-impersonate-coach";
const RETURN_COOKIE = "hq-impersonate-return";
const COOKIE_OPTS = {
  path: "/",
  maxAge: 60 * 60 * 8,
  sameSite: "lax",
  httpOnly: true,
} as const;

// Same-origin internal paths only (mirrors impersonation-actions).
function safeReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export async function GET(req: NextRequest) {
  const identity = await getServerIdentity();
  const coachId = req.nextUrl.searchParams.get("coachId") ?? "";
  const returnTo = safeReturnPath(req.nextUrl.searchParams.get("returnTo"));
  const res = NextResponse.redirect(new URL("/dashboard", req.url));
  if (identity.realRole !== "owner" || !coachId) return res;
  res.cookies.set(IMPERSONATE_COOKIE, coachId, COOKIE_OPTS);
  if (returnTo) res.cookies.set(RETURN_COOKIE, returnTo, COOKIE_OPTS);
  else res.cookies.delete(RETURN_COOKIE);
  return res;
}
