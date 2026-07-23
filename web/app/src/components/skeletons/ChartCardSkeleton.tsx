import { Skeleton, Card } from "@e-infra/design-system";

interface ChartCardSkeletonProps {
  className?: string;
}

export function ChartCardSkeleton({ className }: ChartCardSkeletonProps) {
  return (
    <Card className={` ${className ?? ""}`}>
      <div className="p-4">
        {/* Chart title */}
        <Skeleton className="h-5 w-40 mb-6" />
        {/* Chart area */}
        <Skeleton className="h-[280px] w-full rounded-lg" />
      </div>
    </Card>
  );
}
