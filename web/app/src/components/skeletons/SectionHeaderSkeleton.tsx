import { Skeleton } from '@e-infra/design-system'

export function SectionHeaderSkeleton() {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Skeleton className="h-2.5 w-2.5 rounded-full" />
      <Skeleton className="h-6 w-32" />
    </div>
  )
}
