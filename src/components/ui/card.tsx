import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Slightly roomier padding (24px) when true; default is 20px. */
  roomy?: boolean;
};

/** Base surface container: surface bg, 1px hairline border, 14px radius. */
export function Card({ roomy = false, className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-card border border-border bg-surface ${roomy ? "p-6" : "p-5"} ${className}`}
      {...props}
    />
  );
}
