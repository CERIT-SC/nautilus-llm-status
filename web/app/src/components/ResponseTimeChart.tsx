import { useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import type { HealthEvent } from '../types/api'
import { useEndpointResponseTimes } from '../hooks/useData'
import { getResponseTimeChartOptions, getChartColor } from '../lib/chart-config'
import { MetricsChartSkeleton } from './skeletons'
import { Spinner } from './Spinner'

interface ResponseTimeChartProps {
  endpointKey: string
  duration: '24h' | '7d' | '30d'
  events?: HealthEvent[]
}

export function ResponseTimeChart({ endpointKey, duration, events = [] }: ResponseTimeChartProps) {
  const [hoveredEventIndex, setHoveredEventIndex] = useState<number | null>(null)
  const { data, isLoading: loading, error: queryError } = useEndpointResponseTimes(endpointKey, duration)
  const error = queryError ? 'Failed to load chart data' : null

  const { timestamps, values } = useMemo(() => {
    const series = data?.[0]
    if (series?.points && series.points.length > 0) {
      return {
        timestamps: series.points.map(p => p.timestamp),
        values: series.points.map(p => p.value),
      }
    }
    return { timestamps: [], values: [] }
  }, [data])

  // Filter UNHEALTHY events for the selected duration and calculate durations
  const filteredEvents = useMemo(() => {
    if (!events?.length) return []

    const now = new Date()
    const fromTime = duration === '24h' ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
      : duration === '7d' ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    return events
      .filter(e => e.type === 'UNHEALTHY')
      .map((event, i) => {
        const eventTime = new Date(event.timestamp)
        if (eventTime < fromTime || eventTime > now) return null

        // Calculate duration to next event or now
        let durationStr: string | undefined
        let isOngoing = false
        if (i + 1 < events.length) {
          const next = new Date(events[i + 1].timestamp)
          const diffMs = next.getTime() - eventTime.getTime()
          durationStr = formatDuration(diffMs)
        } else {
          const diffMs = now.getTime() - eventTime.getTime()
          durationStr = formatDuration(diffMs)
          isOngoing = true
        }

        return { ...event, duration: durationStr, isOngoing }
      })
      .filter((e): e is typeof e & { duration: string } => e !== null)
  }, [events, duration])

  // Build chart data
  const chartData = useMemo(() => {
    if (!timestamps.length) return null

    const color = getChartColor(0)
    return {
      labels: timestamps.map(ts => new Date(ts)),
      datasets: [{
        label: 'Response Time (ms)',
        data: values,
        borderColor: color.border,
        backgroundColor: color.bg,
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 4,
        tension: 0.1,
        fill: true,
      }],
    }
  }, [timestamps, values])

  // Build chart options with annotations
  const chartOptions = useMemo(() => {
    return getResponseTimeChartOptions(
      false,
      duration,
      filteredEvents,
      hoveredEventIndex,
      setHoveredEventIndex
    )
  }, [duration, filteredEvents, hoveredEventIndex])

  if (loading || error || !chartData) {
    return (
      <div className="relative w-full" style={{ height: '300px' }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50">
            <Spinner />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm">
            {error}
          </div>
        )}
        {!loading && !error && <MetricsChartSkeleton height={300} />}
      </div>
    )
  }

  return (
    <div className="relative w-full" style={{ height: '300px' }}>
      <Line data={chartData} options={chartOptions} />
    </div>
  )
}

// Helper: format milliseconds to human-readable duration
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    const remainingMinutes = minutes % 60
    const hoursText = hours + (hours === 1 ? ' hour' : ' hours')
    if (remainingMinutes > 0) {
      return hoursText + ' ' + remainingMinutes + (remainingMinutes === 1 ? ' minute' : ' minutes')
    }
    return hoursText
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60
    const minutesText = minutes + (minutes === 1 ? ' minute' : ' minutes')
    if (remainingSeconds > 0) {
      return minutesText + ' ' + remainingSeconds + (remainingSeconds === 1 ? ' second' : ' seconds')
    }
    return minutesText
  } else {
    return seconds + (seconds === 1 ? ' second' : ' seconds')
  }
}
