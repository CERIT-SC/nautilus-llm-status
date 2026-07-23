/**
 * Format duration from nanoseconds to ms or s
 */
export function formatDuration(duration: number | undefined | null): string {
  if (duration === undefined || duration === null) return 'N/A'
  
  const durationMs = duration / 1000000
  
  if (durationMs < 1000) {
    return `${Math.trunc(durationMs)}ms`
  } else {
    return `${(durationMs / 1000).toFixed(2)}s`
  }
}
