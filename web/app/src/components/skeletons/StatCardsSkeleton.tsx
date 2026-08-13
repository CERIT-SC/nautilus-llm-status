import { Skeleton, Card, CardContent } from "@e-infra/design-system";

interface StatCardsSkeletonProps {
  /** Number of stat cards to render (defaults to the usage Totals row count). */
  count?: number;
}

/**
 * Skeleton placeholder mirroring the ModelDetail stat cards:
 * a responsive grid of Cards, each with a Small-label-sized and
 * H3-value-sized Skeleton inside its CardContent.
 */
export function StatCardsSkeleton({ count = 5 }: StatCardsSkeletonProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card className="py-2" key={i}>
          <CardContent>
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-7 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
