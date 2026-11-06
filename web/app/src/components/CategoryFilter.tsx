import { ToggleGroup, ToggleGroupItem } from "@e-infra/design-system";
import { getCategoryLabel } from "../lib/model-categories";

interface CategoryFilterProps {
  categories: string[];
  selectedCategories: string[];
  onChange: (categories: string[]) => void;
}

/**
 * Multi-select category filter built on the design system's toggle
 * group (type="multiple"). An empty selection means all models are
 * shown; several selected chips show models from any of them, and
 * clicking an active chip toggles it off.
 *
 * Radix renders `type="multiple"` items as plain buttons announced
 * with aria-pressed inside a toolbar, so the roles are overridden to
 * checkbox semantics — the conventional announcement for multi-select
 * filters.
 */
export function CategoryFilter({
  categories,
  selectedCategories,
  onChange,
}: CategoryFilterProps) {
  return (
    <ToggleGroup
      type="multiple"
      variant="outline"
      size="sm"
      spacing={2}
      role="group"
      aria-label="Filter models by category"
      className="mb-8 flex-wrap justify-start"
      value={selectedCategories}
      onValueChange={onChange}
    >
      {categories.map((category) => (
        <ToggleGroupItem
          key={category}
          value={category}
          role="checkbox"
          aria-checked={selectedCategories.includes(category)}
          aria-pressed={undefined}
          className="rounded-full"
        >
          {getCategoryLabel(category)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
