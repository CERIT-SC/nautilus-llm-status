import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Content,
  ContentBody,
  ContentHeading,
  H3,
  H4,
  Input,
  Label,
  Muted,
  Skeleton,
  Small,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
} from "@e-infra/design-system";
import { ApiError } from "./api";
import { DurationSelector } from "../components/DurationSelector";
import {
  MetricsChartSkeleton,
  StatCardsSkeleton,
} from "../components/skeletons";
import { useUsage } from "../hooks/useUsage";
import { useDarkMode } from "../hooks/useDarkMode";
import { getChartOtherColor, getChartPalette } from "../lib/chart-config";
import {
  daysAgo,
  metricValue,
  money,
  percent,
  rangeLabel,
  startOfYear,
  today,
  tokens,
} from "./format";
import type { Bucket, Granularity, MetricKey, UsageResponse } from "./types";
import { UsageChart } from "./UsageChart";

// The design system defines seven chart colours; the series cap follows it
// rather than the other way round, so nothing falls back to an off-palette hue.
const TOP_N = 7;
const OTHER = "Other models";

interface Preset {
  id: string;
  label: string;
  granularity: Granularity;
  range: () => { start: string; end: string };
}

const PRESETS: Preset[] = [
  {
    id: "7d",
    label: "7 days",
    granularity: "day",
    range: () => ({ start: daysAgo(6), end: today() }),
  },
  {
    id: "30d",
    label: "30 days",
    granularity: "day",
    range: () => ({ start: daysAgo(29), end: today() }),
  },
  {
    id: "90d",
    label: "90 days",
    granularity: "week",
    range: () => ({ start: daysAgo(89), end: today() }),
  },
  {
    id: "12m",
    label: "12 months",
    granularity: "month",
    range: () => ({ start: daysAgo(364), end: today() }),
  },
  {
    id: "ytd",
    label: "This year",
    granularity: "month",
    range: () => ({ start: startOfYear(), end: today() }),
  },
  {
    id: "custom",
    label: "Custom",
    granularity: "day",
    range: () => ({ start: daysAgo(6), end: today() }),
  },
];

const GRANULARITIES: { id: Granularity; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

const METRICS: { id: MetricKey; label: string }[] = [
  { id: "total_tokens", label: "Tokens" },
  { id: "cache_read_input_tokens", label: "Cached" },
  { id: "spend", label: "Cost" },
  { id: "api_requests", label: "Requests" },
];

export function UsageDashboard() {
  const initial = PRESETS[1];
  const [preset, setPreset] = useState<string>(initial.id);
  const [granularity, setGranularity] = useState<Granularity>(
    initial.granularity,
  );
  const [{ start, end }, setRange] = useState(initial.range);
  const [metric, setMetric] = useState<MetricKey>("total_tokens");
  const isDark = useDarkMode();

  const options = useMemo(
    () => [...PRESETS.map((item) => ({ value: item.id, label: item.label }))],
    [],
  );
  const params = useMemo(
    () => ({ granularity, start, end }),
    [granularity, start, end],
  );
  // keepPreviousData keeps the last loaded series visible while a new range or
  // granularity is fetched, so there is no need to dim the previous render.
  const { data: usage, isPending, isError, error } = useUsage(params);

  const applyPreset = (id: string) => {
    const next = PRESETS.find((item) => item.id === id);
    if (!next) return;
    setPreset(next.id);
    setGranularity(next.granularity);
    setRange(next.range());
  };

  const editRange = (patch: Partial<{ start: string; end: string }>) => {
    setRange((current) => ({ ...current, ...patch }));
  };

  const series = useMemo(() => {
    if (!usage)
      return { names: [] as string[], colours: {} as Record<string, string> };
    // Re-resolve on theme flip so the swatches track the active palette, the
    // same way UsageChart re-resolves its canvas colours.
    void isDark;
    const palette = getChartPalette(TOP_N);
    // Rank by total_tokens regardless of the selected metric, so each model
    // keeps the same colour and stack position across all metric views.
    const ranked = [...usage.models]
      .sort(
        (a, b) =>
          metricValue(b, "total_tokens") - metricValue(a, "total_tokens"),
      )
      .filter((model) => metricValue(model, "total_tokens") > 0);
    const names = ranked.slice(0, TOP_N).map((model) => model.model);
    const colours: Record<string, string> = {};
    names.forEach((name, index) => {
      colours[name] = palette[index];
    });
    if (ranked.length > TOP_N) {
      names.push(OTHER);
      colours[OTHER] = getChartOtherColor();
    }
    return { names, colours };
  }, [usage, isDark]);

  const hasData = Boolean(
    usage && (usage.totals.total_tokens > 0 || usage.totals.spend > 0),
  );

  const errorMessage =
    error instanceof ApiError
      ? error.message
      : "The reading could not be loaded.";

  if (isPending) {
    return (
      <Content className="container mx-auto px-4 pt-8">
        <ContentHeading>Usage</ContentHeading>
        <ContentBody>
          <div className="grid gap-6">
            <StatCardsSkeleton />
            <Card>
              <CardContent className="pt-6">
                <MetricsChartSkeleton height={280} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-24" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </ContentBody>
      </Content>
    );
  }

  // Only blanket the page with an error when there is no data to fall back on.
  // A failed background refetch keeps the previous series visible (react-query's
  // placeholderData: keepPreviousData), so we do not want to discard it.
  if (isError && !usage) {
    return (
      <Content className="container mx-auto px-4 pt-8">
        <ContentHeading>Usage</ContentHeading>
        <ContentBody>
          <div className="text-center py-20">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <H3 className="mb-2">Failed to load usage</H3>
            <Muted>{errorMessage}</Muted>
          </div>
        </ContentBody>
      </Content>
    );
  }
  return (
    <Content className="container mx-auto px-4 pt-8">
      <ContentHeading>Usage</ContentHeading>
      <ContentBody>
        <div className="grid gap-6">
          <Muted className="text-sm">{rangeLabel(start, end)}</Muted>

          <div className="flex flex-col items-start gap-x-6 gap-y-4">
            <DurationSelector
              options={options}
              value={preset}
              onValueChange={applyPreset}
              label="Period"
            />
            {/* Date Picker */}
            {preset === "custom" && (
              <div className="flex flex-row pl-2 gap-2">
                <div className="flex gap-3 sm:ml-auto sm:w-auto">
                  <div className="grid flex-1 gap-1.5 sm:flex-none">
                    <Label
                      className="pl-2 text-text-muted"
                      htmlFor="range-start"
                    >
                      From
                    </Label>
                    <Input
                      id="range-start"
                      type="date"
                      className="tnum w-full px-4 sm:w-44"
                      value={start}
                      max={end}
                      onChange={(event) =>
                        editRange({ start: event.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid flex-1 gap-1.5 sm:flex-none">
                  <Label htmlFor="range-end">To</Label>
                  <Input
                    id="range-end"
                    type="date"
                    className="tnum w-full px-4 sm:w-44"
                    value={end}
                    min={start}
                    max={today()}
                    onChange={(event) => editRange({ end: event.target.value })}
                  />
                </div>
              </div>
            )}
            {/* Group by */}
            <div className="flex items-center gap-2">
              <DurationSelector
                options={GRANULARITIES.map((item) => ({
                  value: item.id,
                  label: item.label,
                }))}
                value={granularity}
                onValueChange={(value) => {
                  if (!value) return;
                  // setPreset("");
                  setGranularity(value as Granularity);
                }}
                label="Group by"
              />
            </div>
          </div>

          <Totals usage={usage} />
          {/* Chart */}
          <Card className="min-w-96">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <H4>By period</H4>
                <Muted className="mt-1 text-sm">
                  {usage?.granularity === "day"
                    ? "Daily"
                    : `Per ${usage?.granularity ?? "period"}`}{" "}
                  totals, stacked by model
                </Muted>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <ToggleGroup
                  type="single"
                  variant="outline"
                  spacing={1}
                  size="sm"
                  value={metric}
                  onValueChange={(value) =>
                    value && setMetric(value as MetricKey)
                  }
                >
                  {METRICS.map((item) => (
                    <ToggleGroupItem
                      key={item.id}
                      value={item.id}
                      aria-label={item.label}
                      className="px-3.5"
                    >
                      {item.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </CardHeader>
            <CardContent>
              {!usage ? (
                <MetricsChartSkeleton height={384} />
              ) : !hasData ? (
                <div className="flex h-70 flex-col items-center justify-center gap-1 text-center">
                  <Small>No requests recorded in this period.</Small>
                  <Muted>Widen the range or pick a different period.</Muted>
                </div>
              ) : (
                <UsageChart
                  usage={usage}
                  seriesNames={series.names}
                  metric={metric}
                />
              )}
            </CardContent>
          </Card>

          <ModelTable usage={usage} colours={series.colours} metric={metric} />
        </div>
      </ContentBody>
    </Content>
  );
}

function Totals({ usage }: { usage: UsageResponse | null }) {
  const t = usage?.totals;

  const stats: { label: string; value: string; hint?: string }[] = [
    {
      label: "Total tokens",
      value: t ? tokens(t.total_tokens) : "\u2014",
    },
    {
      label: "Prompt",
      value: t ? tokens(t.prompt_tokens) : "\u2014",
      // Cache reads are counted inside prompt_tokens, so this is a share of
      // that figure rather than something to add to it.
      hint:
        t && t.cache_read_input_tokens > 0
          ? `${percent(t.cache_read_share)} from cache`
          : undefined,
    },
    {
      label: "Completion",
      value: t ? tokens(t.completion_tokens) : "\u2014",
    },
    {
      label: "Cost",
      value: t ? money(t.spend) : "\u2014",
      hint:
        t && t.savings_spend > 0
          ? `${money(t.savings_spend)} saved`
          : undefined,
    },
    {
      label: "Requests",
      value: t ? tokens(t.api_requests) : "\u2014",
      hint:
        t && t.failed_requests > 0
          ? `${tokens(t.failed_requests)} failed`
          : undefined,
    },
  ];

  // Cache and compression tiles appear only when there is something to show,
  // so a gateway without prompt caching does not carry empty boxes.
  if (t && t.cache_read_input_tokens > 0) {
    stats.push({
      label: "Cache reads",
      value: tokens(t.cache_read_input_tokens),
      hint: `${tokens(t.uncached_prompt_tokens)} uncached`,
    });
  }
  if (t && t.cache_creation_input_tokens > 0) {
    stats.push({
      label: "Cache writes",
      value: tokens(t.cache_creation_input_tokens),
      hint: "billed at write rate",
    });
  }
  if (t && t.compression_saved_tokens > 0) {
    stats.push({
      label: "Compression saved",
      value: tokens(t.compression_saved_tokens),
      hint: "tokens never sent",
    });
  }

  return (
    <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
      {stats.map((stat) => (
        <Card className="py-2 h-full" key={stat.label}>
          <CardContent>
            <Small className="text-text-muted">{stat.label}</Small>
            <H3 className="">{stat.value}</H3>
            {stat.hint ? <Muted className="text-xs">{stat.hint}</Muted> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Swatch({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-sm"
      style={{ background: colour }}
    />
  );
}

function ModelTable({
  usage,
  colours,
  metric,
}: {
  usage: UsageResponse | null;
  colours: Record<string, string>;
  metric: MetricKey;
}) {
  if (!usage || usage.models.length === 0) return null;
  const peak = Math.max(
    ...usage.models.map((model) => metricValue(model, metric)),
    1,
  );

  const otherColour = getChartOtherColor();

  // Only widen the table when the gateway actually reports these.
  const showCache = usage.models.some(
    (m) => m.cache_read_input_tokens > 0 || m.cache_creation_input_tokens > 0,
  );
  const showSavings = usage.models.some((m) => m.savings_spend > 0);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <H4>By model</H4>
          <Muted className="mt-1 text-sm">
            {usage.models.length}{" "}
            {usage.models.length === 1 ? "model" : "models"} in this period
          </Muted>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => downloadCsv(usage)}
        >
          Download CSV
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Model</TableHead>
              <TableHead className="text-right">Prompt</TableHead>
              {showCache ? (
                <>
                  <TableHead className="text-right">Cache read</TableHead>
                  <TableHead className="text-right">Cache write</TableHead>
                </>
              ) : null}
              <TableHead className="text-right">Completion</TableHead>
              <TableHead className="text-right">Total tokens</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              {showSavings ? (
                <TableHead className="text-right">Saved</TableHead>
              ) : null}
              <TableHead className="text-right">Requests</TableHead>
              <TableHead className="w-[18%] pr-6">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usage.models.map((model) => (
              <TableRow key={model.model}>
                <TableCell className="pl-6 font-medium">
                  <span className="flex items-center gap-2">
                    <Swatch colour={colours[model.model] ?? otherColour} />
                    {model.model}
                  </span>
                </TableCell>
                <TableCell className="tnum text-right">
                  {tokens(model.prompt_tokens)}
                  {model.cache_read_share > 0 ? (
                    <span className="text-text-muted ml-1.5 text-xs">
                      {percent(model.cache_read_share)}
                    </span>
                  ) : null}
                </TableCell>
                {showCache ? (
                  <>
                    <TableCell className="tnum text-right">
                      {tokens(model.cache_read_input_tokens)}
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {tokens(model.cache_creation_input_tokens)}
                    </TableCell>
                  </>
                ) : null}
                <TableCell className="tnum text-right">
                  {tokens(model.completion_tokens)}
                </TableCell>
                <TableCell className="tnum text-right font-medium">
                  {tokens(model.total_tokens)}
                </TableCell>
                <TableCell className="tnum text-right">
                  {money(model.spend)}
                </TableCell>
                {showSavings ? (
                  <TableCell className="tnum text-right">
                    {model.savings_spend > 0
                      ? money(model.savings_spend)
                      : "\u2014"}
                  </TableCell>
                ) : null}
                <TableCell className="tnum text-right">
                  {tokens(model.api_requests)}
                </TableCell>
                <TableCell className="pr-6">
                  <span
                    className="block h-2 rounded-sm"
                    style={{
                      width: `${Math.max(2, (metricValue(model, metric) / peak) * 100)}%`,
                      background: colours[model.model] ?? otherColour,
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

const CSV_COLUMNS = [
  "prompt_tokens",
  "uncached_prompt_tokens",
  "cache_read_input_tokens",
  "cache_creation_input_tokens",
  "completion_tokens",
  "total_tokens",
  "compression_saved_tokens",
  "spend",
  "prompt_caching_savings_spend",
  "compression_savings_spend",
  "api_requests",
] as const;

function csvCell(value: string): string {
  // A cell a spreadsheet would treat as a formula gets neutralised with a
  // leading apostrophe. Model names come from the gateway database rather than
  // from the browser, but a CSV is opened by double-click in Excel, and that is
  // the whole of the classic formula-injection path.
  let safe = value;
  if (/^[=+\-@\t\r]/.test(safe)) safe = `'${safe}`;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function downloadCsv(usage: UsageResponse) {
  const header = [
    "period",
    "period_start",
    "period_end",
    "model",
    ...CSV_COLUMNS,
  ];
  const lines = [header.join(",")];
  for (const bucket of usage.buckets as Bucket[]) {
    for (const model of bucket.models) {
      lines.push(
        [
          csvCell(bucket.key),
          csvCell(bucket.start),
          csvCell(bucket.end),
          csvCell(model.model),
          ...CSV_COLUMNS.map((column) => String(model[column])),
        ].join(","),
      );
    }
  }
  const blob = new Blob([lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noopener";
  anchor.download = `llm-usage-${usage.start}_${usage.end}-${usage.granularity}.csv`;
  anchor.click();
  // Revoking synchronously can race the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
