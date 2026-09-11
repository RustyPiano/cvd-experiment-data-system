import { useId, useState } from 'react'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { characterizationProfiles } from '@/shared/generated/field-metadata'
import type { CharacterizationConditionField } from '@/shared/generated/field-metadata'
import { isEnglish, localizedUnit } from '@/shared/field-i18n'
import i18nInstance from '@/shared/i18n'
import { RequiredMark } from '@/shared/ui/required-mark'

export function conditionMatches(
  when: Record<string, string[]> | undefined,
  conditions: Record<string, string>,
) {
  return (
    !when ||
    Object.entries(when).every(([key, values]) =>
      values.includes(conditions[key]),
    )
  )
}

export function conditionHasValue(
  field: CharacterizationConditionField,
  conditions: Record<string, string>,
) {
  return field.components
    ? field.components.every((component) =>
        Boolean(conditions[`${field.key}.${component.key}`]?.trim()),
      )
    : Boolean(conditions[field.key]?.trim())
}

export function characterizationConditionIssue(
  field: CharacterizationConditionField,
  conditions: Record<string, string>,
  required = false,
  language = 'zh',
): string | null {
  const translate = i18nInstance.getFixedT(
    language,
    'common',
    'characterizations.workspace.validation',
  )
  const values = field.components
    ? field.components.map(
        (component) =>
          conditions[`${field.key}.${component.key}`]?.trim() ?? '',
      )
    : [conditions[field.key]?.trim() ?? '']
  if (values.every((value) => !value)) {
    return required ? translate('conditionRequired') : null
  }
  if (values.some((value) => !value)) return translate('completeValues')
  const missingDependency = field.requires?.find(
    (key) => !conditions[key]?.trim(),
  )
  if (missingDependency) {
    const dependency = Object.values(characterizationProfiles)
      .flatMap((profile) => profile.condition_fields)
      .find((item) => item.key === missingDependency)
    const label = dependency
      ? isEnglish(language)
        ? dependency.label_en
        : dependency.label_zh
      : missingDependency
    return i18nInstance.getFixedT(language)('raman.dependencyRequired', {
      name: label,
    })
  }
  if (field.value_type === 'text' || field.value_type === 'select') {
    if (
      field.key === 'power_setting' &&
      conditions.power_setting_unit !== 'level'
    ) {
      const power = Number(values[0])
      if (
        !['percent', 'mW'].includes(conditions.power_setting_unit ?? '') ||
        !/^\+?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(values[0]) ||
        !Number.isFinite(power) ||
        power <= 0 ||
        (conditions.power_setting_unit === 'percent' && power > 100)
      )
        return i18nInstance.getFixedT(language)('raman.powerInvalid')
    }
    if (
      field.value_type === 'select' &&
      !field.options?.some(
        (option) =>
          option.value === values[0] &&
          conditionMatches(option.when, conditions),
      )
    ) {
      return translate('conditionOption')
    }
    const minLength = field.validation?.min_length
    const maxLength = field.validation?.max_length
    if (typeof minLength === 'number' && values[0].length < minLength) {
      return translate('conditionTextMin', { min: minLength })
    }
    if (typeof maxLength === 'number' && values[0].length > maxLength) {
      return translate('conditionTextMax', { max: maxLength })
    }
    return null
  }

  const numbers = values.map(Number)
  for (const rule of field.conditional_validation ?? []) {
    if (conditionMatches(rule.when, conditions)) {
      const issue = characterizationConditionIssue(
        {
          ...field,
          conditional_validation: undefined,
          validation: { ...field.validation, ...rule.validation },
        },
        conditions,
        required,
        language,
      )
      if (issue) return issue
    }
  }
  if (numbers.some((value) => !Number.isFinite(value))) {
    return translate('conditionNumber')
  }
  if (field.value_type === 'resolution') {
    return numbers.every((value) => Number.isInteger(value) && value >= 1)
      ? null
      : translate('positiveInteger')
  }
  if (field.value_type === 'range') {
    const min = Math.max(
      field.validation?.ge ?? (field.signed ? -Infinity : 0),
      field.key === 'scan_range_deg' && conditions.scan_axis === 'two_theta'
        ? 0
        : -Infinity,
    )
    const max = Math.min(
      field.validation?.le ?? Infinity,
      field.key === 'scan_range_deg' && conditions.scan_axis === 'two_theta'
        ? 180
        : Infinity,
    )
    const unit = field.unit ? ` ${localizedUnit(field.unit, language)}` : ''
    if (numbers[1] <= numbers[0]) return translate('range')
    if (
      typeof field.validation?.gt === 'number' &&
      numbers.some((value) => value <= field.validation!.gt!)
    )
      return translate('positiveNumber')
    if (
      (numbers[0] < min || numbers[1] > max) &&
      Number.isFinite(min) &&
      Number.isFinite(max)
    )
      return translate('conditionRange', {
        min: `${min}${unit}`,
        max: `${max}${unit}`,
      })
    if (numbers[0] < min)
      return translate('ge', { label: '', value: `${min}${unit}` }).trim()
    if (numbers[1] > max)
      return translate('le', { label: '', value: `${max}${unit}` }).trim()
    return null
  }
  if (field.value_type === 'integer') {
    if (!Number.isInteger(numbers[0]) || numbers[0] < 1)
      return translate('positiveInteger')
  }
  const ge = field.validation?.ge
  const gt = field.validation?.gt
  const le = field.validation?.le
  const lt = field.validation?.lt
  const unit = field.unit ? ` ${localizedUnit(field.unit, language)}` : ''
  if (
    typeof ge === 'number' &&
    typeof le === 'number' &&
    numbers.some((value) => value < ge || value > le)
  )
    return translate('conditionRange', {
      min: `${ge}${unit}`,
      max: `${le}${unit}`,
    })
  for (const [constraint, bound, invalid] of [
    ['ge', ge, typeof ge === 'number' && numbers.some((value) => value < ge)],
    ['gt', gt, typeof gt === 'number' && numbers.some((value) => value <= gt)],
    ['le', le, typeof le === 'number' && numbers.some((value) => value > le)],
    ['lt', lt, typeof lt === 'number' && numbers.some((value) => value >= lt)],
  ] as const) {
    if (invalid)
      return translate(constraint, {
        label: '',
        value: `${bound}${unit}`,
      }).trim()
  }
  if (
    field.key === 'excitation_power_value' &&
    conditions.excitation_power_basis === 'instrument_percent' &&
    numbers[0] > 100
  )
    return translate('le', { label: '', value: '100%' }).trim()
  return numbers.every((value) =>
    typeof ge === 'number' || typeof gt === 'number' ? true : value > 0,
  )
    ? null
    : translate('positiveNumber')
}

export function typedConditions(
  fields: CharacterizationConditionField[],
  conditions: Record<string, string>,
) {
  return Object.fromEntries(
    fields
      .filter((field) => conditionHasValue(field, conditions))
      .map((field) => [
        field.key,
        field.components
          ? Object.fromEntries(
              field.components.map((component) => [
                component.key,
                Number(conditions[`${field.key}.${component.key}`]),
              ]),
            )
          : ['text', 'select'].includes(field.value_type)
            ? conditions[field.key].trim()
            : Number(conditions[field.key]),
      ]),
  )
}

function BaseConditionInput({
  field,
  conditions,
  required,
  issue,
  language,
  onChange,
  disabled,
}: {
  field: CharacterizationConditionField
  conditions: Record<string, string>
  required?: boolean
  issue?: string | null
  language: string
  onChange: (key: string, value: string) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const inputPrefix = useId()
  if (field.key === 'excitation_power_basis') return null
  const issueId = `${inputPrefix}-condition-${field.key}-error`
  const fieldLabel = isEnglish(language) ? field.label_en : field.label_zh
  const unit =
    field.key === 'power_setting'
      ? ({ percent: '%', mW: 'mW' } as Record<string, string>)[
          conditions.power_setting_unit
        ]
      : field.unit
  const minLength =
    typeof field.validation?.min_length === 'number'
      ? field.validation.min_length
      : undefined
  const maxLength =
    typeof field.validation?.max_length === 'number'
      ? field.validation.max_length
      : undefined
  return (
    <Field className="gap-2" data-invalid={Boolean(issue) || undefined}>
      <FieldLabel
        htmlFor={
          field.components ? undefined : `${inputPrefix}-condition-${field.key}`
        }
      >
        {fieldLabel}
        {unit
          ? isEnglish(language)
            ? ` (${localizedUnit(unit, language)})`
            : `（${unit}）`
          : ''}
        {required ? <RequiredMark /> : null}
      </FieldLabel>
      {field.components ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {field.components.map((component) => {
            const key = `${field.key}.${component.key}`
            const componentLabel = isEnglish(language)
              ? component.label_en
              : component.label_zh
            return (
              <div key={key} className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">
                  {componentLabel}
                </Label>
                <Input
                  id={`${inputPrefix}-condition-${key}`}
                  type="number"
                  min={
                    field.value_type === 'resolution'
                      ? '1'
                      : (field.validation?.ge ??
                        (field.signed ? undefined : '0'))
                  }
                  max={field.validation?.le}
                  step={field.value_type === 'resolution' ? '1' : 'any'}
                  value={conditions[key] ?? ''}
                  required={required}
                  disabled={disabled}
                  aria-invalid={Boolean(issue) || undefined}
                  aria-describedby={issue ? issueId : undefined}
                  aria-label={`${fieldLabel} ${componentLabel}`}
                  onChange={(event) => onChange(key, event.target.value)}
                />
              </div>
            )
          })}
        </div>
      ) : field.value_type === 'select' ? (
        <Select
          value={conditions[field.key] ?? ''}
          disabled={disabled}
          onValueChange={(value) => onChange(field.key, value)}
        >
          <SelectTrigger
            id={`${inputPrefix}-condition-${field.key}`}
            className="w-full"
            aria-invalid={Boolean(issue) || undefined}
            aria-describedby={issue ? issueId : undefined}
          >
            <SelectValue
              placeholder={t('characterizations.workspace.placeholders.select')}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {field.options
                ?.filter((option) => conditionMatches(option.when, conditions))
                .map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {isEnglish(language) ? option.label_en : option.label_zh}
                  </SelectItem>
                ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : field.multiline ? (
        <Textarea
          id={`${inputPrefix}-condition-${field.key}`}
          value={conditions[field.key] ?? ''}
          maxLength={maxLength}
          required={required}
          disabled={disabled}
          aria-invalid={Boolean(issue) || undefined}
          aria-describedby={issue ? issueId : undefined}
          placeholder={
            isEnglish(language) ? field.placeholder_en : field.placeholder_zh
          }
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      ) : (
        <Input
          id={`${inputPrefix}-condition-${field.key}`}
          type={field.value_type === 'text' ? 'text' : 'number'}
          min={
            field.value_type === 'text'
              ? undefined
              : (field.validation?.ge ?? field.validation?.gt ?? '0')
          }
          max={
            field.value_type === 'text'
              ? undefined
              : (field.validation?.le ?? field.validation?.lt)
          }
          minLength={field.value_type === 'text' ? minLength : undefined}
          maxLength={field.value_type === 'text' ? maxLength : undefined}
          step={field.value_type === 'integer' ? '1' : 'any'}
          value={conditions[field.key] ?? ''}
          required={required}
          disabled={disabled}
          aria-invalid={Boolean(issue) || undefined}
          aria-describedby={issue ? issueId : undefined}
          placeholder={
            field.value_type === 'text'
              ? ((isEnglish(language)
                  ? field.placeholder_en
                  : field.placeholder_zh) ??
                t('characterizations.workspace.placeholders.textCondition'))
              : undefined
          }
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      )}
      {field.key === 'excitation_power_value' ? (
        <Select
          value={conditions.excitation_power_basis ?? ''}
          disabled={disabled}
          onValueChange={(value) => onChange('excitation_power_basis', value)}
        >
          <SelectTrigger
            id={`${inputPrefix}-condition-excitation_power_basis`}
            className="w-full"
            aria-label={t('instrumentPresets.powerUnit')}
          >
            <SelectValue placeholder={t('instrumentPresets.powerUnit')} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {characterizationProfiles.Raman.condition_fields
                .find((item) => item.key === 'excitation_power_basis')
                ?.options?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {isEnglish(language) ? option.label_en : option.label_zh}
                  </SelectItem>
                ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : null}
      {field.help_zh || field.help_en ? (
        <p className="text-sm text-muted-foreground">
          {isEnglish(language) ? field.help_en : field.help_zh}
        </p>
      ) : null}
      {issue ? (
        <p id={issueId} className="text-destructive text-sm">
          {issue}
        </p>
      ) : null}
    </Field>
  )
}

/** Convert only coordinates/settings; this never rescales spectral intensities. */
export function opticalUnitValue(
  value: number,
  unit: string,
  toCanonical = true,
): number {
  if (unit === 'eV') return 1239.8419843320025 / value
  if (unit === '℃') return value + (toCanonical ? 273.15 : -273.15)
  const scale =
    ({ ps: 1000, ns: 1e6, kHz: 1e-3, Hz: 1e-6 } as Record<string, number>)[
      unit
    ] ?? 1
  return toCanonical ? value * scale : value / scale
}

export function ConditionInput(
  props: ComponentProps<typeof BaseConditionInput>,
) {
  const { field, conditions, onChange, language } = props
  const [displayUnit, setDisplayUnit] = useState(field.unit ?? '')
  const unit = field.display_units?.includes(displayUnit)
    ? displayUnit
    : (field.unit ?? '')
  if (!field.display_units) return <BaseConditionInput {...props} />
  const keys = field.components?.map((part) => `${field.key}.${part.key}`) ?? [
    field.key,
  ]
  const display = { ...conditions }
  for (const key of keys)
    if (display[key]?.trim() && Number.isFinite(Number(display[key])))
      display[key] = String(
        Number(
          opticalUnitValue(Number(display[key]), unit, false).toPrecision(12),
        ),
      )
  const components =
    unit === 'eV' && field.components
      ? [...field.components].reverse().map((part, index) => ({
          ...part,
          label_zh: field.components![index].label_zh,
          label_en: field.components![index].label_en,
        }))
      : field.components
  const validation = { ...field.validation }
  if (
    unit === '℃' &&
    validation.gt === undefined &&
    validation.ge === undefined
  )
    validation.gt = 0
  for (const key of ['ge', 'gt', 'le', 'lt'] as const)
    if (typeof validation[key] === 'number' && unit !== 'eV')
      validation[key] = opticalUnitValue(validation[key], unit, false)
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <BaseConditionInput
        {...props}
        field={{ ...field, unit, components, validation }}
        conditions={display}
        onChange={(key, value) =>
          onChange(
            key,
            !value.trim() ? '' : String(opticalUnitValue(Number(value), unit)),
          )
        }
      />
      <Select
        value={unit}
        disabled={props.disabled}
        onValueChange={setDisplayUnit}
      >
        <SelectTrigger
          aria-label={`${isEnglish(language) ? field.label_en : field.label_zh} ${i18nInstance.getFixedT(language)('pl.unit')}`}
          className="w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {field.display_units.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
