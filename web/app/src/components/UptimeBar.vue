<template>
  <div class="flex items-center gap-px" :title="summaryText">
    <div
      v-for="(up, i) in buckets"
      :key="i"
      :class="[
        'flex-1 rounded-sm transition-colors',
        up ? 'bg-green-500 hover:bg-green-400' : 'bg-red-500 hover:bg-red-400'
      ]"
      :style="{ height: height + 'px' }"
      :title="bucketTitle(i, up)"
    />
  </div>
  <div class="flex justify-between text-[10px] text-muted-foreground mt-0.5">
    <span>24h ago</span>
    <span>now</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  buckets: { type: Array, default: () => [] },
  height: { type: Number, default: 20 }
})

const summaryText = computed(() => {
  if (!props.buckets.length) return ''
  const up = props.buckets.filter(b => b).length
  const pct = ((up / props.buckets.length) * 100).toFixed(1)
  return `${pct}% uptime (${up}/${props.buckets.length} intervals)`
})

const bucketTitle = (i, up) => {
  const totalMin = props.buckets.length * 30
  const minAgo = totalMin - i * 30
  const h = Math.floor(minAgo / 60)
  const m = minAgo % 60
  const timeLabel = h > 0 ? `${h}h${m > 0 ? m + 'm' : ''} ago` : `${m}m ago`
  return `${timeLabel}: ${up ? 'up' : 'down'}`
}
</script>
