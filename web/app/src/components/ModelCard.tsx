import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Model, MetricsMeta } from "../types/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Progress,
  cn,
} from "@e-infra/design-system";
import { StatusDot } from "./StatusDot";
import { UptimeBar } from "./UptimeBar";
import { formatTimeAgo } from "../utils/time";

// ─── types ──────────────────────────────────────────────────────────────────

interface ModelCardProps {
  model: Model;
  metricsMeta: MetricsMeta[];
}

interface MetricCellProps {
  label: string;
  value: string;
}

interface KvCacheCellProps {
  label: string;
  value: string;
  pct: number;
}

interface TokenGenCellProps {
  label: string;
  value: string;
  unit: string;
}

// ─── constants ───────────────────────────────────────────────────────────────

const STATUS_CARD_CLS: Record<Model["status"], string> = {
  online: "",
  down: " border-red-200 dark:border-red-900",
  archived: "opacity-60",
};

// ─── metric lookup helpers ───────────────────────────────────────────────────

function getLatestValue(model: Model, storageName: string): number | undefined {
  const raw = (model.latest as Record<string, unknown> | undefined)?.[
    storageName
  ];
  if (typeof raw === "number") return raw;
  return undefined;
}

function getMeta(
  metaList: MetricsMeta[],
  storageName: string,
): MetricsMeta | undefined {
  return metaList.find((m) => m.storage_name === storageName);
}

function formatValue(value: number, meta?: MetricsMeta): string {
  const scaled = value * (meta?.display_scale ?? 1);

  if (meta?.unit === "%") return `${scaled.toFixed(0)}%`;
  if (meta?.unit === "s") return `${scaled.toFixed(2)}`;
  if (meta?.unit) return `${scaled.toFixed(1)}`;
  return `${Math.round(scaled)}`;
}

function getDisplayValue(
  model: Model,
  metaList: MetricsMeta[],
  storageName: string,
  fallback = "0",
): string {
  const meta = getMeta(metaList, storageName);
  const value = getLatestValue(model, storageName);
  if (value === undefined) return fallback;
  return formatValue(value, meta);
}

function getNumericValue(
  model: Model,
  metaList: MetricsMeta[],
  storageName: string,
): number {
  const meta = getMeta(metaList, storageName);
  const value = getLatestValue(model, storageName);
  if (value === undefined) return 0;
  const scaled = value * (meta?.display_scale ?? 1);
  return Math.min(100, Math.max(0, scaled));
}

// ─── metric cell components ──────────────────────────────────────────────────

function MetricCell({ label, value }: MetricCellProps) {
  return (
    <div className="rounded-md border bg-surface-raised p-2">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}

function kvCacheBarColor(pct: number): string {
  if (pct > 80) return "[&_[data-slot=progress-indicator]]:bg-error";
  if (pct > 50) return "[&_[data-slot=progress-indicator]]:bg-warning-400";
  return "[&_[data-slot=progress-indicator]]:bg-primary";
}

function KvCacheCell({ label, value, pct }: KvCacheCellProps) {
  return (
    <div className="rounded-md border bg-surface-raised p-2">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
      <Progress
        value={pct}
        className={cn("mt-2 h-1.5", kvCacheBarColor(pct))}
      />
    </div>
  );
}

function TokenGenCell({ label, value, unit }: TokenGenCellProps) {
  return (
    <div className="rounded-md border bg-surface-raised p-2">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{unit}</p>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function ModelCard({ model, metricsMeta }: ModelCardProps) {
  const navigate = useNavigate();

  const navigateToDetails = useCallback(
    () => navigate(`/models/${model.id}`),
    [navigate, model.id],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        navigateToDetails();
      }
    },
    [navigateToDetails],
  );

  return (
    <Card
      className={`transition-all cursor-pointer gap-1 ${STATUS_CARD_CLS[model.status]}`}
      animation="translate"
      onClick={navigateToDetails}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`${model.model_name} — ${model.status}`}
    >
      {/* ── header ── */}
      <CardHeader>
        <div className="flex items-start justify-between gap-2 pointer-events-none overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-2">
              <CardTitle className="truncate min-w-0 flex-1">
                {model.model_name}
              </CardTitle>
              <span className="shrink-0 pr-1">
                <StatusDot status={model.status} />
              </span>
            </div>
            <CardDescription className="truncate mt-0.5 text-text-muted pl-0.5">
              {model.namespace} / {model.container}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      {/* ── metrics grid ── */}
      <CardContent className="px-0 space-y-3">
        {model.status !== "archived" && (
          <div className="grid grid-cols-2 gap-3 px-6">
            <MetricCell
              label="Running Requests"
              value={getDisplayValue(
                model,
                metricsMeta,
                "num_requests_running",
              )}
            />
            <MetricCell
              label="Waiting Requests"
              value={getDisplayValue(
                model,
                metricsMeta,
                "num_requests_waiting",
              )}
            />
            <KvCacheCell
              label="KV Cache Usage"
              value={getDisplayValue(model, metricsMeta, "kv_cache_usage_perc")}
              pct={getNumericValue(model, metricsMeta, "kv_cache_usage_perc")}
            />
            <TokenGenCell
              label="Token Generation"
              value={getDisplayValue(
                model,
                metricsMeta,
                "generation_tokens_rate",
              )}
              unit="tok/s"
            />
          </div>
        )}

        {/* Archived placeholder */}
        {model.status === "archived" && (
          <div className="px-6">
            <p className="text-text-muted text-xs italic">
              This model is archived and no longer reporting metrics.
            </p>
          </div>
        )}

        {/* Uptime footer */}
        <div>
          <div className="text-xs text-text-heading flex justify-between mb-1 px-6">
            <span className="uppercase tracking-wide text-text-muted font-medium">
              Uptime
            </span>
            <span>Last seen {formatTimeAgo(model.last_seen)}</span>
          </div>

          <div className="px-6">
            {model.uptime && model.uptime.length > 0 && (
              <UptimeBar buckets={model.uptime} height={16} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
