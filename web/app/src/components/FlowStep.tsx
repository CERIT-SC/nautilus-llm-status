import { H4 } from '@e-infra/design-system'
import { CheckCircle, XCircle, SkipForward, RotateCcw, Pause } from 'lucide-react'
import { formatDuration } from '../utils/format'

interface FlowStepData {
  name: string
  status: 'success' | 'failed' | 'skipped' | 'not-started'
  duration?: number
  isAlwaysRun?: boolean
  errors?: string[]
  nextStepStatus?: 'success' | 'failed' | 'skipped' | 'not-started'
}

interface FlowStepProps {
  step: FlowStepData
  index: number
  isLast?: boolean
  previousStep?: FlowStepData | null
  onStepClick?: () => void
}

const statusIconMap = {
  success: CheckCircle,
  failed: XCircle,
  skipped: SkipForward,
  'not-started': Pause,
} as const

function getCircleClasses(step: FlowStepData): string {
  const baseClasses = 'border-2'
  
  if (step.isAlwaysRun) {
    switch (step.status) {
      case 'success':
        return `${baseClasses} bg-green-500 text-white border-green-600 ring-2 ring-blue-200 dark:ring-blue-800`
      case 'failed':
        return `${baseClasses} bg-red-500 text-white border-red-600 ring-2 ring-blue-200 dark:ring-blue-800`
      default:
        return `${baseClasses} bg-blue-500 text-white border-blue-600 ring-2 ring-blue-200 dark:ring-blue-800`
    }
  }
  
  switch (step.status) {
    case 'success':
      return `${baseClasses} bg-green-500 text-white border-green-600`
    case 'failed':
      return `${baseClasses} bg-red-500 text-white border-red-600`
    case 'skipped':
      return `${baseClasses} bg-gray-400 text-white border-gray-500`
    case 'not-started':
      return `${baseClasses} bg-gray-200 text-gray-500 border-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600`
    default:
      return `${baseClasses} bg-gray-200 text-gray-500 border-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600`
  }
}

function getIncomingLineClasses(step: FlowStepData, previousStep: FlowStepData | null): string {
  if (!previousStep) return 'bg-gray-300 dark:bg-gray-600'
  
  if (step.status === 'skipped') {
    return 'border-l-2 border-dashed border-gray-400 bg-transparent'
  }
  
  switch (previousStep.status) {
    case 'success':
      return 'bg-green-500'
    case 'failed':
      return 'bg-red-500'
    default:
      return 'bg-gray-300 dark:bg-gray-600'
  }
}

function getConnectionLineClasses(step: FlowStepData): string {
  const nextStepStatus = step.nextStepStatus
  switch (step.status) {
    case 'success':
      return nextStepStatus === 'skipped'
        ? 'bg-gray-300 dark:bg-gray-600'
        : 'bg-green-500'
    case 'failed':
      return nextStepStatus === 'skipped'
        ? 'border-l-2 border-dashed border-gray-400 bg-transparent'
        : 'bg-red-500'
    default:
      return 'bg-gray-300 dark:bg-gray-600'
  }
}

export function FlowStep({ step, index, isLast = false, previousStep = null, onStepClick }: FlowStepProps) {
  const StatusIcon = statusIconMap[step.status] || Pause
  
  return (
    <div 
      className="flex items-start gap-4 relative group hover:bg-accent/30 rounded-lg p-2 -m-2 transition-colors cursor-pointer"
      onClick={onStepClick}
    >
      <div className="relative flex-shrink-0">
        {index > 0 && (
          <div 
            className={`absolute left-1/2 bottom-8 w-0.5 h-4 -translate-x-px ${getIncomingLineClasses(step, previousStep)}`}
          />
        )}
        
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getCircleClasses(step)}`}>
          <StatusIcon className="w-4 h-4" />
        </div>
        
        {!isLast && (
          <div 
            className={`absolute left-1/2 top-8 w-0.5 h-4 -translate-x-px ${getConnectionLineClasses(step)}`}
          />
        )}
      </div>
      
      <div className="flex-1 min-w-0 pt-1">
        <div className="flex items-center justify-between gap-2 mb-1">
          <H4 className="font-medium text-sm truncate">{step.name}</H4>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatDuration(step.duration)}
          </span>
        </div>
        
        <div className="flex flex-wrap gap-1">
          {step.isAlwaysRun && (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-md">
              <RotateCcw className="w-3 h-3" />
              Always Run
            </span>
          )}
          {step.errors?.length && (
            <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded-md">
              {step.errors.length} error{step.errors.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
