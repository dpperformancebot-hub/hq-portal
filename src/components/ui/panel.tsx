import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

type PanelProps = {
  title: string;
  /** Right-aligned slot in the panel header. */
  action?: ReactNode;
  /** Small muted line under the title. */
  subtitle?: string;
  children: ReactNode;
  className?: string;
  /** Remove body padding (e.g. when embedding a full-bleed table). */
  flush?: boolean;
};

/** Card with a standard header: uppercase muted title + optional action. */
export function Panel({ title, action, subtitle, children, className = "", flush = false }: PanelProps) {
  return (
    <Card className={`flex flex-col ${flush ? "p-0" : ""} ${className}`}>
      <div className={`flex items-baseline justify-between gap-3 ${flush ? "px-5 pt-5" : ""}`}>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-fg-dim">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {/* flex-1 so an h-full panel's content can fill/distribute the card's
          height (R2-9); no effect when the card is content-sized. */}
      <div className={`flex-1 ${flush ? "mt-3" : "mt-4"}`}>{children}</div>
    </Card>
  );
}
