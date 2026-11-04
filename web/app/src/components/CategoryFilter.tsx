import { ToggleGroup, ToggleGroupItem } from "@e-infra/design-system";
import { getCategoryLabel } from "../lib/model-categories";

interface CategoryFilterProps {
  categories: string[];
  /** Optional label lookup (from model responses); title-cased id when absent. */
  labels?: Record<string, string>;
  selectedCategory: string | null;
  onChange: (category: string | null) => void;
}

/**
 * Single-select category filter built on the design system's toggle
 * group (rendered as a radiogroup with aria-checked items). There is no
 * explicit "All" chip: an empty selection means all models are shown,
 * and clicking the active chip again deselects it.
 */
export function CategoryFilter({
  categories,
  labels,
  selectedCategory,
  onChange,
}: CategoryFilterProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={2}
      aria-label="Filter models by category"
      className="flex-wrap justify-start"
      value={selectedCategory ?? ""}
      onValueChange={(value) => onChange(value || null)}
    >
      {categories.map((category) => (
        <ToggleGroupItem
          key={category}
          value={category}
          className="rounded-full"
        >
          {labels && labels[category] ? labels[category] : getCategoryLabel(category)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
