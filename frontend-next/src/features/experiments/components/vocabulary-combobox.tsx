import { useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react'

import {
  groupVocabularyOptions,
  withLegacyVocabularyOption,
} from '../editor-types'
import type { VocabularySelectOption } from '../editor-types'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'

/**
 * Free-text vocabulary combobox (faithful replacement for the old antd
 * `AutoComplete`): the field accepts any typed value, while the controlled
 * vocabulary surfaces matching suggestions below. Selecting a suggestion stores
 * its canonical `value`; typing commits the raw text. Legacy values not present
 * in the active vocabulary are preserved via `withLegacyVocabularyOption`.
 */
export function VocabularyCombobox({
  ariaLabel,
  creating = false,
  disabled,
  onChange,
  onCreate,
  options,
  placeholder,
  value,
}: {
  ariaLabel: string
  /** True while a new value is being persisted to the shared vocabulary. */
  creating?: boolean
  disabled: boolean
  onChange: (value: string) => void
  /**
   * When provided, a typed value that is not yet in the vocabulary can be
   * promoted into the shared list via an "add" action in the dropdown.
   */
  onCreate?: (rawValue: string) => void
  options: VocabularySelectOption[]
  placeholder: string
  value: string
}) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const resolvedOptions = useMemo(
    () => withLegacyVocabularyOption(options, value),
    [options, value],
  )

  // 输入框展示当前 value 对应的标签（若有），否则展示原始值。
  const displayValue =
    resolvedOptions.find((option) => option.value === value)?.label ?? value

  const trimmedQuery = displayValue.trim()

  // value 命中一个真实词表项时，输入框展示的是「已选中项的标签」而非用户正在输入的
  // 查询——此时不要据此过滤，否则重新打开下拉只剩选中项、无法浏览其它候选。
  const reflectsSelection = useMemo(
    () => options.some((option) => option.value === value),
    [options, value],
  )

  const filtered = useMemo(() => {
    if (reflectsSelection) return resolvedOptions
    const query = trimmedQuery.toLowerCase()
    if (!query) return resolvedOptions
    return resolvedOptions.filter(
      (option) =>
        option.label.toLowerCase().includes(query) ||
        option.value.toLowerCase().includes(query),
    )
  }, [resolvedOptions, trimmedQuery, reflectsSelection])

  // 仅当输入的值尚不在词表中时才提供"添加"。注意要对照真正的词表 `options`，
  // 而不是 `resolvedOptions`——后者会把当前输入值作为 legacy 选项回显，导致永远命中。
  const hasExactMatch = useMemo(
    () =>
      options.some(
        (option) =>
          option.value === trimmedQuery || option.label === trimmedQuery,
      ),
    [options, trimmedQuery],
  )
  const showCreate = Boolean(
    onCreate && !disabled && trimmedQuery.length > 0 && !hasExactMatch,
  )

  // 分组渲染：仅当词表带有分组标签时才显示分组标题，否则保持扁平列表外观。
  const groupedFiltered = useMemo(
    () => groupVocabularyOptions(filtered),
    [filtered],
  )
  const showGroupHeaders = groupedFiltered.some((group) => group.label)

  const commit = (nextValue: string) => {
    onChange(nextValue)
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            ref={inputRef}
            aria-label={ariaLabel}
            autoComplete="off"
            disabled={disabled}
            placeholder={placeholder}
            value={displayValue}
            onChange={(event) => {
              onChange(event.target.value)
              if (!open) setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onPointerDown={() => {
              if (!disabled) setOpen(true)
            }}
            className="pr-9"
          />
          <ChevronsUpDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground/70" />
        </div>
      </PopoverAnchor>
      {filtered.length > 0 || showCreate ? (
        <PopoverContent
          align="start"
          className="max-h-60 w-(--radix-popover-trigger-width) overflow-y-auto p-1"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            // The anchored input lives outside the popover content; clicking or
            // focusing it must NOT dismiss the suggestions (otherwise the
            // dropdown flickers shut the moment the user clicks the field).
            if (inputRef.current?.contains(event.target as Node)) {
              event.preventDefault()
            }
          }}
        >
          {groupedFiltered.map((group) => (
            <div
              key={group.key ?? '__ungrouped__'}
              role="group"
              aria-label={group.label ?? undefined}
            >
              {showGroupHeaders && group.label ? (
                <div className="px-2 pt-1.5 pb-0.5 text-xs font-medium text-muted-foreground">
                  {group.label}
                </div>
              ) : null}
              {group.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                    'hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none',
                    option.value === value && 'bg-accent/60',
                  )}
                  onClick={() => commit(option.value)}
                >
                  <span className="truncate">{option.label}</span>
                  {option.value === value ? (
                    <Check className="size-4 shrink-0 text-primary" />
                  ) : null}
                </button>
              ))}
            </div>
          ))}
          {showCreate ? (
            <button
              type="button"
              disabled={creating}
              className={cn(
                'mt-0.5 flex w-full items-center gap-2 rounded-sm border-t px-2 py-1.5 text-left text-sm',
                'text-primary hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
              onClick={() => onCreate?.(trimmedQuery)}
            >
              {creating ? (
                <Loader2 className="size-4 shrink-0 animate-spin" />
              ) : (
                <Plus className="size-4 shrink-0" />
              )}
              <span className="truncate">{`添加 “${trimmedQuery}” 到公共列表`}</span>
            </button>
          ) : null}
        </PopoverContent>
      ) : null}
    </Popover>
  )
}
