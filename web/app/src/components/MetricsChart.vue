<template>
  <div class="relative w-full" style="height: 280px;">
    <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-background/50">
      <Loading />
    </div>
    <div v-else-if="error" class="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
      {{ error }}
    </div>
    <div v-else-if="!hasData" class="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
      No data available
    </div>
    <Line v-else :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, TimeScale } from 'chart.js'
import 'chartjs-adapter-date-fns'
import Loading from './Loading.vue'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, TimeScale)

const props = defineProps({
  modelId: { type: Number, required: true },
  metricName: { type: String, default: '' },
  // For overlaying multiple metrics (e.g. latency P50 + P99)
  metricNames: { type: Array, default: null }, // [{name, label, scale?}]
  title: { type: String, required: true },
  unit: { type: String, default: '' },
  duration: { type: String, default: '24h' },
  fill: { type: Boolean, default: true },
  stacked: { type: Boolean, default: false },
  scale: { type: Number, default: 1 }
})

const loading = ref(true)
const error = ref(null)
const seriesData = ref([])
const isDark = ref(document.documentElement.classList.contains('dark'))
let abortController = null

const colors = [
  { border: 'rgb(59, 130, 246)', bg: 'rgba(59, 130, 246, 0.1)' },
  { border: 'rgb(16, 185, 129)', bg: 'rgba(16, 185, 129, 0.1)' },
  { border: 'rgb(245, 158, 11)', bg: 'rgba(245, 158, 11, 0.1)' },
  { border: 'rgb(239, 68, 68)', bg: 'rgba(239, 68, 68, 0.1)' },
  { border: 'rgb(139, 92, 246)', bg: 'rgba(139, 92, 246, 0.1)' },
  { border: 'rgb(236, 72, 153)', bg: 'rgba(236, 72, 153, 0.1)' },
]

const hasData = computed(() => {
  return seriesData.value.length > 0 && seriesData.value.some(s => s.points && s.points.length > 0)
})

// Insert null points where gaps exceed 2x the median interval, so Chart.js breaks the line.
const withGaps = (points, scale) => {
  if (points.length < 2) return points.map(p => ({ x: new Date(p.timestamp), y: p.value * scale }))

  // Estimate typical interval from median of first 20 consecutive deltas
  const deltas = []
  const limit = Math.min(points.length, 21)
  for (let i = 1; i < limit; i++) {
    deltas.push(new Date(points[i].timestamp) - new Date(points[i - 1].timestamp))
  }
  deltas.sort((a, b) => a - b)
  const median = deltas[Math.floor(deltas.length / 2)]
  const gapThreshold = median * 2.5

  const result = []
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const gap = new Date(points[i].timestamp) - new Date(points[i - 1].timestamp)
      if (gap > gapThreshold) {
        // Insert null to break the line
        result.push({ x: new Date(new Date(points[i - 1].timestamp).getTime() + median), y: null })
      }
    }
    result.push({ x: new Date(points[i].timestamp), y: points[i].value * scale })
  }
  return result
}

const chartData = computed(() => {
  if (!hasData.value) return { labels: [], datasets: [] }

  const isMulti = props.metricNames && props.metricNames.length > 0
  const datasets = seriesData.value.map((series, i) => {
    const color = colors[i % colors.length]
    // In multi-metric mode, scale was already applied during fetch
    const scale = isMulti ? 1 : props.scale
    return {
      label: series.label || props.title,
      data: withGaps(series.points, scale),
      borderColor: color.border,
      backgroundColor: props.fill ? color.bg : 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 3,
      tension: 0.2,
      fill: props.fill,
      spanGaps: false
    }
  })

  return { datasets }
})

const chartOptions = computed(() => {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: seriesData.value.length > 1,
        position: 'top',
        labels: {
          color: isDark.value ? '#9ca3af' : '#6b7280',
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 16,
          font: { size: 11 }
        }
      },
      tooltip: {
        backgroundColor: isDark.value ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        titleColor: isDark.value ? '#f9fafb' : '#111827',
        bodyColor: isDark.value ? '#d1d5db' : '#374151',
        borderColor: isDark.value ? '#4b5563' : '#e5e7eb',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (ctx) => {
            const val = ctx.parsed.y
            if (val == null) return null
            if (props.unit === '%') return `${ctx.dataset.label}: ${val.toFixed(1)}%`
            if (props.unit === 's') return `${ctx.dataset.label}: ${val.toFixed(2)}s`
            if (props.unit === 'tok/s') return `${ctx.dataset.label}: ${val.toFixed(1)} tok/s`
            return `${ctx.dataset.label}: ${val.toFixed(1)}${props.unit ? ' ' + props.unit : ''}`
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: props.duration === '3h' ? 'minute' : props.duration === '24h' ? 'hour' : 'day',
          displayFormats: { minute: 'h:mm a', hour: 'MMM d, ha', day: 'MMM d' }
        },
        grid: {
          color: isDark.value ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)',
          drawBorder: false
        },
        ticks: {
          color: isDark.value ? '#9ca3af' : '#6b7280',
          maxRotation: 0,
          autoSkipPadding: 20
        }
      },
      y: {
        beginAtZero: true,
        stacked: props.stacked,
        grid: {
          color: isDark.value ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)',
          drawBorder: false
        },
        ticks: {
          color: isDark.value ? '#9ca3af' : '#6b7280',
          callback: (value) => {
            if (props.unit === '%') return `${value}%`
            if (props.unit === 's') return `${value}s`
            return value
          }
        }
      }
    }
  }
})

const fetchData = async () => {
  // Cancel any in-flight request to prevent out-of-order updates
  if (abortController) abortController.abort()
  abortController = new AbortController()
  const signal = abortController.signal

  loading.value = true
  error.value = null
  try {
    // Use discrete range parameter for cacheable URLs
    const range = props.duration || '24h'

    if (props.metricNames && props.metricNames.length > 0) {
      // Multi-metric mode: fetch each metric and combine as labeled series
      const results = await Promise.all(
        props.metricNames.map(async (m) => {
          const resp = await fetch(`/api/v1/models/${props.modelId}/metrics/${m.name}?range=${range}`, { signal })
          if (!resp.ok) return []
          const series = await resp.json()
          const scale = m.scale || props.scale
          // Flatten and relabel: each metric becomes one series with the given label
          return series.map(s => ({
            label: s.label || m.label || m.name,
            points: s.points.map(p => ({ timestamp: p.timestamp, value: p.value * scale }))
          }))
        })
      )
      seriesData.value = results.flat()
    } else {
      // Single metric mode (original behavior)
      const resp = await fetch(`/api/v1/models/${props.modelId}/metrics/${props.metricName}?range=${range}`, { signal })
      if (resp.ok) {
        seriesData.value = await resp.json()
      } else {
        error.value = 'Failed to load data'
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') return // Superseded by newer request
    error.value = 'Failed to load data'
  } finally {
    loading.value = false
  }
}

watch(() => props.duration, fetchData)
watch(() => props.modelId, fetchData)

let observer
onMounted(() => {
  fetchData()
  observer = new MutationObserver(() => {
    isDark.value = document.documentElement.classList.contains('dark')
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})
onUnmounted(() => { if (observer) observer.disconnect() })
</script>
