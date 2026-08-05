/**
 * Endpoint details page
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Card, H4, Muted } from '@e-infra/design-system'
import { MetricsChart } from '../components/MetricsChart'
import { useEndpointResponseTimes, useEndpointStatuses } from '../hooks/useData'
import { DetailPageLayout } from '../components/DetailPageLayout'
import type { EndpointStatusRow } from '../types/api'

const DURATIONS = ['24h', '7d', '30d'] as const
type Duration = typeof DURATIONS[number]

export function EndpointDetails() {
  const { key = '' } = useParams<{ key: string }>()
  
  const [duration, setDuration] = useState<Duration>('24h')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data: responseTimeData = [] } = useEndpointResponseTimes(key, duration)
  const { data: statusesData, isLoading: statusesLoading } = useEndpointStatuses(key, page, pageSize)
  const endpointStatuses: EndpointStatusRow[] = statusesData?.results ?? []
  const loading = statusesLoading && endpointStatuses.length === 0

  if (loading) {
    return (
      <DetailPageLayout
        title={decodeURIComponent(key)}
        subtitle="Endpoint status and response times"
        loading
      />
    )
  }

  return (
    <DetailPageLayout
      title={decodeURIComponent(key)}
      subtitle="Endpoint status and response times"
    >
      {/* Response Time Chart */}
      <Card className="mb-6">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <H4>Response Times</H4>
            <div className="flex gap-1">
              {DURATIONS.map(d => (
                <Button
                  key={d}
                  variant={duration === d ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDuration(d)}
                >
                  {d}
                </Button>
              ))}
            </div>
          </div>
          
          <MetricsChart
            data={responseTimeData}
            unit="ms"
            fill={false}
            duration={duration}
          />
        </div>
      </Card>

      {/* Status History */}
      <Card>
        <div className="p-4">
          <H4 className="mb-4">Status History</H4>
          
          {endpointStatuses.length === 0 ? (
            <Muted className="text-center py-8">No status history available</Muted>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Timestamp</th>
                    <th className="text-left py-2 px-3 font-medium">Status</th>
                    <th className="text-left py-2 px-3 font-medium">Response Time</th>
                    <th className="text-left py-2 px-3 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {endpointStatuses.map((status: EndpointStatusRow, idx: number) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="py-2 px-3 text-muted-foreground">
                        {status.checked ? new Date(status.checked).toLocaleString() : 'N/A'}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                          status.success 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }`}>
                          {status.success ? 'Success' : 'Failed'}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono">
                        {status.response_time !== undefined ? `${status.response_time}ms` : 'N/A'}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground truncate max-w-md">
                        {status.message || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {endpointStatuses.length > 0 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={endpointStatuses.length < pageSize}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </Card>
    </DetailPageLayout>
  )
}
