"use client";

// Per-page browser titles (2026-07-02): every tab used to say the same thing.
// One client component maps the current route to its nav label so the tab
// reads "Check-ins · DP Performance HQ" etc. Uses the same navigation config
// as the sidebar, so labels never drift.

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { getNavGroups, ROLES } from "@/lib/navigation";

// slug -> label across every role's nav (owner first so shared slugs keep the
// owner wording). Built once at module load.
const LABELS: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const role of ROLES) {
    for (const group of getNavGroups(role)) {
      for (const item of group.items) {
        if (!(item.slug in m)) m[item.slug] = item.label;
      }
    }
  }
  return m;
})();

export function TitleSetter() {
  const pathname = usePathname();
  useEffect(() => {
    const slug = pathname.split("/").filter(Boolean)[0] ?? "";
    const label = LABELS[slug];
    document.title = label ? `${label} · ${BRAND.name} HQ` : `${BRAND.name} HQ`;
  }, [pathname]);
  return null;
}
