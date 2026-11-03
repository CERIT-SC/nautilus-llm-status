import { useEffect, useMemo, useState } from "react";
import { ServerOff } from "lucide-react";
import { useModels, useMetricsMeta } from "../hooks/useData";
import { ModelSection } from "../components/ModelSection";
import { CategoryFilter } from "../components/CategoryFilter";
import {
  filterModelsByCategory,
  getAvailableCategories,
} from "../lib/model-categories";
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

  // Local filter selection. If a refresh removes the selected category,
  // reconcile back to "All" instead of stranding a hidden selection.
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const availableCategories = useMemo(
    () => getAvailableCategories(models),
    [models],
  );
  const effectiveCategory =
    selectedCategory !== null && availableCategories.includes(selectedCategory)
      ? selectedCategory
      : null;

  // Clear a stale selection once it has been reconciled away, so a later
  // poll that re-adds the category cannot silently re-enable the filter.
  useEffect(() => {
    if (selectedCategory !== null && !availableCategories.includes(selectedCategory)) {
      setSelectedCategory(null);
    }
  }, [selectedCategory, availableCategories]);

  const visibleModels = useMemo(
    () => filterModelsByCategory(models, effectiveCategory),
    [models, effectiveCategory],
  );

  const summaryMeta = useMemo(
    () => metricsMeta.filter((m) => m.summary),
    [metricsMeta],
  );
  const onlineModels = useMemo(
    () => visibleModels.filter((m) => m.status === "online"),
    [visibleModels],
  );
  const downModels = useMemo(
    () => visibleModels.filter((m) => m.status === "down"),
    [visibleModels],
  );
  const archivedModels = useMemo(
    () => visibleModels.filter((m) => m.status === "archived"),
    [visibleModels],
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
            <ServerOff className="h-12 w-12 text-text-muted mx-auto mb-4" />
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
            <ServerOff className="h-12 w-12 text-text-muted mx-auto mb-4" />
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
        {models.length > 0 && (
          <CategoryFilter
            categories={availableCategories}
            selectedCategory={effectiveCategory}
            onChange={setSelectedCategory}
          />
        )}
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
