/**
 * Model detail page with metrics charts
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import {
  Button,
  Card,
  Skeleton,
  H2,
  H3,
  H4,
  Muted,
  Small,
  CardContent,
} from "@e-infra/design-system";
import { MetricsChart } from "../components/MetricsChart";
import { ChartCardSkeleton } from "../components/skeletons";
import {
  DurationSelector,
  type DurationOption,
} from "../components/DurationSelector";
import type { MetricsMeta, LabeledSeries } from "../types/api";
import { fetchModelMetrics } from "../lib/api";
import { formatTimeAgo } from "../utils/time";
import { useModels, useMetricsMeta } from "../hooks/useData";

const DURATIONS = ["3h", "24h", "7d", "30d"] as const;
type Duration = (typeof DURATIONS)[number];

const DURATION_OPTIONS: readonly DurationOption<Duration>[] = DURATIONS.map(
  (d) => ({ value: d, label: d }),
);

interface MetricRef {
  name: string;
  label: string;
  scale: number;
}

interface SingleChartConfig {
  key: string;
  title: string;
  storageName: string;
  unit: string;
  scale: number;
  hasLabels: boolean;
}

interface CombinedChartConfig {
  key: string;
  title: string;
  unit: string;
  metricNames: MetricRef[];
  hasLabels: boolean;
}

type ChartConfig = SingleChartConfig | CombinedChartConfig;

function isCombinedChart(c: ChartConfig): c is CombinedChartConfig {
  return "metricNames" in c;
}

export function ModelDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: modelsData, isLoading: modelsLoading } = useModels();
  const { data: metricsMeta = [] } = useMetricsMeta();
  const [duration, setDuration] = useState<Duration>("24h");

  const modelId = parseInt(id || "0");

  const model = useMemo(
    () => modelsData?.find((m) => m.id === modelId) ?? null,
    [modelsData, modelId],
  );
  const loading = modelsLoading && !model;

  const chartConfigs = useMemo((): ChartConfig[] => {
    const configs: ChartConfig[] = [];
    const latencyMetrics: MetricsMeta[] = [];

    for (const m of metricsMeta) {
      if (m.storage_name.startsWith("latency_p")) {
        latencyMetrics.push(m);
      } else {
        configs.push({
          key: m.storage_name,
          title: m.display_name,
          storageName: m.storage_name,
          unit: m.unit || "",
          scale: m.display_scale || 1,
          hasLabels: m.has_labels,
        });
      }
    }

    if (latencyMetrics.length > 0) {
      configs.push({
        key: "latency_combined",
        title: `Latency (${latencyMetrics.map((m) => m.display_name.replace("Latency ", "")).join(" / ")})`,
        unit: latencyMetrics[0].unit || "s",
        metricNames: latencyMetrics.map((m) => ({
          name: m.storage_name,
          label: m.display_name.replace("Latency ", ""),
          scale: m.display_scale || 1,
        })),
        hasLabels: false,
      });
    }

    return configs;
  }, [metricsMeta]);

  const metricQueries = useQueries({
    queries:
      metricsMeta.length > 0 && model
        ? metricsMeta.map((meta) => ({
            queryKey: ["model-metrics", modelId, meta.storage_name, duration],
            queryFn: async ({ signal }: { signal: AbortSignal }) => {
              const data = await fetchModelMetrics(
                modelId,
                meta.storage_name,
                duration,
                signal,
              );
              return { storageName: meta.storage_name, data };
            },
            staleTime: Infinity,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            refetchOnReconnect: false,
          }))
        : [],
  });

  const chartsLoading = metricQueries.some((q) => q.isLoading);

  const chartDataMap = useMemo(() => {
    const map: Record<string, LabeledSeries[]> = {};
    for (const q of metricQueries) {
      if (q.data) {
        map[q.data.storageName] = q.data.data;
      }
    }
    return map;
  }, [metricQueries]);

  useEffect(() => {
    if (chartsLoading || metricsMeta.length === 0 || !model) return;

    const otherDurations = DURATIONS.filter((d) => d !== duration);
    for (const d of otherDurations) {
      for (const meta of metricsMeta) {
        const key = ["model-metrics", modelId, meta.storage_name, d];
        if (!queryClient.getQueryData(key)) {
          queryClient.prefetchQuery({
            queryKey: key,
            queryFn: async ({ signal }: { signal: AbortSignal }) => {
              const data = await fetchModelMetrics(
                modelId,
                meta.storage_name,
                d,
                signal,
              );
              return { storageName: meta.storage_name, data };
            },
            staleTime: Infinity,
          });
        }
      }
    }
  }, [chartsLoading, duration, metricsMeta, model, modelId, queryClient]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const gpuSummary = useMemo(() => {
    const gpus = model?.latest?.gpu_count;
    if (!gpus || typeof gpus !== "object") return null;
    return Object.entries(gpus as Record<string, number>)
      .map(([name, count]) => `${Math.round(count)}x ${name}`)
      .join(", ");
  }, [model]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Back Button */}
        <Link
          to="/status"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Link>
        {/* Title area */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <Skeleton className="h-9 w-64 mb-2" />
            <Skeleton className="h-5 w-48" />
          </div>
          <Skeleton className="h-3 w-3 rounded-full" />
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card className="py-2" key={i}>
              <div className="">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-7 w-28" />
              </div>
            </Card>
          ))}
        </div>

        {/* Duration selector */}
        <div className="flex items-center gap-2 mb-6">
          <Skeleton className="h-4 w-20" />
          <div className="flex gap-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-10 rounded-md" />
            ))}
          </div>
        </div>

        {/* Chart cards */}
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <ChartCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="text-center py-20">
          <H3 className="mb-2">Model not found</H3>
          <Button variant="outline" onClick={() => navigate("/status")}>
            Back to models
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Back Button */}
      <Link
        to="/status"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Link>

      {/* Title */}
      <div className="flex items-start justify-between mb-6">
        <div className="min-w-0 flex-1">
          <H2 className="truncate">{model.model_name}</H2>
          <Muted className="mt-1 truncate block">
            {model.namespace} / {model.container}
          </Muted>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="py-2">
          <CardContent>
            <Small className="text-muted-foreground">Status</Small>
            <H3
              className={`${
                model.status === "online"
                  ? "text-success"
                  : model.status === "down"
                    ? "text-error"
                    : "text-muted-foreground"
              }`}
            >
              {model.status === "online"
                ? "Online"
                : model.status === "down"
                  ? "Down"
                  : "Archived"}
            </H3>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Small className="text-muted-foreground mb-1">First Seen</Small>
            <H4 className="">{formatDate(model.first_seen)}</H4>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Small className="text-muted-foreground mb-1">Last Seen</Small>
            <H4>{formatTimeAgo(model.last_seen, nowMs)}</H4>
          </CardContent>
        </Card>

        {gpuSummary && (
          <Card>
            <CardContent>
              <Small className="text-muted-foreground mb-1">GPUs</Small>
              <H4 className="">{gpuSummary}</H4>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Duration Selector */}
      <DurationSelector
        options={DURATION_OPTIONS}
        value={duration}
        onValueChange={setDuration}
        label="Time range:"
        className="mb-6"
      />

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {chartsLoading
          ? Array.from({ length: Math.max(chartConfigs.length, 2) }).map(
              (_, i) => {
                const isWide =
                  chartConfigs.length % 2 === 1 &&
                  i === chartConfigs.length - 1;
                return (
                  <ChartCardSkeleton
                    key={i}
                    className={isWide ? "lg:col-span-2" : ""}
                  />
                );
              },
            )
          : chartConfigs.map((chart, idx: number) => {
              const isWide =
                chartConfigs.length % 2 === 1 &&
                idx === chartConfigs.length - 1;

              let chartData: LabeledSeries[];
              if (isCombinedChart(chart)) {
                chartData = chart.metricNames.flatMap((mn) => {
                  const series = chartDataMap[mn.name] || [];
                  return series.map((s) => ({
                    ...s,
                    label: mn.label,
                  }));
                });
              } else {
                chartData = chartDataMap[chart.storageName] || [];
              }

              return (
                <Card key={chart.key} className={isWide ? "lg:col-span-2" : ""}>
                  <CardContent>
                    <H4 className=" mb-4">{chart.title}</H4>

                    <MetricsChart
                      data={chartData}
                      title={chart.title}
                      unit={chart.unit}
                      scale={"scale" in chart ? chart.scale : 1}
                      fill={!("metricNames" in chart)}
                      duration={duration}
                    />
                  </CardContent>
                </Card>
              );
            })}
      </div>
    </div>
  );
}
