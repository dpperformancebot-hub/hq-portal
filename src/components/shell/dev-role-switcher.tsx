"use client";

import { useRole } from "@/components/role/role-provider";
import { ROLES, type Role } from "@/lib/navigation";

// Dev-only affordance to preview each role's shell. Not auth.
export function DevRoleSwitcher() {
  const { role, setRole, locked } = useRole();
  // Visible in dev, and on the deployed app while it is still behind the
  // password gate (pre-Clerk), so the owner can preview each role on the live
  // link. Hidden automatically once real auth is on (locked = AUTH_MODE=clerk),
  // so it never shows to logged-in team members.
  if (locked) return null;

  return (
    <label className="flex items-center gap-2 rounded-control border border-border bg-surface-2 px-2 py-1 text-xs text-fg-dim">
      <span className="text-fg-muted">Role</span>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        aria-label="Preview role (dev only)"
        className="bg-transparent text-xs font-medium capitalize text-fg focus:outline-none"
      >
        {ROLES.map((r) => (
          <option key={r} value={r} className="capitalize">
            {r}
          </option>
        ))}
      </select>
    </label>
  );
}
