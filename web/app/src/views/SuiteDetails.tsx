/**
 * Suite details page
 */
import { useParams } from 'react-router-dom'
import { Card, H4, Muted } from '@e-infra/design-system'
import { StatusDot } from '../components/StatusDot'
import { DetailPageLayout } from '../components/DetailPageLayout'
import { useSuiteStatuses } from '../hooks/useData'
import type { SuiteStatus } from '../types/api'

interface SuiteStatusRow extends SuiteStatus {
  description?: string
  last_checked?: string
  latest?: {
    response_time?: number
    uptime_24h?: number
  }
}

export function SuiteDetails() {
  const { key = '' } = useParams<{ key: string }>()
  
  const { data = [], isLoading: loading } = useSuiteStatuses(key)
  const suiteStatuses = data as SuiteStatusRow[]

  if (loading) {
    return (
      <DetailPageLayout
        title={decodeURIComponent(key)}
        subtitle="Suite status overview"
        loading
      />
    )
  }

  return (
    <DetailPageLayout
      title={decodeURIComponent(key)}
      subtitle="Suite status overview"
    >
      {/* Suite Status List */}
      {suiteStatuses.length === 0 ? (
        <Card>
          <div className="p-6 text-center text-text-muted">
            No suite data available
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {suiteStatuses.map((suite: SuiteStatusRow) => (
            <Card key={suite.key || suite.name}>
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <H4 className="font-semibold text-sm truncate">{suite.name}</H4>
                    {suite.description && (
                      <Muted className="truncate mt-0.5">
                        {suite.description}
                      </Muted>
                    )}
                  </div>
                  <StatusDot status={suite.status === 'up' ? 'online' : suite.status === 'down' ? 'down' : 'archived'} />
                </div>

                {/* Stats if available */}
                {suite.latest && (
                  <div className="grid grid-cols-2 gap-2 text-xs mt-3">
                    {suite.latest.response_time !== undefined && (
                      <div className="bg-muted/50 rounded px-2 py-1.5">
                        <span className="text-text-muted">Response Time</span>
                        <p className="font-mono font-medium">
                          {typeof suite.latest.response_time === 'number' 
                            ? `${suite.latest.response_time.toFixed(0)}ms` 
                            : suite.latest.response_time}
                        </p>
                      </div>
                    )}
                    {suite.latest.uptime_24h !== undefined && (
                      <div className="bg-muted/50 rounded px-2 py-1.5">
                        <span className="text-text-muted">Uptime 24h</span>
                        <p className="font-mono font-medium">
                          {typeof suite.latest.uptime_24h === 'number'
                            ? `${(suite.latest.uptime_24h * 100).toFixed(1)}%`
                            : suite.latest.uptime_24h}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Last checked */}
                {suite.last_checked && (
                  <div className="mt-2 text-xs text-text-muted">
                    Last checked {new Date(suite.last_checked).toLocaleString()}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </DetailPageLayout>
  )
}
