import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HQ_COLUMN_CLASS, HQ_MAIN_CLASS, HQ_SHELL_CLASS } from "@/components/shell/shell-classes";

// 2026-10-08 layout bug (coach view, both brands): the sidebar stopped short
// of the bottom of the window and /client-audits rendered as one narrow
// column. Root cause 1: absolutely positioned descendants (the sr-only labels
// on every audit card) resolved against the initial containing block because
// no shell ancestor was positioned, escaped main's overflow and made the
// DOCUMENT taller than the viewport, so the whole h-screen shell scrolled up.
// Root cause 2: the audits board was four fixed cadence columns, so a coach
// whose clients sit in one cadence got one quarter-width column.
//
// Node-only suite (no DOM): these pin the class contracts and assert the
// views' source keeps them. The visual check was done with Playwright at
// 1440x900 and 390x844 (see the fix report).

const src = (rel: string) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");
const classes = (c: string) => c.split(/\s+/);

describe("HQ shell is exactly one viewport tall and only <main> scrolls", () => {
  it("shell: positioned, full viewport height, clips overflow", () => {
    expect(classes(HQ_SHELL_CLASS)).toEqual(expect.arrayContaining(["relative", "flex", "h-screen", "overflow-hidden"]));
  });

  it("column: can shrink inside the flex shell", () => {
    expect(classes(HQ_COLUMN_CLASS)).toEqual(expect.arrayContaining(["flex", "flex-1", "flex-col", "min-h-0", "min-w-0"]));
  });

  it("main: positioned scroll container at full width, no max-w", () => {
    const c = classes(HQ_MAIN_CLASS);
    expect(c).toEqual(expect.arrayContaining(["relative", "flex-1", "overflow-y-auto", "w-full", "min-h-0"]));
    expect(c.some((x) => x.startsWith("max-w-"))).toBe(false);
  });

  it("the (hq) layout uses the shared classes for both shells, and the sidebar fills the height", () => {
    const layout = src("app/(hq)/layout.tsx");
    expect(layout.match(/className=\{HQ_SHELL_CLASS\}/g)).toHaveLength(2);
    expect(layout.match(/<main className=\{HQ_MAIN_CLASS\}>/g)).toHaveLength(2);
    expect(layout).not.toMatch(/<main className="/);
    const sidebar = src("components/shell/sidebar.tsx");
    expect(sidebar).toMatch(/<aside[\s\S]{0,40}className=\{`h-full w-60 shrink-0 flex-col/);
  });
});

describe("Client Audits uses the full width", () => {
  const view = src("components/screens/audits/audits-view.tsx");

  it("cards render in a responsive grid: 1 col phones, 2 md, 3 xl", () => {
    const m = view.match(/export const AUDIT_GRID_CLASS = "([^"]+)"/);
    expect(m).not.toBeNull();
    expect(classes(m![1])).toEqual(expect.arrayContaining(["grid", "grid-cols-1", "md:grid-cols-2", "xl:grid-cols-3"]));
    expect(view).toMatch(/className=\{AUDIT_GRID_CLASS\}/);
  });

  it("no narrow wrapper: no max-w / mx-auto container, no fixed 4-cadence column grid", () => {
    expect(view).not.toMatch(/max-w-(xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|screen)/);
    expect(view).not.toMatch(/mx-auto/);
    expect(view).not.toMatch(/xl:grid-cols-4/);
  });

  it("empty cadences are skipped rather than rendered as empty columns", () => {
    expect(view).toMatch(/if \(cadItems\.length === 0\) return null;/);
  });
});

describe("other coach pages keep the full width", () => {
  it("task board: grid columns, not fixed-width columns in a horizontal scroller", () => {
    const tasks = src("components/screens/tasks/tasks-view.tsx");
    const m = tasks.match(/export const TASK_BOARD_CLASS = "([^"]+)"/);
    expect(classes(m![1])).toEqual(expect.arrayContaining(["grid", "grid-cols-1", "md:grid-cols-2", "xl:grid-cols-4"]));
    expect(tasks).not.toMatch(/w-72 shrink-0/);
    expect(tasks).not.toMatch(/overflow-x-auto/);
  });

  it.each([
    "components/screens/coach-tools/feedback-view.tsx",
    "components/screens/coach-tools/loom-summary-view.tsx",
    "components/screens/coach-tools/coach-assistant-view.tsx",
    "components/screens/capacity/capacity-poll-view.tsx",
  ])("%s has no centred narrow page wrapper", (rel) => {
    expect(src(rel)).not.toMatch(/mx-auto max-w-/);
  });

  it("page header stacks on phones instead of squeezing the title beside the actions", () => {
    const header = src("components/ui/page-header.tsx");
    const m = header.match(/export const PAGE_HEADER_CLASS = "([^"]+)"/);
    expect(classes(m![1])).toEqual(expect.arrayContaining(["flex", "flex-col", "sm:flex-row"]));
    const a = header.match(/export const PAGE_HEADER_ACTIONS_CLASS = "([^"]+)"/);
    expect(classes(a![1])).toEqual(expect.arrayContaining(["flex-wrap", "sm:shrink-0"]));
  });
});
