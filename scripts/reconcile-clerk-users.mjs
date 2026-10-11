// R13-1 / R13-1a (FEEDBACK-V2, 2026-09-05): reconcile Clerk users against the
// portal's users, invites and coaches tables. REPORT-ONLY by default.
//
//   node scripts/reconcile-clerk-users.mjs                 # ledger, no writes
//   node scripts/reconcile-clerk-users.mjs --env FILE      # read env from FILE
//                                                          # (default .env.local)
//   node scripts/reconcile-clerk-users.mjs --apply         # WRITE the proposed
//                                                          # fixes (owner go only)
//
// For every Clerk user on the instance the env points at:
//   * users row?             -> the role they resolve to today
//   * unclaimed invite?      -> matched on EVERY Clerk email address, after
//                               normalisation (trim, lowercase, gmail dots,
//                               plus-aliases)
//   * coach match            -> invite's linked coach, else a coach record
//                               with no linked login whose normalised name
//                               equals the Clerk name (a HINT, never a grant)
//   * resolves today         -> users.role, else invite.role, else "va"
//                               (the pre-R13-2 fallthrough this is fixing)
//   * should get             -> users.role unless they sit on va with a coach
//                               match (-> coach); else invite.role; else coach
//                               when exactly one coach matches; else "ASK"
//
// STALE users rows (clerk_id not on this instance, left from the pre-cutover
// instance) are listed separately; an unmatched Clerk user whose name equals
// exactly one stale row is proposed as a RELINK (re-point clerk_id, keep
// role + coach link, audit row). No second identity is created.
//
// --apply writes ONLY the unambiguous rows:
//   * no users row + no invite + one coach match  -> insert invite (their
//     actual sign-up email, role coach, linked_coach_id)
//   * users row on va + one coach match           -> users.role = coach with
//     linked_coach_id, plus a role_change_audit row (changed_by "script")
// Everything else (ASK rows, 2+ coach matches) is left alone and listed.
//
// Read-only Clerk API (GET /v1/users). Nothing is emailed. No PII beyond
// what the ledger needs is printed.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : ".env.local";

const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      return [l.slice(0, i).trim(), v];
    }),
);

for (const k of ["CLERK_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!env[k]) {
    console.error(`${k} missing from ${envFile}`);
    process.exit(1);
  }
}
const clerkInstance = (() => {
  try {
    const pk = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
    return Buffer.from(pk.replace(/^pk_(test|live)_/, ""), "base64").toString("utf8").replace(/\$$/, "");
  } catch {
    return "?";
  }
})();

// --- normalisation (mirror of src/lib/email-normalise.ts; kept inline so the
// script has no TS build step) -------------------------------------------
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
const nameKey = (raw) =>
  (raw ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

// --- Clerk: every user, paginated -----------------------------------------
async function clerkUsers() {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`https://api.clerk.com/v1/users?limit=100&offset=${offset}`, {
      headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
    });
    if (!res.ok) throw new Error(`Clerk ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const page = await res.json();
    for (const u of page) {
      const emails = (u.email_addresses ?? []).map((e) => e.email_address).filter(Boolean);
      const primary = (u.email_addresses ?? []).find((e) => e.id === u.primary_email_address_id)?.email_address ?? emails[0] ?? "";
      out.push({
        id: u.id,
        name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim(),
        primary,
        emails,
        lastSignIn: u.last_sign_in_at ? new Date(u.last_sign_in_at).toISOString().slice(0, 10) : "never",
        created: u.created_at ? new Date(u.created_at).toISOString().slice(0, 10) : "?",
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
  clerkUsers(),
  db.from("users").select("clerk_id,name,role,linked_coach_id").then(must),
  db.from("invites").select("*").then(must),
  db.from("coaches").select("id,name,role,is_active").then(must),
]);

const userByClerk = new Map(users.map((u) => [u.clerk_id, u]));
const coachById = new Map(coaches.map((c) => [c.id, c]));
const linkedCoachIds = new Set(users.map((u) => u.linked_coach_id).filter(Boolean));
const invites = invitesRaw.map((i) => ({
  ...i,
  keys: new Set([i.email, ...(i.alt_emails ?? [])].map(normaliseEmail).filter(Boolean)),
}));
const coachesByNameKey = new Map();
for (const c of coaches) {
  const k = nameKey(c.name);
  if (!k) continue;
  coachesByNameKey.set(k, [...(coachesByNameKey.get(k) ?? []), c]);
}
// Coach records are often first-name only ("Keri"); a Clerk profile carries
// the full name. Match on the full key first, then on the first token when
// the coach record itself is a single token.
const firstKey = (name) => nameKey((name ?? "").trim().split(/\s+/)[0]);
const coachNameHits = (clerkName) => {
  const full = coachesByNameKey.get(nameKey(clerkName)) ?? [];
  if (full.length) return full;
  const fk = firstKey(clerkName);
  if (!fk) return [];
  return coaches.filter((c) => !/\s/.test(c.name.trim()) && nameKey(c.name) === fk);
};

// STALE users rows: linked to a Clerk id that does not exist on THIS
// instance (left over from the pre-cutover instance). These already carry
// the right role + coach link, so the fix is to RE-POINT clerk_id at the
// person's live account, not to create a second identity.
const liveIds = new Set(clerk.map((u) => u.id));
const staleUsers = users.filter((u) => !liveIds.has(u.clerk_id));
const staleByKey = new Map();
for (const u of staleUsers) {
  for (const k of [nameKey(u.name), firstKey(u.name)]) {
    if (k) staleByKey.set(k, [...(staleByKey.get(k) ?? []), u]);
  }
}
const staleHits = (clerkName) => {
  const full = staleByKey.get(nameKey(clerkName)) ?? [];
  if (full.length) return [...new Set(full)];
  const fk = firstKey(clerkName);
  return fk ? [...new Set(staleUsers.filter((u) => !/\s/.test((u.name ?? "").trim()) && nameKey(u.name) === fk))] : [];
};

// Owner rule (2026-08-18, reaffirmed 2026-09-06): these people are OUT OF
// SCOPE for the portal. The script must never propose or write an invite,
// users row, relink or promotion for them, whatever they match.
const NEVER_TOUCH = new Set(["brookem0011@gmail.com", "lillihof3e@gmail.com"].map(normaliseEmail));

// --- ledger ---------------------------------------------------------------
const rows = [];
const fixes = { invites: [], promotions: [], relinks: [] };
for (const u of clerk) {
  const keys = new Set(u.emails.map(normaliseEmail));
  const excluded = [...keys].some((k) => NEVER_TOUCH.has(k));
  const userRow = userByClerk.get(u.id) ?? null;
  const invite = invites.find((i) => !i.claimed_at && [...i.keys].some((k) => keys.has(k))) ?? null;
  const claimedInvite = invites.find((i) => i.claimed_at && [...i.keys].some((k) => keys.has(k))) ?? null;

  // coach match: linked on the users row > invite's linked coach > name hint
  let coachMatch = null;
  let matchVia = "";
  if (userRow?.linked_coach_id && coachById.has(userRow.linked_coach_id)) {
    coachMatch = coachById.get(userRow.linked_coach_id);
    matchVia = "users row";
  } else if (invite?.linked_coach_id && coachById.has(invite.linked_coach_id)) {
    coachMatch = coachById.get(invite.linked_coach_id);
    matchVia = "invite";
  } else {
    // A coach linked only to a STALE users row counts as unlinked here.
    const staleLinked = new Set(staleUsers.map((x) => x.linked_coach_id).filter(Boolean));
    const hits = coachNameHits(u.name).filter((c) => !linkedCoachIds.has(c.id) || staleLinked.has(c.id));
    if (hits.length === 1) {
      coachMatch = hits[0];
      matchVia = "name";
    } else if (hits.length > 1) {
      matchVia = `name x${hits.length} (ambiguous)`;
    }
  }
  const stale = userRow ? [] : staleHits(u.name);

  const today = userRow ? userRow.role : invite ? `${invite.role} (invite, unclaimed)` : "no access (holding screen)";
  let should;
  let flag = "";
  if (excluded) {
    should = "none";
    flag = "OUT OF SCOPE (owner)";
  } else if (userRow) {
    if (userRow.role === "va" && coachMatch && matchVia === "name") {
      should = "coach";
      flag = "STRANDED ON VA";
      fixes.promotions.push({ clerkId: u.id, name: u.name || userRow.name, coach: coachMatch });
    } else should = userRow.role;
  } else if (invite) {
    should = invite.role;
    flag = "claims on next sign-in";
  } else if (stale.length === 1) {
    const row = stale[0];
    should = row.role + (row.linked_coach_id ? ` (${coachById.get(row.linked_coach_id)?.name ?? "?"})` : "");
    flag = "STALE LINK: relink";
    fixes.relinks.push({ clerkId: u.id, email: u.primary, name: u.name, row, coach: row.linked_coach_id ? coachById.get(row.linked_coach_id) : null });
  } else if (stale.length > 1) {
    should = "ASK";
    flag = `stale rows x${stale.length} (ambiguous)`;
  } else if (coachMatch && matchVia === "name") {
    should = "coach";
    flag = "needs invite";
    fixes.invites.push({ clerkId: u.id, email: u.primary, name: u.name, coach: coachMatch });
  } else {
    should = "ASK";
    flag = matchVia.includes("ambiguous") ? "ambiguous name" : "no match";
  }

  rows.push({
    email: u.primary + (u.emails.length > 1 ? ` (+${u.emails.length - 1})` : ""),
    name: u.name || "(no name)",
    coach: coachMatch ? `${coachMatch.name} [${matchVia}]` : matchVia || "none",
    users: userRow ? "yes" : "no",
    today,
    should,
    flag,
    lastSignIn: u.lastSignIn,
    claimedInvite: claimedInvite ? "claimed" : "",
  });
}

// unclaimed invites with no Clerk user at all (invited, never signed up)
const orphanInvites = invites.filter(
  (i) => !i.claimed_at && !clerk.some((u) => u.emails.some((e) => i.keys.has(normaliseEmail(e)))),
);

// --- output ---------------------------------------------------------------
const brand = env.NEXT_PUBLIC_BRAND ?? "?";
console.log(`\nLEDGER: brand=${brand}  clerk=${clerkInstance}  supabase=${new URL(env.NEXT_PUBLIC_SUPABASE_URL).host}`);
console.log(`Clerk users: ${clerk.length}   users rows: ${users.length}   invites: ${invites.length} (${invites.filter((i) => !i.claimed_at).length} unclaimed)   coaches: ${coaches.length} (${linkedCoachIds.size} linked)\n`);

const cols = [
  ["email", "Clerk email"],
  ["name", "Clerk name"],
  ["coach", "Matched coach"],
  ["users", "users row"],
  ["today", "Resolves today"],
  ["should", "Should get"],
  ["flag", "Flag"],
  ["lastSignIn", "Last sign-in"],
];
const width = Object.fromEntries(cols.map(([k, h]) => [k, Math.max(h.length, ...rows.map((r) => String(r[k]).length))]));
const line = (r) => cols.map(([k]) => String(r[k]).padEnd(width[k])).join("  ");
console.log(line(Object.fromEntries(cols.map(([k, h]) => [k, h]))));
console.log(cols.map(([k]) => "-".repeat(width[k])).join("  "));
rows.sort((a, b) => (a.flag === b.flag ? a.email.localeCompare(b.email) : a.flag.localeCompare(b.flag)));
for (const r of rows) console.log(line(r));

console.log(`\nUnclaimed invites with no Clerk account yet: ${orphanInvites.length}`);
for (const i of orphanInvites) console.log(`  ${i.email}  ${i.name}  ${i.role}${i.linked_coach_id ? ` -> ${coachById.get(i.linked_coach_id)?.name ?? i.linked_coach_id}` : ""}`);

console.log(`\nusers rows whose clerk_id is NOT on this Clerk instance (stale, pre-cutover): ${staleUsers.length}`);
for (const u of staleUsers) console.log(`  ${(u.name ?? "?").padEnd(18)} ${u.role.padEnd(8)} ${u.linked_coach_id ? `-> coach ${coachById.get(u.linked_coach_id)?.name ?? "?"}` : ""}  (${u.clerk_id})`);

const unlinkedCoaches = coaches.filter((c) => c.is_active && !linkedCoachIds.has(c.id));
console.log(`\nActive coaches with no linked login: ${unlinkedCoaches.length}`);
for (const c of unlinkedCoaches) console.log(`  ${c.name}${c.role === "head_coach" ? " (head coach)" : ""}`);

console.log(`\nPROPOSED FIXES (${APPLY ? "APPLYING" : "dry run, pass --apply after owner approval"}):`);
for (const f of fixes.invites) console.log(`  invite   ${f.email}  ->  coach ${f.coach.name}`);
for (const f of fixes.promotions) console.log(`  promote  ${f.name} (${f.clerkId})  va -> coach ${f.coach.name}`);
for (const f of fixes.relinks) console.log(`  relink   users row "${f.row.name}" (${f.row.role}${f.coach ? `, coach ${f.coach.name}` : ""}): clerk_id ${f.row.clerk_id} -> ${f.clerkId}  [${f.email}]`);
if (fixes.invites.length + fixes.promotions.length + fixes.relinks.length === 0) console.log("  (none)");

if (!APPLY) process.exit(0);

// --- apply ----------------------------------------------------------------
for (const f of fixes.relinks) {
  const { error } = await db.from("users").update({ clerk_id: f.clerkId }).eq("clerk_id", f.row.clerk_id);
  if (error) {
    console.log(`  FAILED relink ${f.row.name}: ${error.message}`);
    continue;
  }
  const { error: auditErr } = await db.from("role_change_audit").insert({
    changed_by_clerk_id: "script:reconcile-clerk-users",
    changed_by_name: "R13-1a relink (owner-approved)",
    target_clerk_id: f.clerkId,
    target_name: f.row.name,
    from_role: `${f.row.role} (stale clerk id ${f.row.clerk_id})`,
    to_role: f.row.role,
    from_coach_id: f.row.linked_coach_id,
    to_coach_id: f.row.linked_coach_id,
  });
  console.log(auditErr ? `  relinked ${f.row.name} but AUDIT FAILED: ${auditErr.message}` : `  relinked ${f.row.name} -> ${f.clerkId} (audited)`);
}
for (const f of fixes.invites) {
  const { error } = await db.from("invites").upsert(
    { email: f.email.toLowerCase(), name: f.name || f.coach.name, role: "coach", linked_coach_id: f.coach.id, claimed_at: null, claimed_by: null },
    { onConflict: "email" },
  );
  console.log(error ? `  FAILED invite ${f.email}: ${error.message}` : `  wrote invite ${f.email}`);
}
for (const f of fixes.promotions) {
  const { error } = await db.from("users").update({ role: "coach", linked_coach_id: f.coach.id }).eq("clerk_id", f.clerkId);
  if (error) {
    console.log(`  FAILED promote ${f.name}: ${error.message}`);
    continue;
  }
  const { error: auditErr } = await db.from("role_change_audit").insert({
    changed_by_clerk_id: "script:reconcile-clerk-users",
    changed_by_name: "R13-1a backfill (owner-approved)",
    target_clerk_id: f.clerkId,
    target_name: f.name,
    from_role: "va",
    to_role: "coach",
    from_coach_id: null,
    to_coach_id: f.coach.id,
  });
  console.log(auditErr ? `  promoted ${f.name} but AUDIT FAILED: ${auditErr.message}` : `  promoted ${f.name} -> coach ${f.coach.name} (audited)`);
}
