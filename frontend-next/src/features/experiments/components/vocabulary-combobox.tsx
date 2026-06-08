import { useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'

import {
  withLegacyVocabularyOption
  
} from '../editor-types'
import type {VocabularySelectOption} from '../editor-types';
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
  disabled,
  onChange,
  options,
  placeholder,
  value,
}: {
  ariaLabel: string
  disabled: boolean
  onChange: (value: string) => void
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

  const filtered = useMemo(() => {
    const query = displayValue.trim().toLowerCase()
    if (!query) return resolvedOptions
    return resolvedOptions.filter(
      (option) =>
        option.label.toLowerCase().includes(query) ||
        option.value.toLowerCase().includes(query),
    )
  }, [resolvedOptions, displayValue])

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
      {filtered.length > 0 ? (
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
          {filtered.map((option) => (
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
        </PopoverContent>
      ) : null}
    </Popover>
  )
}
