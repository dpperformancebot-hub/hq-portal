// Monthly-average churn (A5, owner rule): churn on the coach leaderboard and
// Coach Performance is the average of each calendar month's churn rate, not
// the all-time cancelled/(active+cancelled) share. Pure date maths so it is
// unit-testable and shared by the live scorecards.

const WEEK_MS = 7 * 86_400_000;

// R5-5 (Dan's rule): clients who cancel before ~week 3 are early dropouts,
// not a coaching failure, and skew a coach's churn / avg-week-at-churn
// unfairly (the Stephen case). They are EXCLUDED from churn maths entirely:
// not counted as churned AND not counted in the denominator. Documented on
// every churn label via CHURN_EXCLUSION_NOTE.
export const EARLY_DROP_WEEKS = 3;
export const CHURN_EXCLUSION_NOTE = `Clients cancelling before week ${EARLY_DROP_WEEKS} are excluded.`;

export type ChurnClient = {
  /** R17-1a: null when GHL has no start date. Such clients are skipped: a
   *  cohort cannot place a client whose start is unknown. */
  startDate: string | null;
  /** R17-1b: portal override, wins over startDate when set. */
  startDateOverride?: string | null;
  /** Cancellation date when known. Null/undefined = still on the books. */
  endDate?: string | null;
};

/** R17-1: the start we actually trust (portal override, else GHL). NaN when
 *  unknown, which the existing !Number.isNaN filters already drop: a client
 *  whose start is unknown cannot be placed in a cohort. */
const startOf = (c: ChurnClient): number => {
  const iso = c.startDateOverride ?? c.startDate;
  return iso ? Date.parse(iso) : Number.NaN;
};

/** True when the client cancelled before the early-dropout cutoff. */
function earlyDrop(c: { start: number; end: number | null }): boolean {
  return c.end !== null && (c.end - c.start) / WEEK_MS < EARLY_DROP_WEEKS;
}

/** One complete calendar month of a coach's retention history (D1/D2). */
export type MonthlyRetentionPoint = {
  /** "2026-01" */
  month: string;
  /** "Jan 26" */
  label: string;
  /** Roster counted for the month: at month start + started during. */
  denom: number;
  churned: number;
  /** churned / denom, 0..1. */
  churn: number;
  /** 1 - churn, 0..1. */
  retention: number;
  /** D2 (Dan's formula): sum of each churned client's tenure in weeks ÷
   *  churned count, tenure = (cancel date − start date) / 7. Null when nobody
   *  churned that month. */
  avgChurnWeeks: number | null;
};

const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Per-month retention/churn series over a coach's history: every complete
 *  calendar month from the first client start through the previous month.
 *  Months with an empty denominator are skipped.
 *
 *  denomBasis (R8-3): "on-books" (default, the coach-level A5/D1 rule) counts
 *  everyone on the roster during the month; "end-active" is Dan's dashboard
 *  formula, churned ÷ END-of-month active (his 32 ÷ 442 = 7.24% example). */
export function monthlyRetentionSeries(
  clients: ChurnClient[],
  now: number = Date.now(),
  denomBasis: "on-books" | "end-active" = "on-books",
): MonthlyRetentionPoint[] {
  const parsed = clients
    .map((c) => ({
      start: startOf(c),
      end: c.endDate ? Date.parse(c.endDate) : null,
    }))
    .filter((c) => !Number.isNaN(c.start))
    // R5-5: early dropouts (<3 weeks) leave the maths entirely.
    .filter((c) => !earlyDrop(c));
  if (parsed.length === 0) return [];

  const nowDate = new Date(now);
  const currentMonthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
  const first = new Date(Math.min(...parsed.map((c) => c.start)));
  let cursor = new Date(first.getFullYear(), first.getMonth(), 1);

  const out: MonthlyRetentionPoint[] = [];
  while (cursor.getTime() < currentMonthStart) {
    const monthStart = cursor.getTime();
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const monthEnd = nextMonth.getTime();
    const atStart = parsed.filter(
      (c) => c.start < monthStart && (c.end === null || c.end >= monthStart),
    ).length;
    const startedDuring = parsed.filter((c) => c.start >= monthStart && c.start < monthEnd).length;
    const churnedClients = parsed.filter(
      (c) => c.end !== null && c.end >= monthStart && c.end < monthEnd,
    );
    const endActive = parsed.filter(
      (c) => c.start < monthEnd && (c.end === null || c.end >= monthEnd),
    ).length;
    const denom = denomBasis === "end-active" ? endActive : atStart + startedDuring;
    if (denom > 0) {
      const churn = churnedClients.length / denom;
      const tenureWeeks = churnedClients.map((c) => Math.max(0, ((c.end as number) - c.start) / WEEK_MS));
      out.push({
        month: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
        label: `${MONTH_LABEL[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`,
        denom,
        churned: churnedClients.length,
        churn,
        retention: 1 - churn,
        avgChurnWeeks:
          tenureWeeks.length === 0
            ? null
            : Math.round((tenureWeeks.reduce((s, w) => s + w, 0) / tenureWeeks.length) * 10) / 10,
      });
    }
    cursor = nextMonth;
  }
  return out;
}

/** Average of per-month churn rates over a coach's history, 0..1.
 *
 *  Derived from monthlyRetentionSeries (complete months only). If the coach's
 *  history is entirely inside the current month, that partial month is used so
 *  a brand-new coach is not pinned at 0.
 */
export function monthlyAverageChurn(clients: ChurnClient[], now: number = Date.now()): number {
  const series = monthlyRetentionSeries(clients, now);
  if (series.length > 0) {
    return series.reduce((s, m) => s + m.churn, 0) / series.length;
  }
  // History entirely inside the running month: use it rather than report 0/0.
  const parsed = clients
    .map((c) => ({ start: startOf(c), end: c.endDate ? Date.parse(c.endDate) : null }))
    .filter((c) => !Number.isNaN(c.start))
    .filter((c) => !earlyDrop(c));
  if (parsed.length === 0) return 0;
  const churned = parsed.filter((c) => c.end !== null && c.end <= now).length;
  return churned / parsed.length;
}

/** Lifetime average month-to-month retention, 0..1 (D1: replaces the all-time
 *  active/(active+cancelled) share on coach cards). */
export function monthlyAverageRetention(clients: ChurnClient[], now: number = Date.now()): number {
  return 1 - monthlyAverageChurn(clients, now);
}

/** R8-3 (Dan's dashboard formula): the MAIN dashboard churn/retention pair
 *  plus the total Average Week at Churn. Runs over the WHOLE roster (total
 *  churned basis, never an average of coach averages, so nothing compounds):
 *  per month churned ÷ end-of-month active, averaged across months;
 *  retention = 1 − churn. avgWeekAtChurn = mean tenure in weeks across every
 *  churned client, all coaches combined (null until anyone has churned).
 *  R5-5 early dropouts stay excluded throughout. */
export function dashboardChurnStats(
  clients: ChurnClient[],
  now: number = Date.now(),
): { churnPct: number; retentionPct: number; avgWeekAtChurn: number | null; months: number } {
  const series = monthlyRetentionSeries(clients, now, "end-active");
  const churn =
    series.length > 0 ? series.reduce((s, m) => s + m.churn, 0) / series.length : 0;
  const parsed = clients
    .map((c) => ({ start: startOf(c), end: c.endDate ? Date.parse(c.endDate) : null }))
    .filter((c) => !Number.isNaN(c.start))
    .filter((c) => !earlyDrop(c));
  const tenures = parsed
    .filter((c) => c.end !== null && c.end <= now)
    .map((c) => Math.max(0, ((c.end as number) - c.start) / WEEK_MS));
  return {
    churnPct: churn * 100,
    retentionPct: (1 - churn) * 100,
    avgWeekAtChurn:
      tenures.length === 0
        ? null
        : Math.round((tenures.reduce((s, w) => s + w, 0) / tenures.length) * 10) / 10,
    months: series.length,
  };
}
