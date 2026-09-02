import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { X } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import type {
  MeasurementBundleCreate,
  MeasurementPropertyQuality,
  MeasurementQuality,
} from './api'
import { EntityReferenceSelect } from './components/entity-reference-select'
import { ModuleCard } from './components/module-card'

export const METHOD_ORDER = [
  'optical_microscopy',
  'Raman',
  'low_frequency_raman',
  'PL',
  'AFM',
  'SEM',
  'XRD',
  'TEM',
  'other',
] as const

const PROPERTY_QUALITY_OPTIONS: MeasurementPropertyQuality[] = [
  'valid',
  'below_detection_limit',
  'suspect',
  'invalid',
]

type ResultDefinition = {
  key: string
  label: string
  kind: 'number' | 'text' | 'growth' | 'layer_count'
  propertyCode?: string
  assertionType?:
    | 'phase_identity'
    | 'polytype'
    | 'stacking_order'
    | 'orientation_relationship'
  unit?: string
  required?: boolean
  calculated?: boolean
}

type MeasurementPropertyWrite = NonNullable<
  MeasurementBundleCreate['properties']
>[number]
type MeasurementAssertionWrite = NonNullable<
  MeasurementBundleCreate['assertions']
>[number]
type SampleRegionWrite = NonNullable<
  MeasurementBundleCreate['measurement']['sample_region']
>
type RegionGeometry = SampleRegionWrite['geometry_type']
type RegionDraft = {
  geometryType: RegionGeometry
  label: string
  x: string
  y: string
  width: string
  height: string
  unit: string
  imageFileIndex: number | null
  pixelX: string
  pixelY: string
  pixelWidth: string
  pixelHeight: string
}
type AssertionType = MeasurementAssertionWrite['assertion_type']
type CompositionBasis = 'site_fraction' | 'atomic_fraction' | 'mass_fraction'
type CompositionComponentDraft = {
  id: number
  species: string
  fraction: string
}
type AnalysisDraft = {
  softwareName: string
  softwareVersion: string
  codeCommit: string
  startedAt: string
  completedAt: string
}
type AnalysisParameterDraft = {
  id: number
  key: string
  value: string
}
type ResultMetadataDraft = {
  quality: MeasurementPropertyQuality
  qualityNote: string
  statistic: NonNullable<MeasurementPropertyWrite['statistic']>
  sampleCount: string
  uncertaintyValue: string
  uncertaintyType: string
  confidence: string
}

const DEFAULT_REGION: RegionDraft = {
  geometryType: 'whole_sample',
  label: 'whole_sample',
  x: '',
  y: '',
  width: '',
  height: '',
  unit: 'μm',
  imageFileIndex: null,
  pixelX: '',
  pixelY: '',
  pixelWidth: '',
  pixelHeight: '',
}
const DEFAULT_ANALYSIS: AnalysisDraft = {
  softwareName: '',
  softwareVersion: '',
  codeCommit: '',
  startedAt: '',
  completedAt: '',
}
const ASSERTION_TYPES: AssertionType[] = [
  'growth_presence',
  'phase_identity',
  'composition',
  'polytype',
  'stacking_order',
  'orientation_relationship',
  'layer_count',
]

function isAssertionType(value: string): value is AssertionType {
  return ASSERTION_TYPES.includes(value as AssertionType)
}

function resultAssertionType(field: ResultDefinition): AssertionType | null {
  if (field.kind === 'growth') return 'growth_presence'
  if (field.kind === 'layer_count') return 'layer_count'
  return field.assertionType ?? null
}

const DEFAULT_RESULT_METADATA: ResultMetadataDraft = {
  quality: 'valid',
  qualityNote: '',
  statistic: 'single_observation',
  sampleCount: '',
  uncertaintyValue: '',
  uncertaintyType: '',
  confidence: '',
}

function localDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function regionPayload(
  region: RegionDraft,
  uploadedFileIds: string[],
): SampleRegionWrite {
  const optionalNumber = (value: string) =>
    value.trim() ? Number(value) : undefined
  const x = optionalNumber(region.x)
  const y = optionalNumber(region.y)
  const width = optionalNumber(region.width)
  const height = optionalNumber(region.height)
  const hasCoordinates =
    x !== undefined ||
    y !== undefined ||
    width !== undefined ||
    height !== undefined
  const imageFileId =
    region.imageFileIndex === null
      ? undefined
      : uploadedFileIds[region.imageFileIndex]
  return {
    geometry_type: region.geometryType,
    label: region.label.trim(),
    coordinate_system: 'sample_local',
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y }),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(hasCoordinates ? { unit: region.unit.trim() } : {}),
    ...(imageFileId
      ? {
          image_file_id: imageFileId,
          pixel_roi: {
            x: Number(region.pixelX),
            y: Number(region.pixelY),
            width: Number(region.pixelWidth),
            height: Number(region.pixelHeight),
          },
        }
      : {}),
  }
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
  if (!value || field.kind === 'growth') return null
  if (field.assertionType && value.length > 256) {
    return translate('textMax', { label, max: 256 })
  }
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
  if (
    field.kind === 'layer_count' &&
    (!Number.isInteger(number) || number < 0)
  ) {
    return translate('nonNegativeInteger', { label })
  }
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

export function instrumentSupportsMethod(
  data: Record<string, unknown>,
  method: string,
) {
  const capabilities = data.capabilities
  if (Array.isArray(capabilities) && capabilities.length > 0) {
    return capabilities.some((capability) => {
      if (typeof capability === 'string') return capability === method
      if (!capability || typeof capability !== 'object') return false
      return (capability as Record<string, unknown>).code === method
    })
  }
  return data.name_type === method || data.name_type === 'other'
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

export const SIMPLE_RESULTS: Record<string, ResultDefinition[]> = {
  optical_microscopy: [
    {
      key: 'growth',
      label: '是否观察到生长',
      kind: 'growth',
    },
    {
      key: 'coverage',
      label: '覆盖率',
      kind: 'number',
      unit: '%',
      propertyCode: 'coverage_percent',
    },
    {
      key: 'observation',
      label: '观察说明',
      kind: 'text',
      propertyCode: 'observation_note',
    },
  ],
  Raman: [
    {
      key: 'e2g',
      label: 'E₂g 峰位',
      kind: 'number',
      unit: 'cm⁻¹',
      propertyCode: 'raman_e2g_peak_position',
    },
    {
      key: 'a1g',
      label: 'A₁g 峰位',
      kind: 'number',
      unit: 'cm⁻¹',
      propertyCode: 'raman_a1g_peak_position',
    },
    {
      key: 'separation',
      label: '峰间距',
      kind: 'number',
      unit: 'cm⁻¹',
      propertyCode: 'raman_peak_separation',
      calculated: true,
    },
    {
      key: 'phase',
      label: '物相',
      kind: 'text',
      assertionType: 'phase_identity',
    },
    { key: 'layers', label: '层数结论', kind: 'layer_count' },
  ],
  low_frequency_raman: [
    {
      key: 'shear',
      label: '剪切模峰位',
      kind: 'number',
      unit: 'cm⁻¹',
      propertyCode: 'shear_mode_peak_position',
    },
    {
      key: 'fwhm',
      label: '峰宽',
      kind: 'number',
      unit: 'cm⁻¹',
      propertyCode: 'low_frequency_peak_fwhm',
    },
    {
      key: 'stacking',
      label: '堆叠结论',
      kind: 'text',
      assertionType: 'stacking_order',
    },
  ],
  PL: [
    {
      key: 'a_exciton',
      label: 'A 激子峰能量',
      kind: 'number',
      unit: 'eV',
      propertyCode: 'pl_a_exciton_peak_energy',
    },
    {
      key: 'b_exciton',
      label: 'B 激子峰能量',
      kind: 'number',
      unit: 'eV',
      propertyCode: 'pl_b_exciton_peak_energy',
    },
    {
      key: 'intensity',
      label: '积分强度',
      kind: 'number',
      unit: 'a.u.',
      propertyCode: 'pl_integrated_intensity',
    },
  ],
  AFM: [
    {
      key: 'rms',
      label: 'RMS 粗糙度',
      kind: 'number',
      unit: 'nm',
      propertyCode: 'afm_rms_roughness',
    },
    {
      key: 'step',
      label: '台阶高度',
      kind: 'number',
      unit: 'nm',
      propertyCode: 'afm_step_height',
    },
    { key: 'layers', label: '层数结论', kind: 'layer_count' },
  ],
  SEM: [
    {
      key: 'coverage',
      label: '覆盖率',
      kind: 'number',
      unit: '%',
      propertyCode: 'coverage_percent',
    },
    {
      key: 'domain',
      label: '晶畴尺寸',
      kind: 'number',
      unit: 'μm',
      propertyCode: 'domain_size_um',
    },
    { key: 'growth', label: '是否观察到生长', kind: 'growth' },
  ],
  XRD: [
    {
      key: 'peak',
      label: '衍射峰位',
      kind: 'number',
      unit: '2θ',
      propertyCode: 'xrd_peak_2theta',
    },
    {
      key: 'spacing',
      label: '晶面间距',
      kind: 'number',
      unit: 'nm',
      propertyCode: 'xrd_d_spacing',
    },
    {
      key: 'phase',
      label: '物相',
      kind: 'text',
      assertionType: 'phase_identity',
    },
  ],
  TEM: [
    {
      key: 'spacing',
      label: '晶格间距',
      kind: 'number',
      unit: 'nm',
      propertyCode: 'tem_lattice_spacing',
    },
    {
      key: 'phase',
      label: '物相',
      kind: 'text',
      assertionType: 'phase_identity',
    },
    {
      key: 'stacking',
      label: '堆叠结论',
      kind: 'text',
      assertionType: 'stacking_order',
    },
  ],
  other: [
    {
      key: 'observation',
      label: '观察说明',
      kind: 'text',
      propertyCode: 'observation_note',
    },
  ],
}

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
    return numbers[0] >= 0 && numbers[1] > numbers[0]
      ? null
      : translate('range')
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
  if (
    numbers.some(
      (value) =>
        (typeof ge === 'number' && value < ge) ||
        (typeof gt === 'number' && value <= gt) ||
        (typeof le === 'number' && value > le) ||
        (typeof lt === 'number' && value >= lt),
    )
  ) {
    return translate('conditionRange')
  }
  return numbers.every((value) => value > 0)
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

function sampleResultLabel(
  state: string,
  material: string | null | undefined,
  language: string,
) {
  if (material) return material
  return i18nInstance.t(`characterizations.workspace.sampleStates.${state}`, {
    lng: language,
    defaultValue: i18nInstance.t(
      'characterizations.workspace.sampleStates.unknown',
      { lng: language },
    ),
  })
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
                  min={field.value_type === 'resolution' ? '1' : '0'}
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
              ? t('characterizations.workspace.placeholders.textCondition')
              : undefined
          }
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      )}
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
  const textMaxLength = field.assertionType
    ? 256
    : typeof propertyMaxLength === 'number'
      ? propertyMaxLength
      : undefined

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
      {field.kind === 'growth' ? (
        <Select value={value} disabled={disabled} onValueChange={onChange}>
          <SelectTrigger
            id={inputId}
            className="w-full"
            aria-invalid={Boolean(issue) || undefined}
            aria-describedby={describedBy || undefined}
          >
            <SelectValue
              placeholder={t('characterizations.workspace.placeholders.select')}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="present">
                {t('characterizations.workspace.growth.present')}
              </SelectItem>
              <SelectItem value="absent">
                {t('characterizations.workspace.growth.absent')}
              </SelectItem>
              <SelectItem value="uncertain">
                {t('characterizations.workspace.growth.uncertain')}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : field.kind === 'text' ? (
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
          min={field.kind === 'layer_count' ? 0 : bounds.min}
          max={bounds.max}
          step={field.kind === 'layer_count' ? 1 : 'any'}
          value={value}
          disabled={disabled}
          readOnly={field.calculated}
          aria-invalid={Boolean(issue) || undefined}
          aria-describedby={describedBy || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {field.propertyCode && hasValue ? (
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {t('characterizations.workspace.actions.resultMetadata')}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${inputId}-quality`}>
                {t('characterizations.workspace.fields.resultQuality')}
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
                          {t(
                            `characterizations.workspace.propertyQuality.${qualityOption}`,
                          )}
                        </SelectItem>
                      ) : null,
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            {field.kind === 'number' ? (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${inputId}-statistic`}>
                    {t('characterizations.workspace.fields.statistic')}
                  </Label>
                  <Select
                    value={metadata.statistic}
                    disabled={disabled}
                    onValueChange={(statistic) =>
                      onMetadataChange({
                        statistic:
                          statistic as ResultMetadataDraft['statistic'],
                      })
                    }
                  >
                    <SelectTrigger
                      id={`${inputId}-statistic`}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        [
                          'single_observation',
                          'mean',
                          'median',
                          'min',
                          'max',
                        ] as const
                      ).map((statistic) => (
                        <SelectItem key={statistic} value={statistic}>
                          {t(
                            `characterizations.workspace.statistics.${statistic}`,
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${inputId}-sample-count`}>
                    {t('characterizations.workspace.fields.sampleCount')}
                  </Label>
                  <Input
                    id={`${inputId}-sample-count`}
                    type="number"
                    min="1"
                    step="1"
                    value={metadata.sampleCount}
                    disabled={disabled}
                    onChange={(event) =>
                      onMetadataChange({ sampleCount: event.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${inputId}-uncertainty`}>
                    {t('characterizations.workspace.fields.uncertainty')}
                  </Label>
                  <Input
                    id={`${inputId}-uncertainty`}
                    type="number"
                    min="0"
                    step="any"
                    value={metadata.uncertaintyValue}
                    disabled={disabled}
                    onChange={(event) =>
                      onMetadataChange({ uncertaintyValue: event.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${inputId}-uncertainty-type`}>
                    {t('characterizations.workspace.fields.uncertaintyType')}
                  </Label>
                  <Input
                    id={`${inputId}-uncertainty-type`}
                    value={metadata.uncertaintyType}
                    maxLength={64}
                    disabled={disabled}
                    placeholder={t(
                      'characterizations.workspace.placeholders.uncertaintyType',
                    )}
                    onChange={(event) =>
                      onMetadataChange({ uncertaintyType: event.target.value })
                    }
                  />
                </div>
              </>
            ) : null}
            {metadata.quality !== 'valid' ? (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor={`${inputId}-quality-note`}>
                  {t('characterizations.workspace.fields.qualityNote')}{' '}
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
      {!field.propertyCode && hasValue ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${inputId}-confidence`}>
            {t('characterizations.workspace.fields.confidence')}
          </Label>
          <Input
            id={`${inputId}-confidence`}
            type="number"
            min="0"
            max="1"
            step="any"
            value={metadata.confidence}
            disabled={disabled}
            onChange={(event) =>
              onMetadataChange({ confidence: event.target.value })
            }
          />
        </div>
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
  const [qualityFlag, setQualityFlag] = useState<MeasurementQuality>('valid')
  const [qualityNote, setQualityNote] = useState('')
  const [region, setRegion] = useState<RegionDraft>(DEFAULT_REGION)
  const [conditions, setConditions] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, string>>({})
  const [resultMetadata, setResultMetadata] = useState<
    Record<string, ResultMetadataDraft>
  >({})
  const [compositionBasis, setCompositionBasis] =
    useState<CompositionBasis>('atomic_fraction')
  const [compositionComponents, setCompositionComponents] = useState<
    CompositionComponentDraft[]
  >([])
  const nextCompositionId = useRef(1)
  const [compositionConfidence, setCompositionConfidence] = useState('')
  const [analysis, setAnalysis] = useState<AnalysisDraft>(DEFAULT_ANALYSIS)
  const [analysisParameters, setAnalysisParameters] = useState<
    AnalysisParameterDraft[]
  >([])
  const nextAnalysisParameterId = useRef(1)
  const [analysisInputIndexes, setAnalysisInputIndexes] = useState<number[]>([])
  const [analysisOutputIndexes, setAnalysisOutputIndexes] = useState<number[]>(
    [],
  )
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
    setResults((current) => {
      const next = { ...current, [field.key]: value }
      if (method === 'Raman' && ['e2g', 'a1g'].includes(field.key)) {
        const e2g = Number(field.key === 'e2g' ? value : next.e2g)
        const a1g = Number(field.key === 'a1g' ? value : next.a1g)
        next.separation =
          Number.isFinite(e2g) && Number.isFinite(a1g) && next.e2g && next.a1g
            ? String(Math.abs(a1g - e2g))
            : ''
      }
      return next
    })
  const removeRawFile = (removedIndex: number) => {
    setRawFiles((current) =>
      current.filter((_, index) => index !== removedIndex),
    )
    const shiftIndexes = (indexes: number[]) =>
      indexes
        .filter((index) => index !== removedIndex)
        .map((index) => (index > removedIndex ? index - 1 : index))
    setAnalysisInputIndexes(shiftIndexes)
    setAnalysisOutputIndexes(shiftIndexes)
    setRegion((current) => ({
      ...current,
      imageFileIndex:
        current.imageFileIndex === removedIndex
          ? null
          : current.imageFileIndex !== null &&
              current.imageFileIndex > removedIndex
            ? current.imageFileIndex - 1
            : current.imageFileIndex,
      ...(current.imageFileIndex === removedIndex
        ? { pixelX: '', pixelY: '', pixelWidth: '', pixelHeight: '' }
        : {}),
    }))
  }
  const updateCondition = (key: string, value: string) => {
    setConditions((current) => ({ ...current, [key]: value }))
    if (
      key === 'mode' &&
      !(
        (method === 'SEM' && value === 'EDS') ||
        (method === 'TEM' && ['EDS', 'EELS'].includes(value))
      )
    ) {
      setCompositionComponents([])
      setCompositionConfidence('')
    }
  }

  const profile = characterizationProfiles[method]
  const resultDefinitions = (SIMPLE_RESULTS[method] ?? []).filter(
    (field) => field.kind !== 'growth' || profile?.show_growth_presence,
  )
  const advancedResultDefinitions: ResultDefinition[] = (
    profile?.allowed_property_codes ?? []
  )
    .filter(
      (propertyCode) =>
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
  const coveredAssertionTypes = new Set(
    resultDefinitions
      .map(resultAssertionType)
      .filter((value): value is AssertionType => value !== null),
  )
  const advancedAssertionTypes = (profile?.allowed_assertion_types ?? [])
    .filter(isAssertionType)
    .filter(
      (assertionType) =>
        assertionType !== 'composition' ||
        (method === 'SEM' && conditions.mode === 'EDS') ||
        (method === 'TEM' && ['EDS', 'EELS'].includes(conditions.mode)),
    )
    .filter((assertionType) => !coveredAssertionTypes.has(assertionType))
  const advancedAssertionDefinitions: ResultDefinition[] =
    advancedAssertionTypes
      .filter((assertionType) => assertionType !== 'composition')
      .map((assertionType) => ({
        key: `advanced_assertion_${assertionType}`,
        label: t(`characterizations.details.assertionTypes.${assertionType}`, {
          defaultValue: assertionType,
        }),
        kind:
          assertionType === 'growth_presence'
            ? 'growth'
            : assertionType === 'layer_count'
              ? 'layer_count'
              : 'text',
        ...(assertionType === 'growth_presence' ||
        assertionType === 'layer_count'
          ? {}
          : { assertionType }),
      }))
  const allResultDefinitions = [
    ...resultDefinitions,
    ...advancedResultDefinitions,
    ...advancedAssertionDefinitions,
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
  const requiredConditions = (profile?.condition_fields ?? []).filter((field) =>
    profile.required_condition_keys.includes(field.key),
  )
  const optionalConditions = (profile?.condition_fields ?? []).filter((field) =>
    profile.optional_condition_keys.includes(field.key),
  )
  const rawFileCount = rawFiles.length - analysisOutputIndexes.length
  const evidencePresent =
    rawFileCount > 0 ||
    allResultDefinitions.some((field) => results[field.key]?.trim()) ||
    compositionComponents.length > 0
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
      ? t('characterizations.workspace.validation.powerPair')
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
  const resultsValid = resultIssues.length === 0
  const resultMetadataIssues = allResultDefinitions.flatMap((field) => {
    if (!results[field.key]?.trim()) return []
    const metadata = metadataFor(field.key)
    const issues = [
      field.propertyCode &&
      metadata.quality !== 'valid' &&
      !metadata.qualityNote.trim()
        ? t('characterizations.workspace.missing.qualityNote')
        : null,
      field.propertyCode &&
      ((metadata.statistic !== 'single_observation' &&
        !metadata.sampleCount.trim()) ||
        (metadata.sampleCount.trim() &&
          (!Number.isInteger(Number(metadata.sampleCount)) ||
            Number(metadata.sampleCount) < 1)))
        ? t('characterizations.workspace.missing.sampleCount')
        : null,
      field.propertyCode &&
      Boolean(metadata.uncertaintyValue.trim()) !==
        Boolean(metadata.uncertaintyType.trim())
        ? t('characterizations.workspace.missing.uncertaintyPair')
        : null,
      field.propertyCode &&
      metadata.uncertaintyValue.trim() &&
      (!Number.isFinite(Number(metadata.uncertaintyValue)) ||
        Number(metadata.uncertaintyValue) < 0)
        ? t('characterizations.workspace.missing.uncertaintyValue')
        : null,
      !field.propertyCode &&
      metadata.confidence.trim() &&
      (!Number.isFinite(Number(metadata.confidence)) ||
        Number(metadata.confidence) < 0 ||
        Number(metadata.confidence) > 1)
        ? t('characterizations.workspace.missing.confidence')
        : null,
    ].filter(Boolean) as string[]
    return issues.map(
      (issue) => `${resultFieldLabel(field, i18n.language)}：${issue}`,
    )
  })
  const compositionIssues = compositionComponents.length
    ? ([
        compositionComponents.some(
          (component) =>
            !component.species.trim() || component.species.trim().length > 128,
        )
          ? t('characterizations.workspace.advanced.compositionSpecies')
          : null,
        compositionComponents.some(
          (component) =>
            !component.fraction.trim() ||
            !Number.isFinite(Number(component.fraction)) ||
            Number(component.fraction) < 0 ||
            Number(component.fraction) > 1,
        )
          ? t('characterizations.workspace.advanced.compositionFraction')
          : null,
        new Set(
          compositionComponents.map((component) => component.species.trim()),
        ).size !== compositionComponents.length
          ? t('characterizations.workspace.advanced.compositionUnique')
          : null,
        Math.abs(
          compositionComponents.reduce(
            (sum, component) => sum + Number(component.fraction || 0),
            0,
          ) - 1,
        ) > 1e-6
          ? t('characterizations.workspace.advanced.compositionSum')
          : null,
        compositionConfidence.trim() &&
        (!Number.isFinite(Number(compositionConfidence)) ||
          Number(compositionConfidence) < 0 ||
          Number(compositionConfidence) > 1)
          ? t('characterizations.workspace.missing.confidence')
          : null,
      ].filter(Boolean) as string[])
    : []
  const analysisParameterIssues = [
    analysisParameters.some(
      (parameter) =>
        Boolean(parameter.key.trim()) !== Boolean(parameter.value.trim()),
    )
      ? t('characterizations.workspace.advanced.analysisParameterPair')
      : null,
    new Set(
      analysisParameters
        .map((parameter) => parameter.key.trim())
        .filter(Boolean),
    ).size !==
    analysisParameters.filter((parameter) => parameter.key.trim()).length
      ? t('characterizations.workspace.advanced.analysisParameterUnique')
      : null,
  ].filter(Boolean) as string[]
  const parsedAnalysisParameters = Object.fromEntries(
    analysisParameters
      .filter((parameter) => parameter.key.trim() && parameter.value.trim())
      .map((parameter) => [parameter.key.trim(), parameter.value.trim()]),
  )
  const analysisRequested = Boolean(
    analysis.softwareName.trim() ||
    analysis.softwareVersion.trim() ||
    analysis.codeCommit.trim() ||
    analysis.startedAt ||
    analysis.completedAt ||
    analysisParameters.length ||
    analysisInputIndexes.length ||
    analysisOutputIndexes.length,
  )
  const analysisIssues = analysisRequested
    ? ([
        !analysis.softwareName.trim() ||
        analysis.softwareName.trim().length > 128
          ? t('characterizations.workspace.advanced.analysisSoftware')
          : null,
        !analysis.softwareVersion.trim() ||
        analysis.softwareVersion.trim().length > 128
          ? t('characterizations.workspace.advanced.analysisVersion')
          : null,
        analysis.codeCommit.trim().length > 128
          ? t('characterizations.workspace.advanced.analysisCommit')
          : null,
        !analysis.startedAt
          ? t('characterizations.workspace.advanced.analysisStartedAt')
          : null,
        analysis.completedAt &&
        analysis.startedAt &&
        new Date(analysis.completedAt) < new Date(analysis.startedAt)
          ? t('characterizations.workspace.advanced.analysisInterval')
          : null,
        ...analysisParameterIssues,
        analysisInputIndexes.length === 0
          ? t('characterizations.workspace.advanced.analysisInput')
          : null,
      ].filter(Boolean) as string[])
    : []
  const coordinateValues = [region.x, region.y, region.width, region.height]
  const hasCoordinateValue = coordinateValues.some((value) => value.trim())
  const finiteCoordinates = coordinateValues.every(
    (value) => !value.trim() || Number.isFinite(Number(value)),
  )
  const geometryRegionIssues = [
    !region.label.trim()
      ? t('characterizations.workspace.missing.regionLabel')
      : null,
    region.label.trim().length > 128
      ? t('characterizations.workspace.missing.regionLabelMax', { max: 128 })
      : null,
    Boolean(region.x.trim()) !== Boolean(region.y.trim())
      ? t('characterizations.workspace.missing.coordinatePair')
      : null,
    !finiteCoordinates
      ? t('characterizations.workspace.missing.invalidCoordinate')
      : null,
    region.geometryType === 'line' &&
    (!region.width.trim() || Number(region.width) <= 0)
      ? t('characterizations.workspace.missing.lineLength')
      : null,
    region.geometryType === 'area' &&
    (!region.width.trim() ||
      !region.height.trim() ||
      Number(region.width) <= 0 ||
      Number(region.height) <= 0)
      ? t('characterizations.workspace.missing.areaSize')
      : null,
    hasCoordinateValue && !region.unit.trim()
      ? t('characterizations.workspace.missing.coordinateUnit')
      : null,
    hasCoordinateValue && !['μm', 'mm', 'nm', 'px'].includes(region.unit)
      ? t('characterizations.workspace.missing.coordinateUnitUnsupported')
      : null,
    profile && !profile.allowed_region_types.includes(region.geometryType)
      ? t('characterizations.workspace.missing.regionUnsupported')
      : null,
  ].filter(Boolean) as string[]
  const selectedRegionImage =
    region.imageFileIndex === null ? null : rawFiles[region.imageFileIndex]
  const regionImageOptions = rawFiles.flatMap((file, index) =>
    file.type.startsWith('image/') && !analysisOutputIndexes.includes(index)
      ? [{ file, index }]
      : [],
  )
  const pixelRoiValues = [
    region.pixelX,
    region.pixelY,
    region.pixelWidth,
    region.pixelHeight,
  ]
  const regionImageIssues = [
    region.geometryType === 'selected_area' && region.imageFileIndex === null
      ? t('characterizations.workspace.missing.selectedAreaImage')
      : null,
    region.imageFileIndex !== null &&
    (!selectedRegionImage ||
      !selectedRegionImage.type.startsWith('image/') ||
      analysisOutputIndexes.includes(region.imageFileIndex))
      ? t('characterizations.workspace.missing.regionImage')
      : null,
    region.imageFileIndex !== null &&
    (pixelRoiValues.some((value) => !value.trim()) ||
      pixelRoiValues.some((value) => !Number.isInteger(Number(value))) ||
      Number(region.pixelX) < 0 ||
      Number(region.pixelY) < 0 ||
      Number(region.pixelWidth) <= 0 ||
      Number(region.pixelHeight) <= 0)
      ? t('characterizations.workspace.missing.pixelRoi')
      : null,
  ].filter(Boolean) as string[]
  const regionIssues = [...geometryRegionIssues, ...regionImageIssues]
  const measurementQualityIssues = [
    qualityFlag === 'suspect' && !qualityNote.trim()
      ? t('characterizations.workspace.missing.qualityNote')
      : null,
  ].filter(Boolean) as string[]
  const hasMethodDraft = Boolean(
    instrumentId ||
    (method && measuredAt) ||
    qualityFlag !== 'valid' ||
    region.geometryType !== DEFAULT_REGION.geometryType ||
    region.label !== DEFAULT_REGION.label ||
    coordinateValues.some((value) => value.trim()) ||
    region.unit !== DEFAULT_REGION.unit ||
    region.imageFileIndex !== null ||
    pixelRoiValues.some((value) => value.trim()) ||
    Object.values(conditions).some((value) => value.trim()) ||
    Object.values(results).some((value) => value.trim()) ||
    qualityNote.trim() ||
    Object.values(resultMetadata).some(
      (metadata) =>
        metadata.quality !== 'valid' ||
        metadata.qualityNote.trim() ||
        metadata.statistic !== 'single_observation' ||
        metadata.sampleCount.trim() ||
        metadata.uncertaintyValue.trim() ||
        metadata.uncertaintyType.trim() ||
        metadata.confidence.trim(),
    ) ||
    compositionComponents.length ||
    compositionConfidence.trim() ||
    analysisRequested ||
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
    setQualityFlag('valid')
    setQualityNote('')
    setRegion(DEFAULT_REGION)
    setConditions({})
    setResults({})
    setResultMetadata({})
    setCompositionBasis('atomic_fraction')
    setCompositionComponents([])
    setCompositionConfidence('')
    setAnalysis(DEFAULT_ANALYSIS)
    setAnalysisParameters([])
    setAnalysisInputIndexes([])
    setAnalysisOutputIndexes([])
    setRawFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  const canSubmit = Boolean(
    !readOnly &&
    sampleId &&
    method &&
    measuredAt &&
    regionIssues.length === 0 &&
    conditionsValid &&
    resultsValid &&
    resultMetadataIssues.length === 0 &&
    compositionIssues.length === 0 &&
    analysisIssues.length === 0 &&
    measurementQualityIssues.length === 0 &&
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
    ...regionIssues,
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
    ...resultMetadataIssues,
    ...compositionIssues,
    ...analysisIssues,
    ...measurementQualityIssues,
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
        for (const [index, file] of rawFiles.entries()) {
          const uploaded = await uploadExperimentFile(token, runId, {
            file,
            sampleId,
            method,
            assetRole: 'characterization_file',
            fileCategory: analysisOutputIndexes.includes(index)
              ? 'processed'
              : 'raw',
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
                    statistic: metadata.statistic,
                    ...(metadata.sampleCount.trim()
                      ? { sample_count: Number(metadata.sampleCount) }
                      : {}),
                    ...(metadata.uncertaintyValue.trim()
                      ? {
                          uncertainty_value: Number(metadata.uncertaintyValue),
                          uncertainty_type: metadata.uncertaintyType.trim(),
                        }
                      : {}),
                  }),
              quality_flag: metadata.quality,
              ...(metadata.qualityNote.trim()
                ? { quality_note: metadata.qualityNote.trim() }
                : {}),
              ...(analysisRequested ? { analysis_index: 0 } : {}),
            }
          }) as unknown as MeasurementPropertyWrite[]
        const assertions = [
          ...resultDefinitions,
          ...advancedAssertionDefinitions,
        ]
          .filter(
            (field) =>
              (field.kind === 'growth' ||
                field.kind === 'layer_count' ||
                field.assertionType) &&
              results[field.key]?.trim(),
          )
          .map((field) => {
            const value = results[field.key].trim()
            const confidence = metadataFor(field.key).confidence.trim()
            if (field.kind === 'growth') {
              return {
                assertion_type: 'growth_presence',
                value: { state: value },
                confidence: confidence ? Number(confidence) : null,
                ...(analysisRequested ? { analysis_index: 0 } : {}),
              }
            }
            if (field.kind === 'layer_count') {
              return {
                assertion_type: 'layer_count',
                value: { count: Number(value) },
                confidence: confidence ? Number(confidence) : null,
                ...(analysisRequested ? { analysis_index: 0 } : {}),
              }
            }
            const valueKey = {
              phase_identity: 'phase',
              polytype: 'polytype',
              stacking_order: 'stacking_order',
              orientation_relationship: 'orientation_relationship',
            }[field.assertionType!]
            return {
              assertion_type: field.assertionType!,
              value: { [valueKey]: value },
              confidence: confidence ? Number(confidence) : null,
              ...(analysisRequested ? { analysis_index: 0 } : {}),
            }
          }) as unknown as MeasurementAssertionWrite[]
        if (compositionComponents.length) {
          assertions.push({
            assertion_type: 'composition',
            value: {
              basis: compositionBasis,
              components: compositionComponents.map((component) => ({
                species: component.species.trim(),
                fraction: Number(component.fraction),
              })),
            },
            confidence: compositionConfidence.trim()
              ? Number(compositionConfidence)
              : null,
            ...(analysisRequested ? { analysis_index: 0 } : {}),
          })
        }
        const analyses = analysisRequested
          ? [
              {
                software_name: analysis.softwareName.trim(),
                software_version: analysis.softwareVersion.trim(),
                ...(analysis.codeCommit.trim()
                  ? { code_commit: analysis.codeCommit.trim() }
                  : {}),
                parameters: parsedAnalysisParameters,
                started_at: new Date(analysis.startedAt).toISOString(),
                ...(analysis.completedAt
                  ? {
                      completed_at: new Date(
                        analysis.completedAt,
                      ).toISOString(),
                    }
                  : {}),
                input_file_ids: analysisInputIndexes.map(
                  (index) => uploadedFileIds[index],
                ),
                output_file_ids: analysisOutputIndexes.map(
                  (index) => uploadedFileIds[index],
                ),
              },
            ]
          : []
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
            sample_region: regionPayload(region, uploadedFileIds),
            typed_conditions: typedConditions(
              profile.condition_fields,
              conditions,
            ),
            raw_file_ids: uploadedFileIds.filter(
              (_, index) => !analysisOutputIndexes.includes(index),
            ),
            quality_flag: qualityFlag,
            ...(qualityNote.trim() ? { quality_note: qualityNote.trim() } : {}),
          },
          analyses,
          properties,
          assertions,
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
    <ModuleCard
      id="module-results"
      title={t(
        readOnly
          ? 'characterizations.workspace.readOnlyTitle'
          : 'characterizations.workspace.title',
      )}
    >
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
              <h3 className="font-medium">
                {t('characterizations.workspace.sections.selection')}
              </h3>
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
                          t('characterizations.workspace.confirm.sampleChange'),
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
                            {sampleResultLabel(
                              sample.actual_state,
                              sample.actual_material_summary,
                              i18n.language,
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
                          t('characterizations.workspace.confirm.methodChange'),
                        )
                      ) {
                        return
                      }
                      resetDraft()
                      setMethod(value)
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
              <h3 className="font-medium">
                {t('characterizations.workspace.sections.measurement')}
              </h3>
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
                      {profile.instrument_required ? (
                        <RequiredMark />
                      ) : (
                        t('characterizations.workspace.optionalSuffix')
                      )}
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
                            const version = instrumentVersions.data?.items.find(
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
                                  (left, right) => right.version - left.version,
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
                              onClick={() => void instrumentVersions.refetch()}
                            >
                              {t('characterizations.workspace.actions.retry')}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {profile ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="characterization-region-geometry">
                        {t('characterizations.workspace.fields.regionGeometry')}{' '}
                        <RequiredMark />
                      </Label>
                      <Select
                        value={region.geometryType}
                        disabled={controlsDisabled}
                        onValueChange={(value) => {
                          const geometryType = value as RegionGeometry
                          const supportsAnchor = [
                            'point',
                            'line',
                            'area',
                            'selected_area',
                          ].includes(geometryType)
                          setRegion((current) => ({
                            ...current,
                            geometryType,
                            label:
                              current.label === current.geometryType ||
                              current.label === 'whole_sample'
                                ? t(
                                    `characterizations.workspace.geometry.${geometryType}`,
                                  )
                                : current.label,
                            x: supportsAnchor ? current.x : '',
                            y: supportsAnchor ? current.y : '',
                            width: ['line', 'area'].includes(geometryType)
                              ? current.width
                              : '',
                            height:
                              geometryType === 'area' ? current.height : '',
                          }))
                        }}
                      >
                        <SelectTrigger
                          id="characterization-region-geometry"
                          className="w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {profile.allowed_region_types.map((geometry) => (
                              <SelectItem key={geometry} value={geometry}>
                                {t(
                                  `characterizations.workspace.geometry.${geometry}`,
                                  { defaultValue: geometry },
                                )}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    {region.geometryType !== 'whole_sample' ? (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="characterization-region-label">
                          {t('characterizations.workspace.fields.regionLabel')}{' '}
                          <RequiredMark />
                        </Label>
                        <Input
                          id="characterization-region-label"
                          value={region.label}
                          maxLength={128}
                          disabled={controlsDisabled}
                          onChange={(event) =>
                            setRegion((current) => ({
                              ...current,
                              label: event.target.value,
                            }))
                          }
                        />
                      </div>
                    ) : null}
                    {['point', 'line', 'area', 'selected_area'].includes(
                      region.geometryType,
                    ) ? (
                      <>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="characterization-region-x">
                            {t('characterizations.workspace.fields.regionX')}
                          </Label>
                          <Input
                            id="characterization-region-x"
                            type="number"
                            step="any"
                            value={region.x}
                            disabled={controlsDisabled}
                            onChange={(event) =>
                              setRegion((current) => ({
                                ...current,
                                x: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="characterization-region-y">
                            {t('characterizations.workspace.fields.regionY')}
                          </Label>
                          <Input
                            id="characterization-region-y"
                            type="number"
                            step="any"
                            value={region.y}
                            disabled={controlsDisabled}
                            onChange={(event) =>
                              setRegion((current) => ({
                                ...current,
                                y: event.target.value,
                              }))
                            }
                          />
                        </div>
                      </>
                    ) : null}
                    {['line', 'area'].includes(region.geometryType) ? (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="characterization-region-width">
                          {region.geometryType === 'line'
                            ? t(
                                'characterizations.workspace.fields.regionLength',
                              )
                            : t(
                                'characterizations.workspace.fields.regionWidth',
                              )}{' '}
                          <RequiredMark />
                        </Label>
                        <Input
                          id="characterization-region-width"
                          type="number"
                          min="0"
                          step="any"
                          value={region.width}
                          disabled={controlsDisabled}
                          onChange={(event) =>
                            setRegion((current) => ({
                              ...current,
                              width: event.target.value,
                            }))
                          }
                        />
                      </div>
                    ) : null}
                    {region.geometryType === 'area' ? (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="characterization-region-height">
                          {t('characterizations.workspace.fields.regionHeight')}{' '}
                          <RequiredMark />
                        </Label>
                        <Input
                          id="characterization-region-height"
                          type="number"
                          min="0"
                          step="any"
                          value={region.height}
                          disabled={controlsDisabled}
                          onChange={(event) =>
                            setRegion((current) => ({
                              ...current,
                              height: event.target.value,
                            }))
                          }
                        />
                      </div>
                    ) : null}
                    {['point', 'line', 'area', 'selected_area'].includes(
                      region.geometryType,
                    ) ? (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="characterization-region-unit">
                          {t('characterizations.workspace.fields.regionUnit')}
                        </Label>
                        <Select
                          value={region.unit}
                          disabled={controlsDisabled}
                          onValueChange={(value) =>
                            setRegion((current) => ({
                              ...current,
                              unit: value,
                            }))
                          }
                        >
                          <SelectTrigger
                            id="characterization-region-unit"
                            className="w-full"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {['μm', 'mm', 'nm', 'px'].map((unit) => (
                              <SelectItem key={unit} value={unit}>
                                {unit}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    {geometryRegionIssues.length ? (
                      <div
                        className="text-destructive text-sm sm:col-span-2"
                        role="alert"
                      >
                        <ul className="list-disc pl-5">
                          {geometryRegionIssues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : null}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="characterization-quality">
                    {t('characterizations.workspace.fields.measurementQuality')}
                  </Label>
                  <Select
                    value={qualityFlag}
                    disabled={controlsDisabled}
                    onValueChange={(value) => {
                      setQualityFlag(value as MeasurementQuality)
                      if (value === 'valid') setQualityNote('')
                    }}
                  >
                    <SelectTrigger
                      id="characterization-quality"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="valid">
                          {t(
                            'characterizations.workspace.measurementQuality.valid',
                          )}
                        </SelectItem>
                        <SelectItem value="suspect">
                          {t(
                            'characterizations.workspace.measurementQuality.suspect',
                          )}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {qualityFlag !== 'valid' ? (
                    <>
                      <Label htmlFor="characterization-quality-note">
                        {t('characterizations.workspace.fields.qualityNote')}{' '}
                        <RequiredMark />
                      </Label>
                      <Textarea
                        id="characterization-quality-note"
                        value={qualityNote}
                        maxLength={1000}
                        disabled={controlsDisabled}
                        onChange={(event) => setQualityNote(event.target.value)}
                      />
                      <p className="text-sm text-muted-foreground">
                        {t(
                          'characterizations.workspace.measurementQuality.help',
                        )}
                      </p>
                    </>
                  ) : null}
                </div>
              </div>

              {requiredConditions.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {requiredConditions.map((field) => (
                    <ConditionInput
                      key={field.key}
                      field={field}
                      conditions={conditions}
                      required
                      language={i18n.language}
                      issue={characterizationConditionIssue(
                        field,
                        conditions,
                        true,
                        i18n.language,
                      )}
                      disabled={controlsDisabled}
                      onChange={updateCondition}
                    />
                  ))}
                </div>
              ) : null}
              {optionalConditions.length ? (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer font-medium">
                    {t('characterizations.workspace.actions.moreConditions')}
                  </summary>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {optionalConditions.map((field) => (
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
              <h3 className="font-medium">
                {t('characterizations.workspace.sections.rawData')}
              </h3>
              <Label htmlFor="characterization-raw-files">
                {t('characterizations.workspace.fields.rawFiles')}
                {profile?.raw_files_required ? (
                  <RequiredMark />
                ) : (
                  t('characterizations.workspace.optionalSuffix')
                )}
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
              <p className="text-sm text-muted-foreground">
                {rawFiles.length
                  ? t('characterizations.workspace.filesSelected', {
                      count: rawFiles.length,
                    })
                  : isEnglish(i18n.language)
                    ? t('characterizations.workspace.rawFileGuidance')
                    : (profile?.raw_file_guidance_zh ??
                      t('characterizations.workspace.selectMethodFirst'))}
              </p>
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
                      <span className="min-w-0 truncate">{file.name}</span>
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
              <div className="flex flex-col gap-2">
                <Label htmlFor="characterization-region-image">
                  {t('characterizations.workspace.fields.regionImage')}
                  {t('characterizations.workspace.optionalSuffix')}
                </Label>
                <Select
                  value={
                    region.imageFileIndex === null
                      ? 'none'
                      : String(region.imageFileIndex)
                  }
                  disabled={controlsDisabled || regionImageOptions.length === 0}
                  onValueChange={(value) =>
                    setRegion((current) => ({
                      ...current,
                      imageFileIndex: value === 'none' ? null : Number(value),
                      pixelX: '',
                      pixelY: '',
                      pixelWidth: '',
                      pixelHeight: '',
                    }))
                  }
                >
                  <SelectTrigger
                    id="characterization-region-image"
                    className="w-full"
                    aria-invalid={regionImageIssues.length > 0 || undefined}
                    aria-describedby={
                      regionImageIssues.length
                        ? 'characterization-region-image-errors'
                        : undefined
                    }
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">
                        {t(
                          'characterizations.workspace.placeholders.regionImage',
                        )}
                      </SelectItem>
                      {regionImageOptions.map(({ file, index }) => (
                        <SelectItem key={index} value={String(index)}>
                          {file.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {regionImageOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('characterizations.workspace.advanced.noRegionImages')}
                  </p>
                ) : null}
              </div>
              {region.imageFileIndex !== null ? (
                <div className="grid gap-4 sm:grid-cols-4">
                  {(
                    [
                      ['pixelX', 'pixelRoiX', 0],
                      ['pixelY', 'pixelRoiY', 0],
                      ['pixelWidth', 'pixelRoiWidth', 1],
                      ['pixelHeight', 'pixelRoiHeight', 1],
                    ] as const
                  ).map(([key, labelKey, min]) => (
                    <div key={key} className="flex flex-col gap-2">
                      <Label htmlFor={`characterization-region-${key}`}>
                        {t(`characterizations.workspace.fields.${labelKey}`)}{' '}
                        <RequiredMark />
                      </Label>
                      <Input
                        id={`characterization-region-${key}`}
                        type="number"
                        min={min}
                        step="1"
                        value={region[key]}
                        disabled={controlsDisabled}
                        aria-invalid={regionImageIssues.length > 0 || undefined}
                        aria-describedby={
                          regionImageIssues.length
                            ? 'characterization-region-image-errors'
                            : undefined
                        }
                        onChange={(event) =>
                          setRegion((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : null}
              {regionImageIssues.length ? (
                <ul
                  id="characterization-region-image-errors"
                  className="list-disc pl-5 text-sm text-destructive"
                  role="alert"
                >
                  {regionImageIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className="flex flex-col gap-4 rounded-lg border p-4">
              <h3 className="font-medium">
                {t('characterizations.workspace.sections.results')}
              </h3>
              {method && resultDefinitions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('characterizations.workspace.noPresetResults')}
                </p>
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
              {profile ? (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer font-medium">
                    {t('characterizations.workspace.advanced.title')}
                  </summary>
                  <div className="mt-4 flex flex-col gap-5">
                    {advancedAssertionDefinitions.length ||
                    advancedAssertionTypes.includes('composition') ? (
                      <fieldset className="flex flex-col gap-3">
                        <legend className="text-sm font-medium">
                          {t('characterizations.workspace.advanced.assertions')}
                        </legend>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {advancedAssertionDefinitions.map((field) => (
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
                        {advancedAssertionTypes.includes('composition') ? (
                          <div className="flex flex-col gap-3 rounded-lg border p-3">
                            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                              <div className="flex flex-col gap-2">
                                <Label htmlFor="characterization-composition-basis">
                                  {t(
                                    'characterizations.workspace.advanced.compositionBasis',
                                  )}
                                </Label>
                                <Select
                                  value={compositionBasis}
                                  disabled={controlsDisabled}
                                  onValueChange={(value) =>
                                    setCompositionBasis(
                                      value as CompositionBasis,
                                    )
                                  }
                                >
                                  <SelectTrigger
                                    id="characterization-composition-basis"
                                    className="w-full"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      {(
                                        [
                                          'site_fraction',
                                          'atomic_fraction',
                                          'mass_fraction',
                                        ] as CompositionBasis[]
                                      ).map((basis) => (
                                        <SelectItem key={basis} value={basis}>
                                          {t(
                                            `characterizations.workspace.advanced.compositionBasisValues.${basis}`,
                                          )}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={controlsDisabled}
                                onClick={() => {
                                  const id = nextCompositionId.current
                                  nextCompositionId.current += 1
                                  setCompositionComponents((current) => [
                                    ...current,
                                    { id, species: '', fraction: '' },
                                  ])
                                }}
                              >
                                {t(
                                  'characterizations.workspace.advanced.addComposition',
                                )}
                              </Button>
                            </div>
                            {compositionComponents.map((component, index) => (
                              <div
                                key={component.id}
                                className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
                              >
                                <div className="flex flex-col gap-2">
                                  <Label
                                    htmlFor={`characterization-composition-species-${component.id}`}
                                  >
                                    {t(
                                      'characterizations.workspace.advanced.species',
                                    )}
                                  </Label>
                                  <Input
                                    id={`characterization-composition-species-${component.id}`}
                                    value={component.species}
                                    maxLength={128}
                                    disabled={controlsDisabled}
                                    onChange={(event) =>
                                      setCompositionComponents((current) =>
                                        current.map((item, position) =>
                                          position === index
                                            ? {
                                                ...item,
                                                species: event.target.value,
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                </div>
                                <div className="flex flex-col gap-2">
                                  <Label
                                    htmlFor={`characterization-composition-fraction-${component.id}`}
                                  >
                                    {t(
                                      'characterizations.workspace.advanced.fraction',
                                    )}
                                  </Label>
                                  <Input
                                    id={`characterization-composition-fraction-${component.id}`}
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="any"
                                    value={component.fraction}
                                    disabled={controlsDisabled}
                                    onChange={(event) =>
                                      setCompositionComponents((current) =>
                                        current.map((item, position) =>
                                          position === index
                                            ? {
                                                ...item,
                                                fraction: event.target.value,
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="self-end"
                                  disabled={controlsDisabled}
                                  aria-label={t(
                                    'characterizations.workspace.advanced.removeComposition',
                                    { index: index + 1 },
                                  )}
                                  onClick={() =>
                                    setCompositionComponents((current) =>
                                      current.filter(
                                        (item) => item.id !== component.id,
                                      ),
                                    )
                                  }
                                >
                                  {t(
                                    'characterizations.workspace.advanced.remove',
                                  )}
                                </Button>
                              </div>
                            ))}
                            {compositionComponents.length ? (
                              <div className="flex flex-col gap-2 sm:max-w-xs">
                                <Label htmlFor="characterization-composition-confidence">
                                  {t(
                                    'characterizations.workspace.fields.confidence',
                                  )}
                                </Label>
                                <Input
                                  id="characterization-composition-confidence"
                                  type="number"
                                  min="0"
                                  max="1"
                                  step="any"
                                  value={compositionConfidence}
                                  disabled={controlsDisabled}
                                  onChange={(event) =>
                                    setCompositionConfidence(event.target.value)
                                  }
                                />
                              </div>
                            ) : null}
                            {compositionIssues.length ? (
                              <ul
                                className="list-disc pl-5 text-sm text-destructive"
                                role="alert"
                              >
                                {compositionIssues.map((issue) => (
                                  <li key={issue}>{issue}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ) : null}
                      </fieldset>
                    ) : null}

                    <fieldset className="flex flex-col gap-3 border-t pt-4">
                      <legend className="text-sm font-medium">
                        {t('characterizations.workspace.advanced.analysis')}
                      </legend>
                      <p className="text-sm text-muted-foreground">
                        {t('characterizations.workspace.advanced.analysisHelp')}
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="characterization-analysis-software">
                            {t(
                              'characterizations.workspace.advanced.softwareName',
                            )}
                          </Label>
                          <Input
                            id="characterization-analysis-software"
                            value={analysis.softwareName}
                            maxLength={128}
                            disabled={controlsDisabled}
                            onChange={(event) =>
                              setAnalysis((current) => ({
                                ...current,
                                softwareName: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="characterization-analysis-version">
                            {t(
                              'characterizations.workspace.advanced.softwareVersion',
                            )}
                          </Label>
                          <Input
                            id="characterization-analysis-version"
                            value={analysis.softwareVersion}
                            maxLength={128}
                            disabled={controlsDisabled}
                            onChange={(event) =>
                              setAnalysis((current) => ({
                                ...current,
                                softwareVersion: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="characterization-analysis-started-at">
                            {t(
                              'characterizations.workspace.advanced.startedAt',
                            )}
                          </Label>
                          <Input
                            id="characterization-analysis-started-at"
                            type="datetime-local"
                            value={analysis.startedAt}
                            disabled={controlsDisabled}
                            onChange={(event) =>
                              setAnalysis((current) => ({
                                ...current,
                                startedAt: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="characterization-analysis-completed-at">
                            {t(
                              'characterizations.workspace.advanced.completedAt',
                            )}
                          </Label>
                          <Input
                            id="characterization-analysis-completed-at"
                            type="datetime-local"
                            value={analysis.completedAt}
                            disabled={controlsDisabled}
                            onChange={(event) =>
                              setAnalysis((current) => ({
                                ...current,
                                completedAt: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-2 sm:col-span-2">
                          <Label htmlFor="characterization-analysis-code-commit">
                            {t(
                              'characterizations.workspace.advanced.codeCommit',
                            )}
                          </Label>
                          <Input
                            id="characterization-analysis-code-commit"
                            value={analysis.codeCommit}
                            maxLength={128}
                            disabled={controlsDisabled}
                            onChange={(event) =>
                              setAnalysis((current) => ({
                                ...current,
                                codeCommit: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-3 sm:col-span-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium">
                              {t(
                                'characterizations.workspace.advanced.parameters',
                              )}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={controlsDisabled}
                              onClick={() => {
                                const id = nextAnalysisParameterId.current
                                nextAnalysisParameterId.current += 1
                                setAnalysisParameters((current) => [
                                  ...current,
                                  { id, key: '', value: '' },
                                ])
                              }}
                            >
                              {t(
                                'characterizations.workspace.advanced.addParameter',
                              )}
                            </Button>
                          </div>
                          {analysisParameters.map((parameter) => (
                            <div
                              key={parameter.id}
                              className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
                            >
                              <Input
                                aria-label={t(
                                  'characterizations.workspace.advanced.parameterName',
                                )}
                                value={parameter.key}
                                maxLength={128}
                                disabled={controlsDisabled}
                                onChange={(event) =>
                                  setAnalysisParameters((current) =>
                                    current.map((item) =>
                                      item.id === parameter.id
                                        ? { ...item, key: event.target.value }
                                        : item,
                                    ),
                                  )
                                }
                              />
                              <Input
                                aria-label={t(
                                  'characterizations.workspace.advanced.parameterValue',
                                )}
                                value={parameter.value}
                                maxLength={1000}
                                disabled={controlsDisabled}
                                onChange={(event) =>
                                  setAnalysisParameters((current) =>
                                    current.map((item) =>
                                      item.id === parameter.id
                                        ? { ...item, value: event.target.value }
                                        : item,
                                    ),
                                  )
                                }
                              />
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                disabled={controlsDisabled}
                                aria-label={t(
                                  'characterizations.workspace.advanced.removeParameter',
                                )}
                                onClick={() =>
                                  setAnalysisParameters((current) =>
                                    current.filter(
                                      (item) => item.id !== parameter.id,
                                    ),
                                  )
                                }
                              >
                                <X aria-hidden="true" />
                              </Button>
                            </div>
                          ))}
                          {analysisParameterIssues.length ? (
                            <ul className="list-disc pl-5 text-sm text-destructive">
                              {analysisParameterIssues.map((issue) => (
                                <li key={issue}>{issue}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <p className="text-sm font-medium">
                          {t('characterizations.workspace.advanced.inputFiles')}
                        </p>
                        {rawFiles.length ? (
                          rawFiles.map((file, index) => {
                            const id = `characterization-analysis-input-${index}`
                            return (
                              <div
                                key={`${file.name}-${file.size}-${file.lastModified}-input-${index}`}
                                className="flex items-center gap-2"
                              >
                                <Checkbox
                                  id={id}
                                  aria-label={t(
                                    'characterizations.workspace.advanced.inputFileLabel',
                                    { filename: file.name },
                                  )}
                                  checked={analysisInputIndexes.includes(index)}
                                  disabled={controlsDisabled}
                                  onCheckedChange={(checked) => {
                                    setAnalysisInputIndexes((current) =>
                                      checked
                                        ? current.includes(index)
                                          ? current
                                          : [...current, index].sort(
                                              (left, right) => left - right,
                                            )
                                        : current.filter(
                                            (value) => value !== index,
                                          ),
                                    )
                                    if (checked) {
                                      setAnalysisOutputIndexes((current) =>
                                        current.filter(
                                          (value) => value !== index,
                                        ),
                                      )
                                    }
                                  }}
                                />
                                <Label htmlFor={id}>{file.name}</Label>
                              </div>
                            )
                          })
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {t(
                              'characterizations.workspace.advanced.noInputFiles',
                            )}
                          </p>
                        )}
                        <p className="pt-2 text-sm font-medium">
                          {t(
                            'characterizations.workspace.advanced.outputFiles',
                          )}
                        </p>
                        {rawFiles.length ? (
                          rawFiles.map((file, index) => {
                            const id = `characterization-analysis-output-${index}`
                            return (
                              <div
                                key={`${file.name}-${file.size}-${file.lastModified}-output-${index}`}
                                className="flex items-center gap-2"
                              >
                                <Checkbox
                                  id={id}
                                  aria-label={t(
                                    'characterizations.workspace.advanced.outputFileLabel',
                                    { filename: file.name },
                                  )}
                                  checked={analysisOutputIndexes.includes(
                                    index,
                                  )}
                                  disabled={controlsDisabled}
                                  onCheckedChange={(checked) => {
                                    setAnalysisOutputIndexes((current) =>
                                      checked
                                        ? current.includes(index)
                                          ? current
                                          : [...current, index].sort(
                                              (left, right) => left - right,
                                            )
                                        : current.filter(
                                            (value) => value !== index,
                                          ),
                                    )
                                    if (checked) {
                                      setAnalysisInputIndexes((current) =>
                                        current.filter(
                                          (value) => value !== index,
                                        ),
                                      )
                                      setRegion((current) =>
                                        current.imageFileIndex === index
                                          ? {
                                              ...current,
                                              imageFileIndex: null,
                                              pixelX: '',
                                              pixelY: '',
                                              pixelWidth: '',
                                              pixelHeight: '',
                                            }
                                          : current,
                                      )
                                    }
                                  }}
                                />
                                <Label htmlFor={id}>{file.name}</Label>
                              </div>
                            )
                          })
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {t(
                              'characterizations.workspace.advanced.noInputFiles',
                            )}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {t(
                            'characterizations.workspace.advanced.outputFilesHelp',
                          )}
                        </p>
                      </div>
                      {analysisIssues.length ? (
                        <ul
                          className="list-disc pl-5 text-sm text-destructive"
                          role="alert"
                        >
                          {analysisIssues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      ) : null}
                    </fieldset>
                  </div>
                </details>
              ) : null}
            </section>

            <section className="flex flex-col items-end gap-3 rounded-lg border p-4">
              <h3 className="w-full font-medium">
                {t('characterizations.workspace.sections.save')}
              </h3>
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
          <h3 className="font-medium">
            {t('characterizations.workspace.sections.existing')}
          </h3>
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
                          ? t('characterizations.workspace.actions.hideDetails')
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
    </ModuleCard>
  )
}
