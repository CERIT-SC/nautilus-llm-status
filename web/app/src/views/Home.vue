<template>
  <div class="container mx-auto px-4 py-8 max-w-7xl">
    <div class="mb-8">
      <h1 class="text-3xl font-bold tracking-tight">LLM Models</h1>
      <p class="text-muted-foreground mt-1">Real-time status of Nautilus LLM inference endpoints</p>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-20">
      <Loading size="lg" />
    </div>

    <div v-else-if="onlineModels.length === 0 && downModels.length === 0 && archivedModels.length === 0"
         class="text-center py-20">
      <ServerOff class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <h3 class="text-lg font-semibold mb-2">No models found</h3>
      <p class="text-muted-foreground">Waiting for Prometheus data...</p>
    </div>

    <div v-else class="space-y-8">
      <!-- Online Models -->
      <section v-if="onlineModels.length > 0">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-2.5 h-2.5 rounded-full bg-green-500" />
          <h2 class="text-lg font-semibold">Online ({{ onlineModels.length }})</h2>
        </div>
        <div class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <ModelCard v-for="m in onlineModels" :key="m.id" :model="m" />
        </div>
      </section>

      <!-- Down Models -->
      <section v-if="downModels.length > 0">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-2.5 h-2.5 rounded-full bg-red-500" />
          <h2 class="text-lg font-semibold">Temporarily Down ({{ downModels.length }})</h2>
        </div>
        <div class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <ModelCard v-for="m in downModels" :key="m.id" :model="m" />
        </div>
      </section>

      <!-- Archived Models -->
      <section v-if="archivedModels.length > 0">
        <div class="flex items-center gap-2 mb-4 cursor-pointer" @click="showArchived = !showArchived">
          <ChevronDown v-if="showArchived" class="h-4 w-4 text-muted-foreground" />
          <ChevronRight v-else class="h-4 w-4 text-muted-foreground" />
          <div class="w-2.5 h-2.5 rounded-full bg-gray-400" />
          <h2 class="text-lg font-semibold text-muted-foreground">Archived ({{ archivedModels.length }})</h2>
        </div>
        <div v-if="showArchived" class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <ModelCard v-for="m in archivedModels" :key="m.id" :model="m" />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ServerOff, ChevronDown, ChevronRight } from 'lucide-vue-next'
import Loading from '@/components/Loading.vue'
import ModelCard from '@/components/ModelCard.vue'

const models = ref([])
const loading = ref(true)
const showArchived = ref(false)
let refreshInterval = null

const onlineModels = computed(() => models.value.filter(m => m.status === 'online'))
const downModels = computed(() => models.value.filter(m => m.status === 'down'))
const archivedModels = computed(() => models.value.filter(m => m.status === 'archived'))

const fetchModels = async () => {
  try {
    const resp = await fetch('/api/v1/models')
    if (resp.ok) {
      models.value = await resp.json()
    }
  } catch (e) {
    console.error('Failed to fetch models:', e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchModels()
  refreshInterval = setInterval(fetchModels, 30000)
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
})
</script>
