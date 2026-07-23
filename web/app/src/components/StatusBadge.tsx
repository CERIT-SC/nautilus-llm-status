import { Badge } from '@e-infra/design-system'

interface StatusBadgeProps {
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown'
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const getVariant = (s: StatusBadgeProps['status']): 'default' | 'error' | 'secondary' => {
    switch (s) {
      case 'healthy':
        return 'default'
      case 'unhealthy':
        return 'error'
      case 'degraded':
        return 'secondary'
      default:
        return 'secondary'
    }
  }

  const getLabel = (s: StatusBadgeProps['status']): string => {
    switch (s) {
      case 'healthy':
        return 'Healthy'
      case 'unhealthy':
        return 'Unhealthy'
      case 'degraded':
        return 'Degraded'
      default:
        return 'Unknown'
    }
  }

  const getDotClass = (s: StatusBadgeProps['status']): string => {
    switch (s) {
      case 'healthy':
        return 'bg-green-400'
      case 'unhealthy':
        return 'bg-red-400'
      case 'degraded':
        return 'bg-yellow-400'
      default:
        return 'bg-gray-400'
    }
  }

  return (
    <Badge variant={getVariant(status)} className="flex items-center gap-1">
      <span className={`w-2 h-2 rounded-full ${getDotClass(status)}`} />
      {getLabel(status)}
    </Badge>
  )
}
