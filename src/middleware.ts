// Access control (M5 gate + M6 auth).
//
// Two modes, switched by AUTH_MODE (default: gate-only):
//
//   gate-only (today): cookie-based password wall, NOT browser Basic Auth:
//   Chrome blocks Basic Auth prompts inside cross-origin iframes and the HQ
//   is embedded inside GHL via a Custom Menu Link iframe, so the gate is a
//   normal page that sets a cookie (SameSite=None so it survives the iframe
//   context). Enabled only when HQ_ACCESS_PASSWORD is set (local dev stays
//   open). The cookie carries a SHA-256 of the password: rotating the
//   password in Vercel invalidates every session.
//
//   AUTH_MODE=clerk (M6 activation): direct visits require a Clerk session
//   (redirect to /sign-in); per-user role comes from the users table via
//   src/lib/role-server.ts. EMBEDDED visits (the GHL iframe) deliberately
//   STAY on the password gate: third-party auth cookies inside a
//   cross-origin iframe are unreliable, and the GHL tabs are the owner's
//   view anyway (DEFAULT DECISION 24, flagged).
//
// Machine endpoints (/api/sync, /api/webhooks) are excluded by the matcher:
// their callers cannot carry cookies; both carry their own secret auth.

import { NextRequest, NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

const COOKIE = "hq_access";
const CLERK_MODE = process.env.AUTH_MODE === "clerk";

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Detect the GHL iframe (Sec-Fetch-Dest, or ?embed=1 for testing) and
 *  forward the fact to the layout so the shell can drop its own chrome. */
function embedPass(req: NextRequest): { embedded: boolean; pass: NextResponse } {
  const embedded =
    req.headers.get("sec-fetch-dest") === "iframe" ||
    req.nextUrl.searchParams.get("embed") === "1";
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-hq-embed", embedded ? "1" : "0");
  return { embedded, pass: NextResponse.next({ request: { headers: requestHeaders } }) };
}

/** Constant-time string comparison (audit 2026-07-02). Edge runtime has no
 *  node:crypto timingSafeEqual; comparing hex digests char-by-char with XOR
 *  avoids leaking a match prefix through response timing. */
function timingSafeEqual(a: string | undefined, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function passwordGate(req: NextRequest, pass: NextResponse): Promise<NextResponse> {
  const password = process.env.HQ_ACCESS_PASSWORD;
  if (!password) return pass; // gate disabled (local dev)
  const expected = await sha256Hex(password);
  if (timingSafeEqual(req.cookies.get(COOKIE)?.value, expected)) return pass;
  const gateUrl = new URL("/gate", req.url);
  gateUrl.searchParams.set("from", req.nextUrl.pathname);
  return NextResponse.redirect(gateUrl);
}

async function gateOnlyMiddleware(req: NextRequest) {
  const { pass } = embedPass(req);
  return passwordGate(req, pass);
}

const isPublicPath = (p: string) =>
  p === "/sign-in" ||
  p.startsWith("/sign-in/") ||
  p === "/sign-up" ||
  p.startsWith("/sign-up/");

const clerkModeMiddleware = clerkMiddleware(async (auth, req) => {
  const { embedded, pass } = embedPass(req);
  // GHL iframe keeps the cookie gate (decision 24).
  if (embedded) return passwordGate(req, pass);
  if (isPublicPath(req.nextUrl.pathname)) return pass;
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));
  return pass;
});

export default CLERK_MODE ? clerkModeMiddleware : gateOnlyMiddleware;

export const config = {
  // Everything except the gate itself, machine endpoints with their own
  // secret auth (sync cron, weekly-report cron, GHL webhooks: callers cannot
  // carry the gate cookie), Next internals, and static assets.
  matcher: [
    "/((?!gate|api/gate|api/sync|api/reports/weekly|api/webhooks|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|ico|webp)).*)",
  ],
};
