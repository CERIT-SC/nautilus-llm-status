interface HealthIndicatorProps {
  healthy?: boolean
}

export function HealthIndicator({ healthy = false }: HealthIndicatorProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <div className={`w-2 h-2 rounded-full ${healthy ? 'bg-green-500' : 'bg-red-500'}`} />
      <span>{healthy ? 'Connected' : 'Disconnected'}</span>
    </div>
  )
}
