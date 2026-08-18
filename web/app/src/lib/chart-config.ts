/**
 * Chart.js configuration utilities
 */
import type {
  BarElement,
  Chart,
  ChartOptions,
  TooltipItem,
  TooltipModel,
} from "chart.js";
import type {
  AnnotationOptions,
  AnnotationPluginOptions,
} from "chartjs-plugin-annotation";
import { formatMetric, formatMetricShort, rangeLabel } from "../usage/format";
import type { MetricKey } from "../usage/types";

// The design system defines seven series colours via `--chart-1..--chart-7`.
// Chart.js draws on canvas, which cannot consume var() strings, so the values
// are resolved once per options build (theme flips re-run the builders).
const CHART_VAR_COUNT = 7;
const CHART_FALLBACK = "#6b7280";
const OTHER_FALLBACK = "#9ca3af";

function resolveVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

function hexToRgba(hexColor: string, alpha: number): string {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface ChartColors {
  text: string;
  textEmphasis: string;
  grid: string;
  border: string;
  tooltipBg: string;
  tooltipText: string;
  line: string;
  lineBg: string;
}

/**
 * Get chart color from CSS variables
 */
export function getChartColor(index: number): { border: string; bg: string } {
  const border = resolveVar(
    `--chart-${(index % CHART_VAR_COUNT) + 1}`,
    CHART_FALLBACK,
  );
  return {
    border,
    bg: hexToRgba(border, 0.1),
  };
}

/**
 * Resolve `count` series colours from the --chart-N palette
 */
export function getChartPalette(count: number = CHART_VAR_COUNT): string[] {
  return Array.from({ length: count }, (_, i) => getChartColor(i).border);
}

/**
 * Neutral colour for the aggregated "other" series
 */
export function getChartOtherColor(): string {
  return resolveVar("--color-base-400", OTHER_FALLBACK);
}

/**
 * Get chart UI colors from CSS variables
 */
export const getChartColors = (): ChartColors => ({
  text: resolveVar("--text-muted", "#6b7280"),
  textEmphasis: resolveVar("--text", "#111827"),
  grid: resolveVar("--border", "rgba(156,163,175,0.3)"),
  border: resolveVar("--border", "#e5e7eb"),
  tooltipBg: resolveVar("--background", "#ffffff"),
  tooltipText: resolveVar("--text-muted", "#374151"),
  line: resolveVar("--chart-1", "#3b82f6"),
  lineBg: getChartColor(0).bg,
});

// Shared tooltip/scale/legend appearance so line and bar option builders stay in sync.

function tooltipBase(colors: ChartColors) {
  return {
    backgroundColor: colors.tooltipBg,
    titleColor: colors.textEmphasis,
    bodyColor: colors.tooltipText,
    borderColor: colors.border,
    borderWidth: 1,
  };
}

/**
 * Series legend for both line and bar charts. Markers are drawn as circles in
 * the dataset colour: filled for solid bar datasets, outlined for line ones.
 * Clicking a marker toggles the dataset via Chart.js' default handler.
 */
function legendStyle(colors: ChartColors, show: boolean) {
  return {
    display: show,
    position: "top" as const,
    labels: {
      color: colors.text,
      usePointStyle: true,
      pointStyle: "circle" as const,
      padding: 16,
      font: { size: 11 },
    },
  };
}

function scaleStyle(
  colors: ChartColors,
  opts: {
    grid?: boolean;
    border?: boolean;
    maxRotation?: number;
    autoSkipPadding?: number;
  } = {},
) {
  return {
    ...(opts.grid === false
      ? { grid: { display: false as const } }
      : { grid: { color: colors.grid } }),
    ...(opts.border ? { border: { color: colors.border } } : {}),
    ticks: {
      color: colors.text,
      ...(opts.maxRotation != null ? { maxRotation: opts.maxRotation } : {}),
      ...(opts.autoSkipPadding != null
        ? { autoSkipPadding: opts.autoSkipPadding }
        : {}),
    },
  };
}

function timeScale(
  colors: ChartColors,
  duration: string,
  options?: { minute?: boolean },
) {
  const bounds = getTimeBounds(duration);
  return {
    type: "time" as const,
    min: bounds.min,
    max: bounds.max,
    time: {
      unit: getTimeUnit(duration),
      displayFormats: {
        ...(options?.minute ? { minute: "h:mm a" as const } : {}),
        hour: "MMM d, ha",
        day: "MMM d",
      },
    },
    ...scaleStyle(colors, { maxRotation: 0, autoSkipPadding: 20 }),
  };
}

/**
 * Get time unit for chart axis
 */
export const getTimeUnit = (duration: string): "minute" | "hour" | "day" => {
  if (duration === "3h") return "minute";
  if (duration === "24h") return "hour";
  return "day";
};

/**
 * Get time label format
 */
export const getTimeDisplayFormat = (duration: string) => {
  if (duration === "3h") return "h:mm a";
  if (duration === "24h") return "MMM d, ha";
  return "MMM d";
};

/**
 * Get x-axis bounds for the selected duration so the axis spans the full
 * range even when data only covers part of it
 */
export const getTimeBounds = (
  duration: string,
): { min: number; max: number } => {
  const hours: Record<string, number> = {
    "3h": 3,
    "24h": 24,
    "7d": 7 * 24,
    "30d": 30 * 24,
  };
  const max = Date.now();
  const min = max - (hours[duration] ?? 24) * 60 * 60 * 1000;
  return { min, max };
};

/**
 * Format tooltip value with unit
 */
export const formatTooltipValue = (
  value: number | null,
  unit: string,
  label?: string,
): string | void => {
  if (value == null) return;

  const formatted = label ? `${label}: ` : "";

  if (unit === "%") return `${formatted}${value.toFixed(1)}%`;
  if (unit === "s") return `${formatted}${value.toFixed(2)}s`;
  if (unit === "tok/s") return `${formatted}${value.toFixed(1)} tok/s`;
  if (unit === "ms") return `${formatted}${value}ms`;

  return `${formatted}${value.toFixed(1)}${unit ? " " + unit : ""}`;
};

/**
 * Default options for metrics line charts
 */
export const getMetricsChartOptions = (
  _isDark: boolean,
  options?: {
    title?: string;
    unit?: string;
    duration?: string;
    fill?: boolean;
    stacked?: boolean;
    showLegend?: boolean;
  },
): ChartOptions<"line"> => {
  const colors = getChartColors();
  const duration = options?.duration || "24h";
  const showLegend = options?.showLegend ?? true;

  return {
    responsive: true,
    maintainAspectRatio: false,
    spanGaps: true,
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    plugins: {
      legend: legendStyle(colors, showLegend),
      tooltip: {
        ...tooltipBase(colors),
        padding: 10,
        callbacks: {
          label: (ctx: TooltipItem<"line">) => {
            const val = ctx.parsed.y;
            const unit = options?.unit || "";
            return formatTooltipValue(val, unit, ctx.dataset.label);
          },
        },
      },
    },
    scales: {
      x: timeScale(colors, duration, { minute: true }),
      y: {
        beginAtZero: true,
        stacked: options?.stacked ?? false,
        ...scaleStyle(colors),
        ticks: {
          color: colors.text,
          callback: (value) => {
            const unit = options?.unit || "";
            if (unit === "%") return `${value}%`;
            if (unit === "s") return `${value}s`;
            return value;
          },
        },
      },
    },
  };
};

/**
 * Chart options for response time charts with annotations
 */
export const getResponseTimeChartOptions = (
  _isDark: boolean,
  duration: string,
  events: Array<{
    timestamp: string;
    type: string;
    duration?: string;
    isOngoing?: boolean;
  }> = [],
  hoveredEventIndex: number | null = null,
  onHoverChange?: (index: number | null) => void,
): ChartOptions<"line"> => {
  const colors = getChartColors();

  // Calculate max Y for positioning annotations
  const maxY = 100; // Default, will be overridden by data
  const midY = maxY / 2;

  // Build annotations for unhealthy events using design system colors
  const annotations: AnnotationPluginOptions["annotations"] = {};

  events.forEach((event, index) => {
    if (event.type !== "UNHEALTHY") return;

    const position = midY <= maxY / 2 ? ("end" as const) : ("start" as const);
    const chart5Color = resolveVar("--chart-5", "#ef4444");

    annotations[`event-${index}`] = {
      type: "line",
      xMin: event.timestamp,
      xMax: event.timestamp,
      borderColor: chart5Color,
      borderWidth: 1,
      borderDash: [5, 5],
      enter() {
        onHoverChange?.(index);
      },
      leave() {
        onHoverChange?.(null);
      },
      label: {
        display: hoveredEventIndex === index,
        content: [
          event.isOngoing ? "Status: ONGOING" : "Status: RESOLVED",
          `Unhealthy for ${event.duration}`,
          `Started at ${new Date(event.timestamp).toLocaleString()}`,
        ],
        backgroundColor: chart5Color,
        color: resolveVar("--text", "#ffffff"),
        font: { size: 11 },
        padding: 6,
        position,
      },
    };
  });

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        ...tooltipBase(colors),
        padding: 12,
        displayColors: false,
        callbacks: {
          title: (tooltipItems: TooltipItem<"line">[]) => {
            if (tooltipItems.length > 0) {
              const x = tooltipItems[0].parsed.x;
              if (x != null) {
                return new Date(x).toLocaleString();
              }
            }
            return "";
          },
          label: (ctx: TooltipItem<"line">) => {
            const value = ctx.parsed.y;
            return `${value}ms`;
          },
        },
      },
      annotation: {
        annotations,
      },
    },
    scales: {
      x: timeScale(colors, duration),
      y: {
        beginAtZero: true,
        ...scaleStyle(colors),
        ticks: {
          color: colors.text,
          callback: (value) => `${value}ms`,
        },
      },
    },
  };
};

/**
 * One bucket of usage data, shaped for the stacked bar chart tooltip + annotation
 */
export interface UsageBarRow {
  label: string;
  start: string;
  end: string;
  partial: boolean;
  values: Record<string, number>;
}

/** One rendered row of the usage tooltip (series name, value, swatch colour). */
export interface UsageTooltipItem {
  label: string;
  color: string;
  formatted: string;
}

/** Everything the external usage tooltip needs to render and place itself. */
export interface UsageTooltipData {
  title: string;
  items: UsageTooltipItem[];
  totalFormatted: string;
  barLeftX: number;
  barRightX: number;
  stackTopY: number;
  chartWidth: number;
  chartHeight: number;
}

/** Geometry of the hovered bar stack in CSS pixels (data from Chart.js). */
function stackGeometry(chart: Chart, dataPoints: TooltipItem<"bar">[]) {
  let leftX = Infinity;
  let rightX = -Infinity;
  let topY = Infinity;
  for (const dp of dataPoints) {
    const el = chart.getDatasetMeta(dp.datasetIndex).data[dp.dataIndex] as
      BarElement | undefined;
    if (!el) continue;
    // width/height live in the element's props (BarProps), read via getProps.
    const width = el.getProps(["width"], true).width;
    leftX = Math.min(leftX, el.x - width / 2);
    rightX = Math.max(rightX, el.x + width / 2);
    topY = Math.min(topY, el.y);
  }
  return { leftX, rightX, topY };
}

/**
 * Build render data for the external usage tooltip; null hides it. Keeps the
 * old canvas-tooltip content rules: zero-value rows are dropped, rows list
 * top-of-stack first.
 */
export function buildUsageTooltipData(
  tooltip: TooltipModel<"bar">,
  chart: Chart,
  rows: UsageBarRow[],
  metric: MetricKey,
): UsageTooltipData | null {
  if (tooltip.opacity === 0) return null;
  const visible = tooltip.dataPoints
    .filter((dp) => (dp.parsed.y ?? 0) > 0)
    .sort((a, b) => b.datasetIndex - a.datasetIndex);

  const row = rows[visible[0]?.dataIndex ?? -1];
  if (!row || visible.length === 0) return null;

  const { leftX, rightX, topY } = stackGeometry(chart, visible);
  if (!isFinite(topY)) return null;

  const range = rangeLabel(row.start, row.end);
  return {
    title: range,
    items: visible.map((dp) => {
      const bg = dp.dataset.backgroundColor;
      return {
        label: String(dp.dataset.label ?? ""),
        color:
          typeof bg === "string" ? bg : getChartColor(dp.datasetIndex).border,
        formatted: formatMetric(dp.parsed.y ?? 0, metric),
      };
    }),
    totalFormatted: formatMetric(
      visible.reduce((sum, dp) => sum + (dp.parsed.y ?? 0), 0),
      metric,
    ),
    barLeftX: leftX,
    barRightX: rightX,
    stackTopY: topY,
    chartWidth: chart.width,
    chartHeight: chart.height,
  };
}

const TOOLTIP_GAP = 10;
const TOOLTIP_MARGIN = 4;

export type TooltipSide = "right" | "left" | "top";

export interface TooltipPosition {
  side: TooltipSide;
  left: number;
  top: number;
}

/**
 * Overflow-aware placement: prefer the right side of the bar, then the left,
 * then above the stack when neither side has room. Side placements center on
 * the stack top; the top fallback sits just above it. Always clamped inside
 * the chart so the bar stays visible.
 */
export function computeTooltipPosition(
  data: UsageTooltipData,
  width: number,
  height: number,
): TooltipPosition {
  const clampX = (left: number) =>
    Math.max(
      TOOLTIP_MARGIN,
      Math.min(
        left,
        Math.max(TOOLTIP_MARGIN, data.chartWidth - width - TOOLTIP_MARGIN),
      ),
    );
  const clampY = (top: number) =>
    Math.max(
      TOOLTIP_MARGIN,
      Math.min(
        top,
        Math.max(TOOLTIP_MARGIN, data.chartHeight - height - TOOLTIP_MARGIN),
      ),
    );
  const centeredOnStack = data.stackTopY - height / 2;

  const besideRight = data.barRightX + TOOLTIP_GAP;
  if (besideRight + width <= data.chartWidth - TOOLTIP_MARGIN) {
    return { side: "right", left: besideRight, top: clampY(centeredOnStack) };
  }

  const besideLeft = data.barLeftX - TOOLTIP_GAP - width;
  if (besideLeft >= TOOLTIP_MARGIN) {
    return { side: "left", left: besideLeft, top: clampY(centeredOnStack) };
  }

  const centerX = (data.barLeftX + data.barRightX) / 2;
  return {
    side: "top",
    left: clampX(centerX - width / 2),
    top: clampY(data.stackTopY - TOOLTIP_GAP - height),
  };
}

function buildTodayAnnotation(
  partial: UsageBarRow | null,
  muted: string,
): AnnotationOptions | null {
  if (!partial) return null;
  return {
    type: "line",
    xMin: partial.label,
    xMax: partial.label,
    borderColor: muted,
    borderWidth: 1,
    borderDash: [3, 3],
  };
}

/**
 * Options for the usage stacked bar chart (dark-mode aware, reads --chart vars)
 */
export function getUsageBarChartOptions(
  rows: UsageBarRow[],
  metric: MetricKey,
  reducedMotion: boolean,
  showLegend: boolean,
  onTooltip: (data: UsageTooltipData | null) => void,
): ChartOptions<"bar"> {
  const colors = getChartColors();
  const annotation = buildTodayAnnotation(
    rows.find((row) => row.partial) ?? null,
    colors.text,
  );

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: reducedMotion ? false : { duration: 380 },
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: legendStyle(colors, showLegend),
      tooltip: {
        // Rendered as an external HTML card (see UsageChartTooltip); the
        // canvas tooltip stays disabled.
        enabled: false,
        external: (context) =>
          onTooltip(
            buildUsageTooltipData(context.tooltip, context.chart, rows, metric),
          ),
        // Item rules kept on the model and re-applied when the render data is
        // built: zero rows hidden, top-of-stack first.
        filter: (item) => (item.parsed.y ?? 0) > 0,
        itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
      },
      annotation: {
        annotations: annotation ? { today: annotation } : {},
      },
    },
    scales: {
      x: {
        stacked: true,
        ...scaleStyle(colors, {
          grid: false,
          border: true,
          maxRotation: 0,
          autoSkipPadding: 22,
        }),
      },
      y: {
        stacked: true,
        beginAtZero: true,
        ...scaleStyle(colors, { border: true }),
        ticks: {
          color: colors.text,
          callback: (value) => formatMetricShort(Number(value), metric),
        },
      },
    },
  };
}

/**
 * Insert nulls at data gaps to break chart lines
 */
export interface DataPoint {
  timestamp: string;
  value: number;
}

export interface ProcessedDataPoint {
  x: Date;
  y: number | null;
}

export const withGaps = (
  points: DataPoint[],
  scale: number = 1,
): ProcessedDataPoint[] => {
  if (points.length < 2) {
    return points.map((p) => ({
      x: new Date(p.timestamp),
      y: p.value * scale,
    }));
  }

  const deltas: number[] = [];
  const limit = Math.min(points.length, 21);
  for (let i = 1; i < limit; i++) {
    deltas.push(
      new Date(points[i].timestamp).getTime() -
        new Date(points[i - 1].timestamp).getTime(),
    );
  }
  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)];
  const gapThreshold = median * 2.5;

  const result: ProcessedDataPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const gap =
        new Date(points[i].timestamp).getTime() -
        new Date(points[i - 1].timestamp).getTime();
      if (gap > gapThreshold) {
        result.push({
          x: new Date(new Date(points[i - 1].timestamp).getTime() + median),
          y: null,
        });
      }
    }
    result.push({
      x: new Date(points[i].timestamp),
      y: points[i].value * scale,
    });
  }
  return result;
};

/**
 * Chart dataset configuration
 */
export interface DatasetConfig {
  label: string;
  data: ProcessedDataPoint[];
  borderColor: string;
  backgroundColor: string;
  borderWidth: number;
  pointRadius: number;
  pointHoverRadius: number;
  tension: number;
  fill: boolean;
  spanGaps: boolean;
}

/**
 * Build dataset for a metric series
 */
export const buildDataset = (
  points: DataPoint[],
  colorIndex: number,
  options?: {
    fill?: boolean;
    scale?: number;
    label?: string;
  },
): DatasetConfig => {
  const color = getChartColor(colorIndex);
  const scale = options?.scale ?? 1;
  const fill = options?.fill ?? true;

  return {
    label: options?.label || "Metric",
    data: withGaps(points, scale),
    borderColor: color.border,
    backgroundColor: fill ? color.bg : "transparent",
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 3,
    tension: 0.2,
    fill,
    spanGaps: true,
  };
};
