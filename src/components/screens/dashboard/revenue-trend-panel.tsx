"use client";

import { useState } from "react";
import { AreaChart, BarChart, EmptyState, Panel, SegmentedControl } from "@/components/ui";
import { useSensitive } from "@/components/sensitive-provider";

type Point = { month: string; value: number };
type Range = "1M" | "3M" | "6M" | "1Y" | "Custom";
type CompareMode = "none" | "lastYear" | "prevPeriod" | "custom";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const RANGE_COUNT: Record<Exclude<Range, "Custom">, number> = { "1M": 2, "3M": 3, "6M": 6, "1Y": 12 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const monthIdx = (dateStr: string, fallback: number) => {
  if (!dateStr) return fallback;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? fallback : d.getMonth();
};

function compareLabelText(mode: CompareMode, from: string): string {
  if (mode === "lastYear") return "last year";
  if (mode === "prevPeriod") return "previous period";
  if (mode === "custom" && from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  return "custom range";
}

const dateInput =
  "rounded-control border border-border bg-surface px-2 py-1 text-xs text-fg focus:outline-none";

export function RevenueTrendPanel({
  series,
  lastYear,
  prevPeriod,
  weeklySeries = [],
  empty = false,
}: {
  series: Point[];
  lastYear: number[];
  prevPeriod: number[];
  /** Weekly revenue points (A11): drawn instead of months when the visible
   *  range is under 6 months. */
  weeklySeries?: Point[];
  empty?: boolean;
}) {
  const { blurred } = useSensitive();
  const [range, setRange] = useState<Range>("6M");
  // R2-8: bars (A11 default) or the original line view.
  const [chartType, setChartType] = useState<"bars" | "line">("bars");
  const [customRange, setCustomRange] = useState({ from: "2026-01-01", to: "2026-06-30" });
  const [compareMode, setCompareMode] = useState<CompareMode>("none");
  const [customCompare, setCustomCompare] = useState({ from: "2025-05-01", to: "2025-10-31" });

  // Resolve the visible index window. Comparison arrays are index-aligned, so
  // the same window slices them. (Seed has 6 monthly points; ranges approximate.)
  let startIdx = series.length - (range === "Custom" ? series.length : RANGE_COUNT[range]);
  let endIdx = series.length - 1;
  if (range === "Custom") {
    startIdx = clamp(monthIdx(customRange.from, 0), 0, series.length - 1);
    endIdx = clamp(monthIdx(customRange.to, series.length - 1), startIdx, series.length - 1);
  }
  startIdx = clamp(startIdx, 0, series.length - 1);

  // A11: monthly BARS by default; a visible range under 6 months switches to
  // weekly bars (when weekly data exists). Comparison overlays are
  // month-aligned, so they only draw in monthly mode.
  const visibleMonths = endIdx - startIdx + 1;
  const useWeekly = weeklySeries.length > 0 && visibleMonths < 6;

  const compareActive = compareMode !== "none" && !useWeekly;
  const compareArr = compareMode === "prevPeriod" ? prevPeriod : lastYear; // custom reuses prior-year shape
  const compareLabel = compareLabelText(compareMode, customCompare.from);

  const visible = series.slice(startIdx, endIdx + 1);
  const visibleCompare = compareArr.slice(startIdx, endIdx + 1);

  // Weekly window: about 4.33 weeks per visible month, capped by the data.
  const weekCount = Math.max(2, Math.min(weeklySeries.length, Math.round(visibleMonths * 4.33)));
  const weeklyVisible = weeklySeries.slice(weeklySeries.length - weekCount);

  const allRows = useWeekly
    ? weeklyVisible.map((pt) => ({ month: pt.month, value: pt.value }))
    : visible.map((pt, i) => ({
        month: pt.month,
        value: pt.value,
        ...(compareActive ? { compare: visibleCompare[i] ?? 0 } : {}),
      }));

  // A12: honest states instead of a static-looking plot. Periods before any
  // data exists sample to 0; drop that leading dead zone (keeping at least 2
  // bars) and say so. A range with no data at all gets an empty state.
  const noData = allRows.every(
    (r) => r.value === 0 && ((r as { compare?: number }).compare ?? 0) === 0,
  );
  const firstDataIdx = allRows.findIndex((r) => r.value > 0);
  const trimIdx = Math.max(0, Math.min(firstDataIdx, allRows.length - 2));
  const rows = firstDataIdx > 0 ? allRows.slice(trimIdx) : allRows;
  const trimmed = rows.length < allRows.length;

  const sumCurrent = visible.reduce((s, p) => s + p.value, 0);
  const sumCompare = visibleCompare.reduce((s, v) => s + v, 0);
  const deltaPct = sumCompare === 0 ? 0 : ((sumCurrent - sumCompare) / sumCompare) * 100;

  return (
    <Panel
      title="Revenue trend"
      className="lg:col-span-2"
      action={
        <SegmentedControl
          aria-label="Range"
          size="sm"
          value={range}
          onChange={(v) => setRange(v as Range)}
          options={[
            { label: "1M", value: "1M" },
            { label: "3M", value: "3M" },
            { label: "6M", value: "6M" },
            { label: "1Y", value: "1Y" },
            { label: "Custom", value: "Custom" },
          ]}
        />
      }
    >
      {empty ? (
        <EmptyState icon="trending_up" title="No revenue yet" message="Revenue appears once clients are billing." />
      ) : (
        <div className="space-y-3">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {range === "Custom" ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-fg-muted">Range</span>
                <input type="date" value={customRange.from} onChange={(e) => setCustomRange((r) => ({ ...r, from: e.target.value }))} className={dateInput} aria-label="Range from" />
                <span className="text-xs text-fg-muted">to</span>
                <input type="date" value={customRange.to} onChange={(e) => setCustomRange((r) => ({ ...r, to: e.target.value }))} className={dateInput} aria-label="Range to" />
              </div>
            ) : null}

            {/* R2-8: bars/line toggle; bars stay the default. */}
            <SegmentedControl
              aria-label="Chart type"
              size="sm"
              value={chartType}
              onChange={(v) => setChartType(v as "bars" | "line")}
              options={[
                { label: "Bars", value: "bars" },
                { label: "Line", value: "line" },
              ]}
            />

            <div className="flex items-center gap-2">
              <span className="text-xs text-fg-muted">Compare</span>
              <SegmentedControl
                aria-label="Compare"
                size="sm"
                value={compareMode}
                onChange={(v) => setCompareMode(v as CompareMode)}
                options={[
                  { label: "None", value: "none" },
                  { label: "Last yr", value: "lastYear" },
                  { label: "Prev", value: "prevPeriod" },
                  { label: "Custom", value: "custom" },
                ]}
              />
            </div>

            {compareMode === "custom" ? (
              <div className="flex items-center gap-1.5">
                <input type="date" value={customCompare.from} onChange={(e) => setCustomCompare((r) => ({ ...r, from: e.target.value }))} className={dateInput} aria-label="Compare from" />
                <span className="text-xs text-fg-muted">to</span>
                <input type="date" value={customCompare.to} onChange={(e) => setCustomCompare((r) => ({ ...r, to: e.target.value }))} className={dateInput} aria-label="Compare to" />
              </div>
            ) : null}
          </div>

          {compareActive ? (
            <div className="text-sm">
              <span className={`font-medium ${deltaPct >= 0 ? "text-positive" : "text-warn"}`}>
                {deltaPct >= 0 ? "+" : ""}
                {deltaPct.toFixed(0)}%
              </span>{" "}
              <span className="text-fg-dim">vs {compareLabel}</span>
            </div>
          ) : null}

          {useWeekly && compareMode !== "none" ? (
            <p className="text-xs text-fg-muted">Compare is monthly only; showing weekly bars for this range.</p>
          ) : null}
          {trimmed && !noData ? (
            <p className="text-xs text-fg-muted">
              History starts at {rows[0]?.month}; earlier periods have no billing data.
            </p>
          ) : null}

          {noData ? (
            <EmptyState
              icon="trending_up"
              title="No data for this range"
              message="There is no billing history in this window yet. Try a shorter range."
            />
          ) : (
            /* Blur the whole plot (axis + values + shape) when financials are hidden. */
            <div className={blurred ? "select-none blur-[6px] transition-[filter] duration-150" : ""}>
              {chartType === "bars" ? (
                <BarChart
                  data={rows}
                  xKey="month"
                  yKey="value"
                  valuePrefix="$"
                  valueLabel="This period"
                  compareKey={compareActive ? "compare" : undefined}
                  compareLabel={compareActive ? compareLabel : undefined}
                  height={230}
                />
              ) : (
                <AreaChart
                  data={rows}
                  xKey="month"
                  yKey="value"
                  valuePrefix="$"
                  valueLabel="This period"
                  compareKey={compareActive ? "compare" : undefined}
                  compareLabel={compareActive ? compareLabel : undefined}
                  height={230}
                />
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
