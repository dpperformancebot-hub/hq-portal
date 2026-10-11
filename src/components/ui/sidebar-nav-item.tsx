"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type SidebarNavItemProps = {
  icon?: ReactNode;
  label: string;
  active?: boolean;
  /** Render as a link when provided; otherwise a button. */
  href?: string;
  onClick?: () => void;
  className?: string;
};

/** Icon + label nav row. Active = surface bg + hairline border + green icon. */
export function SidebarNavItem({
  icon,
  label,
  active = false,
  href,
  onClick,
  className = "",
}: SidebarNavItemProps) {
  const classes = `flex w-full items-center gap-3 rounded-control px-3 py-2 text-left text-sm font-medium transition-colors ${
    active
      ? "border border-border bg-surface text-fg"
      : "border border-transparent text-fg-dim hover:bg-surface-2"
  } ${className}`;

  const inner = (
    <>
      {icon ? (
        <span className={`flex h-[18px] w-[18px] items-center justify-center ${active ? "text-accent" : "text-fg-muted"}`}>
          {icon}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} aria-current={active ? "page" : undefined} className={classes}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={classes}>
      {inner}
    </button>
  );
}
