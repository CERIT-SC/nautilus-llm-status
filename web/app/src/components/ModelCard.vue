<template>
  <router-link :to="`/models/${model.id}`" class="block">
    <div :class="[
      'border rounded-lg p-4 transition-all hover:shadow-md hover:border-foreground/20',
      model.status === 'online' ? 'bg-card' : model.status === 'down' ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900' : 'bg-muted/50 opacity-75'
    ]">
      <!-- Header -->
      <div class="flex items-start justify-between mb-3">
        <div class="min-w-0 flex-1">
          <h3 class="font-semibold text-sm truncate">{{ model.model_name }}</h3>
          <p class="text-xs text-muted-foreground truncate mt-0.5">{{ model.namespace }}/{{ model.container }}</p>
        </div>
        <StatusDot :status="model.status" />
      </div>

      <!-- Quick Stats (dynamic from metricsMeta) -->
      <div v-if="model.status !== 'archived' && stats.length > 0" class="grid grid-cols-2 gap-2 text-xs">
        <div v-for="stat in stats" :key="stat.name" class="bg-muted/50 rounded px-2 py-1.5">
          <span class="text-muted-foreground">{{ stat.label }}</span>
          <p class="font-mono font-medium truncate">{{ stat.display }}</p>
        </div>
      </div>

      <!-- Last Seen -->
      <div class="mt-3 text-xs text-muted-foreground">
        Last seen {{ timeAgo(model.last_seen) }}
      </div>
    </div>
  </router-link>
</template>

<script setup>
import { computed } from 'vue'
import StatusDot from './StatusDot.vue'

const props = defineProps({
  model: { type: Object, required: true },
  metricsMeta: { type: Array, default: () => [] }
})

const stats = computed(() => {
  const result = []
  for (const meta of props.metricsMeta) {
    const raw = props.model.latest?.[meta.storage_name]
    if (raw === undefined || raw === null) continue

    if (meta.has_labels) {
      // Labeled metric (e.g. gpu_count): show as "2x A100, 4x H100"
      if (typeof raw === 'object') {
        const display = Object.entries(raw)
          .map(([name, count]) => `${Math.round(count)}x ${name}`)
          .join(', ')
        if (display) {
          result.push({ name: meta.storage_name, label: meta.display_name, display })
        }
      }
    } else {
      // Scalar metric: apply display_scale and unit
      const scale = meta.display_scale || 1
      const val = raw * scale
      let display
      if (meta.unit === '%') {
        display = `${val.toFixed(1)}%`
      } else if (meta.unit === 's') {
        display = `${val.toFixed(2)}s`
      } else if (meta.unit) {
        display = `${val.toFixed(1)} ${meta.unit}`
      } else {
        display = `${Math.round(val)}`
      }
      result.push({ name: meta.storage_name, label: meta.display_name, display })
    }
  }
  return result
})

const timeAgo = (iso) => {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
</script>
