"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useRole } from "@/components/role/role-provider";
import { getDefaultRoute, visibleSlugsFor } from "@/lib/navigation";

// Two jobs, both for the dev role switcher's preview (real enforcement comes
// with Clerk auth in M6):
//   1. On a ROLE SWITCH, land on the new role's default screen so the switcher
//      previews that role's home, not whatever page you were on. Owner is
//      exempt: owner has full access and should stay where they are.
//   2. On NAVIGATION within a non-owner role, bounce any route outside that
//      role's scoped nav back to its default (wrong-role redirect).
export function RouteGuard() {
  const pathname = usePathname();
  const { role, isHeadCoach, realRole } = useRole();
  const router = useRouter();
  // Tracks the role across renders so we can tell a role switch (preview the
  // new default screen) apart from ordinary navigation (scope check only).
  const prevRole = useRef(role);

  useEffect(() => {
    const roleChanged = prevRole.current !== role;
    prevRole.current = role;

    // Role switch -> always land on the new role's default screen, so the dev
    // switcher previews that role's home (its scoped dashboard) rather than
    // leaving you on whatever page you were on. Fires only on an actual switch,
    // never on ordinary navigation, so owner's full access is untouched.
    if (roleChanged) {
      router.replace(getDefaultRoute(role));
      return;
    }

    // Owner has full access to every screen, including ones reached from the
    // topbar or contextual links rather than the sidebar (Inbox, Tasks, etc).
    if (role === "owner") return;
    // First path segment, so nested routes like /client-database/c1 resolve.
    const slug = pathname.replace(/^\//, "").split("/")[0];
    if (!slug) return;
    // Head coach: the coach scope plus the Oversight screens (never
    // financials/team/settings, which stay outside the head-coach slug set).
    // realRole + role: on a brand where coaches do not see pay (TJD) an owner
    // viewing as a coach gets exactly the coach's scope, so /my-pay bounces
    // to the dashboard; on DP the owner keeps it.
    if (!visibleSlugsFor({ role, isHeadCoach, realRole }).has(slug)) {
      router.replace(getDefaultRoute(role));
    }
  }, [pathname, role, isHeadCoach, realRole, router]);

  return null;
}
