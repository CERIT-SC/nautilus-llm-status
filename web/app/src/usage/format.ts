import type { MetricKey, ModelUsage } from "./types";

const groups = new Intl.NumberFormat("en-GB");
const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Czech and SI convention groups thousands with a space rather than a comma.
 *  U+202F (narrow no-break space) is the right character: it will not wrap, and
 *  unlike U+2009 it does not open a gap wide enough to read as two numbers. */
export function tokens(value: number): string {
  return groups.format(value).replace(/,/g, "\u202f");
}

export function tokensShort(value: number): string {
  return compact.format(value);
}

export function money(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toPrecision(2)}`;
  return `$${value.toFixed(value < 100 ? 4 : 2)}`;
}

export function dateLabel(iso: string): string {
  return day.format(new Date(`${iso}T00:00:00`));
}

export function rangeLabel(start: string, end: string): string {
  return start === end ? dateLabel(start) : `${dateLabel(start)} \u2013 ${dateLabel(end)}`;
}

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

export function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

export function today(): string {
  return isoDay(new Date());
}

/** Extract the charted/tabled metric from a per-model usage record. */
export function metricValue(usage: ModelUsage, metric: MetricKey): number {
  if (metric === "spend") return usage.spend;
  if (metric === "api_requests") return usage.api_requests;
  return usage.total_tokens;
}

export function formatMetric(value: number, metric: MetricKey): string {
  return metric === "spend" ? money(value) : tokens(value);
}

export function formatMetricShort(value: number, metric: MetricKey): string {
  return metric === "spend" ? money(value) : tokensShort(value);
}
