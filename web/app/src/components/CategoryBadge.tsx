import { Badge } from "@e-infra/design-system";
import { getCategoryLabel } from "../lib/model-categories";

// Dot colors per shipped category; custom ids fall back to neutral gray.
const CATEGORY_DOT_CLS: Record<string, string> = {
  chat: "bg-blue-400",
  embedding: "bg-green-400",
  reranker: "bg-pink-400",
  speech: "bg-yellow-400",
};

export function CategoryBadge({ category }: { category: string }) {
  return (
    <Badge variant="secondary" className="w-fit">
      <span
        className={`w-2 h-2 rounded-full ${CATEGORY_DOT_CLS[category] ?? "bg-gray-400"}`}
      />
      {getCategoryLabel(category)}
    </Badge>
  );
}
