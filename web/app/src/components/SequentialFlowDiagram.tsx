import { H4 } from '@e-infra/design-system'
import { CheckCircle, XCircle, SkipForward, RotateCcw } from 'lucide-react'
import { FlowStep } from './FlowStep'
import { formatDuration } from '../utils/format'

interface FlowStepData {
  name: string
  status: 'success' | 'failed' | 'skipped' | 'not-started'
  duration?: number
  isAlwaysRun?: boolean
  errors?: string[]
  nextStepStatus?: 'success' | 'failed' | 'skipped' | 'not-started'
}

interface SequentialFlowDiagramProps {
  flowSteps: FlowStepData[]
  progressPercentage?: number
  completedSteps?: number
  totalSteps?: number
  onStepSelected?: (step: FlowStepData, index: number) => void
}

export function SequentialFlowDiagram({
  flowSteps = [],
  progressPercentage = 0,
  completedSteps = 0,
  totalSteps = 0,
  onStepSelected,
}: SequentialFlowDiagramProps) {
  const totalDuration = flowSteps.reduce((total, step) => total + (step.duration || 0), 0)
  
  const hasSuccessSteps = flowSteps.some(step => step.status === 'success')
  const hasFailedSteps = flowSteps.some(step => step.status === 'failed')
  const hasSkippedSteps = flowSteps.some(step => step.status === 'skipped')
  const hasAlwaysRunSteps = flowSteps.some(step => step.isAlwaysRun === true)
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <H4 className="text-sm font-medium text-text-muted">Start</H4>
        <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-green-500 dark:bg-green-600 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <H4 className="text-sm font-medium text-text-muted">End</H4>
      </div>
      
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{completedSteps}/{totalSteps} steps successful</span>
        {totalDuration > 0 && (
          <span>{formatDuration(totalDuration)} total</span>
        )}
      </div>
      
      <div className="space-y-2">
        {flowSteps.map((step, index) => (
          <FlowStep
            key={index}
            step={step}
            index={index}
            isLast={index === flowSteps.length - 1}
            previousStep={index > 0 ? flowSteps[index - 1] : null}
            onStepClick={() => onStepSelected?.(step, index)}
          />
        ))}
      </div>
      
      <div className="mt-6 pt-4 border-t">
        <H4 className="text-sm font-medium text-text-muted mb-2">Status Legend</H4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {hasSuccessSteps && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                <CheckCircle className="w-3 h-3 text-white" />
              </div>
              <span className="text-text-muted">Success</span>
            </div>
          )}
          
          {hasFailedSteps && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                <XCircle className="w-3 h-3 text-white" />
              </div>
              <span className="text-text-muted">Failed</span>
            </div>
          )}
          
          {hasSkippedSteps && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center">
                <SkipForward className="w-3 h-3 text-white" />
              </div>
              <span className="text-text-muted">Skipped</span>
            </div>
          )}
          
          {hasAlwaysRunSteps && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-blue-200 dark:border-blue-800 flex items-center justify-center">
                <RotateCcw className="w-3 h-3 text-white" />
              </div>
              <span className="text-text-muted">Always Run</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
