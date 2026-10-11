// ⚠️ SUPERSEDED 2026-09-08 — DO NOT RUN.
// The QA pass this was written for now uses Clerk actor tokens (dashboard
// impersonation) instead: no password writes, no session revocation, no
// instance-wide auth toggle, and the audit trail keeps an `act` claim so QA
// actions are not attributed to the coach. This script is kept only as a
// record of the approach that was considered and rejected.
// Running it rewrites real coaches' passwords and signs them out. It must not
// be run again without a fresh owner decision.
//
// QA pass prep (FEEDBACK-V2, 2026-09-08): set a temporary password on the DP
// coach Clerk accounts so Dan's VA can walk each coach portal before the
// coaches themselves use it. DRY RUN by default.
//
//   node scripts/qa-temp-password.mjs                      # report only
//   node scripts/qa-temp-password.mjs --db-only            # skip Clerk (no key)
//   node scripts/qa-temp-password.mjs --clerk-env FILE     # sk_live lives here
//   node scripts/qa-temp-password.mjs --apply              # WRITE (owner go)
//
// Targets = every Clerk user on the instance whose PORTAL role resolves to
// "coach" (users.role, else a claimed/unclaimed invite's role — the same
// resolution reconcile-clerk-users.mjs uses). Nothing else is ever a target.
//
// --apply does two writes per target, in order:
//   1. PATCH /v1/users/:id   { password }   -- the temp password
//   2. revoke every active session so nothing is left signed in
// It reports email + ok/failed + reason per user. The password is read from a
// file, is never an argv value (argv is world-readable via ps), and is never
// printed, logged, or written anywhere by this script.
//
// SAFETY RAILS, all fail-loud (the script exits non-zero rather than skipping):
//   * DP Supabase ref guard    -- refuses to run against any other project
//   * NEVER_TOUCH list         -- owner/admin/finance/out-of-scope addresses.
//                                 If one of them resolves INTO the coach
//                                 target list the run aborts; it is a signal
//                                 that role resolution is wrong, not a row to
//                                 quietly drop.
//   * password file perms      -- refuses a group/world-readable file
//   * no linked_coach_id       -- reported, never repaired here

import { readFileSync, statSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DB_ONLY = args.includes("--db-only");
const argOf = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
const envFile = argOf("--env", ".env.local");
const clerkEnvFile = argOf("--clerk-env", envFile);
const pwFile = argOf("--pw-file", "/tmp/hq-deploy-backup/.temp-pw");

const readEnv = (file) =>
  Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        let v = l.slice(i + 1).trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        return [l.slice(0, i).trim(), v];
      }),
  );

const env = readEnv(envFile);
const clerkEnv = clerkEnvFile === envFile ? env : { ...env, ...readEnv(clerkEnvFile) };

for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!env[k]) {
    console.error(`${k} missing from ${envFile}`);
    process.exit(1);
  }
}
if (!DB_ONLY && !clerkEnv.CLERK_SECRET_KEY) {
  console.error(`CLERK_SECRET_KEY missing from ${clerkEnvFile}. Pass --clerk-env FILE, or --db-only for the portal-side table.`);
  process.exit(1);
}

// --- DP guard --------------------------------------------------------------
const DP_REF = "vutdqjfixvijldlyvbaw";
const ref = (env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase/) ?? [])[1] ?? "?";
if (ref !== DP_REF) {
  console.error(`Refusing: env points at ${ref}, this script is DP-only (${DP_REF}).`);
  process.exit(1);
}

// --- normalisation (mirrors reconcile-clerk-users.mjs) ---------------------
const GMAIL = new Set(["gmail.com", "googlemail.com"]);
const normaliseEmail = (raw) => {
  const s = (raw ?? "").trim().toLowerCase();
  const at = s.lastIndexOf("@");
  if (at <= 0) return s;
  let local = s.slice(0, at);
  let domain = s.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (GMAIL.has(domain)) {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
};

// Owner-supplied exclusions. Entries ending in "@" match on local-part alone
// (the owner gave them that way); the rest match the normalised address.
const NEVER_TOUCH = [
  "danielpiplios@gmail.com",
  "contact@kaifourie.com",
  "jameela@",
  "mykael@",
  "contact@rubysheohmelian.com",
  "brookem0011@",
  "lillihof3e@",
];
const isExcluded = (email) => {
  const n = normaliseEmail(email);
  const local = n.split("@")[0];
  return NEVER_TOUCH.some((x) => (x.endsWith("@") ? local === x.slice(0, -1) : n === normaliseEmail(x)));
};

// --- Clerk -----------------------------------------------------------------
const clerkFetch = async (path, init = {}) => {
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${clerkEnv.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Clerk ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
};

async function clerkUsers() {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const page = await clerkFetch(`/users?limit=100&offset=${offset}`);
    for (const u of page) {
      const emails = (u.email_addresses ?? []).map((e) => e.email_address).filter(Boolean);
      out.push({
        id: u.id,
        name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim(),
        primary: (u.email_addresses ?? []).find((e) => e.id === u.primary_email_address_id)?.email_address ?? emails[0] ?? "",
        emails,
        passwordSet: Boolean(u.password_enabled),
        lastSignIn: u.last_sign_in_at ? new Date(u.last_sign_in_at).toISOString().slice(0, 10) : "never",
      });
    }
    if (page.length < 100) break;
  }
  return out;
}

// --- portal tables ---------------------------------------------------------
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const must = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data ?? [];
};

const [clerk, users, invitesRaw, coaches] = await Promise.all([
  DB_ONLY ? Promise.resolve([]) : clerkUsers(),
  db.from("users").select("clerk_id,name,role,linked_coach_id").then(must),
  db.from("invites").select("*").then(must),
  db.from("coaches").select("id,name,is_active").then(must),
]);

const coachById = new Map(coaches.map((c) => [c.id, c]));
const userByClerk = new Map(users.map((u) => [u.clerk_id, u]));
const invites = invitesRaw.map((i) => ({
  ...i,
  keys: new Set([i.email, ...(i.alt_emails ?? [])].map(normaliseEmail).filter(Boolean)),
}));

// Resolve a person to their portal role. users row wins; else the invite that
// matches any of their addresses (claimed or not).
const resolve = (emails, clerkId) => {
  const keys = new Set(emails.map(normaliseEmail));
  const row = clerkId ? userByClerk.get(clerkId) ?? null : null;
  const invite = invites.find((i) => [...i.keys].some((k) => keys.has(k))) ?? null;
  return {
    row,
    invite,
    role: row?.role ?? invite?.role ?? null,
    coachId: row?.linked_coach_id ?? invite?.linked_coach_id ?? null,
    via: row ? "users row" : invite ? `invite (${invite.claimed_at ? "claimed" : "UNCLAIMED"})` : "none",
  };
};

// --- build the target list -------------------------------------------------
const targets = [];
if (DB_ONLY) {
  // Portal side only: every users row / invite that resolves to coach. No
  // Clerk facts (password set, last sign-in) are available in this mode.
  const seen = new Set();
  for (const u of users) {
    if (u.role !== "coach") continue;
    seen.add(u.clerk_id);
    targets.push({
      name: u.name ?? "?",
      primary: "(clerk key needed)",
      emails: [],
      role: u.role,
      via: "users row",
      coachId: u.linked_coach_id,
      passwordSet: null,
      lastSignIn: null,
      clerkId: u.clerk_id,
    });
  }
  for (const i of invites) {
    if (i.role !== "coach") continue;
    targets.push({
      name: i.name ?? "(invite)",
      primary: i.email,
      emails: [i.email, ...(i.alt_emails ?? [])],
      role: i.role,
      via: `invite (${i.claimed_at ? "claimed" : "UNCLAIMED"})`,
      coachId: i.linked_coach_id,
      passwordSet: null,
      lastSignIn: null,
      clerkId: null,
    });
  }
} else {
  for (const u of clerk) {
    const r = resolve(u.emails, u.id);
    if (r.role !== "coach") continue;
    targets.push({
      name: u.name || r.row?.name || "?",
      primary: u.primary,
      emails: u.emails,
      role: r.role,
      via: r.via,
      coachId: r.coachId,
      passwordSet: u.passwordSet,
      lastSignIn: u.lastSignIn,
      clerkId: u.id,
    });
  }
}

// --- fail loud if an excluded address is inside the target list ------------
const collisions = targets.filter((t) => [t.primary, ...t.emails].some((e) => e && isExcluded(e)));
if (collisions.length) {
  console.error("ABORT: excluded address resolved to role=coach. Role resolution is wrong; not skipping silently.");
  for (const c of collisions) console.error(`  ${c.name} <${c.primary}> via ${c.via}`);
  process.exit(2);
}

// --- report ----------------------------------------------------------------
const pad = (s, n) => String(s ?? "").padEnd(n).slice(0, n);
console.log(`\nDP coach accounts — ${DB_ONLY ? "PORTAL SIDE ONLY (no Clerk key)" : APPLY ? "APPLY" : "DRY RUN"}`);
console.log(`supabase ${ref}   targets ${targets.length}\n`);
console.log(
  pad("NAME", 20) + pad("EMAIL", 34) + pad("ROLE VIA", 22) + pad("LINKED COACH", 20) + pad("PW SET", 8) + "LAST SIGN-IN",
);
console.log("-".repeat(112));
for (const t of targets.sort((a, b) => a.name.localeCompare(b.name))) {
  const coach = t.coachId ? coachById.get(t.coachId)?.name ?? `(id ${t.coachId})` : "-- none --";
  console.log(
    pad(t.name, 20) +
      pad(t.primary, 34) +
      pad(t.via, 22) +
      pad(coach, 20) +
      pad(t.passwordSet === null ? "?" : t.passwordSet ? "yes" : "no", 8) +
      (t.lastSignIn ?? "?"),
  );
}
const noCoach = targets.filter((t) => !t.coachId);
if (noCoach.length) console.log(`\nNOTE: ${noCoach.length} target(s) have no linked_coach_id: ${noCoach.map((t) => t.name).join(", ")}`);
if (!APPLY) {
  console.log(`\nDry run. Re-run with --apply --clerk-env FILE to set the temp password and revoke sessions.`);
  process.exit(0);
}

// --- apply -----------------------------------------------------------------
if (DB_ONLY) {
  console.error("--db-only cannot apply; Clerk key required.");
  process.exit(1);
}
const mode = statSync(pwFile).mode & 0o077;
if (mode !== 0) {
  console.error(`Refusing: ${pwFile} is group/world readable (chmod 600 it).`);
  process.exit(1);
}
const password = readFileSync(pwFile, "utf8").replace(/\r?\n$/, "");
if (!password) {
  console.error(`Refusing: ${pwFile} is empty.`);
  process.exit(1);
}

console.log(`\nApplying to ${targets.length} account(s)...\n`);
for (const t of targets) {
  try {
    await clerkFetch(`/users/${t.clerkId}`, { method: "PATCH", body: JSON.stringify({ password }) });
    const sessions = await clerkFetch(`/sessions?user_id=${t.clerkId}&status=active`);
    let revoked = 0;
    for (const s of sessions ?? []) {
      await clerkFetch(`/sessions/${s.id}/revoke`, { method: "POST" });
      revoked += 1;
    }
    console.log(`  ok      ${t.primary}  (sessions revoked: ${revoked})`);
  } catch (e) {
    console.log(`  FAILED  ${t.primary}  ${String(e.message).replace(password, "***").slice(0, 160)}`);
  }
}
console.log("\nDone. Every coach must use Forgot Password on first real login.");
