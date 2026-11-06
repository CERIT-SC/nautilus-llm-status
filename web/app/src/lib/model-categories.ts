import type { Model } from "../types/api";

/**
 * Category ids come from the backend (config-driven classification).
 * Older backends may omit the field; those models fall back to "chat".
 */
export function getModelCategory(model: Pick<Model, "category">): string {
  return model.category && model.category.length > 0 ? model.category : "chat";
}

/** Friendly display labels for the shipped categories; custom ids pass through. */
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
      return category;
  }
}

/** Deduplicated, lexicographically sorted category ids across all models. */
export function getAvailableCategories(models: Model[]): string[] {
  const set = new Set<string>();
  for (const model of models) {
    set.add(getModelCategory(model));
  }
  return [...set].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/** Empty selection means "All" — no filtering; otherwise match any selected id. */
export function filterModelsByCategory(
  models: Model[],
  categories: string[],
): Model[] {
  if (categories.length === 0) return models;
  const wanted = new Set(categories);
  return models.filter((m) => wanted.has(getModelCategory(m)));
}
