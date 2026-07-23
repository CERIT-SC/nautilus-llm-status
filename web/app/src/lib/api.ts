import type {
  HealthStatus,
  AppConfig,
  Model,
  MetricsMeta,
  LabeledSeries,
  EndpointStatusesResponse,
  SuiteStatus,
} from '../types/api'

/**
 * API client for status monitoring backend
 */

const BASE = '/status/api/v1'
const HEALTH_TIMEOUT = 5000
const DEFAULT_TIMEOUT = 10000

/**
 * Create an AbortSignal with timeout
 */
function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  controller.signal.addEventListener('abort', () => clearTimeout(timeoutId))
  return controller.signal
}

/**
 * Generic GET request with timeout
 */
async function get<T>(path: string, signal?: AbortSignal, timeoutMs?: number): Promise<T> {
  const finalSignal = signal ?? (timeoutMs ? timeoutSignal(timeoutMs) : undefined)
  const resp = await fetch(`${BASE}${path}`, { signal: finalSignal })
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
  }
  return resp.json()
}

// ── Endpoints ──────────────────────────────────────────────

/**
 * Fetch health status of Prometheus and scraper
 */
export function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
  return get('/health', signal, HEALTH_TIMEOUT)
}

/**
 * Fetch application configuration
 */
export function fetchConfig(): Promise<AppConfig> {
  return get('/config', undefined, DEFAULT_TIMEOUT)
}

/**
 * Fetch list of all tracked LLM models
 */
export function fetchModels(): Promise<Model[]> {
  return get('/models', undefined, DEFAULT_TIMEOUT)
}

/**
 * Fetch metrics metadata
 */
export function fetchMetricsMeta(): Promise<MetricsMeta[]> {
  return get('/metrics-meta', undefined, DEFAULT_TIMEOUT)
}

/**
 * Fetch time-series data for a model metric
 */
export function fetchModelMetrics(
  modelId: number,
  metricName: string,
  range: '3h' | '24h' | '7d' | '30d',
  signal?: AbortSignal
): Promise<LabeledSeries[]> {
  return get(`/models/${modelId}/metrics/${metricName}?range=${range}`, signal, DEFAULT_TIMEOUT)
}

/**
 * Fetch paginated endpoint status history
 */
export function fetchEndpointStatuses(
  key: string,
  page: number,
  pageSize: number
): Promise<EndpointStatusesResponse> {
  return get(`/endpoints/${encodeURIComponent(key)}/statuses?page=${page}&pageSize=${pageSize}`)
}

/**
 * Fetch endpoint response time history
 */
export function fetchEndpointResponseTimes(
  key: string,
  duration: string
): Promise<LabeledSeries[]> {
  return get(`/endpoints/${encodeURIComponent(key)}/response-times/${duration}/history`)
}

/**
 * Fetch suite status overview
 */
export function fetchSuiteStatuses(key: string): Promise<SuiteStatus[]> {
  return get(`/suites/${encodeURIComponent(key)}/statuses`)
}


