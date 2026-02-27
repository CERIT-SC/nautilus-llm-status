<template>
  <div class="flex items-center gap-2 text-sm text-muted-foreground">
    <div :class="['w-2 h-2 rounded-full', healthy ? 'bg-green-500' : 'bg-red-500']" />
    <span>{{ healthy ? 'Connected' : 'Disconnected' }}</span>
  </div>
</template>

<script setup>
defineProps({
  healthy: {
    type: Boolean,
    default: false
  }
})
</script>
