"use server";

// TJD payroll, wired end to end. Until now tjd-pay.ts was imported for its
// TYPES only and nothing read or wrote client_paid_weeks, so My Pay on TJD
// fell through to DP's check-in-code model and showed one client, because TJD
// has one check-in row. This is the model the owner's SOP actually describes.
//
// DP never reaches any of this: every entry point refuses unless the brand is
// on the weeks-paid model.

import { revalidatePath } from "next/cache";
import { BRAND } from "@/lib/brand";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { fetchAllRows } from "@/lib/db/fetch-all";
import { getServerIdentity } from "@/lib/role-server";
import { canViewOwnPayScreen, moneyHiddenFromViewer } from "@/lib/access-policy";
import { DEFAULT_RATE_CARD } from "@/lib/pay/default-rate-card";
import {
  buildTjdInvoice,
  weeksOfMonth,
  type TjdCadence,
  type TjdClientType,
  type TjdInvoice,
  type TjdPayClient,
  type TjdPayer,
  type TjdRateCard,
  type TjdWeek,
} from "@/lib/pay/tjd-pay";

const WRONG_BRAND = "This brand does not pay on weeks paid.";
const NO_DB = "Payroll needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";

const isWeeksPaid = () => BRAND.pay.model === "weeks-paid";

/** Owner and admin run payroll. A coach sees only their own pay. On TJD the
 *  owner viewing as a coach is NOT a payroll runner (moneyHiddenFromViewer):
 *  the coach view is exactly what the coach sees, so every action refuses. */
async function gate() {
  const id = await getServerIdentity();
  return {
    id,
    canRunPayroll: (id.realRole === "owner" || id.role === "admin") && !moneyHiddenFromViewer(id),
    coachId: id.linkedCoachId,
  };
}

export type PayrollClientRow = {
  clientId: string;
  clientName: string;
  coachId: string | null;
  cadence: TjdCadence | null;
  type: TjdClientType;
  payer: TjdPayer;
  customCoachMonthly: number | null;
  customClientMonthly: number | null;
  challenge: boolean;
  /** Week starts ticked as paid, within the month being shown. */
  paidWeeks: string[];
  /** Why this client cannot be paid correctly yet. Shown, never silently $0. */
  flags: string[];
};

export type PayrollCoach = {
  coachId: string;
  coachName: string;
  ownerNoSplit: boolean;
  hasRateCard: boolean;
  clients: PayrollClientRow[];
  invoice: TjdInvoice;
};

export type PayrollMonth = {
  month: string;
  label: string;
  weeks: TjdWeek[];
  coaches: PayrollCoach[];
  totals: { payroll: number; revenue: number; brandKeeps: number; clients: number; weeksPaid: number };
  /** Every client the owner needs to fix before the numbers can be trusted. */
  issues: { clientName: string; coachName: string; flags: string[] }[];
};

const parseMonth = (ym: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) throw new Error(`Bad month "${ym}"`);
  return { year: Number(m[1]), month0: Number(m[2]) - 1 };
};

const DEFAULT_CARD = DEFAULT_RATE_CARD;

function cardFor(row: Record<string, unknown> | undefined): { card: TjdRateCard; has: boolean } {
  if (!row) {
    return {
      card: {
        brandWeekly: DEFAULT_CARD?.brandWeekly ?? 0,
        brandFortnightly: DEFAULT_CARD?.brandFortnightly ?? 0,
        referralWeekly: DEFAULT_CARD?.referralWeekly ?? 0,
        referralFortnightly: DEFAULT_CARD?.referralFortnightly ?? 0,
        clientWeekly: DEFAULT_CARD?.clientWeekly ?? 0,
        clientFortnightly: DEFAULT_CARD?.clientFortnightly ?? 0,
      },
      has: false,
    };
  }
  const n = (k: string) => Number(row[k] ?? 0);
  return {
    card: {
      brandWeekly: n("brand_weekly"), brandFortnightly: n("brand_fortnightly"),
      referralWeekly: n("referral_weekly"), referralFortnightly: n("referral_fortnightly"),
      clientWeekly: n("client_weekly"), clientFortnightly: n("client_fortnightly"),
    },
    has: true,
  };
}

const toCadence = (plan: unknown): TjdCadence | null => {
  const s = String(plan ?? "").toLowerCase();
  if (s.startsWith("week")) return "weekly";
  if (s.startsWith("fort")) return "fortnightly";
  return null;
};

/** The whole payroll month. Paged reads throughout: a truncated roster would
 *  silently drop clients from somebody's pay. */
export async function getTjdPayrollAction(
  ym: string,
): Promise<{ ok: true; data: PayrollMonth } | { ok: false; error: string }> {
  if (!isWeeksPaid()) return { ok: false, error: WRONG_BRAND };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const g = await gate();
  if (!g.canRunPayroll) return { ok: false, error: "Only the owner or an admin can open payroll." };
  return { ok: true, data: await buildMonth(ym, null) };
}

/** One coach's own pay for the month. */
export async function getMyTjdPayAction(
  ym: string,
): Promise<{ ok: true; data: PayrollMonth } | { ok: false; error: string }> {
  if (!isWeeksPaid()) return { ok: false, error: WRONG_BRAND };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const g = await gate();
  // Brand.pay.coachCanSeePay (false on TJD): a coach or head coach calling
  // this action directly (bypassing the /my-pay redirect) gets nothing, and
  // neither does the owner viewing as a coach. The owner not viewing as
  // anyone and the admin are unaffected.
  if (!g.canRunPayroll && !canViewOwnPayScreen(g.id)) {
    return { ok: false, error: "Pay is managed by the owner on this brand." };
  }
  // An owner viewing as a coach sees that coach's pay; a real coach sees only
  // their own, and never another coach's roster or rate card.
  const only = g.canRunPayroll && !g.coachId ? null : g.coachId;
  if (!g.canRunPayroll && !only) return { ok: false, error: "This login is not linked to a coach record." };
  return { ok: true, data: await buildMonth(ym, only) };
}

async function buildMonth(ym: string, onlyCoachId: string | null): Promise<PayrollMonth> {
  const { year, month0 } = parseMonth(ym);
  const weeks = weeksOfMonth(year, month0);
  const db = dbAdmin();

  const [clientRows, coachRows, rateRows] = await Promise.all([
    fetchAllRows<Record<string, unknown>>(
      (from, to) =>
        db.from("clients")
          .select("id,name,coach_id,status,plan,client_type,payer,custom_coach_monthly,custom_client_monthly,is_challenge")
          .order("id").range(from, to),
      { label: "payroll: clients" },
    ),
    fetchAllRows<Record<string, unknown>>(
      (from, to) => db.from("coaches").select("id,name,is_active").order("id").range(from, to),
      { label: "payroll: coaches" },
    ),
    fetchAllRows<Record<string, unknown>>(
      (from, to) => db.from("coach_pay_rates").select("*").order("coach_id").range(from, to),
      { label: "payroll: rate cards" },
    ),
  ]);

  const first = weeks[0]?.start ?? `${ym}-01`;
  const last = weeks[weeks.length - 1]?.start ?? `${ym}-28`;
  const paid = await fetchAllRows<Record<string, unknown>>(
    (from, to) =>
      db.from("client_paid_weeks").select("client_id,week_start").gte("week_start", first).lte("week_start", last)
        .order("id").range(from, to),
    { label: "payroll: paid weeks" },
  );
  const paidBy = new Map<string, string[]>();
  for (const p of paid) {
    const k = String(p.client_id);
    paidBy.set(k, [...(paidBy.get(k) ?? []), String(p.week_start)]);
  }

  const rateByCoach = new Map(rateRows.map((r) => [String(r.coach_id), r]));
  const activeCoaches = coachRows.filter((c) => c.is_active !== false);
  const wanted = onlyCoachId ? activeCoaches.filter((c) => String(c.id) === onlyCoachId) : activeCoaches;

  const coaches: PayrollCoach[] = [];
  const issues: PayrollMonth["issues"] = [];

  for (const co of wanted) {
    const coachId = String(co.id);
    const rateRow = rateByCoach.get(coachId);
    const { card, has } = cardFor(rateRow);
    const ownerNoSplit = rateRow?.owner_no_split === true;

    const mine = clientRows.filter((c) => c.coach_id === coachId && c.status === "active");
    const rows: PayrollClientRow[] = mine.map((c) => {
      const cadence = toCadence(c.plan);
      const flags: string[] = [];
      if (!cadence) flags.push("No cadence set, so this client cannot be rated.");
      if (!has && !ownerNoSplit) flags.push("This coach has no rate card.");
      if (flags.length) {
        issues.push({ clientName: String(c.name), coachName: String(co.name), flags });
      }
      return {
        clientId: String(c.id),
        clientName: String(c.name),
        coachId,
        cadence,
        type: (String(c.client_type ?? "brand") === "referral" ? "referral" : "brand") as TjdClientType,
        payer: (String(c.payer ?? "weekly") === "monthly" ? "monthly" : "weekly") as TjdPayer,
        customCoachMonthly: c.custom_coach_monthly === null || c.custom_coach_monthly === undefined ? null : Number(c.custom_coach_monthly),
        customClientMonthly: c.custom_client_monthly === null || c.custom_client_monthly === undefined ? null : Number(c.custom_client_monthly),
        challenge: c.is_challenge === true,
        paidWeeks: (paidBy.get(String(c.id)) ?? []).filter((w) => weeks.some((x) => x.start === w)),
        flags,
      };
    }).sort((a, b) => a.clientName.localeCompare(b.clientName));

    // A client with no cadence is listed but contributes nothing, rather than
    // being quietly rated as weekly.
    const payable: TjdPayClient[] = rows.map((r) => ({
      clientId: r.clientId,
      clientName: r.clientName,
      cadence: r.cadence ?? "weekly",
      type: r.type,
      payer: r.payer,
      weeksPaid: r.cadence ? r.paidWeeks.length : 0,
      customCoachMonthly: r.customCoachMonthly,
      customClientMonthly: r.customClientMonthly,
      challenge: r.challenge,
    }));

    coaches.push({
      coachId,
      coachName: String(co.name),
      ownerNoSplit,
      hasRateCard: has,
      clients: rows,
      invoice: buildTjdInvoice(card, payable, weeks.length, ownerNoSplit),
    });
  }

  coaches.sort((a, b) => a.coachName.localeCompare(b.coachName));
  const totals = coaches.reduce(
    (s, c) => ({
      payroll: Math.round((s.payroll + c.invoice.payroll) * 100) / 100,
      revenue: Math.round((s.revenue + c.invoice.revenue) * 100) / 100,
      brandKeeps: Math.round((s.brandKeeps + c.invoice.brandKeeps) * 100) / 100,
      clients: s.clients + c.invoice.clients,
      weeksPaid: s.weeksPaid + c.invoice.weeksPaid,
    }),
    { payroll: 0, revenue: 0, brandKeeps: 0, clients: 0, weeksPaid: 0 },
  );

  const label = new Date(Date.UTC(year, month0, 1)).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
  return { month: ym, label, weeks, coaches, totals, issues };
}

export type TickResult = { ok: true; paidWeeks: string[] } | { ok: false; error: string };

/** Tick or untick one client-week. Idempotent, and audited both ways. */
export async function setPaidWeekAction(clientId: string, weekStart: string, paid: boolean): Promise<TickResult> {
  if (!isWeeksPaid()) return { ok: false, error: WRONG_BRAND };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const g = await gate();
  if (!g.canRunPayroll) return { ok: false, error: "Only the owner or an admin can tick paid weeks." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return { ok: false, error: "Bad week." };

  const db = dbAdmin();
  const { data: client } = await db.from("clients").select("id,name,coach_id,payer").eq("id", clientId).maybeSingle();
  if (!client) return { ok: false, error: "That client no longer exists." };
  const c = client as { id: string; name: string; coach_id: string | null; payer: string | null };

  const month = weekStart.slice(0, 7);
  const { year, month0 } = parseMonth(
    // The week belongs to the month its SUNDAY falls in, so derive it rather
    // than trusting the Monday's month.
    (() => {
      const [y, m, d] = weekStart.split("-").map(Number);
      const sun = new Date(Date.UTC(y, m - 1, d + 6));
      return `${sun.getUTCFullYear()}-${String(sun.getUTCMonth() + 1).padStart(2, "0")}`;
    })(),
  );
  void month;
  const weeks = weeksOfMonth(year, month0);

  if (paid) {
    // The monthly-payer cap is enforced HERE as well as in the maths, so a
    // fifth tick cannot be stored and then silently ignored at invoice time.
    const existing = await fetchAllRows<Record<string, unknown>>(
      (from, to) =>
        db.from("client_paid_weeks").select("week_start").eq("client_id", clientId)
          .gte("week_start", weeks[0].start).lte("week_start", weeks[weeks.length - 1].start)
          .order("id").range(from, to),
      { label: "tick: existing" },
    );
    const already = existing.map((e) => String(e.week_start));
    if (!already.includes(weekStart) && (c.payer ?? "weekly") === "monthly" && already.length >= 4) {
      return { ok: false, error: `${c.name} pays monthly, so one payment covers four weeks. The fifth cannot be ticked.` };
    }
    const { error } = await db
      .from("client_paid_weeks")
      .upsert({ client_id: clientId, coach_id: c.coach_id, week_start: weekStart, marked_by: g.id.role }, { onConflict: "client_id,week_start" });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await db.from("client_paid_weeks").delete().eq("client_id", clientId).eq("week_start", weekStart);
    if (error) return { ok: false, error: error.message };
  }

  try {
    await db.from("sync_events").insert({
      source: "manual", entity: "client", ghl_id: null,
      action: paid ? "paid_week_ticked" : "paid_week_unticked",
      payload: { client_id: clientId, client: c.name, coach_id: c.coach_id, week_start: weekStart, by: g.id.role },
    });
  } catch {
    /* best-effort */
  }

  const after = await fetchAllRows<Record<string, unknown>>(
    (from, to) =>
      db.from("client_paid_weeks").select("week_start").eq("client_id", clientId)
        .gte("week_start", weeks[0].start).lte("week_start", weeks[weeks.length - 1].start)
        .order("id").range(from, to),
    { label: "tick: after" },
  );
  revalidatePath("/payroll");
  revalidatePath("/my-pay");
  return { ok: true, paidWeeks: after.map((r) => String(r.week_start)) };
}

/** Tick every week of the month for one client, respecting the cap. */
export async function tickAllWeeksAction(clientId: string, ym: string, paid: boolean): Promise<TickResult> {
  const { year, month0 } = parseMonth(ym);
  const weeks = weeksOfMonth(year, month0);
  let last: TickResult = { ok: true, paidWeeks: [] };
  for (const w of weeks) {
    const r = await setPaidWeekAction(clientId, w.start, paid);
    // A monthly payer's fifth week refuses; that is expected, not a failure.
    if (!r.ok && !/pays monthly/.test(r.error)) return r;
    if (r.ok) last = r;
  }
  return last;
}
