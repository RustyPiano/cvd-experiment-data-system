import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  formatCompositeValue,
  parseCompositeValue,
} from '@/shared/composite-field'
import type { CompositeInput } from '@/shared/composite-field'

export function CompositeFieldControl({
  input,
  value,
  options,
  onChange,
  inputId,
  selectId,
  selectLabel,
  disabled,
  invalid,
  freePlaceholder,
  selectPlaceholder,
}: {
  input: CompositeInput
  value: string
  options: string[]
  onChange: (value: string) => void
  inputId: string
  selectId: string
  selectLabel: string
  disabled?: boolean
  invalid?: boolean
  freePlaceholder: string
  selectPlaceholder: string
}) {
  const { freeValue, option } = parseCompositeValue(input, value, options)
  const freeFirst = input.startsWith('数值') || input.startsWith('文本')
  const freeControl = (
    <Input
      id={inputId}
      value={freeValue}
      onChange={(event) =>
        onChange(formatCompositeValue(input, event.target.value, option))
      }
      disabled={disabled}
      autoComplete="off"
      placeholder={freePlaceholder}
      aria-invalid={invalid}
      className="flex-1"
    />
  )
  const selectControl = (
    <Select
      value={option}
      onValueChange={(selected) =>
        onChange(formatCompositeValue(input, freeValue, selected))
      }
      disabled={disabled}
    >
      <SelectTrigger
        id={selectId}
        aria-label={selectLabel}
        aria-invalid={invalid}
        className="flex-1"
      >
        <SelectValue placeholder={selectPlaceholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {freeFirst ? freeControl : selectControl}
      {freeFirst ? selectControl : freeControl}
    </div>
  )
}
