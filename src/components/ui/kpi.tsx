import { Card } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { MiniSparkline } from "@/components/ui/mini-sparkline";
import { Sensitive } from "@/components/ui/sensitive";

type KpiProps = {
  label: string;
  value: string | number;
  /** e.g. "$" */
  prefix?: string;
  /** e.g. "%" */
  suffix?: string;
  /** Signed delta; renders a Delta pill top-right. */
  delta?: number;
  deltaSuffix?: string;
  deltaPrefix?: string;
  /** Supporting line under the value. */
  hint?: string;
  /** Optional mini sparkline series. */
  sparkline?: number[];
  /** When set, the whole card is clickable (dashboard drill-ins). */
  onClick?: () => void;
  /** Money value: blurs when the owner's "hide financials" toggle is on. */
  sensitive?: boolean;
  className?: string;
};

// Trim trailing zero decimals: 14.10 -> "14.1", 100.0 -> "100", 2.00 -> "2".
function trimNum(x: number, decimals: number): string {
  return x.toFixed(decimals).replace(/\.?0+$/, "");
}

// Abbreviate large numbers so KPI values stay short. Full value goes in title.
// Numbers under 10,000 render in full (with thousands separators).
function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${trimNum(abs / 1e9, 2)}B`;
  if (abs >= 1e6) return `${sign}${trimNum(abs / 1e6, 2)}M`;
  if (abs >= 1e4) return `${sign}${trimNum(abs / 1e3, 1)}k`;
  return n.toLocaleString();
}

export function Kpi({
  label,
  value,
  prefix = "",
  suffix = "",
  delta,
  deltaSuffix,
  deltaPrefix,
  hint,
  sparkline,
  onClick,
  sensitive = false,
  className = "",
}: KpiProps) {
  const isNum = typeof value === "number";
  const shown = isNum ? formatCompact(value) : value;
  const fullDisplay = isNum ? value.toLocaleString() : value;
  // No title on money KPIs: the tooltip would leak the full figure while blurred.
  const title = sensitive ? undefined : `${prefix}${fullDisplay}${suffix}`;
  const clickable = onClick
    ? "cursor-pointer transition-colors hover:border-accent/50 hover:bg-surface-2"
    : "";

  return (
    <Card
      className={`flex flex-col ${clickable} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
          {label}
        </span>
        {delta !== undefined ? (
          <Delta value={delta} prefix={deltaPrefix} suffix={deltaSuffix} />
        ) : null}
      </div>

      {/* container-type lets .kpi scale its font to the card width (no overflow) */}
      <div className="mt-2 [container-type:inline-size]">
        <div className={`kpi text-fg ${String(shown).length > 9 ? "kpi-long" : ""}`} title={title}>
          {sensitive ? (
            <Sensitive>
              {prefix}
              {shown}
              {suffix}
            </Sensitive>
          ) : (
            <>
              {prefix}
              {shown}
              {suffix}
            </>
          )}
        </div>
      </div>

      {hint ? <p className="mt-1.5 text-xs text-fg-dim">{hint}</p> : null}

      {sparkline ? (
        <div className="mt-3">
          <MiniSparkline data={sparkline} />
        </div>
      ) : null}
    </Card>
  );
}
