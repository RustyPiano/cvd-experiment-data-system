import { useEffect, useState } from 'react'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const OTHER_VALUE = '__cvd_other_value__'

export function SelectWithOtherControl({
  value,
  options,
  onChange,
  disabled,
  selectId,
  invalid,
  ariaDescribedBy,
  placeholder,
  otherLabel,
  otherInputLabel,
  otherPlaceholder,
  optionLabel,
}: {
  value: string
  options: readonly string[]
  onChange: (value: string) => void
  disabled?: boolean
  selectId?: string
  invalid?: boolean
  ariaDescribedBy?: string
  placeholder: string
  otherLabel: string
  otherInputLabel: string
  otherPlaceholder: string
  optionLabel: (option: string) => string
}) {
  const [otherMode, setOtherMode] = useState(
    value.trim() !== '' && !options.includes(value),
  )

  useEffect(() => {
    if (value.trim() !== '' && !options.includes(value)) setOtherMode(true)
    if (options.includes(value)) setOtherMode(false)
  }, [options, value])

  const selectValue = otherMode
    ? OTHER_VALUE
    : options.includes(value)
      ? value
      : ''

  return (
    <div className="grid gap-2">
      <Select
        value={selectValue}
        onValueChange={(nextValue) => {
          if (nextValue === OTHER_VALUE) {
            setOtherMode(true)
            if (options.includes(value)) onChange('')
            return
          }
          setOtherMode(false)
          onChange(nextValue)
        }}
        disabled={disabled}
      >
        <SelectTrigger
          id={selectId}
          aria-invalid={invalid}
          aria-describedby={ariaDescribedBy}
          className="w-full"
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {optionLabel(option)}
            </SelectItem>
          ))}
          <SelectItem value={OTHER_VALUE}>{otherLabel}</SelectItem>
        </SelectContent>
      </Select>
      {otherMode ? (
        <Input
          value={options.includes(value) ? '' : value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-label={otherInputLabel}
          aria-invalid={invalid}
          aria-describedby={ariaDescribedBy}
          placeholder={otherPlaceholder}
          autoComplete="off"
        />
      ) : null}
    </div>
  )
}
