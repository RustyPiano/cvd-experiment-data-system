import { useMemo } from 'react'
import { Check } from 'lucide-react'

import {
  groupVocabularyOptions,
  withMissingMultiSelectOptions,
} from '../editor-types'
import type { VocabularySelectOption } from '../editor-types'
import { cn } from '@/lib/utils'

/**
 * 受控词表多选（分组 chips）。用于 result_summary 的失败模式等可多选字段：
 * 选项按后端分组渲染，已选项高亮；已选但不在 active 词表里的 legacy 值也会
 * 作为未分组 chip 显示，避免无法取消。
 */
export function VocabularyMultiSelect({
  ariaLabel,
  disabled = false,
  emptyHint = '暂无可选项',
  onChange,
  options,
  value,
}: {
  ariaLabel: string
  disabled?: boolean
  emptyHint?: string
  onChange: (next: string[]) => void
  options: VocabularySelectOption[]
  value: string[]
}) {
  const groups = useMemo(
    () => groupVocabularyOptions(withMissingMultiSelectOptions(options, value)),
    [options, value],
  )
  const selected = useMemo(() => new Set(value), [value])

  const toggle = (optionValue: string) => {
    if (disabled) return
    onChange(
      selected.has(optionValue)
        ? value.filter((item) => item !== optionValue)
        : [...value, optionValue],
    )
  }

  if (options.length === 0 && value.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyHint}</p>
  }

  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-col gap-3">
      {groups.map((group) => (
        <div
          key={group.key ?? '__ungrouped__'}
          className="flex flex-col gap-1.5"
        >
          {group.label ? (
            <span className="text-xs font-medium text-muted-foreground">
              {group.label}
            </span>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {group.options.map((option) => {
              const active = selected.has(option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  disabled={disabled}
                  onClick={() => toggle(option.value)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors',
                    'disabled:pointer-events-none disabled:opacity-50',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {active ? <Check className="size-3.5 shrink-0" /> : null}
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
