import { SectionHeaderSkeleton } from "./SectionHeaderSkeleton";
import { ModelCardSkeleton } from "./ModelCardSkeleton";

interface SkeletonGridProps {
  count?: number;
  colsClass?: string;
  sectionClass?: string;
  showHeader?: boolean;
}

export function SkeletonGrid({
  count = 6,
  colsClass = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  sectionClass = "mb-6",
  showHeader = true,
}: SkeletonGridProps) {
  return (
    <section className={sectionClass}>
      {showHeader && <SectionHeaderSkeleton />}
      <div className={`grid gap-4 ${colsClass}`}>
        {Array.from({ length: count }).map((_, i) => (
          <ModelCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}
