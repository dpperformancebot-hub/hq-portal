"use server";

// R17-4: one-step coach onboarding.
//
// Onboarding a coach used to be four disconnected steps in a required order:
// the GHL sync only creates a `coaches` row once a client is assigned to that
// exact name, the Team invite needs that row to exist, capacity lives in code,
// and a name differing by one character silently creates a SECOND, empty coach
// row. That last one is not hypothetical: the duplicate "Cody" / "Jake" /
// "Riley" rows deleted in R14 came from exactly that, and the check-in importer
// nearly wrote 21 invisible check-ins against them.
//
// This action does the portal half in one go: coaches row + invite, linked,
// with a near-match guard so a typo cannot create a duplicate. The GHL half
// (adding the name to the Assigned Coach dropdown) stays outside the portal
// and is handed back as a checklist, because nothing here may write to GHL.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { BRAND } from "@/lib/brand";
import { payDisplayFor } from "@/lib/pay/pay-display";
import { fetchAllRows } from "@/lib/db/fetch-all";
import { sendClerkInvitation, resendClerkInvitation, type ClerkInviteStatus } from "@/lib/clerk-invites";

// R19: a no-bonus brand must not be told to go and configure bonuses.
const PAY_DISPLAY = payDisplayFor(BRAND.pay);
import { moneyHiddenFromViewer } from "@/lib/access-policy";
import { getServerIdentity } from "@/lib/role-server";

export type AddCoachInput = {
  /** Must match the GHL "Assigned Coach" value exactly. */
  name: string;
  email: string;
  // NO phone field. The initial schema states an explicit PII boundary:
  // "email/phone are NOT stored here", and coaches has no phone column. The
  // owner asked for one in R19-2b, so migration 20260930000001 adds it, but
  // that is a schema change AND a reversal of a stated privacy decision, so it
  // is a HARD STOP. A form field that silently discards what you typed is
  // worse than an absent one, so the field stays out until the column exists.
  headCoach: boolean;
  capacity: number;
  /** ISO date; recorded on the invite for the owner's records, not the roster. */
  startDate: string | null;
  /** R19-2b: pay setup, shaped by the brand's pay model. A weeks-paid brand
   *  (TJD) REFUSES to create a coach without one, because a coach with no rate
   *  card silently invoices at zero and nobody finds out until payday. */
  pay?: CoachPaySetup | null;
};

/** DP pays from check-in codes at a weekly/fortnightly rate on the coach row.
 *  TJD pays rate x weeks paid from a coach_pay_rates card. */
export type CoachPaySetup =
  | { model: "checkin-codes"; weeklyRate: number; fortnightlyRate: number }
  | {
      model: "weeks-paid";
      brandWeekly: number;
      brandFortnightly: number;
      referralWeekly: number;
      referralFortnightly: number;
    };

export type ExistingCoach = { id: string; name: string; isActive: boolean; hasLogin: boolean; clients: number };

export type AddCoachResult =
  | {
      ok: true;
      coachId: string;
      name: string;
      email: string;
      /** True when an existing login-less coach row was reused. */
      linkedExisting: boolean;
      /** R19-2a: what happened to the automatic email. */
      invite: ClerkInviteStatus;
      /** Ready-to-send message for the coach. */
      message: string;
      /** What the owner still has to do OUTSIDE the portal. */
      checklist: string[];
    }
  | { ok: false; error: string; nearMatch?: { name: string; score: number } };

const NO_DB = "Adding a coach needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";

/** Owner + admin only. Creating a login is not an ops-manager power. Not while
 *  the owner views as a coach on TJD: the form and the coach list carry rate
 *  cards (money), and the coach view is exactly what the coach sees. */
async function canAddCoach(): Promise<boolean> {
  const id = await getServerIdentity();
  return (id.realRole === "owner" || id.role === "admin") && !moneyHiddenFromViewer(id);
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** DP's rates live on the coach row; TJD's live on coach_pay_rates, so this
 *  returns nothing for a weeks-paid brand rather than writing misleading
 *  columns the pay engine will never read. */
function coachPayColumns(pay: CoachPaySetup | null | undefined) {
  if (!pay || pay.model !== "checkin-codes") return {};
  return { weekly_rate: pay.weeklyRate, fortnightly_rate: pay.fortnightlyRate };
}

/** Levenshtein distance, capped work for short names. */
function editDistance(a: string, b: string): number {
  const x = norm(a), y = norm(b);
  const m = x.length, n = y.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i, ...Array<number>(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Is this name close enough to an existing coach to be a typo?
 *
 * The brief specified Dice >= 0.8. On its own that MISSES the brief's own
 * example: "Perri" vs "Perry" scores 0.75, because a one-character swap in a
 * five-letter name only shares 3 of 4 bigrams. Short names are exactly where
 * this guard matters, so a single-edit rule runs alongside the Dice one.
 * Both triggers only ask a question; the owner can still confirm the new
 * spelling. A false prompt costs one click, a missed one costs a duplicate
 * coach and every client assigned to the other spelling.
 */
function isNearMatch(a: string, dice: number): (b: string) => boolean {
  return (b: string) => dice >= 0.8 || (Math.min(norm(a).length, norm(b).length) >= 4 && editDistance(a, b) <= 1);
}

/** Dice coefficient on character bigrams. Same measure the roster tooling
 *  uses, so "did you mean" behaves consistently across the codebase. */
export async function nameSimilarity(a: string, b: string): Promise<number> {
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = grams(x), B = grams(y);
  let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0);
  const total = x.length - 1 + (y.length - 1);
  return total <= 0 ? 0 : (2 * inter) / total;
}

/** The coach names already in play, so the form can show them and the owner
 *  can spell the new one the same way. These rows came from the GHL Assigned
 *  Coach field, so they ARE the list of values GHL uses. */
export async function listExistingCoachesAction(): Promise<ExistingCoach[]> {
  if (!persistenceEnabled() || !(await canAddCoach())) return [];
  const db = dbAdmin();
  // R19-1 self-review: this read counts every coach's live load, so it has to
  // see the WHOLE clients table. Unpaged it returned 1000 of DP's 1054 rows and
  // quietly understated up to 54 coaches' worth of load, on the very screen
  // that decides whether a coach has room for more. coaches (17 rows) and
  // invites stay unpaged; neither is near the 1000-row ceiling.
  const [{ data: coaches }, clients, { data: invites }] = await Promise.all([
    db.from("coaches").select("id,name,is_active").order("name"),
    fetchAllRows<{ coach_id: string | null }>(
      (from, to) => db.from("clients").select("coach_id").order("id").range(from, to),
      { label: "coach load: clients" },
    ),
    db.from("invites").select("linked_coach_id"),
  ]);
  const counts = new Map<string, number>();
  for (const c of clients) {
    if (c.coach_id) counts.set(c.coach_id, (counts.get(c.coach_id) ?? 0) + 1);
  }
  const withLogin = new Set(
    ((invites ?? []) as { linked_coach_id: string | null }[]).map((i) => i.linked_coach_id).filter(Boolean) as string[],
  );
  return ((coaches ?? []) as { id: string; name: string; is_active: boolean }[]).map((c) => ({
    id: c.id,
    name: c.name,
    isActive: c.is_active,
    hasLogin: withLogin.has(c.id),
    clients: counts.get(c.id) ?? 0,
  }));
}

/**
 * Create (or adopt) the coach row and its invite together.
 *
 * `confirmNearMatch` is the escape hatch: the first call refuses when the name
 * is within Dice 0.8 of an existing coach and hands back the suggestion, so a
 * typo cannot quietly create a second Perry. Calling again with the flag set
 * means the owner has looked at the suggestion and meant the new spelling.
 */
export async function addCoachAction(
  input: AddCoachInput,
  confirmNearMatch = false,
): Promise<AddCoachResult> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  if (!(await canAddCoach())) return { ok: false, error: "Only the owner or an admin can add a coach." };

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { ok: false, error: "Enter the coach's display name, spelled exactly as GHL has it." };
  if (!email.includes("@")) return { ok: false, error: "Enter a valid login email." };
  if (!Number.isFinite(input.capacity) || input.capacity <= 0) {
    return { ok: false, error: "Capacity must be a positive number." };
  }
  if (input.startDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    return { ok: false, error: "Start date must be a date." };
  }

  // R19-2b: a weeks-paid brand cannot create a coach without a rate card. A
  // missing card is not a blank screen later, it is an invoice that quietly
  // totals zero, which nobody notices until the coach asks where their money is.
  const payModel = BRAND.pay.model;
  if (payModel === "weeks-paid") {
    const pay = input.pay;
    if (!pay || pay.model !== "weeks-paid") {
      return { ok: false, error: "This brand pays from a rate card. Set the coach's rates before saving." };
    }
    const nums = [pay.brandWeekly, pay.brandFortnightly, pay.referralWeekly, pay.referralFortnightly];
    if (nums.some((n) => !Number.isFinite(n) || n < 0)) {
      return { ok: false, error: "Every rate must be a number, zero or more." };
    }
    if (nums.every((n) => n === 0)) {
      return { ok: false, error: "All four rates are zero. That coach would invoice nothing. Set their rates." };
    }
  }

  const db = dbAdmin();

  // Duplicate email: the invite table is unique on email, so without this the
  // owner gets a raw constraint error after the coach row has already been
  // created, which is the half-made state this action exists to prevent.
  const { data: emailRows } = await db.from("invites").select("email,name,linked_coach_id").eq("email", email);
  const emailTaken = (emailRows ?? [])[0] as { name?: string; linked_coach_id?: string | null } | undefined;
  const { data: existing, error: readErr } = await db.from("coaches").select("id,name,is_active");
  if (readErr) return { ok: false, error: readErr.message };
  const rows = (existing ?? []) as { id: string; name: string; is_active: boolean }[];

  // Exact match (case-insensitive): adopt it rather than create a twin.
  const exact = rows.find((r) => norm(r.name) === norm(name));

  if (!exact && !confirmNearMatch) {
    let best: { name: string; score: number } | null = null;
    for (const r of rows) {
      const score = await nameSimilarity(name, r.name);
      if (isNearMatch(name, score)(r.name) && (!best || score > best.score)) {
        best = { name: r.name, score };
      }
    }
    if (best) {
      return {
        ok: false,
        error: `Did you mean "${best.name}"? A near-miss spelling creates a SECOND coach and every client assigned to the other spelling goes to the wrong one.`,
        nearMatch: best,
      };
    }
  }

  if (emailTaken && norm(String(emailTaken.name ?? "")) !== norm(name)) {
    return {
      ok: false,
      error: `That email is already invited, as "${emailTaken.name}". One login belongs to one person, so use a different address or fix the existing invite.`,
    };
  }

  let coachId: string;
  let linkedExisting = false;
  if (exact) {
    coachId = exact.id;
    linkedExisting = true;
    const { error } = await db
      .from("coaches")
      .update({
        role: input.headCoach ? "head_coach" : "coach",
        max_capacity: input.capacity,
        is_active: true,
        ...coachPayColumns(input.pay),
      })
      .eq("id", coachId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await db
      .from("coaches")
      .insert({
        name,
        role: input.headCoach ? "head_coach" : "coach",
        max_capacity: input.capacity,
        is_active: true,
        ...coachPayColumns(input.pay),
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    coachId = (data as { id: string }).id;
  }

  // The invite is what turns the coach row into a login. Upsert on email so a
  // re-run repairs a half-finished onboarding instead of erroring.
  const { error: inviteErr } = await db.from("invites").upsert(
    { email, name, role: "coach", linked_coach_id: coachId, claimed_at: null, claimed_by: null },
    { onConflict: "email" },
  );
  if (inviteErr) {
    return {
      ok: false,
      error: `The coach record was saved but the invite failed: ${inviteErr.message}. Re-run this form with the same details to finish it.`,
    };
  }

  // R19-2b: the rate card, for a brand that pays from one. Written AFTER the
  // coach row exists and BEFORE the invite goes out, so an invited coach always
  // has rates behind them.
  if (payModel === "weeks-paid" && input.pay?.model === "weeks-paid") {
    const { error: rateErr } = await db.from("coach_pay_rates").upsert(
      {
        coach_id: coachId,
        brand_weekly: input.pay.brandWeekly,
        brand_fortnightly: input.pay.brandFortnightly,
        referral_weekly: input.pay.referralWeekly,
        referral_fortnightly: input.pay.referralFortnightly,
        updated_by: "add-coach",
      },
      { onConflict: "coach_id" },
    );
    if (rateErr) {
      return {
        ok: false,
        error: `The coach record and invite were saved but their rate card failed: ${rateErr.message}. Re-run this form with the same details to finish it.`,
      };
    }
  }

  // R19-2a: the automatic email. Deliberately LAST, and deliberately unable to
  // fail the creation: a coach with a record and no email can be resent from
  // the success screen, but an email promising a portal that was never created
  // cannot be taken back.
  const invite = await sendClerkInvitation(email, {
    role: "coach",
    linkedCoachId: coachId,
  });

  try {
    await db.from("sync_events").insert({
      source: "manual",
      entity: "coach",
      ghl_id: null,
      action: "coach_added",
      payload: {
        coach_id: coachId,
        name,
        head_coach: input.headCoach,
        capacity: input.capacity,
        start_date: input.startDate,
        adopted_existing_row: linkedExisting,
        pay_model: payModel,
        invite_status: invite.status,
        by: (await getServerIdentity()).role,
      },
    });
  } catch {
    /* best-effort */
  }

  revalidatePath("/team");
  revalidatePath("/coach-overview");

  const signInUrl = process.env.NEXT_PUBLIC_APP_URL ?? "your portal sign-in page";
  return {
    ok: true,
    coachId,
    name,
    email,
    linkedExisting,
    invite,
    message: [
      `Hi ${name.split(" ")[0]}, your coaching portal is ready.`,
      "",
      `Sign in: ${signInUrl}`,
      `Use exactly this email: ${email}`,
      "",
      "First time in, you'll see:",
      "- My Clients: your roster",
      "- Check-ins: your weekly grid",
      "- Academy: start at module 1",
    ].join("\n"),
    checklist: [
      `In GHL, add "${name}" to the Assigned Coach dropdown, spelled exactly that way. Clients are matched to coaches by this name, so a different spelling sends them to a different coach.`,
      `Assign at least one client to "${name}" in GHL so the nightly sync confirms the link.`,
      PAY_DISPLAY.hasBonuses
        ? `Set their pay rates: weekly and fortnightly rates live on the coaches row; bonuses are per brand in src/lib/brand.ts (pay block).`
        : `Set their pay rates on the coaches row. This brand pays rate times weeks paid with no onboarding or retention bonus, so there is nothing else to set.`,
      linkedExisting
        ? "This linked to the existing coach record rather than creating a new one, so their current clients stay attached."
        : "This created a new coach record. It has no clients until you assign some in GHL or via Assign clients.",
    ],
  };
}

/** R19-2a: resend the sign-in email from the success screen. Revokes whatever
 *  Clerk is holding and issues a fresh invitation, so the coach gets a link
 *  that works rather than another copy of an expired one. Idempotent, and safe
 *  to press twice. */
export async function resendCoachInviteAction(
  email: string,
  coachId: string,
): Promise<{ ok: true; invite: ClerkInviteStatus } | { ok: false; error: string }> {
  if (!(await canAddCoach())) return { ok: false, error: "Only the owner or an admin can resend an invite." };
  const clean = String(email ?? "").trim().toLowerCase();
  if (!clean.includes("@")) return { ok: false, error: "That is not a valid email." };
  const invite = await resendClerkInvitation(clean, { role: "coach", linkedCoachId: coachId || null });
  try {
    await dbAdmin().from("sync_events").insert({
      source: "manual",
      entity: "coach",
      ghl_id: null,
      action: "coach_invite_resent",
      payload: { coach_id: coachId, email: clean, invite_status: invite.status },
    });
  } catch {
    /* best-effort */
  }
  return { ok: true, invite };
}
