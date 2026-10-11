// Pure week maths + sorting for the check-in week grid (R16-2). Kept out of
// the component so the window shape, the future column and the default sort
// can be pinned by vitest without a DOM.

export const DAY = 86_400_000;
/** Columns on screen. 10 past + this week + 1 future = 12 fits a 1440px
 *  viewport beside the 240px sidebar without horizontal scroll (R16-2b). */
export const WEEKS_SHOWN = 12;
export const FUTURE_WEEKS = 1;

/** Monday 00:00 (local) of the week containing the date; ms epoch. */
export function weekStart(d: Date): number {
  const day = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
}

export const isoDate = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const fmtWeek = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

export type WeekColumn = { start: number; future: boolean; current: boolean };

/**
 * The visible window. Page 0 = (WEEKS_SHOWN - FUTURE_WEEKS - 1) past weeks,
 * this week, then FUTURE_WEEKS future column(s). Paging back shifts the whole
 * window by WEEKS_SHOWN weeks and never shows a future column, so a coach can
 * pre-mark next week but never two weeks out.
 */
export function buildWeekWindow(now: Date, pageBack: number): WeekColumn[] {
  const current = weekStart(now);
  const out: WeekColumn[] = [];
  if (pageBack <= 0) {
    const past = WEEKS_SHOWN - FUTURE_WEEKS - 1;
    for (let i = past; i >= 1; i--) out.push({ start: current - i * 7 * DAY, future: false, current: false });
    out.push({ start: current, future: false, current: true });
    for (let i = 1; i <= FUTURE_WEEKS; i++) out.push({ start: current + i * 7 * DAY, future: true, current: false });
    return out;
  }
  // Older pages: the newest column of page n is the week before page (n-1)'s oldest.
  const newest = current - (WEEKS_SHOWN - FUTURE_WEEKS - 1) * 7 * DAY - (pageBack - 1) * WEEKS_SHOWN * 7 * DAY - 7 * DAY;
  for (let i = WEEKS_SHOWN - 1; i >= 0; i--) out.push({ start: newest - i * 7 * DAY, future: false, current: false });
  return out;
}

export type SortKey = "start" | "name" | "day" | "plan" | "status";
export type SortDir = "asc" | "desc";
export const DEFAULT_SORT: { by: SortKey; dir: SortDir } = { by: "start", dir: "asc" };

const parseDate = (iso: string | null | undefined): number => {
  if (!iso) return Number.POSITIVE_INFINITY; // unknown start sorts last
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
};

/** Start-date sort: oldest first by default (Dan: "their oldest client's going
 *  to be at the top"); `desc` flips to newest first. Ties by name. */
export function sortByStart<T extends { name: string; startDate?: string | null }>(clients: T[], dir: SortDir): T[] {
  const arr = [...clients];
  arr.sort((a, b) => {
    const da = parseDate(a.startDate), db = parseDate(b.startDate);
    if (da !== db) {
      if (!Number.isFinite(da)) return 1;
      if (!Number.isFinite(db)) return -1;
      return dir === "asc" ? da - db : db - da;
    }
    return a.name.localeCompare(b.name);
  });
  return arr;
}

/** True when the client starts after today (R16-2a "starts <date>" pill). */
export function startsInFuture(startDate: string | null | undefined, now = new Date()): boolean {
  const t = parseDate(startDate);
  if (!Number.isFinite(t)) return false;
  return t > new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() + DAY - 1;
}

export const gridSortStorageKey = (scope: string) => `hq-checkin-grid-sort:${scope}`;
