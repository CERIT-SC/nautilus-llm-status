/**
 * Chart.js configuration utilities
 */
import type { ChartOptions, TooltipItem } from 'chart.js'
import type { AnnotationPluginOptions } from 'chartjs-plugin-annotation'

/**
 * Get chart color from CSS variables
 */
export function getChartColor(index: number): { border: string; bg: string } {
  const n = (index % 5) + 1
  const style = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null
  const color = style?.getPropertyValue(`--chart-${n}`)?.trim() || '#6b7280'
  const hex = color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return {
    border: color,
    bg: `rgba(${r}, ${g}, ${b}, 0.1)`,
  }
}

/**
 * Get CSS variable with fallback
 */
function getCSSFromDesignSystem(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

/**
 * Get chart UI colors from CSS variables
 */
export const getChartColors = () => {
  const style = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null
  const getVar = (name: string, fb: string) => style?.getPropertyValue(name)?.trim() || fb

  return {
    text: getVar('--text-muted', '#6b7280'),
    textEmphasis: getVar('--text', '#111827'),
    grid: getVar('--border', 'rgba(156,163,175,0.3)'),
    border: getVar('--border', '#e5e7eb'),
    tooltipBg: getVar('--background', '#ffffff'),
    tooltipText: getVar('--text-muted', '#374151'),
    line: getVar('--chart-1', '#3b82f6'),
    lineBg: getChartColor(0).bg,  // reuse chart color
  }
}

/**
 * Get time unit for chart axis
 */
export const getTimeUnit = (duration: string): 'minute' | 'hour' | 'day' => {
  if (duration === '3h') return 'minute'
  if (duration === '24h') return 'hour'
  return 'day'
}

/**
 * Get time label format
 */
export const getTimeDisplayFormat = (duration: string) => {
  if (duration === '3h') return 'h:mm a'
  if (duration === '24h') return 'MMM d, ha'
  return 'MMM d'
}

/**
 * Get x-axis bounds for the selected duration so the axis spans the full
 * range even when data only covers part of it
 */
export const getTimeBounds = (duration: string): { min: number; max: number } => {
  const hours: Record<string, number> = {
    '3h': 3,
    '24h': 24,
    '7d': 7 * 24,
    '30d': 30 * 24,
  }
  const max = Date.now()
  const min = max - (hours[duration] ?? 24) * 60 * 60 * 1000
  return { min, max }
}

/**
 * Format tooltip value with unit
 */
export const formatTooltipValue = (
  value: number | null,
  unit: string,
  label?: string
): string | void => {
  if (value == null) return

  const formatted = label ? `${label}: ` : ''

  if (unit === '%') return `${formatted}${value.toFixed(1)}%`
  if (unit === 's') return `${formatted}${value.toFixed(2)}s`
  if (unit === 'tok/s') return `${formatted}${value.toFixed(1)} tok/s`
  if (unit === 'ms') return `${formatted}${value}ms`

  return `${formatted}${value.toFixed(1)}${unit ? ' ' + unit : ''}`
}

/**
 * Default options for metrics line charts
 */
export const getMetricsChartOptions = (
  _isDark: boolean,
  options?: {
    title?: string
    unit?: string
    duration?: string
    fill?: boolean
    stacked?: boolean
    showLegend?: boolean
  }
): ChartOptions<'line'> => {
  const colors = getChartColors()
  const duration = options?.duration || '24h'
  const showLegend = options?.showLegend ?? true
  const bounds = getTimeBounds(duration)

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: showLegend,
        position: 'top' as const,
        labels: {
          color: colors.text,
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 16,
          font: { size: 11 },
        },
      },
      tooltip: {
        backgroundColor: colors.tooltipBg,
        titleColor: colors.textEmphasis,
        bodyColor: colors.tooltipText,
        borderColor: colors.border,
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (ctx: TooltipItem<'line'>) => {
            const val = ctx.parsed.y
            const unit = options?.unit || ''
            return formatTooltipValue(val, unit, ctx.dataset.label)
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time' as const,
        min: bounds.min,
        max: bounds.max,
        time: {
          unit: getTimeUnit(duration),
          displayFormats: {
            minute: 'h:mm a',
            hour: 'MMM d, ha',
            day: 'MMM d',
          },
        },
        grid: {
          color: colors.grid,
        },
        ticks: {
          color: colors.text,
          maxRotation: 0,
          autoSkipPadding: 20,
        },
      },
      y: {
        beginAtZero: true,
        stacked: options?.stacked ?? false,
        grid: {
          color: colors.grid,
        },
        ticks: {
          color: colors.text,
          callback: (value) => {
            const unit = options?.unit || ''
            if (unit === '%') return `${value}%`
            if (unit === 's') return `${value}s`
            return value
          },
        },
      },
    },
  }
}

/**
 * Chart options for response time charts with annotations
 */
export const getResponseTimeChartOptions = (
  _isDark: boolean,
  duration: string,
  events: Array<{
    timestamp: string
    type: string
    duration?: string
    isOngoing?: boolean
  }> = [],
  hoveredEventIndex: number | null = null,
  onHoverChange?: (index: number | null) => void
): ChartOptions<'line'> => {
  const colors = getChartColors()
  const bounds = getTimeBounds(duration)

  // Calculate max Y for positioning annotations
  const maxY = 100 // Default, will be overridden by data
  const midY = maxY / 2

  // Build annotations for unhealthy events using design system colors
  const annotations: AnnotationPluginOptions['annotations'] = {}

  events.forEach((event, index) => {
    if (event.type !== 'UNHEALTHY') return

    const position = midY <= maxY / 2 ? 'end' as const : 'start' as const
    const chart5Color = getCSSFromDesignSystem('--chart-5', '#ef4444')

    annotations[`event-${index}`] = {
      type: 'line',
      xMin: event.timestamp,
      xMax: event.timestamp,
      borderColor: chart5Color,
      borderWidth: 1,
      borderDash: [5, 5],
      enter() {
        onHoverChange?.(index)
      },
      leave() {
        onHoverChange?.(null)
      },
      label: {
        display: hoveredEventIndex === index,
        content: [
          event.isOngoing ? 'Status: ONGOING' : 'Status: RESOLVED',
          `Unhealthy for ${event.duration}`,
          `Started at ${new Date(event.timestamp).toLocaleString()}`,
        ],
        backgroundColor: chart5Color,
        color: getCSSFromDesignSystem('--text', '#ffffff'),
        font: { size: 11 },
        padding: 6,
        position,
      },
    }
  })

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: colors.tooltipBg,
        titleColor: colors.textEmphasis,
        bodyColor: colors.tooltipText,
        borderColor: colors.border,
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        callbacks: {
          title: (tooltipItems: TooltipItem<'line'>[]) => {
            if (tooltipItems.length > 0) {
              const x = tooltipItems[0].parsed.x
              if (x != null) {
                return new Date(x).toLocaleString()
              }
            }
            return ''
          },
          label: (ctx: TooltipItem<'line'>) => {
            const value = ctx.parsed.y
            return `${value}ms`
          },
        },
      },
      annotation: {
        annotations,
      },
    },
    scales: {
      x: {
        type: 'time' as const,
        min: bounds.min,
        max: bounds.max,
        time: {
          unit: getTimeUnit(duration),
          displayFormats: {
            hour: 'MMM d, ha',
            day: 'MMM d',
          },
        },
        grid: {
          color: colors.grid,
        },
        ticks: {
          color: colors.text,
          maxRotation: 0,
          autoSkipPadding: 20,
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: colors.grid,
        },
        ticks: {
          color: colors.text,
          callback: (value) => `${value}ms`,
        },
      },
    },
  }
}

/**
 * Insert nulls at data gaps to break chart lines
 */
export interface DataPoint {
  timestamp: string
  value: number
}

export interface ProcessedDataPoint {
  x: Date
  y: number | null
}

export const withGaps = (
  points: DataPoint[],
  scale: number = 1
): ProcessedDataPoint[] => {
  if (points.length < 2) {
    return points.map((p) => ({
      x: new Date(p.timestamp),
      y: p.value * scale,
    }))
  }

  const deltas: number[] = []
  const limit = Math.min(points.length, 21)
  for (let i = 1; i < limit; i++) {
    deltas.push(new Date(points[i].timestamp).getTime() - new Date(points[i - 1].timestamp).getTime())
  }
  deltas.sort((a, b) => a - b)
  const median = deltas[Math.floor(deltas.length / 2)]
  const gapThreshold = median * 2.5

  const result: ProcessedDataPoint[] = []
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const gap = new Date(points[i].timestamp).getTime() - new Date(points[i - 1].timestamp).getTime()
      if (gap > gapThreshold) {
        result.push({
          x: new Date(new Date(points[i - 1].timestamp).getTime() + median),
          y: null,
        })
      }
    }
    result.push({
      x: new Date(points[i].timestamp),
      y: points[i].value * scale,
    })
  }
  return result
}

/**
 * Chart dataset configuration
 */
export interface DatasetConfig {
  label: string
  data: ProcessedDataPoint[]
  borderColor: string
  backgroundColor: string
  borderWidth: number
  pointRadius: number
  pointHoverRadius: number
  tension: number
  fill: boolean
  spanGaps: boolean
}

/**
 * Build dataset for a metric series
 */
export const buildDataset = (
  points: DataPoint[],
  colorIndex: number,
  options?: {
    fill?: boolean
    scale?: number
    label?: string
  }
): DatasetConfig => {
  const color = getChartColor(colorIndex)
  const scale = options?.scale ?? 1
  const fill = options?.fill ?? true

  return {
    label: options?.label || 'Metric',
    data: withGaps(points, scale),
    borderColor: color.border,
    backgroundColor: fill ? color.bg : 'transparent',
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 3,
    tension: 0.2,
    fill,
    spanGaps: false,
  }
}
