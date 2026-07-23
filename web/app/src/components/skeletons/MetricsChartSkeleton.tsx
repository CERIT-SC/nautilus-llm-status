import { Skeleton } from '@e-infra/design-system'

interface MetricsChartSkeletonProps {
  className?: string
  height?: number
}

export function MetricsChartSkeleton({ className, height = 280 }: MetricsChartSkeletonProps) {
  const chartAreaHeight = height - 40 // Account for title/legend area
  return (
    <div className={`relative w-full ${className ?? ''}`} style={{ height: `${height}px` }}>
      {/* Chart title/legend area */}
      <Skeleton className="h-4 w-32 mb-4" />
      {/* Chart area */}
      <Skeleton className="w-full rounded-lg" style={{ height: `${chartAreaHeight}px` }} />
    </div>
  )
}
