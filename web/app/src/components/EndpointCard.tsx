import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '@e-infra/design-system'
import { StatusBadge } from './StatusBadge'

// Type definitions
export interface EndpointResult {
  success: boolean
  duration: number  // nanoseconds
  timestamp: string  // ISO
  hostname?: string
}

export interface Endpoint {
  key: string
  name: string
  group?: string
  results: EndpointResult[]
}

interface EndpointCardProps {
  endpoint: Endpoint
  maxResults?: number  // default: 50
  showAverageResponseTime?: boolean  // default: true
  onShowTooltip?: (result: EndpointResult | null, event: React.MouseEvent, type: 'hover' | 'click') => void
}

// Pretty time formatting helper
function generatePrettyTimeAgo(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime()
  const minutes = Math.floor(diff / 60000)
  
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function EndpointCard({
  endpoint,
  maxResults = 50,
  showAverageResponseTime = true,
  onShowTooltip
}: EndpointCardProps) {
  const navigate = useNavigate()
  const [selectedResultIndex, setSelectedResultIndex] = useState<number | null>(null)

  // Derived values (computed properties from Vue version)
  const latestResult = endpoint.results.length > 0 
    ? endpoint.results[endpoint.results.length - 1] 
    : null

  const currentStatus: 'healthy' | 'unhealthy' | 'unknown' = latestResult 
    ? (latestResult.success ? 'healthy' : 'unhealthy')
    : 'unknown'

  const hostname = latestResult?.hostname || null

  // Pad results array to maxResults length
  const displayResults = useMemoizedDisplayResults(endpoint.results, maxResults)

  // Format response time display
  const formattedResponseTime = useMemoizedResponseTime(
    endpoint.results, 
    showAverageResponseTime
  )

  // Time labels for oldest/newest results
  const oldestResultTime = useMemoizedOldestTime(endpoint.results, maxResults)
  const newestResultTime = useMemoizedNewestTime(endpoint.results)

  // Navigation handler
  const navigateToDetails = useCallback(() => {
    navigate(`/endpoints/${endpoint.key}`)
  }, [navigate, endpoint.key])

  // Handle keyboard navigation for accessibility
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      navigateToDetails()
    }
  }, [navigateToDetails])

  // Tooltip handlers
  const handleMouseEnter = useCallback((result: EndpointResult, event: React.MouseEvent) => {
    onShowTooltip?.(result, event, 'hover')
  }, [onShowTooltip])

  const handleMouseLeave = useCallback((event: React.MouseEvent) => {
    onShowTooltip?.(null as unknown as EndpointResult, event, 'hover')
  }, [onShowTooltip])

  // Click handler for selecting/deselecting data points
  const handleClick = useCallback((
    result: EndpointResult, 
    event: React.MouseEvent, 
    index: number
  ) => {
    // Clear selections in other cards first
    window.dispatchEvent(new CustomEvent('clear-data-point-selection'))
    
    // Toggle this card's selection
    setSelectedResultIndex(prevIndex => {
      if (prevIndex === index) {
        onShowTooltip?.(null as unknown as EndpointResult, event, 'click')
        return null
      } else {
        onShowTooltip?.(result, event, 'click')
        return index
      }
    })
  }, [onShowTooltip])

  // Listen for clear selection events from other cards
  useEffect(() => {
    const handleClearSelection = () => {
      setSelectedResultIndex(null)
    }

    window.addEventListener('clear-data-point-selection', handleClearSelection)
    return () => {
      window.removeEventListener('clear-data-point-selection', handleClearSelection)
    }
  }, [])

  return (
    <Card className="endpoint h-full flex flex-col transition hover:shadow-lg hover:scale-[1.01] dark:hover:border-gray-700">
      <CardHeader className="endpoint-header px-3 sm:px-6 pt-3 sm:pt-6 pb-2 space-y-0">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="flex-1 min-w-0 overflow-hidden">
            <CardTitle className="text-base sm:text-lg truncate">
              <span 
                className="hover:text-primary cursor-pointer hover:underline text-sm sm:text-base block truncate" 
                onClick={navigateToDetails}
                onKeyDown={handleKeyDown}
                title={endpoint.name}
                role="link"
                tabIndex={0}
                aria-label={`View details for ${endpoint.name}`}
              >
                {endpoint.name}
              </span>
            </CardTitle>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground min-h-[1.25rem]">
              {endpoint.group && <span className="truncate" title={endpoint.group}>{endpoint.group}</span>}
              {endpoint.group && hostname && <span>•</span>}
              {hostname && <span className="truncate" title={hostname}>{hostname}</span>}
            </div>
          </div>
          <div className="shrink-0 ml-2">
            <StatusBadge status={currentStatus} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="endpoint-content flex-1 pb-3 sm:pb-4 px-3 sm:px-6 pt-2">
        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex-1"></div>
              <p className="text-xs text-muted-foreground" title={showAverageResponseTime ? 'Average response time' : 'Minimum and maximum response time'}>
                {formattedResponseTime}
              </p>
            </div>
            <div className="flex gap-0.5">
              {displayResults.map((result, index) => (
                <div
                  key={index}
                  className={`
                    flex-1 h-6 sm:h-8 rounded-sm transition-all
                    ${result ? 'cursor-pointer' : ''}
                    ${result 
                      ? (result.success 
                          ? (selectedResultIndex === index ? 'bg-green-700' : 'bg-green-500 hover:bg-green-700')
                          : (selectedResultIndex === index ? 'bg-red-700' : 'bg-red-500 hover:bg-red-700'))
                      : 'bg-gray-200 dark:bg-gray-700'
                    }
                  `}
                  onMouseEnter={result ? (e) => handleMouseEnter(result, e) : undefined}
                  onMouseLeave={result ? handleMouseLeave : undefined}
                  onClick={result ? (e) => handleClick(result, e, index) : undefined}
                />
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
              <span>{oldestResultTime}</span>
              <span>{newestResultTime}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Memoized helper functions to avoid unnecessary recalculations
function useMemoizedDisplayResults(
  results: EndpointResult[], 
  maxResults: number
): (EndpointResult | null)[] {
  // This is a simple implementation - in a real app you might use useMemo
  const displayResults: (EndpointResult | null)[] = [...results]
  while (displayResults.length < maxResults) {
    displayResults.unshift(null)
  }
  return displayResults.slice(-maxResults)
}

function useMemoizedResponseTime(
  results: EndpointResult[], 
  showAverage: boolean
): string {
  if (!results || results.length === 0) return 'N/A'
  
  let total = 0
  let count = 0
  let min = Infinity
  let max = 0
  
  for (const result of results) {
    if (result.duration) {
      const durationMs = result.duration / 1000000
      total += durationMs
      count++
      min = Math.min(min, durationMs)
      max = Math.max(max, durationMs)
    }
  }
  
  if (count === 0) return 'N/A'
  
  if (showAverage) {
    const avgMs = Math.round(total / count)
    return `~${avgMs}ms`
  } else {
    const minMs = Math.trunc(min)
    const maxMs = Math.trunc(max)
    if (minMs === maxMs) {
      return `${minMs}ms`
    }
    return `${minMs}-${maxMs}ms`
  }
}

function useMemoizedOldestTime(
  results: EndpointResult[], 
  maxResults: number
): string {
  if (!results || results.length === 0) return ''
  const oldestResultIndex = Math.max(0, results.length - maxResults)
  return generatePrettyTimeAgo(results[oldestResultIndex].timestamp)
}

function useMemoizedNewestTime(results: EndpointResult[]): string {
  if (!results || results.length === 0) return ''
  return generatePrettyTimeAgo(results[results.length - 1].timestamp)
}
