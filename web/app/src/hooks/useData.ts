import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  fetchHealth,
  fetchModels,
  fetchMetricsMeta,
  fetchConfig,
  fetchEndpointResponseTimes,
  fetchEndpointStatuses,
  fetchSuiteStatuses,
} from '../lib/api'
import type {
  HealthStatus,
  LabeledSeries,
  EndpointStatusesResponse,
  SuiteStatus,
} from '../types/api'
import { useUIStore } from '../stores/ui-store'

const HEALTH_CHECK_INTERVAL = 10_000 // 10 seconds for health checks

/**
 * Get refresh interval from Zustand store in milliseconds.
 */
function getRefreshInterval(): number {
  return parseInt(useUIStore.getState().refreshInterval) * 1000
}

/**
 * Health polling hook with background refresh.
 * POLLS every 10 seconds for health checks.
 */
export function useHealth() {
  return useQuery<HealthStatus, Error>({
    queryKey: ['health'],
    queryFn: async ({ signal }) => {
      try {
        const res = await fetchHealth(signal)
        return res
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return Promise.reject(error)
        }
        throw error
      }
    },
    refetchInterval: HEALTH_CHECK_INTERVAL,
    retry: false,
    refetchOnMount: 'always',
    refetchIntervalInBackground: true,
    enabled: true,
  })
}

/**
 * Models list hook with user-configurable refresh.
 * POLLS at user-configured interval (default: 5min).
 * This is the ONLY chart/data hook with polling enabled.
 */
export function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: fetchModels,
    refetchInterval: getRefreshInterval,
  })
}

/**
 * Metrics metadata hook - static config, never stale.
 * NO POLLING - fetches once and caches indefinitely.
 */
export function useMetricsMeta() {
  return useQuery({
    queryKey: ['metrics-meta'],
    queryFn: fetchMetricsMeta,
    staleTime: Infinity,
  })
}

/**
 * Config hook - fetches app configuration including announcements.
 * NO POLLING - fetches once, refreshes only on remount after 5min.
 */
export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: fetchConfig,
    staleTime: 5 * 60 * 1000,  // 5min - config rarely changes
  })
}

/**
 * Endpoint response times hook.
 * Refetches when endpointKey or duration changes.
 */
export function useEndpointResponseTimes(key: string, duration: string) {
  return useQuery<LabeledSeries[]>({
    queryKey: ['endpoint-response-times', key, duration],
    queryFn: () => fetchEndpointResponseTimes(key, duration),
    enabled: !!key,
  })
}

/**
 * Endpoint status history hook with pagination.
 * keepPreviousData gives smooth pagination transitions.
 */
export function useEndpointStatuses(
  key: string,
  page: number,
  pageSize: number,
) {
  return useQuery<EndpointStatusesResponse>({
    queryKey: ['endpoint-statuses', key, page, pageSize],
    queryFn: () => fetchEndpointStatuses(key, page, pageSize),
    enabled: !!key,
    placeholderData: keepPreviousData,
  })
}

/**
 * Suite statuses hook.
 */
export function useSuiteStatuses(key: string) {
  return useQuery<SuiteStatus[]>({
    queryKey: ['suite-statuses', key],
    queryFn: () => fetchSuiteStatuses(key),
    enabled: !!key,
  })
}
