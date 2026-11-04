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
