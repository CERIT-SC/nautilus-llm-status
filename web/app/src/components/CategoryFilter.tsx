import { getCategoryLabel } from "../lib/model-categories";

interface CategoryFilterProps {
  categories: string[];
  selectedCategory: string | null;
  onChange: (category: string | null) => void;
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-transparent text-text-muted border-border hover:bg-secondary/50"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Single-select category filter chips. "All" is represented internally
 * as null — no category may use that id (reserved server-side).
 */
export function CategoryFilter({
  categories,
  selectedCategory,
  onChange,
}: CategoryFilterProps) {
  return (
    <div
      role="group"
      aria-label="Filter models by category"
      className="flex flex-wrap items-center gap-2 mb-4"
    >
      <Chip
        label="All"
        active={selectedCategory === null}
        onClick={() => onChange(null)}
      />
      {categories.map((category) => (
        <Chip
          key={category}
          label={getCategoryLabel(category)}
          active={selectedCategory === category}
          onClick={() => onChange(category)}
        />
      ))}
    </div>
  );
}
