<template>
  <div id="global" class="bg-background text-foreground min-h-screen flex flex-col">
    <!-- Header -->
    <header class="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div class="container mx-auto px-4 py-4 max-w-7xl">
        <div class="flex items-center justify-between">
          <router-link to="/" class="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div class="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Activity class="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 class="text-xl font-bold tracking-tight">{{ header }}</h1>
              <p class="text-xs text-muted-foreground">LLM Service Monitor</p>
            </div>
          </router-link>

          <div class="flex items-center gap-2">
            <HealthIndicator :healthy="health.scraper_healthy" />
            <Settings />
          </div>
        </div>
      </div>
    </header>

    <!-- Prometheus Down Banner -->
    <div v-if="health.prometheus_healthy === false" class="bg-red-600 text-white text-center py-2 text-sm font-medium">
      Prometheus is unreachable. Showing cached data.
    </div>

    <!-- Main Content -->
    <main class="flex-1">
      <router-view />
    </main>

    <!-- Footer -->
    <footer class="border-t mt-auto">
      <div class="container mx-auto px-4 py-4 max-w-7xl text-center text-sm text-muted-foreground">
        Powered by <a href="https://github.com/TW-Robotics/nautilus-llm-status" target="_blank" class="font-medium hover:underline">nautilus-llm-status</a>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Activity } from 'lucide-vue-next'
import Settings from './components/Settings.vue'
import HealthIndicator from './components/HealthIndicator.vue'

const health = ref({})
let healthInterval = null

const header = computed(() => {
  return window.config && window.config.header ? window.config.header : "Nautilus LLM Status"
})

const fetchHealth = async () => {
  try {
    const resp = await fetch('/api/v1/health')
    if (resp.ok) {
      health.value = await resp.json()
    }
  } catch (e) {
    health.value = { scraper_healthy: false, prometheus_healthy: false }
  }
}

onMounted(() => {
  fetchHealth()
  healthInterval = setInterval(fetchHealth, 30000)
})

onUnmounted(() => {
  if (healthInterval) clearInterval(healthInterval)
})
</script>
