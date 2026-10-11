type DeltaProps = {
  /** Signed change. Positive renders green/up, negative renders warm/down. */
  value: number;
  prefix?: string;
  suffix?: string;
  /** Override the displayed magnitude (e.g. pre-formatted). */
  format?: (absValue: number) => string;
  className?: string;
};

/** Arrow + colored value. Green up, warm down. Sits top-right of a KPI. */
export function Delta({ value, prefix = "", suffix = "", format, className = "" }: DeltaProps) {
  const dir = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const tone =
    dir === "up"
      ? "bg-positive-soft text-positive"
      : dir === "down"
        ? "bg-warn-soft text-warn"
        : "bg-surface-2 text-fg-muted";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "▬";
  const magnitude = format ? format(Math.abs(value)) : String(Math.abs(value));

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium tabular-nums ${tone} ${className}`}
    >
      <span aria-hidden className="text-[0.65em] leading-none">
        {arrow}
      </span>
      {prefix}
      {magnitude}
      {suffix}
    </span>
  );
}
