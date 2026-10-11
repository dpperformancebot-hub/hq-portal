"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { BRAND } from "@/lib/brand";
import { Icon } from "@/lib/icons";
import { getNavGroupsFor } from "@/lib/navigation";
import { useRole } from "@/components/role/role-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarNavItem } from "@/components/ui/sidebar-nav-item";
import { getUserStateAction, setUserStateAction } from "@/lib/user-state-actions";

// Hidden nav sections (2026-07-11, owner request: too many sections). Hover a
// group label -> "Hide" control; hidden groups collapse into a "Hidden" row at
// the bottom, click a name to restore. Persists per login (user_state) with a
// localStorage fallback so it applies instantly on load.
const HIDDEN_NAV_KEY = "hq-hidden-nav";

// Human label for a role, with head-coach elevation surfaced.
function roleLabel(role: string, isHeadCoach: boolean): string {
  if (role === "coach") return isHeadCoach ? "Head Coach" : "Coach";
  if (role === "owner") return "Owner";
  if (role === "sales") return "Sales";
  if (role === "va") return "VA";
  if (role === "admin") return "Admin";
  if (role === "ops_manager") return "Ops Manager";
  if (role === "ambassador_mgr") return "Ambassador Mgr";
  return role;
}

// Initials from a person's name (first + last word). Falls back to the brand
// initials when there is no name (dev preview / unresolved user).
function initialsFrom(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return BRAND.initials;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Bottom-left profile: the signed-in person, plus a menu with Log out. Sign-
// out goes through Clerk (AUTH_MODE=clerk in production) and lands on the
// sign-in page; ClerkProvider wraps the whole app so this is safe in dev too.
function SidebarProfile() {
  const { role, isHeadCoach, displayName } = useRole();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const name = displayName?.trim() || BRAND.name;

  const logout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut({ redirectUrl: "/sign-in" });
    } catch {
      // If Clerk sign-out fails, fall back to a hard navigation to sign-in.
      window.location.href = "/sign-in";
    }
  };

  return (
    <div className="relative mt-3">
      {open ? (
        <>
          {/* click-away layer */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute bottom-full left-0 z-50 mb-2 w-full overflow-hidden rounded-control border border-border bg-surface shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={logout}
              disabled={signingOut}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-fg transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <Icon name="logout" size={16} />
              {signingOut ? "Signing out..." : "Log out"}
            </button>
          </div>
        </>
      ) : null}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-control py-1 pl-0 pr-1 text-left transition-colors hover:bg-surface-2"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-accent-soft text-xs font-semibold text-accent-deep">
          {initialsFrom(displayName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{name}</span>
          <span className="block truncate text-xs text-fg-muted">{roleLabel(role, isHeadCoach)}</span>
        </span>
        <Icon name="chevron_right" size={15} className={`shrink-0 text-fg-muted transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
    </div>
  );
}

function loadLocal(): string[] {
  try {
    const raw = window.localStorage.getItem(HIDDEN_NAV_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Brand mark: the real logo when /public/brands/<brand>.png exists, the
 *  initials block otherwise (onError flips the fallback, so a missing file
 *  never renders as a broken image). */
function BrandMark() {
  const [failed, setFailed] = useState(false);
  if (BRAND.logoSrc && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small static asset, no optimizer needed
      <img
        src={BRAND.logoSrc}
        alt={`${BRAND.name} logo`}
        className="h-8 w-8 shrink-0 rounded-control object-contain"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-accent text-sm font-bold tracking-tight text-white"
    >
      {BRAND.initials}
    </span>
  );
}

export function Sidebar({ forceVisible = false }: { forceVisible?: boolean }) {
  const pathname = usePathname();
  const { role, isHeadCoach, realRole } = useRole();
  const groups = getNavGroupsFor({ role, isHeadCoach, realRole });
  const [hidden, setHidden] = useState<string[]>([]);

  // localStorage applies instantly; the per-login server copy (if any) then
  // takes over so the preference follows the person across devices.
  useEffect(() => {
    setHidden(loadLocal());
    getUserStateAction(HIDDEN_NAV_KEY)
      .then((v) => {
        if (Array.isArray(v)) setHidden(v.filter((x): x is string => typeof x === "string"));
      })
      .catch(() => {});
  }, []);

  const persist = (next: string[]) => {
    setHidden(next);
    try {
      window.localStorage.setItem(HIDDEN_NAV_KEY, JSON.stringify(next));
    } catch {}
    void setUserStateAction(HIDDEN_NAV_KEY, next).catch(() => {});
  };

  const hide = (label: string) => persist([...hidden, label]);
  const show = (label: string) => persist(hidden.filter((h) => h !== label));

  const visibleGroups = groups.filter((g) => !hidden.includes(g.label));
  // Only offer restore for groups that exist for THIS role (stale labels from
  // a previous role stay stored but are not shown).
  const hiddenHere = groups.filter((g) => hidden.includes(g.label));

  return (
    <aside
      className={`h-full w-60 shrink-0 flex-col border-r border-border bg-surface ${
        forceVisible ? "flex" : "hidden md:flex"
      }`}
    >
      {/* Brand lockup: mark sits on the nav row's left edge; wordmark aligns
          with the nav labels. */}
      <div className="flex items-center gap-3 px-3 pb-4 pt-5">
        <BrandMark />
        <div className="min-w-0 leading-none">
          <div className="truncate font-display text-xl leading-none tracking-display text-fg">
            {BRAND.name}
          </div>
          <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
            {BRAND.tagline}
          </div>
        </div>
      </div>

      {/* Search: opens the global command palette (single search surface). */}
      <div className="px-3 pb-2">
        <button
          type="button"
          aria-label="Search clients, coaches, leads, screens"
          onClick={() => window.dispatchEvent(new Event("hq:open-search"))}
          className="flex w-full items-center gap-2 rounded-control border border-border bg-surface-2 px-3 py-2 text-fg-muted transition-colors hover:text-fg-dim"
        >
          <Icon name="search" size={15} />
          <span className="flex-1 text-left text-sm">Search</span>
          <kbd className="rounded-sm border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Grouped nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {visibleGroups.map((group) => (
          <div key={group.label} className="group/nav mt-3 first:mt-1">
            <div className="flex items-center justify-between px-3 pb-1 pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
                {group.label}
              </span>
              <button
                type="button"
                onClick={() => hide(group.label)}
                title={`Hide ${group.label}`}
                aria-label={`Hide the ${group.label} section`}
                className="hidden text-[10px] font-medium text-fg-muted transition-colors hover:text-fg group-hover/nav:block"
              >
                Hide
              </button>
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const href = `/${item.slug}`;
                return (
                  <SidebarNavItem
                    key={item.slug}
                    href={href}
                    label={item.label}
                    icon={<Icon name={item.icon} size={17} />}
                    active={pathname === href}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {hiddenHere.length > 0 ? (
          <div className="mt-4 border-t border-border-soft px-3 pt-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-muted">Hidden</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {hiddenHere.map((g) => (
                <button
                  key={g.label}
                  type="button"
                  onClick={() => show(g.label)}
                  title={`Show ${g.label} again`}
                  className="rounded-pill border border-border px-2 py-0.5 text-[11px] text-fg-dim transition-colors hover:border-accent/40 hover:text-fg"
                >
                  {g.label} +
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </nav>

      {/* Pinned bottom: theme toggle + profile (with Log out menu) */}
      <div className="border-t border-border p-3">
        <ThemeToggle />
        <SidebarProfile />
      </div>
    </aside>
  );
}
