"use client";

import { Cell, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip } from "recharts";

type Slice = { label: string; value: number };

// Theme-var palette (SVG honors var()); order matters, muted last for
// "unknown"-style slices.
const COLORS = ["var(--accent)", "var(--warn)", "var(--text-dim)", "var(--text-muted)", "var(--border)"];

/** Donut chart for share-of-total splits (H2 MRR split). Slices with value 0
 * are dropped; the legend below carries exact values. */
export function PieChart({
  data,
  height = 200,
  valuePrefix = "",
}: {
  data: Slice[];
  height?: number;
  valuePrefix?: string;
}) {
  const slices = data.filter((s) => s.value > 0);
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const fmt = (v: number) => `${valuePrefix}${v.toLocaleString()}`;

  return (
    <div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <Tooltip
              formatter={(value) => fmt(value as number)}
              contentStyle={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text)",
                fontSize: 12,
              }}
              itemStyle={{ color: "var(--text)" }}
            />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
              stroke="var(--panel)"
            >
              {slices.map((s, i) => (
                <Cell key={s.label} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 space-y-1">
        {slices.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="flex-1 text-fg-dim">{s.label}</span>
            <span className="tabular-nums text-fg">
              {fmt(s.value)} · {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
