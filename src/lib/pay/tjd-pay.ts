// TJD Fit payroll. Pure maths, no IO: the caller decides whether this model
// applies (BRAND.pay.model === "weeks-paid").
//
// TJD pays on a COMPLETELY different basis from DP Performance, so the two
// engines are kept apart on purpose. DP pays per check-in code (a submitted
// week earns the rate, a ghosted week earns half for two weeks: see
// coach-config PAY_RULES). TJD pays on WEEKS PAID: the weeks a client has
// actually paid for, ticked one by one. Not weeks coached, not a flat monthly
// figure. Nothing in here is ever reached on the DP brand.
//
// Source: the owner's coach rates SOP and master workbook (2026-09-26; kept
// locally, not in the repo). The rules:
//   - Rates are per client, per month. Weekly rate = monthly / 4, because
//     coaches are invoiced on weeks paid.
//   - A coach earns a higher REFERRAL rate on clients they personally brought
//     in (their own socials or funnels), for the LIFETIME of that client.
//     Brand-generated leads stay on the brand rate.
//   - A week counts in the month its SUNDAY (end) falls in.
//   - Weekly payers tick each week as its payment lands (4 most months, 5 in
//     a five-week month).
//   - Monthly payers tick the weeks their one payment covers, usually 4. In a
//     five-week month they still only get 4, because one monthly payment does
//     not cover a fifth week. Weekly payers DO get the fifth.
//   - The owner's own clients carry no coach split; they are tracked at the
//     client payment price.

/** How often the client checks in, which is also how they are billed. */
export type TjdCadence = "weekly" | "fortnightly";

/** Where the client came from. Decides which half of the rate card applies. */
export type TjdClientType = "brand" | "referral";

/** How the client pays, which decides whether a 5th week can be earned. */
export type TjdPayer = "weekly" | "monthly";

/**
 * One coach's rate card. Six numbers, all WEEKLY dollars (monthly / 4).
 * Per coach and editable in the portal: each coach is on different money,
 * and the owner changes them without a deploy.
 */
export type TjdRateCard = {
  brandWeekly: number;
  brandFortnightly: number;
  referralWeekly: number;
  referralFortnightly: number;
  /** What the CLIENT pays. Drives revenue and the brand's margin. */
  clientWeekly: number;
  clientFortnightly: number;
};

export type TjdPayClient = {
  clientId: string;
  clientName: string;
  cadence: TjdCadence;
  type: TjdClientType;
  payer: TjdPayer;
  /** Weeks ticked as PAID in the month being invoiced. */
  weeksPaid: number;
  /** Optional MONTHLY override for what this coach earns on this client.
   *  Blank means the standard rate card applies. Divided by 4 like any
   *  monthly figure. */
  customCoachMonthly?: number | null;
  /** Optional MONTHLY override for what the client pays. */
  customClientMonthly?: number | null;
  /** 12 week challenge clients are counted separately in the workbook. */
  challenge?: boolean;
};

export type TjdPayLine = {
  clientId: string;
  clientName: string;
  cadence: TjdCadence;
  type: TjdClientType;
  weeksPaid: number;
  /** Weeks actually invoiced, after the monthly-payer cap. */
  weeksInvoiced: number;
  /** Weekly dollars used for this line, after any override. */
  ratePerWeek: number;
  /** What the coach earns on this client this month. */
  invoiceable: number;
  /** What the client paid this month. */
  revenue: number;
  /** True when a custom monthly override replaced the rate card. */
  overridden: boolean;
  /** Set when the monthly-payer rule dropped a 5th week. */
  cappedFifthWeek: boolean;
};

export type TjdInvoice = {
  lines: TjdPayLine[];
  /** What we pay this coach for the month. */
  payroll: number;
  /** What the clients on this roster paid. */
  revenue: number;
  /** Revenue minus payroll. */
  brandKeeps: number;
  weeksPaid: number;
  clients: number;
  challengeClients: number;
};

/** Monthly figure to the weekly one the sheet invoices on. */
export const monthlyToWeekly = (monthly: number): number => monthly / 4;

/** The maximum weeks a payer can be invoiced for in a month of this length.
 *  A monthly payer's single payment never covers a 5th week; a weekly payer
 *  pays for it, so they earn it. */
export function invoiceableWeeks(payer: TjdPayer, weeksPaid: number, weeksInMonth: number): number {
  const cap = payer === "monthly" ? Math.min(4, weeksInMonth) : weeksInMonth;
  return Math.max(0, Math.min(weeksPaid, cap));
}

/** The coach's weekly rate for one client, before any override. */
export function rateFor(card: TjdRateCard, type: TjdClientType, cadence: TjdCadence): number {
  if (type === "referral") return cadence === "weekly" ? card.referralWeekly : card.referralFortnightly;
  return cadence === "weekly" ? card.brandWeekly : card.brandFortnightly;
}

/** What the client pays per week, before any override. */
export function clientRateFor(card: TjdRateCard, cadence: TjdCadence): number {
  return cadence === "weekly" ? card.clientWeekly : card.clientFortnightly;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Build one coach's invoice for the month.
 *
 * `weeksInMonth` is how many Mon-Sun weeks END in this month (4 or 5), which
 * is what decides whether a fifth week is available at all.
 *
 * `ownerNoSplit` is the owner's own roster: tracked at the client payment
 * price with no coach split, so those lines carry revenue but no payroll.
 */
export function buildTjdInvoice(
  card: TjdRateCard,
  clients: TjdPayClient[],
  weeksInMonth: number,
  ownerNoSplit = false,
): TjdInvoice {
  const lines: TjdPayLine[] = clients.map((c) => {
    const weeksInvoiced = invoiceableWeeks(c.payer, c.weeksPaid, weeksInMonth);
    const overridden = typeof c.customCoachMonthly === "number" && c.customCoachMonthly > 0;
    const rate = ownerNoSplit
      ? 0
      : overridden
        ? monthlyToWeekly(c.customCoachMonthly as number)
        : rateFor(card, c.type, c.cadence);
    const clientRate =
      typeof c.customClientMonthly === "number" && c.customClientMonthly > 0
        ? monthlyToWeekly(c.customClientMonthly)
        : clientRateFor(card, c.cadence);
    return {
      clientId: c.clientId,
      clientName: c.clientName,
      cadence: c.cadence,
      type: c.type,
      weeksPaid: c.weeksPaid,
      weeksInvoiced,
      ratePerWeek: round2(rate),
      invoiceable: round2(rate * weeksInvoiced),
      revenue: round2(clientRate * weeksInvoiced),
      overridden,
      cappedFifthWeek: c.weeksPaid > weeksInvoiced,
    };
  });

  const payroll = round2(lines.reduce((s, l) => s + l.invoiceable, 0));
  const revenue = round2(lines.reduce((s, l) => s + l.revenue, 0));
  return {
    lines,
    payroll,
    revenue,
    brandKeeps: round2(revenue - payroll),
    weeksPaid: lines.reduce((s, l) => s + l.weeksInvoiced, 0),
    clients: lines.length,
    challengeClients: clients.filter((c) => c.challenge).length,
  };
}

/**
 * How many Mon-Sun weeks END inside the given month. The SOP is explicit that
 * a week straddling month-end belongs to the month it FINISHES in, so this
 * counts Sundays, not days.
 */
export function weeksEndingInMonth(year: number, monthIndex0: number): number {
  const last = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  let count = 0;
  for (let d = new Date(Date.UTC(year, monthIndex0, 1)); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 0) count++; // Sunday ends the week
  }
  return count;
}

/** One Mon-Sun week, by the dates the ticking screen shows. */
export type TjdWeek = {
  /** Monday, ISO date. The key stored in client_paid_weeks.week_start. */
  start: string;
  /** Sunday, ISO date. The day that decides which month the week belongs to. */
  end: string;
  /** W1..W5, matching the master sheet's columns. */
  label: string;
};

const isoUtc = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The weeks of a payroll month, as real dates.
 *
 * Same rule as weeksEndingInMonth, which only counts them: a week belongs to
 * the month its SUNDAY falls in, so the week of Mon 29 Sep to Sun 5 Oct is
 * October's W1, not September's W5. Pure UTC arithmetic, so the answer does
 * not depend on the server's timezone.
 */
export function weeksOfMonth(year: number, monthIndex0: number): TjdWeek[] {
  const last = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  const out: TjdWeek[] = [];
  for (let d = new Date(Date.UTC(year, monthIndex0, 1)); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 0) continue; // Sundays only
    const end = new Date(d.getTime());
    const start = new Date(d.getTime());
    start.setUTCDate(start.getUTCDate() - 6);
    out.push({ start: isoUtc(start), end: isoUtc(end), label: `W${out.length + 1}` });
  }
  return out;
}

/** The payroll month a given date belongs to, by the Sunday rule. Returns
 *  "YYYY-MM". A Monday late in a month can belong to the NEXT month. */
export function payrollMonthOf(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  // Walk forward to that week's Sunday.
  const ahead = (7 - day.getUTCDay()) % 7;
  day.setUTCDate(day.getUTCDate() + ahead);
  return `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}`;
}
