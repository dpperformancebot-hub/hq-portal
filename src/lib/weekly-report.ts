// Weekly report (H1, FEEDBACK-V2). One computation shared by the
// /weekly-report page (renders live, screenshot-friendly) and the Monday
// cron (/api/reports/weekly) that snapshots it into the reports store.
// Server-only: reads the same selectors the dashboard uses.

import { CAPACITY_SLOTS, listWeekCapacity } from "@/lib/capacity";
import { getClientsData, getCoachNamesData, getRenewalsData } from "@/lib/data";
import { liveMode } from "@/lib/data";
import { persistenceEnabled } from "@/lib/db/client";
import * as live from "@/lib/live";

const DAY = 86_400_000;

export type WeeklyReportData = {
  /** Monday of LAST week (the week being reported). */
  weekStart: string;
  weekEnd: string;
  activeClients: number;
  mrr: number;
  gained: number;
  lost: number;
  net: number;
  transformationsLastWeek: number;
  /** Week ahead */
  renewalsDue7: number;
  renewalsOverdue: number;
  unassigned: number;
  capacity: { slots: number; answered: number; coaches: number } | null;
  /** Rule-based consultant review: what's leaking, what to fix. */
  review: string[];
};

const iso = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Monday 00:00 (local) of the week containing `now`. */
function mondayOf(now: number): number {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
}

export async function getWeeklyReportData(now: number = Date.now()): Promise<WeeklyReportData> {
  const thisMonday = mondayOf(now);
  const lastMonday = thisMonday - 7 * DAY;

  const [clients, renewals, weekCapacity, coachNames] = await Promise.all([
    getClientsData(),
    getRenewalsData(),
    listWeekCapacity(),
    getCoachNamesData(),
  ]);

  const active = clients.filter((c) => c.status === "active");
  const mrr = active.reduce((s, c) => s + c.monthlyRate, 0);
  const inLastWeek = (isoDate: string | null | undefined) => {
    if (!isoDate) return false;
    const t = Date.parse(isoDate);
    return !Number.isNaN(t) && t >= lastMonday && t < thisMonday;
  };
  const gained = clients.filter((c) => c.status !== "cancelled" && inLastWeek(c.startDate)).length;
  const lost = clients.filter((c) => c.status === "cancelled" && inLastWeek(c.endDate)).length;

  const transformationsLastWeek =
    liveMode() && persistenceEnabled()
      ? (await live.getTransformations()).filter((t) => inLastWeek(t.createdAt ?? null)).length
      : 0;

  const renewalsDue7 = renewals.filter((r) => r.daysToRenewal > 0 && r.daysToRenewal <= 7).length;
  const renewalsOverdue = renewals.filter((r) => r.daysToRenewal <= 0).length;
  const unassigned = clients.filter(
    (c) => (c.status === "active" || c.status === "paused") && !c.coachId,
  ).length;
  const capacity =
    weekCapacity.length === 0
      ? null
      : {
          slots: weekCapacity.reduce((s, c) => s + (CAPACITY_SLOTS[c.capacity] ?? 0), 0),
          answered: weekCapacity.length,
          coaches: Object.keys(coachNames).length,
        };

  // Consultant review: derived from the numbers, never invented.
  const review: string[] = [];
  if (lost > gained) {
    review.push(
      `Leaking: ${lost} cancelled against ${gained} new last week. Look at who churned and their week bracket before this repeats.`,
    );
  } else if (gained > 0 || lost > 0) {
    review.push(`Net ${gained - lost >= 0 ? "+" : ""}${gained - lost} last week (${gained} in, ${lost} out).`);
  } else {
    review.push("No client movement last week.");
  }
  if (renewalsOverdue > 0) {
    review.push(`${renewalsOverdue} renewal${renewalsOverdue === 1 ? " is" : "s are"} past term end with no call logged: book these first.`);
  }
  if (unassigned > 0) {
    review.push(`${unassigned} signed client${unassigned === 1 ? "" : "s"} still unassigned: assign in the Journey Tracker today.`);
  }
  if (capacity === null) {
    review.push("No coach has answered this week's capacity prompt yet: chase the Sunday check.");
  } else {
    if (capacity.answered < capacity.coaches) {
      review.push(`${capacity.coaches - capacity.answered} coach${capacity.coaches - capacity.answered === 1 ? "" : "es"} have not answered the capacity prompt.`);
    }
    if (capacity.slots === 0) {
      review.push("Team capacity is ZERO for the coming week: pause acquisition pushes or free up slots before selling.");
    }
  }
  if (renewalsDue7 > 0) {
    review.push(`${renewalsDue7} renewal call${renewalsDue7 === 1 ? "" : "s"} due this week: get them booked by Wednesday.`);
  }

  return {
    weekStart: iso(lastMonday),
    weekEnd: iso(thisMonday - DAY),
    activeClients: active.length,
    mrr,
    gained,
    lost,
    net: gained - lost,
    transformationsLastWeek,
    renewalsDue7,
    renewalsOverdue,
    unassigned,
    capacity,
    review,
  };
}

/** Plain-text body for the persisted report row (reports store). */
export function renderWeeklyReportBody(d: WeeklyReportData): string {
  const cap =
    d.capacity === null
      ? "no capacity answers yet"
      : `~${d.capacity.slots} slots (${d.capacity.answered}/${d.capacity.coaches} coaches answered)`;
  return [
    `Week ${d.weekStart} to ${d.weekEnd}`,
    "",
    "LAST WEEK",
    `Active clients: ${d.activeClients}`,
    `MRR: $${d.mrr.toLocaleString()}`,
    `Net change: ${d.net >= 0 ? "+" : ""}${d.net} (${d.gained} new, ${d.lost} cancelled)`,
    `Transformations logged: ${d.transformationsLastWeek}`,
    "",
    "WEEK AHEAD",
    `Team capacity: ${cap}`,
    `Renewal calls due this week: ${d.renewalsDue7} (${d.renewalsOverdue} overdue)`,
    `Unassigned clients: ${d.unassigned}`,
    "",
    "CONSULTANT REVIEW",
    ...d.review.map((r) => `- ${r}`),
  ].join("\n");
}
