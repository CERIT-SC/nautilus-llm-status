import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { fetchMe, fetchUsage } from '../usage/api'
import type { ApiError } from '../usage/api'
import type { Granularity, Me, UsageResponse } from '../usage/types'

/**
 * Current signed-in identity from /usage/api/me.
 *
 * Fetches once on mount; a 401 resolves to null (nobody signed in) rather
 * than throwing, so the query data is `Me | null`. The client fetch does not
 * accept a signal, so cancellation is left to react-query's default (the
 * query result is simply ignored after unmount).
 */
export function useUsageMe() {
  return useQuery<Me | null, ApiError>({
    queryKey: ['usage', 'me'],
    queryFn: () => fetchMe(),
    staleTime: 5 * 60 * 1000, // identity rarely changes within a session
    retry: false,
  })
}

/** Range + granularity selection for the usage query. */
export interface UsageParams {
  granularity: Granularity
  start: string
  end: string
}

/**
 * Usage data for the given range/granularity.
 *
 * keepPreviousData keeps the last loaded series visible while a new range or
 * granularity is fetched, instead of flashing a loading state. Keys are
 * namespaced under ['usage', 'data', ...] so they never collide with the
 * status-backend keys in useData.ts.
 */
export function useUsage(params: UsageParams) {
  return useQuery<UsageResponse, ApiError>({
    queryKey: ['usage', 'data', params],
    queryFn: ({ signal }) => fetchUsage(params, signal),
    placeholderData: keepPreviousData,
    retry: false,
  })
}
