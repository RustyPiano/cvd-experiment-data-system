import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  spaceGroupNumber,
  spaceGroupOptions,
  suggestedBulkSpaceGroups,
} from '../space-groups'

export function SpaceGroupInput({
  id,
  value,
  formula,
  onChange,
  disabled,
  invalid,
  ariaDescribedBy,
  placeholder,
}: {
  id: string
  value: string
  formula?: string
  onChange: (value: string) => void
  disabled?: boolean
  invalid?: boolean
  ariaDescribedBy?: string
  placeholder?: string
}) {
  const { t } = useTranslation()
  const formulaText = String(formula ?? '')
  const suggestions = suggestedBulkSpaceGroups(formula)
  const number = spaceGroupNumber(value)
  const selectedSuggestion = suggestions.some(
    (suggestion) => suggestion.number === number,
  )
    ? String(number)
    : ''

  return (
    <div className="flex flex-col gap-2">
      {suggestions.length > 0 ? (
        <div className="flex flex-col gap-1">
          <Select
            value={selectedSuggestion}
            onValueChange={onChange}
            disabled={disabled}
          >
            <SelectTrigger
              aria-label={t(
                'experimentsV2.sections.targetProduct.spaceGroupCandidateLabel',
                { formula: formulaText },
              )}
              className="w-full"
            >
              <SelectValue
                placeholder={t(
                  'experimentsV2.sections.targetProduct.spaceGroupCandidatePlaceholder',
                  { formula: formulaText },
                )}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {suggestions.map((suggestion) => (
                  <SelectItem
                    key={`${suggestion.phase}-${suggestion.number}`}
                    value={String(suggestion.number)}
                  >
                    {suggestion.phase} · #{suggestion.number} ·{' '}
                    {suggestion.symbol}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('experimentsV2.sections.targetProduct.spaceGroupCandidateHelp')}
          </p>
        </div>
      ) : null}

      <Input
        id={id}
        type="text"
        inputMode="text"
        list={`${id}-options`}
        value={value}
        onChange={(event) => {
          const next = event.target.value
          const parsed = next.includes('·') ? spaceGroupNumber(next) : undefined
          onChange(parsed == null ? next : String(parsed))
        }}
        onBlur={() => {
          const parsed = spaceGroupNumber(value)
          if (parsed != null && value !== String(parsed)) {
            onChange(String(parsed))
          }
        }}
        disabled={disabled}
        autoComplete="off"
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-describedby={ariaDescribedBy}
        className={cn(invalid && 'border-destructive')}
      />
      <datalist id={`${id}-options`}>
        {spaceGroupOptions.map((option) => (
          <option key={option.number} value={option.datalistValue} />
        ))}
      </datalist>
    </div>
  )
}
