import { DEMO_MODE } from "@/lib/demo";

/** Subtle indicator that the app is showing placeholder seed data, not live
 * client data. Remove with DEMO_MODE (src/lib/demo.ts) when real data lands. */
export function DemoBadge() {
  if (!DEMO_MODE) return null;
  return (
    <span
      title="Showing placeholder seed data, not live client data"
      className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-muted"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-pill bg-warn" />
      Demo data
    </span>
  );
}
