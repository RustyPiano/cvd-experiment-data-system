import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { X } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  characterizationProfiles,
  characterizationProperties,
} from '@/shared/generated/field-metadata'
import type { CharacterizationConditionField } from '@/shared/generated/field-metadata'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { isEnglish, localizedUnit } from '@/shared/field-i18n'
import i18nInstance from '@/shared/i18n'
import { RequiredMark } from '@/shared/ui/required-mark'
import { RouteLeaveGuard } from '@/shared/ui/route-leave-guard'
import {
  deleteExperimentFile,
  getExperimentFile,
  uploadExperimentFile,
} from '@/features/samples/api'
import { listEntityVersions } from '@/features/entity-library/api'

import { MeasurementDetails } from '@/features/characterizations/measurement-details'
import {
  createMeasurement,
  getRun,
  listAllMeasurements,
  listSamples,
} from './api'
import type { MeasurementBundleCreate, MeasurementPropertyQuality } from './api'
import { EntityReferenceSelect } from './components/entity-reference-select'
import {
  emptyPeakSeries,
  peakSeriesIssue,
  peakSeriesValue,
  SpectralPeaksEditor,
} from './spectral-peaks-editor'
import type { PeakSeriesDraft } from './spectral-peaks-editor'

export const METHOD_ORDER = [
  'optical_microscopy',
  'Raman',
  'PL',
  'SHG',
  'AFM',
  'SEM',
  'TEM',
  'XRD',
  'other',
] as const

const PROPERTY_QUALITY_OPTIONS: MeasurementPropertyQuality[] = [
  'valid',
  'below_detection_limit',
]

type ResultDefinition = {
  key: string
  label: string
  kind: 'number' | 'text'
  propertyCode?: string
  unit?: string
  required?: boolean
}

type MeasurementPropertyWrite = NonNullable<
  MeasurementBundleCreate['properties']
>[number]
type ResultMetadataDraft = {
  quality: MeasurementPropertyQuality
  qualityNote: string
}

const DEFAULT_RESULT_METADATA: ResultMetadataDraft = {
  quality: 'valid',
  qualityNote: '',
}

function localDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function resultFieldLabel(field: ResultDefinition, language: string) {
  const property = field.propertyCode
    ? characterizationProperties[field.propertyCode]
    : null
  if (property) {
    return isEnglish(language) ? property.label_en : property.label_zh
  }
  return i18nInstance.t(`characterizations.workspace.results.${field.key}`, {
    lng: language,
    defaultValue: field.label,
  })
}

export function characterizationResultIssue(
  field: ResultDefinition,
  rawValue: string | undefined,
  language = 'zh',
): string | null {
  const translate = i18nInstance.getFixedT(
    language,
    'common',
    'characterizations.workspace.validation',
  )
  const label = resultFieldLabel(field, language)
  const value = rawValue?.trim() ?? ''
  if (field.required && !value) return translate('required', { label })
  if (!value) return null
  const property = field.propertyCode
    ? characterizationProperties[field.propertyCode]
    : null
  if (field.kind === 'text' || property?.value_type === 'text') {
    const minLength = property?.validation.min_length
    const maxLength = property?.validation.max_length
    if (typeof minLength === 'number' && value.length < minLength) {
      return translate('textMin', { label, min: minLength })
    }
    if (typeof maxLength === 'number' && value.length > maxLength) {
      return translate('textMax', { label, max: maxLength })
    }
    return null
  }
  const number = Number(value)
  if (!Number.isFinite(number)) return translate('invalidNumber', { label })
  const validation = property?.validation
  if (validation?.ge != null && number < validation.ge) {
    return translate('ge', { label, value: validation.ge })
  }
  if (validation?.gt != null && number <= validation.gt) {
    return translate('gt', { label, value: validation.gt })
  }
  if (validation?.le != null && number > validation.le) {
    return translate('le', { label, value: validation.le })
  }
  if (validation?.lt != null && number >= validation.lt) {
    return translate('lt', { label, value: validation.lt })
  }
  return null
}

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

export function instrumentSupportsMethod(
  data: Record<string, unknown>,
  method: string,
) {
  const capabilities = data.capabilities
  if (Array.isArray(capabilities) && capabilities.length > 0) {
    return capabilities.some((capability) => {
      if (typeof capability === 'string')
        return (
          capability === method ||
          (method === 'Raman' && capability === 'low_frequency_raman')
        )
      if (!capability || typeof capability !== 'object') return false
      const code = (capability as Record<string, unknown>).code
      return (
        code === method ||
        (method === 'Raman' && code === 'low_frequency_raman')
      )
    })
  }
  return (
    data.name_type === method ||
    data.name_type === 'other' ||
    (method === 'Raman' && data.name_type === 'low_frequency_raman')
  )
}

function propertyInputBounds(propertyCode: string | undefined) {
  const validation = propertyCode
    ? characterizationProperties[propertyCode]?.validation
    : null
  return {
    min: validation?.ge ?? validation?.gt,
    max: validation?.le ?? validation?.lt,
  }
}

export const SIMPLE_RESULTS: Record<string, ResultDefinition[]> =
  Object.fromEntries(
    Object.entries(characterizationProfiles).map(([method, profile]) => [
      method,
      profile.default_property_codes
        .filter(
          (code) =>
            !characterizationProperties[code].legacy_only &&
            characterizationProperties[code].value_type !== 'structured',
        )
        .map((code) => ({
          key: code,
          label: characterizationProperties[code].label_zh,
          kind:
            characterizationProperties[code].value_type === 'text'
              ? 'text'
              : 'number',
          propertyCode: code,
        })),
    ]),
  )

function conditionHasValue(
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
  if (field.value_type === 'text' || field.value_type === 'select') {
    if (
      field.value_type === 'select' &&
      !field.options?.some((option) => option.value === values[0])
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
    return Number.isInteger(numbers[0]) && numbers[0] >= 1
      ? null
      : translate('positiveInteger')
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

function typedConditions(
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

function ConditionInput({
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
  if (field.key === 'excitation_power_basis') return null
  const issueId = `characterization-condition-${field.key}-error`
  const fieldLabel = isEnglish(language) ? field.label_en : field.label_zh
  const minLength =
    typeof field.validation?.min_length === 'number'
      ? field.validation.min_length
      : undefined
  const maxLength =
    typeof field.validation?.max_length === 'number'
      ? field.validation.max_length
      : undefined
  return (
    <div
      className="flex flex-col gap-2"
      data-invalid={Boolean(issue) || undefined}
    >
      <Label
        htmlFor={
          field.components
            ? undefined
            : `characterization-condition-${field.key}`
        }
      >
        {fieldLabel}
        {field.unit
          ? isEnglish(language)
            ? ` (${localizedUnit(field.unit, language)})`
            : `（${field.unit}）`
          : ''}
        {required ? <RequiredMark /> : null}
      </Label>
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
                  id={`characterization-condition-${key}`}
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
            id={`characterization-condition-${field.key}`}
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
              {field.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {isEnglish(language) ? option.label_en : option.label_zh}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={`characterization-condition-${field.key}`}
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
            id="characterization-condition-excitation_power_basis"
            className="w-full"
            aria-label={isEnglish(language) ? 'Power unit' : '功率单位'}
          >
            <SelectValue
              placeholder={isEnglish(language) ? 'Power unit' : '功率单位'}
            />
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
    </div>
  )
}

function ResultInput({
  field,
  value,
  metadata,
  language,
  disabled,
  onChange,
  onMetadataChange,
}: {
  field: ResultDefinition
  value: string
  metadata: ResultMetadataDraft
  language: string
  disabled?: boolean
  onChange: (value: string) => void
  onMetadataChange: (value: Partial<ResultMetadataDraft>) => void
}) {
  const { t } = useTranslation()
  const issue = characterizationResultIssue(field, value, language)
  const inputId = `characterization-result-${field.key.replace('.', '-')}`
  const issueId = `${inputId}-error`
  const qualityHelpId = `${inputId}-quality-help`
  const hasValue = Boolean(value.trim())
  const describedBy = [
    issue ? issueId : null,
    metadata.quality === 'below_detection_limit' ? qualityHelpId : null,
  ]
    .filter(Boolean)
    .join(' ')
  const bounds = propertyInputBounds(field.propertyCode)
  const label = resultFieldLabel(field, language)
  const rawUnit = field.propertyCode
    ? characterizationProperties[field.propertyCode]?.unit
    : field.unit
  const unit = localizedUnit(
    rawUnit === '—' ? null : (rawUnit ?? null),
    language,
  )
  const propertyMaxLength = field.propertyCode
    ? characterizationProperties[field.propertyCode]?.validation.max_length
    : undefined
  const textMaxLength =
    typeof propertyMaxLength === 'number' ? propertyMaxLength : undefined

  return (
    <div
      className="flex flex-col gap-2"
      data-invalid={Boolean(issue) || undefined}
    >
      <Label htmlFor={inputId}>
        {label}
        {unit ? (isEnglish(language) ? ` (${unit})` : `（${unit}）`) : ''}
        {field.required ? <RequiredMark /> : null}
      </Label>
      {field.kind === 'text' ? (
        <Textarea
          id={inputId}
          value={value}
          maxLength={textMaxLength}
          disabled={disabled}
          aria-invalid={Boolean(issue) || undefined}
          aria-describedby={describedBy || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={inputId}
          type="number"
          min={bounds.min}
          max={bounds.max}
          step="any"
          value={value}
          disabled={disabled}
          aria-invalid={Boolean(issue) || undefined}
          aria-describedby={describedBy || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {field.propertyCode && hasValue && field.kind === 'number' ? (
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {isEnglish(language) ? 'Value details' : '数值说明'}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${inputId}-quality`}>
                {isEnglish(language) ? 'Value type' : '数值类型'}
              </Label>
              <Select
                value={metadata.quality}
                disabled={disabled}
                onValueChange={(quality) =>
                  onMetadataChange({
                    quality: quality as MeasurementPropertyQuality,
                    ...(quality === 'valid' ? { qualityNote: '' } : {}),
                  })
                }
              >
                <SelectTrigger id={`${inputId}-quality`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {PROPERTY_QUALITY_OPTIONS.map((qualityOption) =>
                      qualityOption !== 'below_detection_limit' ||
                      characterizationProperties[field.propertyCode!]
                        ?.value_type === 'numeric' ? (
                        <SelectItem key={qualityOption} value={qualityOption}>
                          {qualityOption === 'valid'
                            ? isEnglish(language)
                              ? 'Measured value'
                              : '实测值'
                            : t(
                                'characterizations.workspace.propertyQuality.below_detection_limit',
                              )}
                        </SelectItem>
                      ) : null,
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            {metadata.quality !== 'valid' ? (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor={`${inputId}-quality-note`}>
                  {isEnglish(language) ? 'Detection-limit basis' : '检出限依据'}{' '}
                  <RequiredMark />
                </Label>
                <Textarea
                  id={`${inputId}-quality-note`}
                  value={metadata.qualityNote}
                  maxLength={1000}
                  disabled={disabled}
                  onChange={(event) =>
                    onMetadataChange({ qualityNote: event.target.value })
                  }
                />
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
      {metadata.quality === 'below_detection_limit' ? (
        <p id={qualityHelpId} className="text-sm text-muted-foreground">
          {t('characterizations.workspace.propertyQuality.bdlHelp')}
        </p>
      ) : null}
      {issue ? (
        <p id={issueId} className="text-destructive text-sm">
          {issue}
        </p>
      ) : null}
    </div>
  )
}

export function SimpleCharacterizationWorkspace({
  runId,
  initialSampleId,
  token,
  readOnly,
}: {
  runId: string
  initialSampleId?: string
  token: string
  readOnly: boolean
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const run = useQuery({
    queryKey: ['v2-experiment-status', runId],
    queryFn: () => getRun(runId, token),
    enabled: !readOnly,
  })
  const samples = useQuery({
    queryKey: ['samples', runId],
    queryFn: () => listSamples(runId, token),
    enabled: !readOnly,
  })
  const measurements = useQuery({
    queryKey: ['measurements', runId],
    queryFn: () => listAllMeasurements(token, { runId }),
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sampleId, setSampleId] = useState(initialSampleId ?? '')
  const [method, setMethod] = useState('')
  const [instrumentId, setInstrumentId] = useState('')
  const [instrumentVersion, setInstrumentVersion] = useState<number | null>(
    null,
  )
  const [instrumentSnapshot, setInstrumentSnapshot] = useState<Record<
    string,
    unknown
  > | null>(null)
  const [measuredAt, setMeasuredAt] = useState(localDateTimeValue)
  const [conditions, setConditions] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, string>>({})
  const [peakSeries, setPeakSeries] = useState<PeakSeriesDraft>(() =>
    emptyPeakSeries(),
  )
  const [resultMetadata, setResultMetadata] = useState<
    Record<string, ResultMetadataDraft>
  >({})
  const [rawFiles, setRawFiles] = useState<File[]>([])
  const [detailId, setDetailId] = useState<string | null>(null)
  const instrumentVersions = useQuery({
    queryKey: ['v2-entity', 'instrument', instrumentId, 'versions'],
    queryFn: () => listEntityVersions('instrument', instrumentId, token),
    enabled: Boolean(instrumentId),
  })

  const metadataFor = (key: string) =>
    resultMetadata[key] ?? DEFAULT_RESULT_METADATA
  const updateResultMetadata = (
    key: string,
    update: Partial<ResultMetadataDraft>,
  ) =>
    setResultMetadata((current) => ({
      ...current,
      [key]: { ...(current[key] ?? DEFAULT_RESULT_METADATA), ...update },
    }))
  const updateResult = (field: ResultDefinition, value: string) =>
    setResults((current) => ({ ...current, [field.key]: value }))
  const removeRawFile = (removedIndex: number) => {
    const sourceIndex = rawFiles.length === 1 ? 0 : peakSeries.sourceFileIndex
    if (removedIndex === sourceIndex && peakSeries.status) {
      if (
        !window.confirm(
          isEnglish(i18n.language)
            ? 'Removing this source file clears its peak results. Continue?'
            : '移除来源文件将清空对应峰结果，继续吗？',
        )
      )
        return
      setPeakSeries(emptyPeakSeries(peakSeries.positionUnit))
    }
    setRawFiles((current) =>
      current.filter((_, index) => index !== removedIndex),
    )
    setPeakSeries((current) => ({
      ...current,
      sourceFileIndex:
        current.sourceFileIndex === removedIndex
          ? null
          : current.sourceFileIndex !== null &&
              current.sourceFileIndex > removedIndex
            ? current.sourceFileIndex - 1
            : current.sourceFileIndex,
    }))
  }
  const updateCondition = (key: string, value: string) => {
    const next = { ...conditions, [key]: value }
    if (
      key === 'excitation_power_basis' &&
      conditions.excitation_power_basis &&
      conditions.excitation_power_basis !== value &&
      conditions.excitation_power_value
    ) {
      if (
        !window.confirm(
          isEnglish(i18n.language)
            ? 'Changing power units clears the entered power. Continue?'
            : '切换功率单位将清空已填功率，继续吗？',
        )
      )
        return
      delete next.excitation_power_value
    }
    const affected =
      profile?.condition_fields.filter(
        (field) => field.when && !conditionMatches(field.when, next),
      ) ?? []
    for (const field of affected) {
      for (const conditionKey of Object.keys(next))
        if (
          conditionKey === field.key ||
          conditionKey.startsWith(field.key + '.')
        )
          delete next[conditionKey]
    }
    if (
      ['data_type', 'scan_axis', 'mode', 'spectrum_mode'].includes(key) &&
      (peakSeries.status || Object.values(results).some(Boolean))
    ) {
      if (
        !window.confirm(
          isEnglish(i18n.language)
            ? 'Changing measurement settings clears entered results. Continue?'
            : '切换测量设置将清空已填结果，继续吗？',
        )
      )
        return
      setResults({})
      setResultMetadata({})
      setPeakSeries(emptyPeakSeries())
    }
    if (key === 'scan_axis')
      setPeakSeries(
        emptyPeakSeries(
          (
            {
              two_theta: '° 2θ',
              omega: '° ω',
              phi: '° φ',
              chi: '° χ',
            } as Record<string, string>
          )[value],
        ),
      )
    if (key === 'data_type')
      setPeakSeries(emptyPeakSeries(profile?.peak_position_units?.[0] ?? ''))
    setConditions(next)
  }

  const profile = characterizationProfiles[method]
  const propertyApplies = (code: string) =>
    (!profile?.property_modes?.[code] ||
      profile.property_modes[code].includes(conditions.mode)) &&
    conditionMatches(profile?.property_conditions?.[code], conditions)
  const peakUnits = propertyApplies('spectral_peaks')
    ? method === 'XRD'
      ? ({ two_theta: ['° 2θ'], omega: ['° ω'], phi: ['° φ'], chi: ['° χ'] }[
          conditions.scan_axis
        ] ?? [])
      : (profile?.peak_position_units ?? [])
    : []
  const resultDefinitions = (SIMPLE_RESULTS[method] ?? []).filter(
    (field) => field.propertyCode && propertyApplies(field.propertyCode),
  )
  const advancedResultDefinitions: ResultDefinition[] = (
    profile?.allowed_property_codes ?? []
  )
    .filter(
      (propertyCode) =>
        !characterizationProperties[propertyCode]?.legacy_only &&
        propertyApplies(propertyCode) &&
        !resultDefinitions.some(
          (field) => field.propertyCode === propertyCode,
        ) &&
        characterizationProperties[propertyCode]?.value_type !== 'structured',
    )
    .map((propertyCode) => {
      const property = characterizationProperties[propertyCode]
      return {
        key: `advanced.${propertyCode}`,
        label: isEnglish(i18n.language) ? property.label_en : property.label_zh,
        kind: property.value_type === 'text' ? 'text' : 'number',
        unit: property.unit === '—' ? undefined : property.unit,
        propertyCode,
      }
    })
  const allResultDefinitions = [
    ...resultDefinitions,
    ...advancedResultDefinitions,
  ]
  const eligibleSamples = (samples.data?.items ?? []).filter(
    (sample) =>
      sample.lifecycle_state === 'active' &&
      (sample.role !== 'growth' ||
        sample.run_revision_id === run.data?.current_revision_id),
  )
  const selectedInstrumentSupportsMethod = Boolean(
    instrumentSnapshot && instrumentSupportsMethod(instrumentSnapshot, method),
  )
  const requiredConditionKeys = profile?.required_condition_keys ?? []
  const visibleConditions = (profile?.condition_fields ?? []).filter(
    (field) => !field.legacy_only && conditionMatches(field.when, conditions),
  )
  const requiredConditions = visibleConditions.filter((field) =>
    requiredConditionKeys.includes(field.key),
  )
  const optionalConditions = visibleConditions.filter(
    (field) => !requiredConditionKeys.includes(field.key),
  )
  const commonConditions = visibleConditions.filter(
    (field) =>
      field.section !== 'results' &&
      (requiredConditionKeys.includes(field.key) ||
        profile?.common_condition_keys?.includes(field.key)),
  )
  const extraConditions = optionalConditions.filter(
    (field) => field.section !== 'results' && !commonConditions.includes(field),
  )
  const resultConditions = visibleConditions.filter(
    (field) => field.section === 'results',
  )
  const rawIndexes = rawFiles.map((_, index) => index)
  const rawFileCount = rawIndexes.length
  const spectralIssue = peakUnits.length
    ? peakSeriesIssue(peakSeries, rawIndexes, method)
    : null
  const evidencePresent =
    rawFileCount > 0 ||
    allResultDefinitions.some((field) => results[field.key]?.trim()) ||
    Boolean(peakUnits.length && peakSeries.status)
  const conditionIssues = [
    ...requiredConditions.map((field) => ({
      field,
      issue: characterizationConditionIssue(
        field,
        conditions,
        true,
        i18n.language,
      ),
    })),
    ...optionalConditions.map((field) => ({
      field,
      issue: characterizationConditionIssue(
        field,
        conditions,
        false,
        i18n.language,
      ),
    })),
  ]
  const excitationPowerPairIssue =
    Boolean(conditions.excitation_power_value?.trim()) !==
    Boolean(conditions.excitation_power_basis?.trim())
      ? t(
          conditions.excitation_power_value?.trim()
            ? 'characterizations.workspace.validation.powerBasis'
            : 'characterizations.workspace.validation.powerValue',
        )
      : null
  const conditionsValid =
    conditionIssues.every(({ issue }) => issue === null) &&
    excitationPowerPairIssue === null
  const resultIssues = allResultDefinitions.flatMap((field) => {
    const issue = characterizationResultIssue(
      field,
      results[field.key],
      i18n.language,
    )
    return issue ? [issue] : []
  })
  const resultsValid = resultIssues.length === 0 && !spectralIssue
  const resultMetadataIssues = allResultDefinitions.flatMap((field) => {
    if (!results[field.key]?.trim()) return []
    const metadata = metadataFor(field.key)
    const issues = [
      field.propertyCode &&
      metadata.quality !== 'valid' &&
      !metadata.qualityNote.trim()
        ? t('characterizations.workspace.missing.qualityNote')
        : null,
    ].filter(Boolean) as string[]
    return issues.map(
      (issue) => `${resultFieldLabel(field, i18n.language)}：${issue}`,
    )
  })
  const hasMethodDraft = Boolean(
    instrumentId ||
    (method && measuredAt) ||
    Object.values(conditions).some((value) => value.trim()) ||
    Object.values(results).some((value) => value.trim()) ||
    Boolean(peakSeries.status) ||
    Object.values(resultMetadata).some(
      (metadata) => metadata.quality !== 'valid' || metadata.qualityNote.trim(),
    ) ||
    rawFiles.length,
  )
  const hasUnsavedChanges = Boolean(method || hasMethodDraft)
  const resetDraft = (keepSample = true) => {
    if (!keepSample) setSampleId('')
    setMethod('')
    setInstrumentId('')
    setInstrumentVersion(null)
    setInstrumentSnapshot(null)
    setMeasuredAt(localDateTimeValue())

    setConditions({})
    setResults({})
    setPeakSeries(emptyPeakSeries())
    setResultMetadata({})
    setRawFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  const canSubmit = Boolean(
    !readOnly &&
    sampleId &&
    method &&
    measuredAt &&
    conditionsValid &&
    resultsValid &&
    resultMetadataIssues.length === 0 &&
    evidencePresent &&
    (!profile?.instrument_required || instrumentId) &&
    (!instrumentId ||
      (instrumentVersion !== null && selectedInstrumentSupportsMethod)) &&
    (!profile?.raw_files_required || rawFileCount > 0),
  )
  const missingRequirements = [
    !sampleId ? t('characterizations.workspace.missing.sample') : null,
    !method ? t('characterizations.workspace.missing.method') : null,
    !measuredAt ? t('characterizations.workspace.missing.measuredAt') : null,
    profile?.instrument_required && !instrumentId
      ? t('characterizations.workspace.missing.instrument')
      : null,
    instrumentId && instrumentVersion === null
      ? t('characterizations.workspace.missing.instrumentVersion')
      : null,
    instrumentId &&
    instrumentVersion !== null &&
    !selectedInstrumentSupportsMethod
      ? t('characterizations.workspace.missing.instrumentUnsupported')
      : null,
    ...conditionIssues
      .filter(({ issue }) => issue)
      .map(({ field, issue }) => {
        const label = isEnglish(i18n.language) ? field.label_en : field.label_zh
        return `${label}${isEnglish(i18n.language) ? ': ' : '：'}${issue}`
      }),
    ...(excitationPowerPairIssue ? [excitationPowerPairIssue] : []),
    ...resultIssues,
    ...(spectralIssue
      ? [
          t(`characterizations.workspace.peaks.${spectralIssue}`, {
            defaultValue: spectralIssue,
          }),
        ]
      : []),
    ...resultMetadataIssues,
    profile?.raw_files_required && rawFileCount === 0
      ? t('characterizations.workspace.missing.rawFile')
      : null,
    method && !profile?.raw_files_required && !evidencePresent
      ? t('characterizations.workspace.missing.evidence')
      : null,
  ].filter(Boolean) as string[]

  const mutation = useMutation({
    mutationFn: async () => {
      const uploadedFileIds: string[] = []
      try {
        for (const file of rawFiles) {
          const uploaded = await uploadExperimentFile(token, runId, {
            file,
            sampleId,
            method,
            assetRole: 'characterization_file',
            fileCategory: 'raw',
          })
          uploadedFileIds.push(uploaded.id)
        }
        const properties = allResultDefinitions
          .filter(
            (field): field is ResultDefinition & { propertyCode: string } =>
              Boolean(field.propertyCode && results[field.key]?.trim()),
          )
          .map((field) => {
            const metadata = metadataFor(field.key)
            return {
              property_code: field.propertyCode,
              ...(field.kind === 'text'
                ? { text_value: results[field.key].trim() }
                : {
                    numeric_value: Number(results[field.key]),
                    unit: characterizationProperties[field.propertyCode]?.unit,
                  }),
              quality_flag: metadata.quality,
              ...(metadata.qualityNote.trim()
                ? { quality_note: metadata.qualityNote.trim() }
                : {}),
            }
          }) as unknown as MeasurementPropertyWrite[]
        if (peakUnits.length && peakSeries.status) {
          properties.push({
            property_code: 'spectral_peaks',
            structured_value: peakSeriesValue(
              peakSeries,
              rawIndexes,
              uploadedFileIds,
            ),
          })
        }
        const payload = {
          measurement: {
            sample_id: sampleId,
            method_profile: method,
            ...(instrumentId
              ? {
                  instrument_id: instrumentId,
                  instrument_version: instrumentVersion,
                }
              : {}),
            measured_at: new Date(measuredAt).toISOString(),
            typed_conditions: typedConditions(visibleConditions, conditions),
            raw_file_ids: uploadedFileIds,
          },
          analyses: [],
          properties,
          assertions: [],
        }
        return await createMeasurement(
          payload as unknown as MeasurementBundleCreate,
          token,
        )
      } catch (error) {
        for (const fileId of uploadedFileIds) {
          const uploaded = await getExperimentFile(token, fileId).catch(
            () => null,
          )
          if (uploaded?.characterization_record_id === null) {
            await deleteExperimentFile(token, fileId).catch(() => undefined)
          }
        }
        throw error
      }
    },
    onSuccess: async () => {
      resetDraft()
      setDetailId(null)
      await queryClient.invalidateQueries({
        queryKey: ['measurements', runId],
      })
      await queryClient.invalidateQueries({ queryKey: ['samples'] })
      await queryClient.invalidateQueries({ queryKey: ['characterizations'] })
      toast.success(t('characterizations.workspace.toast.saved'))
    },
    onError: (error) =>
      toast.error(
        resolveErrorMessage(
          error,
          t('characterizations.workspace.toast.saveError'),
        ),
      ),
  })
  const controlsDisabled = readOnly || mutation.isPending

  return (
    <Card id="module-results" tabIndex={-1} className="scroll-mt-20">
      <CardContent className="flex flex-col gap-4">
        <RouteLeaveGuard
          when={hasUnsavedChanges}
          message={t('characterizations.workspace.confirm.leave')}
        />
        <div className="flex flex-col gap-5">
          {!readOnly ? (
            <>
              {samples.isError ? (
                <Alert variant="destructive">
                  <AlertDescription className="flex items-center justify-between gap-3">
                    <span>
                      {resolveErrorMessage(
                        samples.error,
                        t('characterizations.workspace.errors.samples'),
                      )}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={samples.isFetching}
                      onClick={() => void samples.refetch()}
                    >
                      {t('characterizations.workspace.actions.retry')}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
              {run.isError ? (
                <Alert variant="destructive">
                  <AlertDescription className="flex items-center justify-between gap-3">
                    <span>
                      {resolveErrorMessage(
                        run.error,
                        t('characterizations.workspace.errors.run'),
                      )}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={run.isFetching}
                      onClick={() => void run.refetch()}
                    >
                      {t('characterizations.workspace.actions.retry')}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
              <section className="flex flex-col gap-4 rounded-lg border p-4">
                <h2 className="font-medium">
                  {t('characterizations.workspace.sections.selection')}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="characterization-sample">
                      {t('characterizations.workspace.fields.sample')}{' '}
                      <RequiredMark />
                    </Label>
                    <Select
                      value={sampleId}
                      disabled={
                        controlsDisabled ||
                        samples.isLoading ||
                        samples.isError ||
                        run.isLoading ||
                        run.isError
                      }
                      onValueChange={(value) => {
                        if (
                          value !== sampleId &&
                          hasUnsavedChanges &&
                          !window.confirm(
                            t(
                              'characterizations.workspace.confirm.sampleChange',
                            ),
                          )
                        ) {
                          return
                        }
                        resetDraft()
                        setSampleId(value)
                      }}
                    >
                      <SelectTrigger
                        id="characterization-sample"
                        className="w-full"
                      >
                        <SelectValue
                          placeholder={t(
                            'characterizations.workspace.placeholders.sample',
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {eligibleSamples.map((sample) => (
                            <SelectItem key={sample.id} value={sample.id}>
                              {sample.sample_code} ·{' '}
                              {t(
                                'characterizations.workspace.sampleMeasurements',
                                { count: sample.characterization_count ?? 0 },
                              )}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {!samples.isLoading &&
                    !samples.isError &&
                    !run.isLoading &&
                    !run.isError &&
                    eligibleSamples.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t('characterizations.workspace.emptySamples')}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="characterization-method">
                      {t('characterizations.workspace.fields.method')}{' '}
                      <RequiredMark />
                    </Label>
                    <Select
                      value={method}
                      disabled={controlsDisabled}
                      onValueChange={(value) => {
                        if (
                          value !== method &&
                          hasMethodDraft &&
                          !window.confirm(
                            t(
                              'characterizations.workspace.confirm.methodChange',
                            ),
                          )
                        ) {
                          return
                        }
                        resetDraft()
                        setMethod(value)
                        setPeakSeries(
                          emptyPeakSeries(
                            characterizationProfiles[value]
                              ?.peak_position_units?.[0] ?? '',
                          ),
                        )
                      }}
                    >
                      <SelectTrigger
                        id="characterization-method"
                        className="w-full"
                      >
                        <SelectValue
                          placeholder={t(
                            'characterizations.workspace.placeholders.method',
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {METHOD_ORDER.map((value) => (
                            <SelectItem key={value} value={value}>
                              {isEnglish(i18n.language)
                                ? characterizationProfiles[value].label_en
                                : characterizationProfiles[value].label_zh}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              <section className="flex flex-col gap-4 rounded-lg border p-4">
                <h2 className="font-medium">
                  {t('characterizations.workspace.sections.measurement')}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="characterization-measured-at">
                      {t('characterizations.workspace.fields.measuredAt')}{' '}
                      <RequiredMark />
                    </Label>
                    <Input
                      id="characterization-measured-at"
                      type="datetime-local"
                      value={measuredAt}
                      disabled={controlsDisabled}
                      required
                      onInput={(event) =>
                        setMeasuredAt(event.currentTarget.value)
                      }
                    />
                  </div>
                  {profile ? (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="characterization-instrument">
                        {t('characterizations.workspace.fields.instrument')}
                        {profile.instrument_required ? <RequiredMark /> : null}
                      </Label>
                      <EntityReferenceSelect
                        kind="instrument"
                        value={instrumentId}
                        triggerId="characterization-instrument"
                        disabled={controlsDisabled}
                        clearable
                        selectedVersion={instrumentVersion}
                        selectedSnapshot={instrumentSnapshot}
                        onChange={(id, entity) => {
                          setInstrumentId(id)
                          setInstrumentVersion(
                            entity?.latest_version?.version ?? null,
                          )
                          setInstrumentSnapshot(
                            entity?.latest_version?.data ?? null,
                          )
                        }}
                      />
                      {instrumentId ? (
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="characterization-instrument-version">
                            {t(
                              'characterizations.workspace.fields.instrumentVersion',
                            )}{' '}
                            <RequiredMark />
                          </Label>
                          <Select
                            value={
                              instrumentVersion == null
                                ? ''
                                : String(instrumentVersion)
                            }
                            disabled={
                              controlsDisabled ||
                              instrumentVersions.isLoading ||
                              instrumentVersions.isError
                            }
                            onValueChange={(value) => {
                              const version =
                                instrumentVersions.data?.items.find(
                                  (item) => item.version === Number(value),
                                )
                              if (!version) return
                              setInstrumentVersion(version.version)
                              setInstrumentSnapshot(version.data)
                            }}
                          >
                            <SelectTrigger
                              id="characterization-instrument-version"
                              className="w-full"
                              aria-invalid={
                                !selectedInstrumentSupportsMethod || undefined
                              }
                            >
                              <SelectValue
                                placeholder={t(
                                  'characterizations.workspace.placeholders.instrumentVersion',
                                )}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {[...(instrumentVersions.data?.items ?? [])]
                                  .sort(
                                    (left, right) =>
                                      right.version - left.version,
                                  )
                                  .map((version) => {
                                    const supported = instrumentSupportsMethod(
                                      version.data,
                                      method,
                                    )
                                    return (
                                      <SelectItem
                                        key={version.id}
                                        value={String(version.version)}
                                        disabled={!supported}
                                      >
                                        v{version.version} ·{' '}
                                        {new Date(
                                          version.created_at,
                                        ).toLocaleDateString()}
                                        {supported
                                          ? ''
                                          : ` · ${t('characterizations.workspace.instrument.unsupported')}`}
                                      </SelectItem>
                                    )
                                  })}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          {instrumentVersions.isLoading ? (
                            <Skeleton className="h-8 w-full rounded-md" />
                          ) : instrumentVersions.isError ? (
                            <div
                              className="flex items-center justify-between gap-2 text-xs text-destructive"
                              role="alert"
                            >
                              <span>
                                {t(
                                  'characterizations.workspace.errors.instrumentVersions',
                                )}
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={instrumentVersions.isFetching}
                                onClick={() =>
                                  void instrumentVersions.refetch()
                                }
                              >
                                {t('characterizations.workspace.actions.retry')}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {commonConditions.length ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {commonConditions.map((field) => (
                      <ConditionInput
                        key={field.key}
                        field={field}
                        conditions={conditions}
                        required={requiredConditionKeys.includes(field.key)}
                        language={i18n.language}
                        issue={characterizationConditionIssue(
                          field,
                          conditions,
                          requiredConditionKeys.includes(field.key),
                          i18n.language,
                        )}
                        disabled={controlsDisabled}
                        onChange={updateCondition}
                      />
                    ))}
                  </div>
                ) : null}
                {extraConditions.length ? (
                  <details className="rounded-lg border p-3">
                    <summary className="cursor-pointer font-medium">
                      {t('characterizations.workspace.actions.moreConditions')}
                    </summary>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {extraConditions.map((field) => (
                        <ConditionInput
                          key={field.key}
                          field={field}
                          conditions={conditions}
                          language={i18n.language}
                          issue={characterizationConditionIssue(
                            field,
                            conditions,
                            false,
                            i18n.language,
                          )}
                          disabled={controlsDisabled}
                          onChange={updateCondition}
                        />
                      ))}
                    </div>
                  </details>
                ) : null}
              </section>

              <section className="flex flex-col gap-3 rounded-lg border p-4">
                <h2 className="font-medium">
                  {t('characterizations.workspace.sections.rawData')}
                </h2>
                <Label htmlFor="characterization-raw-files">
                  {t('characterizations.workspace.fields.rawFiles')}
                  {profile?.raw_files_required ? <RequiredMark /> : null}
                </Label>
                <Input
                  ref={fileInputRef}
                  id="characterization-raw-files"
                  type="file"
                  multiple
                  disabled={controlsDisabled}
                  required={profile?.raw_files_required}
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? [])
                    setRawFiles((current) => [...current, ...files])
                    event.target.value = ''
                  }}
                />
                {rawFiles.length ? (
                  <ul
                    className="flex flex-col gap-2 text-sm"
                    aria-label={t('characterizations.workspace.selectedFiles')}
                  >
                    {rawFiles.map((file, index) => (
                      <li
                        key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {file.name}
                        </span>
                        <Badge variant="outline">
                          {t('characterizations.workspace.fields.rawFile')}
                        </Badge>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={controlsDisabled}
                          aria-label={t(
                            'characterizations.workspace.actions.removeFile',
                            { filename: file.name },
                          )}
                          onClick={() => removeRawFile(index)}
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section className="flex flex-col gap-4 rounded-lg border p-4">
                <h2 className="font-medium">
                  {t('characterizations.workspace.sections.results')}
                </h2>
                {peakUnits.length ||
                allResultDefinitions.some(
                  (field) => field.kind === 'number',
                ) ? (
                  <p className="text-sm text-muted-foreground">
                    {t('characterizations.workspace.resultSourceHelp')}
                  </p>
                ) : null}
                {method &&
                resultDefinitions.length === 0 &&
                !peakUnits.length ? (
                  <p className="text-sm text-muted-foreground">
                    {t('characterizations.workspace.noPresetResults')}
                  </p>
                ) : null}
                {peakUnits.length ? (
                  <SpectralPeaksEditor
                    value={peakSeries}
                    onChange={setPeakSeries}
                    units={peakUnits}
                    method={method}
                    rawFiles={rawFiles}
                    rawIndexes={rawIndexes}
                    disabled={controlsDisabled}
                  />
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  {resultDefinitions.map((field) => (
                    <ResultInput
                      key={field.key}
                      field={field}
                      value={results[field.key] ?? ''}
                      metadata={metadataFor(field.key)}
                      language={i18n.language}
                      disabled={controlsDisabled}
                      onChange={(value) => updateResult(field, value)}
                      onMetadataChange={(value) =>
                        updateResultMetadata(field.key, value)
                      }
                    />
                  ))}
                </div>
                {resultConditions.length ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {resultConditions.map((field) => (
                      <ConditionInput
                        key={field.key}
                        field={field}
                        conditions={conditions}
                        required={requiredConditionKeys.includes(field.key)}
                        language={i18n.language}
                        disabled={controlsDisabled}
                        issue={characterizationConditionIssue(
                          field,
                          conditions,
                          requiredConditionKeys.includes(field.key),
                          i18n.language,
                        )}
                        onChange={updateCondition}
                      />
                    ))}
                  </div>
                ) : null}
                {advancedResultDefinitions.length ? (
                  <details className="rounded-lg border p-3">
                    <summary className="cursor-pointer font-medium">
                      {t('characterizations.workspace.actions.moreResults')}
                    </summary>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {advancedResultDefinitions.map((field) => (
                        <ResultInput
                          key={field.key}
                          field={field}
                          value={results[field.key] ?? ''}
                          metadata={metadataFor(field.key)}
                          language={i18n.language}
                          disabled={controlsDisabled}
                          onChange={(value) => updateResult(field, value)}
                          onMetadataChange={(value) =>
                            updateResultMetadata(field.key, value)
                          }
                        />
                      ))}
                    </div>
                  </details>
                ) : null}
              </section>

              <section className="flex flex-col items-end gap-3 rounded-lg border p-4">
                <h2 className="w-full font-medium">
                  {t('characterizations.workspace.sections.save')}
                </h2>
                {!canSubmit && missingRequirements.length ? (
                  <div
                    className="w-full text-sm text-muted-foreground"
                    aria-live="polite"
                  >
                    <p>{t('characterizations.workspace.missing.title')}</p>
                    <ul className="mt-1 list-disc pl-5">
                      {missingRequirements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <Button
                  type="button"
                  disabled={!canSubmit || mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  {mutation.isPending
                    ? t('characterizations.workspace.actions.saving')
                    : t('characterizations.workspace.actions.save')}
                </Button>
              </section>
            </>
          ) : null}

          <section className="flex flex-col gap-3">
            <h2 className="font-medium">
              {t('characterizations.workspace.sections.existing')}
            </h2>
            {measurements.isError ? (
              <Alert variant="destructive">
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span>
                    {resolveErrorMessage(
                      measurements.error,
                      t('characterizations.workspace.errors.measurements'),
                    )}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={measurements.isFetching}
                    onClick={() => void measurements.refetch()}
                  >
                    {t('characterizations.workspace.actions.retry')}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : measurements.isLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
              </div>
            ) : measurements.data?.items.length ? (
              <div className="flex flex-col gap-3">
                {measurements.data.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-lg border p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{item.sample_code}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(item.measured_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {(isEnglish(i18n.language)
                            ? characterizationProfiles[item.method_profile]
                                ?.label_en
                            : characterizationProfiles[item.method_profile]
                                ?.label_zh) ?? item.method_profile}
                        </Badge>
                        {item.quality_flag !== 'valid' ? (
                          <Badge
                            variant={
                              item.quality_flag === 'invalid'
                                ? 'destructive'
                                : 'outline'
                            }
                          >
                            {t(
                              `characterizations.workspace.measurementQuality.${item.quality_flag}`,
                              { defaultValue: item.quality_flag },
                            )}
                          </Badge>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-expanded={detailId === item.id}
                          aria-controls={`measurement-details-${item.id}`}
                          onClick={() =>
                            setDetailId((current) =>
                              current === item.id ? null : item.id,
                            )
                          }
                        >
                          {detailId === item.id
                            ? t(
                                'characterizations.workspace.actions.hideDetails',
                              )
                            : t(
                                'characterizations.workspace.actions.viewDetails',
                              )}
                        </Button>
                      </div>
                    </div>
                    {detailId === item.id ? (
                      <div
                        id={`measurement-details-${item.id}`}
                        role="region"
                        aria-label={t(
                          'characterizations.workspace.detailRegion',
                          { sample: item.sample_code },
                        )}
                      >
                        <MeasurementDetails
                          measurementId={item.id}
                          token={token}
                          allowInvalidate={!readOnly}
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {t('characterizations.workspace.noMeasurements')}
              </p>
            )}
          </section>
        </div>
      </CardContent>
    </Card>
  )
}
