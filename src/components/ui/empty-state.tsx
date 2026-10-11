import type { ReactNode } from "react";
import { Icon } from "@/lib/icons";

type EmptyStateProps = {
  /** Icon name from the icon set. */
  icon?: string;
  title: string;
  message?: string;
  /** Optional action slot (e.g. a Button). */
  action?: ReactNode;
  /** Tight vertical padding for small panels, so an empty panel hugs its
   *  content instead of holding a screen-sized blank. */
  compact?: boolean;
  className?: string;
};

/** Neutral empty state for screens and panels with no data. */
export function EmptyState({ icon = "dot", title, message, action, compact = false, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 px-6 text-center ${compact ? "py-4" : "py-12"} ${className}`}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-surface-2 text-fg-muted">
        <Icon name={icon} size={20} />
      </span>
      <div>
        <p className="text-sm font-medium text-fg">{title}</p>
        {message ? <p className="mt-1 text-xs text-fg-muted">{message}</p> : null}
      </div>
      {action}
    </div>
  );
}
