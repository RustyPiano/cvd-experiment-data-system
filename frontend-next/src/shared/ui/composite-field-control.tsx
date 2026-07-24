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
import type { FieldValidation } from '@/shared/generated/field-metadata'
import { numericInputAttributes } from '@/shared/field-validation'

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
  ariaDescribedBy,
  freePlaceholder,
  selectPlaceholder,
  validation,
  optionLabel = (option) => option,
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
  ariaDescribedBy?: string
  freePlaceholder: string
  selectPlaceholder: string
  validation?: FieldValidation | null
  optionLabel?: (option: string) => string
}) {
  const { freeValue, option } = parseCompositeValue(input, value, options)
  const freeTextOption = input === '文本+数值'
  const freeFirst =
    !freeTextOption && (input.startsWith('数值') || input.startsWith('文本'))
  // Keep malformed legacy values visible/editable instead of letting
  // <input type="number"> silently blank them.
  const numeric =
    input.includes('数值') &&
    (freeValue.trim() === '' || Number.isFinite(Number(freeValue)))
  const numericAttributes = numericInputAttributes(validation)
  const freeControl = (
    <Input
      id={inputId}
      type={numeric ? 'number' : 'text'}
      inputMode={numeric ? 'decimal' : undefined}
      min={numeric ? numericAttributes.min : undefined}
      max={numeric ? numericAttributes.max : undefined}
      step={numeric ? numericAttributes.step : undefined}
      value={freeValue}
      onChange={(event) =>
        onChange(formatCompositeValue(input, event.target.value, option))
      }
      disabled={disabled}
      autoComplete="off"
      placeholder={freePlaceholder}
      aria-invalid={invalid}
      aria-describedby={ariaDescribedBy}
      className="flex-1"
    />
  )
  const optionControl = freeTextOption ? (
    <Input
      id={selectId}
      type="text"
      value={option}
      onChange={(event) =>
        onChange(formatCompositeValue(input, freeValue, event.target.value))
      }
      disabled={disabled}
      autoComplete="off"
      placeholder={selectPlaceholder}
      aria-label={selectLabel}
      aria-invalid={invalid}
      aria-describedby={ariaDescribedBy}
      className="flex-1"
    />
  ) : (
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
        aria-describedby={ariaDescribedBy}
        className="flex-1"
      >
        <SelectValue placeholder={selectPlaceholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((item) => (
            <SelectItem key={item} value={item}>
              {optionLabel(item)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {freeFirst ? freeControl : optionControl}
      {freeFirst ? optionControl : freeControl}
    </div>
  )
}
