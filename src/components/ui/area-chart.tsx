"use client";

import { useId } from "react";
import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartDatum = Record<string, string | number>;

type AreaChartProps = {
  data: ChartDatum[];
  xKey: string;
  yKey: string;
  height?: number;
  /** Prefix for axis/tooltip values, e.g. "$". */
  valuePrefix?: string;
  /** Legend label for the primary series (shown only when comparing). */
  valueLabel?: string;
  /** Optional second, muted comparison series. */
  compareKey?: string;
  compareLabel?: string;
};

// Colors come from the theme via CSS variables (SVG honors var()).
const ACCENT = "var(--accent)";
const MUTED = "var(--text-muted)";
const GRID = "var(--border-soft)";
const AXIS_TEXT = "var(--text-muted)";

function LegendDot({ color, dashed = false, label }: { color: string; dashed?: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-fg-dim">
      <span
        className="inline-block h-0.5 w-4 rounded-pill"
        style={{ background: dashed ? "transparent" : color, borderTop: dashed ? `2px dashed ${color}` : undefined }}
      />
      {label}
    </span>
  );
}

/** Revenue / cash trend area chart with a green gradient fill. Optionally
 * overlays a muted comparison series with a small legend. */
export function AreaChart({
  data,
  xKey,
  yKey,
  height = 240,
  valuePrefix = "",
  valueLabel,
  compareKey,
  compareLabel,
}: AreaChartProps) {
  const gradientId = useId();
  // Full value for the tooltip.
  const fmt = (v: number | string) =>
    `${valuePrefix}${typeof v === "number" ? v.toLocaleString() : v}`;
  // Compact value for Y-axis ticks so labels never clip the axis band (e.g. $30k).
  const fmtTick = (v: number | string) =>
    typeof v === "number" && Math.abs(v) >= 1000
      ? `${valuePrefix}${Math.round(v / 1000)}k`
      : fmt(v);

  return (
    <div>
      {compareKey ? (
        <div className="mb-2 flex items-center gap-4">
          <LegendDot color={ACCENT} label={valueLabel ?? "Current"} />
          <LegendDot color={MUTED} dashed label={compareLabel ?? "Comparison"} />
        </div>
      ) : null}
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsAreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey={xKey}
              tick={{ fill: AXIS_TEXT, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
            />
            <YAxis
              tick={{ fill: AXIS_TEXT, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={fmtTick}
            />
            <Tooltip
              cursor={{ stroke: GRID }}
              formatter={(value) => fmt(value as number)}
              contentStyle={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text)",
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--text-dim)" }}
              itemStyle={{ color: "var(--text)" }}
            />
            {compareKey ? (
              <Area
                type="monotone"
                name={compareLabel ?? "Comparison"}
                dataKey={compareKey}
                stroke={MUTED}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                fill="none"
                dot={false}
              />
            ) : null}
            <Area
              type="monotone"
              name={valueLabel ?? "Current"}
              dataKey={yKey}
              stroke={ACCENT}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
            />
          </RechartsAreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
