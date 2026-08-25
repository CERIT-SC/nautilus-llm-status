import { useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  H4,
  Muted,
} from '@e-infra/design-system'
import {
  X,
  AlertCircle,
  RotateCcw,
  Download,
  CheckCircle,
  XCircle,
  SkipForward,
  Pause,
  Clock,
  Settings,
} from 'lucide-react'
import { Button } from '@e-infra/design-system'
import { formatDuration } from '../utils/format'
import { prettifyTimestamp } from '../utils/time'

// Type definitions
export interface ConditionResult {
  condition: string
  success: boolean
}

export interface EndpointConfig {
  url?: string
  method?: string
  interval?: string
  timeout?: string
}

export interface StepResult {
  timestamp?: string
  duration?: number
  success: boolean
  conditionResults?: ConditionResult[]
  errors?: string[]
}

export interface StepData {
  name: string
  status: 'success' | 'failed' | 'skipped' | 'not-started'
  duration?: number
  isAlwaysRun?: boolean
  errors?: string[]
  endpoint?: EndpointConfig
  result?: StepResult
}

interface StepDetailsModalProps {
  step: StepData
  index: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Icon mapping based on status
const statusIconMap = {
  success: CheckCircle,
  failed: XCircle,
  skipped: SkipForward,
  'not-started': Pause,
} as const

// Icon color classes based on status
function getIconClasses(status: StepData['status']): string {
  switch (status) {
    case 'success':
      return 'text-green-600 dark:text-green-400'
    case 'failed':
      return 'text-red-600 dark:text-red-400'
    case 'skipped':
      return 'text-gray-600 dark:text-gray-400'
    default:
      return 'text-blue-600 dark:text-blue-400'
  }
}

export function StepDetailsModal({
  step,
  index,
  open,
  onOpenChange,
}: StepDetailsModalProps) {
  // Handle ESC key press
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false)
      }
    }

    if (open) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onOpenChange])

  const StatusIcon = statusIconMap[step.status] || Pause
  const iconClasses = getIconClasses(step.status)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden p-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <StatusIcon className={`w-5 h-5 ${iconClasses}`} />
              {step.name}
            </DialogTitle>
            <DialogDescription className="text-sm text-text-muted mt-1">
              Step {index + 1} • {formatDuration(step.duration)}
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* Always Run indicator */}
          {step.isAlwaysRun && (
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700">
                <RotateCcw className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <div>
                  <H4 className="text-sm font-medium text-blue-900 dark:text-blue-200">Always Run</H4>
                  <Muted className="text-blue-600 dark:text-blue-400">This endpoint is configured to execute even after failures</Muted>
                </div>
              </div>
            </div>
          )}

          {/* Errors section */}
          {step.errors && step.errors.length > 0 && (
            <div className="space-y-2">
              <H4 className="text-sm font-medium flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4" />
                Errors ({step.errors.length})
              </H4>
              <div className="space-y-2">
                {step.errors.map((error, errorIndex) => (
                  <div
                    key={errorIndex}
                    className="p-3 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded text-sm font-mono text-red-800 dark:text-red-300 break-all"
                  >
                    {error}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timestamp */}
          {step.result?.timestamp && (
            <div className="space-y-2">
              <H4 className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Timestamp
              </H4>
              <Muted className="font-mono">
                {prettifyTimestamp(step.result.timestamp)}
              </Muted>
            </div>
          )}

          {/* Response details */}
          {step.result && (
            <div className="space-y-2">
              <H4 className="text-sm font-medium flex items-center gap-2">
                <Download className="w-4 h-4" />
                Response
              </H4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-text-muted">Duration:</span>
                  <p className="font-mono mt-1">
                    {formatDuration(step.result.duration)}
                  </p>
                </div>
                <div>
                  <span className="text-text-muted">Success:</span>
                  <p
                    className="mt-1"
                    style={{
                      color: step.result.success
                        ? 'rgb(22, 163, 74)'
                        : 'rgb(220, 38, 38)',
                    }}
                  >
                    {step.result.success ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Condition Results */}
          {step.result?.conditionResults &&
            step.result.conditionResults.length > 0 && (
              <div className="space-y-2">
                <H4 className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Condition Results ({step.result.conditionResults.length})
                </H4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {step.result.conditionResults.map((conditionResult, conditionIndex) => (
                    <div
                      key={conditionIndex}
                      className={`flex items-start gap-3 p-1 rounded-lg border ${
                        conditionResult.success
                          ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700'
                          : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700'
                      }`}
                    >
                      {/* Status icon */}
                      <div className="shrink-0 mt-0.5">
                        {conditionResult.success ? (
                          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                        )}
                      </div>

                      {/* Condition text */}
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                        <p
                          className="text-sm font-mono break-all"
                          style={{
                            color: conditionResult.success
                              ? 'rgb(22, 107, 16)'
                              : 'rgb(185, 28, 28)',
                          }}
                        >
                          {conditionResult.condition}
                        </p>
                        <span
                          className="text-xs font-medium whitespace-nowrap"
                          style={{
                            color: conditionResult.success
                              ? 'rgb(22, 163, 74)'
                              : 'rgb(220, 38, 38)',
                          }}
                        >
                          {conditionResult.success ? 'Passed' : 'Failed'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Endpoint Configuration */}
          {step.endpoint && (
            <div className="space-y-2">
              <H4 className="text-sm font-medium flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Endpoint Configuration
              </H4>
              <div className="space-y-3 text-xs">
                {step.endpoint.url && (
                  <div>
                    <span className="text-text-muted">URL:</span>
                    <p className="font-mono mt-1 break-all">{step.endpoint.url}</p>
                  </div>
                )}
                {step.endpoint.method && (
                  <div>
                    <span className="text-text-muted">Method:</span>
                    <p className="mt-1 font-medium">{step.endpoint.method}</p>
                  </div>
                )}
                {step.endpoint.interval && (
                  <div>
                    <span className="text-text-muted">Interval:</span>
                    <p className="mt-1">{step.endpoint.interval}</p>
                  </div>
                )}
                {step.endpoint.timeout && (
                  <div>
                    <span className="text-text-muted">Timeout:</span>
                    <p className="mt-1">{step.endpoint.timeout}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Result Errors (separate from step errors) */}
          {step.result?.errors && step.result.errors.length > 0 && (
            <div className="space-y-2">
              <H4 className="text-sm font-medium flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4" />
                Result Errors ({step.result.errors.length})
              </H4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {step.result.errors.map((error, errorIndex) => (
                  <div
                    key={errorIndex}
                    className="p-3 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded text-sm font-mono text-red-800 dark:text-red-300 break-all"
                  >
                    {error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
