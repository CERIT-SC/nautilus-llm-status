/**
 * Format an ISO timestamp as a relative "time ago" string.
 * Produces: "just now" | "Xm ago" | "Xh ago" | "Xd ago".
 * Pure function; pass nowMs to make it deterministic (e.g. for ticking UIs).
 */
export function formatTimeAgo(iso: string, nowMs: number = Date.now()): string {
  if (!iso) return 'N/A'
  const diff = nowMs - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/**
 * Format ISO timestamp for display
 */
export function prettifyTimestamp(isoTimestamp: string): string {
  if (!isoTimestamp) return 'N/A'
  
  try {
    const date = new Date(isoTimestamp)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'short'
    })
  } catch {
    return isoTimestamp
  }
}
