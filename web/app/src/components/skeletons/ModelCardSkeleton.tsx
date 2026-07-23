import {
  Skeleton,
  Card,
  CardHeader,
  CardContent,
} from "@e-infra/design-system";

interface ModelCardSkeletonProps {
  className?: string;
}

/**
 * Skeleton placeholder mirroring the ModelCard layout:
 * header (title + status dot + description), a 2×2 metrics grid
 * (one cell with a progress bar), and an uptime footer with a label row.
 */
export function ModelCardSkeleton({ className }: ModelCardSkeletonProps) {
  return (
    <Card className={`${className ?? ""}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden space-y-1">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-3 w-3 shrink-0 rounded-full mt-1.5" />
        </div>
      </CardHeader>

      <CardContent className="px-0 space-y-3">
        {/* Metrics grid (2×2) */}
        <div className="grid grid-cols-2 gap-3 px-6">
          <div className="rounded-md border bg-surface-raised p-2">
            <Skeleton className="h-4 w-20 mb-1" />
            <Skeleton className="h-6 w-16" />
          </div>
          <div className="rounded-md border bg-surface-raised p-2">
            <Skeleton className="h-4 w-20 mb-1" />
            <Skeleton className="h-6 w-16" />
          </div>
          {/* KV cache cell — includes a progress bar */}
          <div className="rounded-md border bg-surface-raised p-2">
            <Skeleton className="h-4 w-20 mb-1" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-1.5 w-full mt-2" />
          </div>
          <div className="rounded-md border bg-surface-raised p-2">
            <Skeleton className="h-4 w-20 mb-1" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>

        {/* Uptime footer */}
        <div>
          <div className="flex justify-between mb-1 px-6">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="px-6">
            <Skeleton className="h-4 w-full rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
