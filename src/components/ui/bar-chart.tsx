"use client";

import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartDatum = Record<string, string | number>;

type BarChartProps = {
  data: ChartDatum[];
  xKey: string;
  yKey: string;
  height?: number;
  /** Prefix for axis/tooltip values, e.g. "$". */
  valuePrefix?: string;
  /** Legend label for the primary series (shown only when comparing). */
  valueLabel?: string;
  /** Optional second, muted comparison series rendered as paired bars. */
  compareKey?: string;
  compareLabel?: string;
};

// Colors come from the theme via CSS variables (SVG honors var()).
const ACCENT = "var(--accent)";
const MUTED = "var(--text-muted)";
const GRID = "var(--border-soft)";
const AXIS_TEXT = "var(--text-muted)";

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-fg-dim">
      <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Revenue bar chart (A11), same prop contract as AreaChart so panels can
 * switch between the two without reshaping data. */
export function BarChart({
  data,
  xKey,
  yKey,
  height = 240,
  valuePrefix = "",
  valueLabel,
  compareKey,
  compareLabel,
}: BarChartProps) {
  const fmt = (v: number | string) =>
    `${valuePrefix}${typeof v === "number" ? v.toLocaleString() : v}`;
  const fmtTick = (v: number | string) =>
    typeof v === "number" && Math.abs(v) >= 1000
      ? `${valuePrefix}${Math.round(v / 1000)}k`
      : fmt(v);

  return (
    <div>
      {compareKey ? (
        <div className="mb-2 flex items-center gap-4">
          <LegendSwatch color={ACCENT} label={valueLabel ?? "Current"} />
          <LegendSwatch color={MUTED} label={compareLabel ?? "Comparison"} />
        </div>
      ) : null}
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
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
              cursor={{ fill: "var(--border-soft)", opacity: 0.35 }}
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
              <Bar
                name={compareLabel ?? "Comparison"}
                dataKey={compareKey}
                fill={MUTED}
                opacity={0.45}
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
            ) : null}
            <Bar
              name={valueLabel ?? "Current"}
              dataKey={yKey}
              fill={ACCENT}
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
            />
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
