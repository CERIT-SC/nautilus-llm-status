import { StatusDot } from "./StatusDot";
import { getCategoryLabel } from "../lib/model-categories";
import type { Model } from "../types/api";

// The backend's fallback category; a card in the default category shows
// only the plain status dot, no pill.
const DEFAULT_CATEGORY = "chat";

interface CategoryBadgeProps {
  category: string;
  status: Model["status"];
  /** Backend-provided display label; title-cased id when absent. */
  label?: string;
}

/**
 * The card's top-right indicator. For the default category it is the
 * plain status dot; for a real category the dot extends into a pill —
 * category label first, status dot on its right.
 */
export function CategoryBadge({ category, status, label }: CategoryBadgeProps) {
  if (category === DEFAULT_CATEGORY) {
    return <StatusDot status={status} />;
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-secondary py-0.5 pr-2 pl-2.5 text-xs font-medium whitespace-nowrap shrink-0 text-secondary-foreground">
      <span>{label && label.length > 0 ? label : getCategoryLabel(category)}</span>
      <StatusDot status={status} />
    </span>
  );
}
