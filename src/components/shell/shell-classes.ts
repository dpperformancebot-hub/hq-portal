// HQ shell layout classes, shared by src/app/(hq)/layout.tsx (standalone and
// embedded shells) and pinned by src/components/shell/shell-classes.test.ts.
//
// Full-height contract (2026-10-08 fix): the shell is exactly one viewport
// tall and ONLY <main> scrolls. Both the shell and <main> are positioned
// (`relative`) so absolutely positioned descendants, notably the `sr-only`
// form labels on every audit card, resolve against them and get clipped by
// main's overflow. Without it those labels resolved against the initial
// containing block, escaped every overflow:hidden/auto ancestor and stretched
// the DOCUMENT taller than the viewport, so the whole shell scrolled up and
// the sidebar stopped short of the bottom of the window.
export const HQ_SHELL_CLASS = "relative flex h-screen overflow-hidden bg-bg";

/** Right-hand column (banner + topbar + main). min-h-0 lets main shrink and
 *  scroll inside the fixed-height flex column instead of overflowing it. */
export const HQ_COLUMN_CLASS = "flex min-h-0 min-w-0 flex-1 flex-col";

/** The scroll container every HQ page renders into: full width (no max-w),
 *  16px gutters on phones, 32px from sm up. */
export const HQ_MAIN_CLASS = "relative min-h-0 w-full flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-6";
