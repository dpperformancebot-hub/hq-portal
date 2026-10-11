// Gate check: verifies the access password and sets the access cookie.
// SameSite=None + Secure so the cookie works when the HQ runs inside the
// GHL Custom Menu Link iframe (third-party context).

import { NextRequest, NextResponse } from "next/server";

const COOKIE = "hq_access";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: NextRequest) {
  const password = process.env.HQ_ACCESS_PASSWORD;
  if (!password) return NextResponse.json({ error: "Gate not configured" }, { status: 500 });

  const form = await req.formData();
  const attempt = String(form.get("password") ?? "");
  const from = String(form.get("from") ?? "/dashboard");
  // Only allow internal redirect targets.
  const target = from.startsWith("/") && !from.startsWith("//") ? from : "/dashboard";

  if (attempt !== password) {
    const back = new URL("/gate", req.url);
    back.searchParams.set("from", target);
    back.searchParams.set("error", "1");
    return NextResponse.redirect(back, 303);
  }

  // Production (HTTPS, GHL iframe): SameSite=None + Secure, required for the
  // third-party iframe context. Local dev (plain HTTP): Lax, since Chrome
  // refuses None without Secure and refuses Secure without HTTPS.
  const prod = process.env.NODE_ENV === "production";
  const res = NextResponse.redirect(new URL(target, req.url), 303);
  res.cookies.set(COOKIE, await sha256Hex(password), {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? "none" : "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  return res;
}
