"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/navigation";

const DEV_ROLE_KEY = "tjd-dev-role";
const DEV_ROLE_COOKIE = "hq-dev-role";
const DEFAULT_ROLE: Role = "owner";

// Mirror the preview role into a cookie so SERVER components (the role-
// branched /dashboard) see the same role as the client shell. Dev-only
// plumbing: with AUTH_MODE=clerk the server ignores this cookie entirely.
function writeRoleCookie(role: Role) {
  try {
    document.cookie = `${DEV_ROLE_COOKIE}=${role}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // ignore
  }
}

type RoleContextValue = {
  role: Role;
  setRole: (role: Role) => void;
  /** True when the role comes from real auth (AUTH_MODE=clerk): the dev
   *  switcher hides and setRole is a no-op. */
  locked: boolean;
  /** Server-resolved head-coach elevation (coaches.role = 'head_coach') for
   *  the current coach identity. Only meaningful while role is "coach". */
  isHeadCoach: boolean;
  /** Display name of the signed-in person (or the coach whose portal an owner
   *  is viewing). Null in dev preview / when unknown. */
  displayName: string | null;
  /** The REAL signed-in role before impersonation (an owner viewing as a
   *  coach: role "coach", realRole "owner"). Equals `role` whenever the shell
   *  is not server-locked (dev preview), so a previewed role never inherits
   *  the previewer's powers. Together with `role` it drives brand pay
   *  visibility in the nav (TJD: viewing as a coach shows no My Pay). */
  realRole: Role;
};

const RoleContext = createContext<RoleContextValue | null>(null);

// Until real auth (M6), role is owner by default and can be previewed via the
// dev-only role switcher. The preference is persisted to localStorage so a
// preview survives reloads. This is NOT auth and grants no real access.
export function RoleProvider({
  children,
  authRole = null,
  isHeadCoach = false,
  displayName = null,
  realRole = null,
}: {
  children: React.ReactNode;
  /** Server-resolved role when AUTH_MODE=clerk; null in dev-preview mode. */
  authRole?: Role | null;
  /** Server-resolved head-coach flag (getServerIdentity). In dev preview it
   *  tracks the hq-dev-role/-coach cookies, which router.refresh keeps in
   *  sync with the client role state on every switch. */
  isHeadCoach?: boolean;
  /** Server-resolved display name for the sidebar profile. */
  displayName?: string | null;
  /** Server-resolved REAL role (getServerIdentity().realRole). Only honoured
   *  while the shell is locked to a server role (real auth or impersonation). */
  realRole?: Role | null;
}) {
  const locked = authRole !== null;
  const [role, setRoleState] = useState<Role>(authRole ?? DEFAULT_ROLE);
  const router = useRouter();

  useEffect(() => {
    if (locked) return; // real auth: ignore any stale dev preference
    const stored = localStorage.getItem(DEV_ROLE_KEY) as Role | null;
    if (stored) {
      setRoleState(stored);
      writeRoleCookie(stored); // keep server view in sync on load
    }
  }, [locked]);

  const setRole = useCallback(
    (next: Role) => {
      if (locked) return; // no role switching under real auth
      setRoleState(next);
      writeRoleCookie(next);
      try {
        localStorage.setItem(DEV_ROLE_KEY, next);
      } catch {
        // ignore storage failures
      }
      // Re-render server components (role-branched /dashboard) with the new cookie.
      router.refresh();
    },
    [router, locked],
  );

  const effectiveRole = authRole ?? role;
  const effectiveRealRole = locked ? realRole ?? effectiveRole : effectiveRole;
  return (
    <RoleContext.Provider
      // Head-coach elevation only ever applies to the coach shell, so a stale
      // flag can never leak oversight nav into another role during a switch.
      value={{ role: effectiveRole, setRole, locked, isHeadCoach: effectiveRole === "coach" && isHeadCoach, displayName, realRole: effectiveRealRole }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider");
  return ctx;
}
