import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '@e-infra/design-system'
import { StatusBadge } from './StatusBadge'

// Type definitions
export interface SuiteEndpointResult {
  success: boolean
  duration: number  // nanoseconds
}

export interface SuiteResult {
  success: boolean
  duration: number  // nanoseconds
  timestamp: string  // ISO
  endpointResults: SuiteEndpointResult[]
}

export interface Suite {
  key: string
  name: string
  group?: string
  results: SuiteResult[]
}

interface SuiteCardProps {
  suite: Suite
  maxResults?: number  // default: 50
  onShowTooltip?: (result: SuiteResult | null, event: React.MouseEvent, type: 'hover' | 'click') => void
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

export function SuiteCard({
  suite,
  maxResults = 50,
  onShowTooltip
}: SuiteCardProps) {
  const navigate = useNavigate()
  const [selectedResultIndex, setSelectedResultIndex] = useState<number | null>(null)

  // Derived values (computed properties from Vue version)
  const latestResult = suite.results.length > 0 
    ? suite.results[suite.results.length - 1] 
    : null

  const currentStatus: 'healthy' | 'unhealthy' | 'unknown' = latestResult 
    ? (latestResult.success ? 'healthy' : 'unhealthy')
    : 'unknown'

  const endpointCount = latestResult?.endpointResults?.length || 0

  // Pad results array to maxResults length
  const displayResults = useMemo(() => {
    const results: (SuiteResult | null)[] = [...suite.results]
    while (results.length < maxResults) {
      results.unshift(null)
    }
    return results.slice(-maxResults)
  }, [suite.results, maxResults])

  // Calculate success rate
  const successRate = useMemo(() => {
    if (!suite.results || suite.results.length === 0) return 0
    const successful = suite.results.filter(r => r.success).length
    return Math.round((successful / suite.results.length) * 100)
  }, [suite.results])

  // Calculate average duration (nanoseconds to milliseconds)
  const averageDuration = useMemo(() => {
    if (!suite.results || suite.results.length === 0) return null
    const total = suite.results.reduce((sum, r) => sum + (r.duration || 0), 0)
    return Math.trunc((total / suite.results.length) / 1000000)
  }, [suite.results])

  // Time labels for oldest/newest results
  const oldestResultTime = useMemo(() => {
    if (!suite.results || suite.results.length === 0) return 'N/A'
    return generatePrettyTimeAgo(suite.results[0].timestamp)
  }, [suite.results])

  const newestResultTime = useMemo(() => {
    if (!suite.results || suite.results.length === 0) return 'Now'
    return generatePrettyTimeAgo(suite.results[suite.results.length - 1].timestamp)
  }, [suite.results])

  // Navigation handler
  const navigateToDetails = useCallback(() => {
    navigate(`/suites/${suite.key}`)
  }, [navigate, suite.key])

  // Handle keyboard navigation for accessibility
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      navigateToDetails()
    }
  }, [navigateToDetails])

  // Tooltip handlers
  const handleMouseEnter = useCallback((result: SuiteResult, event: React.MouseEvent) => {
    onShowTooltip?.(result, event, 'hover')
  }, [onShowTooltip])

  const handleMouseLeave = useCallback((event: React.MouseEvent) => {
    onShowTooltip?.(null as unknown as SuiteResult, event, 'hover')
  }, [onShowTooltip])

  // Click handler for selecting/deselecting data points
  const handleClick = useCallback((
    result: SuiteResult, 
    event: React.MouseEvent, 
    index: number
  ) => {
    // Clear selections in other cards first
    window.dispatchEvent(new CustomEvent('clear-data-point-selection'))
    
    // Toggle this card's selection
    setSelectedResultIndex(prevIndex => {
      if (prevIndex === index) {
        onShowTooltip?.(null as unknown as SuiteResult, event, 'click')
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
    <Card className="suite h-full flex flex-col transition hover:shadow-lg hover:scale-[1.01] dark:hover:border-gray-700">
      <CardHeader className="suite-header px-3 sm:px-6 pt-3 sm:pt-6 pb-2 space-y-0">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="flex-1 min-w-0 overflow-hidden">
            <CardTitle className="text-base sm:text-lg truncate">
              <span 
                className="hover:text-primary cursor-pointer hover:underline text-sm sm:text-base block truncate" 
                onClick={navigateToDetails}
                onKeyDown={handleKeyDown}
                title={suite.name}
                role="link"
                tabIndex={0}
                aria-label={`View details for suite ${suite.name}`}
              >
                {suite.name}
              </span>
            </CardTitle>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground min-h-5">
              {suite.group && <span className="truncate" title={suite.group}>{suite.group}</span>}
              {suite.group && endpointCount > 0 && <span>•</span>}
              {endpointCount > 0 && <span>{endpointCount} endpoint{endpointCount !== 1 ? 's' : ''}</span>}
            </div>
          </div>
          <div className="shrink-0 ml-2">
            <StatusBadge status={currentStatus} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="suite-content flex-1 pb-3 sm:pb-4 px-3 sm:px-6 pt-2">
        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Success Rate: {successRate}%</p>
              {averageDuration !== null && (
                <p className="text-xs text-muted-foreground">{averageDuration}ms avg</p>
              )}
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
