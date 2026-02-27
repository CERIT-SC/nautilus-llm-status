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

      <!-- Quick Stats -->
      <div v-if="model.status !== 'archived'" class="grid grid-cols-2 gap-2 text-xs">
        <div v-if="latestRunning !== null" class="bg-muted/50 rounded px-2 py-1.5">
          <span class="text-muted-foreground">Running</span>
          <p class="font-mono font-medium">{{ latestRunning }}</p>
        </div>
        <div v-if="latestWaiting !== null" class="bg-muted/50 rounded px-2 py-1.5">
          <span class="text-muted-foreground">Waiting</span>
          <p class="font-mono font-medium">{{ latestWaiting }}</p>
        </div>
        <div v-if="latestKV !== null" class="bg-muted/50 rounded px-2 py-1.5">
          <span class="text-muted-foreground">KV Cache</span>
          <p class="font-mono font-medium">{{ latestKV }}%</p>
        </div>
        <div v-if="gpuSummary" class="bg-muted/50 rounded px-2 py-1.5">
          <span class="text-muted-foreground">GPUs</span>
          <p class="font-mono font-medium truncate">{{ gpuSummary }}</p>
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
  model: { type: Object, required: true }
})

const latestRunning = computed(() => {
  const v = props.model.latest?.num_requests_running
  return v !== undefined ? Math.round(v) : null
})

const latestWaiting = computed(() => {
  const v = props.model.latest?.num_requests_waiting
  return v !== undefined ? Math.round(v) : null
})

const latestKV = computed(() => {
  const v = props.model.latest?.kv_cache_usage_perc
  return v !== undefined ? (v * 100).toFixed(1) : null
})

const gpuSummary = computed(() => {
  const gpus = props.model.latest?.gpu_count
  if (!gpus || typeof gpus !== 'object') return null
  return Object.entries(gpus).map(([name, count]) => `${Math.round(count)}x ${name}`).join(', ')
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
