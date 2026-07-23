import { QueryClient } from '@tanstack/react-query'

/**
 * React Query client configuration
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      staleTime: 30_000,       // 30s before stale
      gcTime: 5 * 60 * 1000,   // 5min cache lifetime
    },
  },
})
