import type { ReactNode } from "react";
import { BackLink } from "@/components/ui/back-link";

type PageHeaderProps = {
  /** Small uppercase label above the title. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Right-aligned actions slot (buttons, toggles). */
  actions?: ReactNode;
  /** Renders a "← Dashboard" back control above the eyebrow (drill-in
   *  targets). history.back() when possible, else navigates to backHref. */
  back?: boolean;
  backHref?: string;
  backLabel?: string;
  className?: string;
};

/** Phones: title block on top at full width, actions wrap underneath (they
 *  used to sit beside the title with shrink-0, squeezing the title into a
 *  one-word-per-line column and pushing buttons off the right edge). From sm
 *  up: unchanged, title left and actions right. */
export const PAGE_HEADER_CLASS = "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4";
export const PAGE_HEADER_ACTIONS_CLASS = "flex flex-wrap items-center gap-2 sm:shrink-0";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  back = false,
  backHref,
  backLabel,
  className = "",
}: PageHeaderProps) {
  return (
    <header className={`${PAGE_HEADER_CLASS} ${className}`}>
      <div className="min-w-0">
        {back ? <BackLink href={backHref} label={backLabel} /> : null}
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-accent">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-3xl tracking-display text-fg">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-fg-dim">{subtitle}</p> : null}
      </div>
      {actions ? <div className={PAGE_HEADER_ACTIONS_CLASS}>{actions}</div> : null}
    </header>
  );
}
