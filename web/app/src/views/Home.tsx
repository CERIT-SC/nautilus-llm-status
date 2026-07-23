import { useMemo } from "react";
import { ServerOff } from "lucide-react";
import { useModels, useMetricsMeta } from "../hooks/useData";
import { ModelSection } from "../components/ModelSection";
import { SkeletonGrid } from "../components/skeletons/SkeletonGrid";
import {
  Content,
  ContentHeading,
  ContentBody,
  H3,
  Muted,
} from "@e-infra/design-system";

/**
 * Home page - LLM models dashboard
 */
export function Home() {
  // NOTE: destructuring default `= []` only covers `undefined`, not `null`.
  // The backend may return `null` for an empty model list, so coerce explicitly.
  // Memoize so the downstream useMemo hooks get a stable reference.
  const { data, isLoading, isError } = useModels();
  const models = useMemo(() => data ?? [], [data]);
  const { data: metricsMeta = [] } = useMetricsMeta();

  const summaryMeta = useMemo(
    () => metricsMeta.filter((m) => m.summary),
    [metricsMeta],
  );
  const onlineModels = useMemo(
    () => models.filter((m) => m.status === "online"),
    [models],
  );
  const downModels = useMemo(
    () => models.filter((m) => m.status === "down"),
    [models],
  );
  const archivedModels = useMemo(
    () => models.filter((m) => m.status === "archived"),
    [models],
  );

  if (isLoading) {
    return (
      <Content className="container mx-auto px-4 pt-8">
        <ContentHeading>LLM Models</ContentHeading>
        <ContentBody>
          <SkeletonGrid count={6} />
          <SkeletonGrid count={2} />
          <SkeletonGrid count={0} showHeader={true} />
        </ContentBody>
      </Content>
    );
  }

  if (isError) {
    return (
      <Content className="container mx-auto px-4 pt-8">
        <ContentHeading>LLM Models</ContentHeading>
        <ContentBody>
          <div className="text-center py-20">
            <ServerOff className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <H3 className="mb-2">Failed to load models</H3>
            <Muted>Unable to reach the status backend.</Muted>
          </div>
        </ContentBody>
      </Content>
    );
  }

  if (models.length === 0) {
    return (
      <Content className="container mx-auto px-4 pt-8">
        <ContentHeading>LLM Models</ContentHeading>
        <ContentBody>
          <div className="text-center py-20">
            <ServerOff className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <H3 className="mb-2">No models found</H3>
            <Muted>Waiting for Prometheus data...</Muted>
          </div>
        </ContentBody>
      </Content>
    );
  }

  return (
    <Content className="container mx-auto px-4 pt-8">
      <ContentHeading>LLM Models</ContentHeading>
      <ContentBody>
        {onlineModels.length > 0 && (
          <ModelSection
            title="Online"
            status="online"
            models={onlineModels}
            metricsMeta={summaryMeta}
          />
        )}
        {downModels.length > 0 && (
          <ModelSection
            title="Temporarily Down"
            status="down"
            models={downModels}
            metricsMeta={summaryMeta}
          />
        )}
        {archivedModels.length > 0 && (
          <ModelSection
            title="Archived"
            status="archived"
            models={archivedModels}
            metricsMeta={summaryMeta}
            collapsible={true}
            defaultCollapsed={true}
          />
        )}
      </ContentBody>
    </Content>
  );
}
