<template>
  <div :class="['flex items-center gap-1.5 text-xs font-medium', statusClass]">
    <div :class="['w-2 h-2 rounded-full', dotClass]" />
    {{ label }}
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, required: true }
})

const dotClass = computed(() => {
  switch (props.status) {
    case 'online': return 'bg-green-500'
    case 'down': return 'bg-red-500 animate-pulse'
    case 'archived': return 'bg-gray-400'
    default: return 'bg-gray-400'
  }
})

const statusClass = computed(() => {
  switch (props.status) {
    case 'online': return 'text-green-600 dark:text-green-400'
    case 'down': return 'text-red-600 dark:text-red-400'
    case 'archived': return 'text-muted-foreground'
    default: return 'text-muted-foreground'
  }
})

const label = computed(() => {
  switch (props.status) {
    case 'online': return 'Online'
    case 'down': return 'Down'
    case 'archived': return 'Archived'
    default: return 'Unknown'
  }
})
</script>
