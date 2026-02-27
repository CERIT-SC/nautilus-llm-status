<template>
  <div class="container mx-auto px-4 py-8 max-w-7xl">
    <div class="mb-6">
      <Button variant="ghost" class="mb-4" @click="$router.push('/')">
        <ArrowLeft class="h-4 w-4 mr-2" />
        Back
      </Button>

      <div v-if="model" class="space-y-6">
        <!-- Title + Status -->
        <div class="flex items-start justify-between">
          <div>
            <h1 class="text-3xl font-bold tracking-tight">{{ model.model_name }}</h1>
            <p class="text-muted-foreground mt-1">{{ model.namespace }} / {{ model.container }}</p>
          </div>
          <StatusDot :status="model.status" />
        </div>

        <!-- Summary Cards -->
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-sm font-medium text-muted-foreground">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div :class="['text-2xl font-bold', model.status === 'online' ? 'text-green-600' : model.status === 'down' ? 'text-red-600' : 'text-muted-foreground']">
                {{ model.status === 'online' ? 'Online' : model.status === 'down' ? 'Down' : 'Archived' }}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-sm font-medium text-muted-foreground">First Seen</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="text-lg font-semibold">{{ formatDate(model.first_seen) }}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-sm font-medium text-muted-foreground">Last Seen</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="text-lg font-semibold">{{ timeAgo(model.last_seen) }}</div>
            </CardContent>
          </Card>
          <Card v-if="gpuSummary">
            <CardHeader class="pb-2">
              <CardTitle class="text-sm font-medium text-muted-foreground">GPUs</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="text-lg font-semibold">{{ gpuSummary }}</div>
            </CardContent>
          </Card>
        </div>

        <!-- Duration Selector -->
        <div class="flex items-center gap-2">
          <span class="text-sm text-muted-foreground">Time range:</span>
          <div class="flex gap-1">
            <Button
              v-for="d in ['24h', '7d', '30d']" :key="d"
              :variant="duration === d ? 'default' : 'outline'"
              size="sm"
              @click="duration = d"
            >{{ d }}</Button>
          </div>
        </div>

        <!-- Charts -->
        <div class="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle class="text-base">Running Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <MetricsChart :modelId="modelId" metricName="num_requests_running" title="Running" :duration="duration" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle class="text-base">Waiting Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <MetricsChart :modelId="modelId" metricName="num_requests_waiting" title="Waiting" :duration="duration" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle class="text-base">KV Cache Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <MetricsChart :modelId="modelId" metricName="kv_cache_usage_perc" title="KV Cache" unit="%" :scale="100" :duration="duration" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle class="text-base">Token Generation Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <MetricsChart :modelId="modelId" metricName="generation_tokens_rate" title="Throughput" unit="tok/s" :duration="duration" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle class="text-base">Latency (P50 / P99)</CardTitle>
            </CardHeader>
            <CardContent>
              <MetricsChart :modelId="modelId" metricName="latency_seconds" title="Latency" unit="s" :duration="duration" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle class="text-base">GPU Count by Type</CardTitle>
            </CardHeader>
            <CardContent>
              <MetricsChart :modelId="modelId" metricName="gpu_count" title="GPUs" :duration="duration" :fill="false" />
            </CardContent>
          </Card>

          <Card class="lg:col-span-2">
            <CardHeader>
              <CardTitle class="text-base">GPU Utilization by Type</CardTitle>
            </CardHeader>
            <CardContent>
              <MetricsChart :modelId="modelId" metricName="gpu_utilization" title="GPU Util" unit="%" :duration="duration" />
            </CardContent>
          </Card>
        </div>
      </div>

      <div v-else class="flex items-center justify-center py-20">
        <Loading size="lg" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import StatusDot from '@/components/StatusDot.vue'
import MetricsChart from '@/components/MetricsChart.vue'
import Loading from '@/components/Loading.vue'

const route = useRoute()
const model = ref(null)
const duration = ref('24h')

const modelId = computed(() => parseInt(route.params.id))

const gpuSummary = computed(() => {
  const gpus = model.value?.latest?.gpu_count
  if (!gpus || typeof gpus !== 'object') return null
  return Object.entries(gpus).map(([name, count]) => `${Math.round(count)}x ${name}`).join(', ')
})

const formatDate = (iso) => {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

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

onMounted(async () => {
  try {
    const resp = await fetch('/api/v1/models')
    if (resp.ok) {
      const models = await resp.json()
      model.value = models.find(m => m.id === modelId.value)
    }
  } catch (e) {
    console.error('Failed to fetch model:', e)
  }
})
</script>
