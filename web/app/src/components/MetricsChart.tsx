import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import type { LabeledSeries } from '../types/api'
import { MetricsChartSkeleton } from './skeletons'
import { getMetricsChartOptions, buildDataset } from '../lib/chart-config'
import { useDarkMode } from '../hooks/useDarkMode'
import { Spinner } from './Spinner'

interface MetricsChartProps {
  data: LabeledSeries[]
  unit?: string
  fill?: boolean
  loading?: boolean
  error?: string | null
  duration?: string
  title?: string
  scale?: number
}

function LoadingSpinner() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/50">
      <Spinner />
    </div>
  )
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
      {message}
    </div>
  )
}

export function MetricsChart({
  data,
  unit = '',
  fill = true,
  loading = false,
  error = null,
  duration = '24h',
  title,
  scale = 1,
}: MetricsChartProps) {
  const isDark = useDarkMode()

  const hasData = useMemo(
    () => data && Array.isArray(data) && data.some((s) => s.points && s.points.length > 0),
    [data]
  )

  const chartData = useMemo(() => {
    if (!hasData) return null

    const datasets = data
      .filter((series) => series.points && series.points.length > 0)
      .map((series, idx) =>
        buildDataset(series.points ?? [], idx, {
          fill,
          scale,
          label: series.label || title || `Series ${idx + 1}`,
        })
      )

    if (datasets.length === 0) return null
    return { datasets }
  }, [data, fill, hasData, scale, title])

  const options = useMemo(
    () =>
      getMetricsChartOptions(isDark, {
        unit,
        duration,
        fill,
        showLegend: data?.length > 1,
      }),
    [isDark, unit, duration, fill, data?.length]
  )

  if (!chartData) {
    // Distinguish "still loading" from "no data available" so the skeleton
    // doesn't show indefinitely for models that simply have no metrics.
    if (loading) {
      return <MetricsChartSkeleton height={280} />
    }
    return (
      <div
        className="relative w-full flex items-center justify-center text-muted-foreground text-sm"
        style={{ height: '280px' }}
      >
        {error ?? 'No data available'}
      </div>
    )
  }

  return (
    <div className="relative w-full" style={{ height: '280px' }}>
      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}
      {!loading && !error && <Line data={chartData} options={options} />}
    </div>
  )
}
