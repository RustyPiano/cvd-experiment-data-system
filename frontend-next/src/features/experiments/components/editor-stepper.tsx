import { Check, Minus, X } from 'lucide-react'

import type { EditorSectionKey } from '../editor-types'
import type { ModuleCompletionStatus } from './completion-indicator'
import { cn } from '@/lib/utils'

export type StepperItemStatus =
  | 'empty'
  | 'editing'
  | 'saved'
  | 'warning'
  | 'error'
  | 'current'

export type StepperItem = {
  key: EditorSectionKey
  label: string
  status: StepperItemStatus
  completion?: ModuleCompletionStatus
}

type VisualState =
  | 'empty'
  | 'editing'
  | 'saved'
  | 'warning'
  | 'error'
  | 'current'
  | 'complete'
  | 'partial'

function resolveVisualState(
  completion: ModuleCompletionStatus | undefined,
  status: StepperItemStatus,
): VisualState {
  if (completion) {
    if (completion.state === 'error') return 'error'
    if (completion.state === 'warning') return 'warning'
    if (completion.state === 'complete') return 'complete'
    if (completion.state === 'partial') return 'partial'
    return 'empty'
  }
  return status
}

const dotClass: Record<VisualState, string> = {
  empty: 'border border-input bg-background text-transparent',
  editing: 'bg-primary text-primary-foreground',
  current: 'border-2 border-primary bg-background text-primary',
  saved: 'bg-success text-white',
  complete: 'bg-success text-white',
  warning: 'bg-warning text-white',
  error: 'bg-destructive text-white',
  partial: 'border-2 border-primary/40 bg-primary-soft text-primary',
}

function StepperDot({ state }: { state: VisualState }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full transition-colors',
        dotClass[state],
      )}
    >
      {state === 'saved' || state === 'complete' ? (
        <Check className="size-3" strokeWidth={3} />
      ) : null}
      {state === 'error' ? <X className="size-3" strokeWidth={3} /> : null}
      {state === 'warning' ? <Minus className="size-3" strokeWidth={3} /> : null}
      {state === 'current' || state === 'editing' ? (
        <span className="size-1.5 rounded-full bg-current" />
      ) : null}
      {state === 'partial' ? (
        <span className="size-1.5 rounded-full bg-current" />
      ) : null}
    </span>
  )
}

function resolveCompletionLabel(
  label: string,
  completion: ModuleCompletionStatus | undefined,
) {
  if (!completion) {
    return undefined
  }
  if (completion.state === 'error') {
    return `${label}：阻塞 ${completion.errors} 项，完成度 ${completion.percent}%`
  }
  if (completion.state === 'warning') {
    return `${label}：提示 ${completion.warnings} 项，完成度 ${completion.percent}%`
  }
  return `${label}：完成度 ${completion.percent}%`
}

export function EditorStepper({
  items,
  currentKey,
  onChange,
}: {
  items: StepperItem[]
  currentKey: string
  onChange: (key: EditorSectionKey) => void
}) {
  return (
    <>
      {/* Desktop vertical stepper */}
      <nav
        aria-label="编辑器分步导航"
        className="sticky top-24 hidden w-48 shrink-0 flex-col self-start lg:flex"
      >
        {items.map((item, index) => {
          const isCurrent = item.key === currentKey
          const isLast = index === items.length - 1
          const state = resolveVisualState(item.completion, item.status)
          const lineActive =
            item.completion?.percent === 100 ||
            item.status === 'saved' ||
            item.status === 'current'
          const completionLabel = resolveCompletionLabel(
            item.label,
            item.completion,
          )
          return (
            <button
              key={item.key}
              type="button"
              aria-label={completionLabel}
              aria-current={isCurrent ? 'step' : undefined}
              onClick={() => onChange(item.key)}
              className="group flex items-stretch gap-3 text-left"
            >
              <div className="flex flex-col items-center">
                <StepperDot state={state} />
                {!isLast ? (
                  <div
                    className={cn(
                      'w-px flex-1',
                      lineActive ? 'bg-primary/40' : 'bg-border',
                    )}
                  />
                ) : null}
              </div>
              <span
                className={cn(
                  'pb-5 text-sm transition-colors',
                  isCurrent
                    ? 'font-semibold text-foreground'
                    : 'text-muted-foreground group-hover:text-foreground',
                )}
              >
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Mobile horizontal stepper */}
      <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {items.map((item) => {
          const isCurrent = item.key === currentKey
          const state = resolveVisualState(item.completion, item.status)
          const completionLabel = resolveCompletionLabel(
            item.label,
            item.completion,
          )
          return (
            <button
              key={item.key}
              type="button"
              aria-label={completionLabel}
              aria-current={isCurrent ? 'step' : undefined}
              onClick={() => onChange(item.key)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                isCurrent
                  ? 'border-primary bg-primary-soft text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              <StepperDot state={state} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}
