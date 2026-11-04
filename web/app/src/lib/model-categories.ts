import type { Model } from "../types/api";

/**
 * Category ids come from the backend (config-driven classification).
 * Older backends may omit the field; those models fall back to "chat".
 */
export function getModelCategory(model: Pick<Model, "category">): string {
  return model.category && model.category.length > 0 ? model.category : "chat";
}

/** Friendly display labels for the shipped categories; other ids title-case. */
export function getCategoryLabel(category: string): string {
  switch (category) {
    case "chat":
      return "Chat";
    case "embedding":
      return "Embedding";
    case "reranker":
      return "Reranker";
    case "speech":
      return "Speech";
    default:
      return titleCaseID(category);
  }
}

/** "decision-support" -> "Decision Support" */
function titleCaseID(id: string): string {
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/** Display label for one model: backend-provided label wins, then the mapping. */
export function getModelCategoryLabel(
  model: Pick<Model, "category" | "category_label">,
): string {
  if (model.category_label && model.category_label.length > 0) {
    return model.category_label;
  }
  return getCategoryLabel(getModelCategory(model));
}

/** Label lookup by category id, from each category's first model. */
export function categoryLabelMap(models: Model[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const model of models) {
    const id = getModelCategory(model);
    if (!(id in map)) {
      map[id] = getModelCategoryLabel(model);
    }
  }
  return map;
}

/** Deduplicated, lexicographically sorted category ids across all models. */
export function getAvailableCategories(models: Model[]): string[] {
  const set = new Set<string>();
  for (const model of models) {
    set.add(getModelCategory(model));
  }
  return [...set].sort();
}

/** null means "All" — no filtering. */
export function filterModelsByCategory(
  models: Model[],
  category: string | null,
): Model[] {
  if (category === null) return models;
  return models.filter((m) => getModelCategory(m) === category);
}
