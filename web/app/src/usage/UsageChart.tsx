import { useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import type { ChartData } from "chart.js";
import { useDarkMode } from "../hooks/useDarkMode";
import {
  getChartOtherColor,
  getChartPalette,
  getUsageBarChartOptions,
} from "../lib/chart-config";
import type { UsageBarRow, UsageTooltipData } from "../lib/chart-config";
import { metricValue } from "./format";
import type { MetricKey, ModelUsage, UsageResponse } from "./types";
import { UsageChartTooltip } from "./UsageChartTooltip";

// Mirrors the palette size (--chart-1..--chart-7) in lib/chart-config; the
// trailing "Other" series is the aggregate of every model past the top N.
const PALETTE_SIZE = 7;

/** The "Other" series name, present only when the dashboard truncated the top N. */
function otherSeriesName(seriesNames: string[]): string | null {
  return seriesNames.length > PALETTE_SIZE ? seriesNames[seriesNames.length - 1] : null;
}

/** Fold one bucket's models into per-series values plus the "Other" aggregate. */
function foldModels(
  models: ModelUsage[],
  names: Set<string>,
  otherName: string | null,
  metric: MetricKey,
): Record<string, number> {
  const values: Record<string, number> = {};
  let other = 0;

  for (const model of models) {
    const value = metricValue(model, metric);
    if (value === 0) continue;
    if (names.has(model.model)) values[model.model] = value;
    else other += value;
  }
  if (other > 0 && otherName) values[otherName] = other;
  return values;
}

function buildRows(usage: UsageResponse, seriesNames: string[], metric: MetricKey): UsageBarRow[] {
  const names = new Set(seriesNames);
  const otherName = otherSeriesName(seriesNames);
  return usage.buckets.map((bucket) => ({
    label: bucket.label,
    start: bucket.start,
    end: bucket.end,
    partial: bucket.partial,
    values: foldModels(bucket.models, names, otherName, metric),
  }));
}

function buildChartData(
  rows: UsageBarRow[],
  seriesNames: string[],
  palette: string[],
  otherColour: string,
): ChartData<"bar"> {
  return {
    labels: rows.map((row) => row.label),
    datasets: seriesNames.map((name, i) => ({
      label: name,
      data: rows.map((row) => row.values[name] ?? 0),
      backgroundColor: i < palette.length ? palette[i] : otherColour,
      borderRadius: { topLeft: 2, topRight: 2, bottomLeft: 0, bottomRight: 0 },
      stack: "usage",
    })),
  };
}

export function UsageChart({
  usage,
  seriesNames,
  metric,
}: {
  usage: UsageResponse | null;
  seriesNames: string[];
  metric: MetricKey;
}) {
  const isDark = useDarkMode();

  // Reduced-motion preference is read once; a change mid-session applies on remount.
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const rows = useMemo(
    () => (usage ? buildRows(usage, seriesNames, metric) : []),
    [usage, seriesNames, metric],
  );

  // Palette and chart options read CSS custom properties directly, so they must
  // be re-resolved when the theme flips; void marks isDark as intentionally used.
  const palette = useMemo(() => {
    void isDark;
    return getChartPalette();
  }, [isDark]);
  const otherColour = useMemo(() => {
    void isDark;
    return getChartOtherColor();
  }, [isDark]);
  const chartData = useMemo(
    () => (rows.length ? buildChartData(rows, seriesNames, palette, otherColour) : null),
    [rows, seriesNames, palette, otherColour],
  );
  // Legend mirrors MetricsChart: shown only when more than one series exists.
  const showLegend = seriesNames.length > 1;
  const [tooltip, setTooltip] = useState<UsageTooltipData | null>(null);
  const options = useMemo(() => {
    void isDark;
    return getUsageBarChartOptions(
      rows,
      metric,
      reducedMotion,
      showLegend,
      setTooltip,
    );
  }, [isDark, rows, metric, reducedMotion, showLegend]);

  if (!chartData) return null;

  return (
    <div className="relative w-full" style={{ height: 340 }}>
      <Bar data={chartData} options={options} />
      {tooltip && (
        <UsageChartTooltip data={tooltip} reducedMotion={reducedMotion} />
      )}
    </div>
  );
}
