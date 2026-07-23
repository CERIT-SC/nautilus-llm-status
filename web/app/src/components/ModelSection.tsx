import { useState } from "react";
import type { Model, MetricsMeta } from "../types/api";
import { H4 } from "@e-infra/design-system";
import { StatusDot } from "./StatusDot";
import { ModelCard } from "./ModelCard";
import { ChevronDown } from "lucide-react";

interface ModelSectionProps {
  title: string;
  status: "online" | "down" | "archived";
  models: Model[];
  metricsMeta: MetricsMeta[];
  colsClass?: string;
  sectionClass?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export function ModelSection({
  title,
  status,
  models,
  metricsMeta,
  colsClass = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 lg:grid-cols-3",
  sectionClass = "mb-6",
  collapsible = false,
  defaultCollapsed = false,
}: ModelSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section className={sectionClass}>
      <div
        className={`flex items-center gap-2 mb-4 ${collapsible ? "cursor-pointer hover:opacity-80" : ""}`}
        onClick={collapsible ? () => setCollapsed(!collapsed) : undefined}
      >
        <StatusDot status={status} />
        <H4>
          {title} ({models.length})
        </H4>
        {collapsible && (
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
        )}
      </div>
      {!collapsed && (
        <div className={`grid gap-4 ${colsClass}`}>
          {models.map((model) => (
            <ModelCard key={model.id} model={model} metricsMeta={metricsMeta} />
          ))}
        </div>
      )}
    </section>
  );
}
