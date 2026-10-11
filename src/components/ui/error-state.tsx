import type { ReactNode } from "react";
import { Icon } from "@/lib/icons";

type ErrorStateProps = {
  title?: string;
  message?: string;
  /** Retry handler (e.g. an error boundary reset). */
  onRetry?: () => void;
  action?: ReactNode;
  className?: string;
};

/** Neutral error state for screens and error boundaries. */
export function ErrorState({
  title = "Something went wrong",
  message = "This screen could not load. Try again.",
  onRetry,
  action,
  className = "",
}: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 px-6 py-12 text-center ${className}`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-danger-soft text-danger">
        <Icon name="bell" size={20} />
      </span>
      <div>
        <p className="text-sm font-medium text-fg">{title}</p>
        <p className="mt-1 text-xs text-fg-muted">{message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-control border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
        >
          Try again
        </button>
      ) : null}
      {action}
    </div>
  );
}
