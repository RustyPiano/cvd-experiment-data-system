// 一等实体的动态表单（纯展示；数据获取/提交由页面注入 onSubmit）。
// 字段清单、显隐、必填、选项均由 field-metadata 驱动；UI 文案全部走 i18n（D12）。
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Control, FieldError, Resolver } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'

import { characterizationProfiles } from '@/shared/generated/field-metadata'
import type { FieldMetadata } from '@/shared/generated/field-metadata'
import {
  localizedFieldHelp,
  localizedFieldLabel,
  localizedFieldPlaceholder,
  localizedOption,
  localizedSetupFieldLabel,
  localizedUnitLabel,
} from '@/shared/field-i18n'
import { RequiredMark } from '@/shared/ui/required-mark'
import {
  isCompositeInput,
  parseCompositeOptions,
  parseCompositeValue,
} from '@/shared/composite-field'
import { CompositeFieldControl } from '@/shared/ui/composite-field-control'
import { SelectWithOtherControl } from '@/shared/ui/select-with-other-control'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { EntityKind } from './config'
import {
  buildDefaultValues,
  buildSubmitPayload,
  getDisplayEntityFields,
  getEntityFields,
  instrumentOtherMethodNames,
  isEffectivelyRequired,
  isEntityJsonArrayField,
  isFieldVisible,
  isMultiSelectInput,
  isNoneOption,
  isOtherOptionMarker,
  isSelectWithOtherInput,
  materialLotFormulaIsCompatible,
  parseEnumOptions,
  parseEntityJsonArray,
  productionDateIsValid,
} from './field-logic'
import type { EntityFormValues, EntityVersionPayload } from './field-logic'
import {
  isStructuredInput,
  parseStructuredValue,
  structuredPayload,
} from '@/shared/structured-field'
import { StructuredObjectControl } from '@/shared/ui/structured-object-control'
import {
  numericInputAttributes,
  numericValidationIssue,
} from '@/shared/field-validation'
import {
  entityFileInputAllowsNote,
  entityFilePayload,
  isEntityFileInput,
} from '@/shared/entity-file-reference'
import { EntityFileControl } from './entity-file-control'
import { listEntities } from './api'
import type { EntityFileAssetRead } from './api'
import {
  TemperatureSensorsEditor,
  reconcileTemperatureSensors,
  temperatureSensorsAreValid,
} from './temperature-sensors-editor'
import type { TemperatureSensor } from './temperature-sensors-editor'
import { buildTemperatureSensorsEditorLabels } from '@/shared/structured-editor-labels'
import { FormulaInput } from '@/features/experiments-v2/components/formula-input'
import { validateMaterialFormula } from '@/features/experiments-v2/formula'
import {
  GasCompositionEditor,
  gasCompositionIssue,
} from './gas-composition-editor'
import type { GasCompositionComponent } from './gas-composition-editor'

// 长文本字段用多行输入并跨两列（示意图/配置/坐标系描述）。
const TEXTAREA_KEYS = new Set([
  'setup_diagram',
  'mfc_config',
  'fixed_config',
  'coordinate_system',
  'modification_details',
])
const NUMERIC_INPUT = '\u6570\u503c'
const DATE_INPUT = '\u65e5\u671f'
const MATERIAL_FORMULA_INPUT = '\u7269\u6599\u5316\u5b66\u5f0f'

type InstrumentCapability = {
  code: string
  configuration?: Record<string, unknown>
}

const INSTRUMENT_CAPABILITY_CODES = new Set(
  Object.keys(characterizationProfiles),
)

function instrumentCapabilitiesAreValid(value: string | string[]): boolean {
  const capabilities = parseEntityJsonArray<InstrumentCapability>(value)
  return (
    capabilities.length > 0 &&
    capabilities.every(
      (capability) =>
        capability &&
        typeof capability === 'object' &&
        INSTRUMENT_CAPABILITY_CODES.has(capability.code) &&
        (capability.configuration === undefined ||
          (capability.configuration !== null &&
            typeof capability.configuration === 'object' &&
            !Array.isArray(capability.configuration))) &&
        (capability.code !== 'other' ||
          (Array.isArray(capability.configuration?.method_names) &&
            capability.configuration.method_names.length > 0 &&
            capability.configuration.method_names.every(
              (name) =>
                typeof name === 'string' &&
                name.trim().length > 0 &&
                name.trim().length <= 128,
            ) &&
            new Set(
              capability.configuration.method_names.map((name: string) =>
                name.trim().toLowerCase(),
              ),
            ).size === capability.configuration.method_names.length)),
    ) &&
    new Set(capabilities.map((capability) => capability.code)).size ===
      capabilities.length
  )
}

export type EntityFormMode = 'create' | 'newVersion'

type EntityFormProps = {
  kind: EntityKind
  mode: EntityFormMode
  /** newVersion 模式下的目标版本号（= 当前版本 + 1），用于「改动即新版本」提示。 */
  nextVersion: number
  /** newVersion 模式下的旧版本数据快照，用于预填。 */
  defaultData?: Record<string, unknown> | null
  /** 从实验记录就地新增物料时，只开放该入口适用的批次类别。 */
  allowedLotCategories?: readonly string[]
  submitting: boolean
  token?: string
  onSubmit: (payload: EntityVersionPayload) => void
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
  onPendingFilesChange?: (files: EntityFileAssetRead[]) => void
  onUploadPendingChange?: (pending: boolean) => void
}

export function EntityForm({
  kind,
  mode,
  nextVersion,
  defaultData,
  allowedLotCategories,
  submitting,
  token = '',
  onSubmit,
  onCancel,
  onDirtyChange,
  onPendingFilesChange,
  onUploadPendingChange,
}: EntityFormProps) {
  const { t, i18n } = useTranslation()
  const fields = useMemo(() => getEntityFields(kind), [kind])
  const defaultValues = useMemo(
    () =>
      buildDefaultValues(
        kind,
        kind === 'material_lot' && allowedLotCategories?.length === 1
          ? { ...defaultData, lot_category: allowedLotCategories[0] }
          : defaultData,
      ),
    [allowedLotCategories, defaultData, kind],
  )
  const historicalEntities = useQuery({
    queryKey: ['v2-entity', kind, 'select-history', token],
    queryFn: () => listEntities(kind, token),
    enabled: Boolean(token),
  })
  const historicalSelectOptions = useMemo(() => {
    const options: Record<string, string[]> = {}
    for (const field of fields) {
      if (!isSelectWithOtherInput(field.input)) continue
      options[field.key] = [
        ...new Set(
          (historicalEntities.data?.items ?? [])
            .map((entity) => entity.latest_version?.data[field.key])
            .filter(
              (value): value is string =>
                typeof value === 'string' &&
                value.trim() !== '' &&
                !isOtherOptionMarker(value),
            )
            .map((value) => value.trim()),
        ),
      ]
    }
    return options
  }, [fields, historicalEntities.data?.items])
  const [pendingFiles, setPendingFiles] = useState<
    Record<string, EntityFileAssetRead>
  >({})
  const [attachmentDraftDirty, setAttachmentDraftDirty] = useState<
    Record<string, boolean>
  >({})
  const [attachmentUploadPending, setAttachmentUploadPending] = useState<
    Record<string, boolean>
  >({})

  // 校验随当前取值动态计算：可见且有效必填的字段才强制非空（隐藏字段不校验）。
  // 手写 resolver 等价于旧的动态 z.object（值不 trim；提交时 buildSubmitPayload 再 trim，
  // 载荷逐键相同），省去 zod + 双重 as 断言。
  const resolver: Resolver<EntityFormValues> = (values) => {
    const errors: Record<string, FieldError> = {}
    const rawZoneCount = values['zone_count']
    const parsedZoneCount = Number(
      Array.isArray(rawZoneCount) ? '' : rawZoneCount,
    )
    const zoneCount =
      Number.isInteger(parsedZoneCount) && parsedZoneCount > 0
        ? parsedZoneCount
        : null
    const resolvedValues: EntityFormValues = { ...values }
    if (zoneCount != null) {
      resolvedValues['temperature_sensors'] = JSON.stringify(
        reconcileTemperatureSensors(
          parseEntityJsonArray<TemperatureSensor>(
            values['temperature_sensors'],
          ),
          zoneCount,
        ),
      )
    }
    const rawTubeShape = resolvedValues['tube_material_shape']
    const tubeShape =
      typeof rawTubeShape === 'string'
        ? String(parseStructuredValue(rawTubeShape).shape ?? '')
        : ''
    for (const field of fields) {
      if (!isFieldVisible(kind, field, resolvedValues)) continue
      const required = isEffectivelyRequired(kind, field, resolvedValues)
      const value = resolvedValues[field.key]
      const empty = Array.isArray(value)
        ? value.length === 0
        : (value ?? '').trim() === ''
      if (required && empty) {
        errors[field.key] = {
          type: 'required',
          message:
            field.key === 'tube_outer_diameter_wall_mm'
              ? t('validation.tubeDimensionsRequired')
              : t('validation.required'),
        }
      } else if (
        !empty &&
        field.input === MATERIAL_FORMULA_INPUT &&
        !Array.isArray(value) &&
        !validateMaterialFormula(value).valid
      ) {
        errors[field.key] = { type: 'validate', message: '' }
      } else if (!empty && field.key === 'temperature_sensors') {
        if (
          !temperatureSensorsAreValid(
            parseEntityJsonArray<TemperatureSensor>(value),
            zoneCount,
          )
        ) {
          errors[field.key] = {
            type: 'validate',
            message:
              zoneCount == null
                ? t('structuredEditors.temperatureSensors.selectZoneCountFirst')
                : t('validation.temperatureSensorsCoverage', {
                    count: zoneCount,
                  }),
          }
        }
      } else if (!empty && field.key === 'gas_components') {
        if (
          gasCompositionIssue(
            parseEntityJsonArray<GasCompositionComponent>(value),
          )
        ) {
          errors[field.key] = {
            type: 'validate',
            message: t('validation.gasComposition'),
          }
        }
      } else if (!empty && field.key === 'capabilities') {
        if (!instrumentCapabilitiesAreValid(value)) {
          errors[field.key] = {
            type: 'validate',
            message: t('validation.instrumentCapabilities'),
          }
        }
      } else if (
        !empty &&
        field.key === 'production_date' &&
        !Array.isArray(value) &&
        !productionDateIsValid(value)
      ) {
        errors[field.key] = {
          type: 'validate',
          message: t('validation.productionDate'),
        }
      } else if (!empty && isEntityFileInput(field.input)) {
        try {
          entityFilePayload(
            Array.isArray(value) ? '' : (value ?? ''),
            field.key,
          )
        } catch {
          errors[field.key] = {
            type: 'validate',
            message: t('entityLibrary.form.invalidFileReference'),
          }
        }
      } else if (!empty && isStructuredInput(field.input)) {
        try {
          structuredPayload(
            field.key,
            Array.isArray(value) ? '' : (value ?? ''),
            { tubeShape },
          )
        } catch (error) {
          const wallThicknessMessage =
            field.key === 'tube_outer_diameter_wall_mm' &&
            error instanceof RangeError &&
            error.message.startsWith('wall thickness')
              ? tubeShape === 'round'
                ? t('validation.tubeRoundWallThickness')
                : tubeShape === 'square'
                  ? t('validation.tubeSquareWallThickness')
                  : tubeShape === 'rectangular'
                    ? t('validation.tubeRectangularWallThickness')
                    : null
              : null
          errors[field.key] = {
            type: 'validate',
            message:
              wallThicknessMessage ??
              t('validation.structuredField', {
                field: localizedFieldLabel(field, i18n.language),
              }),
          }
        }
      } else if (!empty && !Array.isArray(value)) {
        const compositeInput = isCompositeInput(field.input)
          ? field.input
          : null
        const compositeParts = compositeInput
          ? parseCompositeValue(
              compositeInput,
              value,
              parseEnumOptions(field.input, field.options, field.key) ??
                parseCompositeOptions(field.options),
            )
          : null
        const numericText =
          field.input === NUMERIC_INPUT
            ? value.trim()
            : compositeInput?.includes(NUMERIC_INPUT)
              ? compositeParts?.freeValue.trim()
              : null
        if (
          compositeParts &&
          field.validation?.require_value &&
          !compositeParts.freeValue.trim()
        ) {
          errors[field.key] = {
            type: 'required',
            message: compositeInput?.includes(NUMERIC_INPUT)
              ? t('validation.numericValueRequired')
              : t('validation.required'),
          }
        } else if (
          compositeParts &&
          field.validation?.require_option &&
          !compositeParts.option
        ) {
          errors[field.key] = {
            type: 'required',
            message: t('validation.required'),
          }
        } else if (numericText) {
          const issue = numericValidationIssue(numericText, field.validation)
          if (issue) {
            const message =
              issue.kind === 'finite'
                ? t('validation.finiteNumber')
                : issue.kind === 'integer'
                  ? t('validation.integerNumber')
                  : issue.kind === 'ge'
                    ? t('validation.numberGe', { limit: issue.limit })
                    : issue.kind === 'gt'
                      ? t('validation.numberGt', { limit: issue.limit })
                      : issue.kind === 'le'
                        ? t('validation.numberLe', { limit: issue.limit })
                        : t('validation.numberLt', { limit: issue.limit })
            errors[field.key] = { type: 'validate', message }
          }
        }
      }
    }
    if (
      kind === 'material_lot' &&
      !errors['chemical_formula'] &&
      !materialLotFormulaIsCompatible(resolvedValues)
    ) {
      errors['chemical_formula'] = {
        type: 'validate',
        message: t('validation.substrateFormulaMismatch'),
      }
    }
    return Object.keys(errors).length > 0
      ? { values: {}, errors }
      : { values: resolvedValues, errors: {} }
  }

  const form = useForm<EntityFormValues>({
    defaultValues,
    resolver,
  })

  const values = form.watch()
  const isDirty = form.formState.isDirty
  const hasAttachmentDraft = Object.values(attachmentDraftDirty).some(Boolean)
  const hasAttachmentUploadPending = Object.values(
    attachmentUploadPending,
  ).some(Boolean)
  const formBusy = submitting || hasAttachmentUploadPending

  useEffect(() => {
    onDirtyChange?.(isDirty || hasAttachmentDraft)
  }, [hasAttachmentDraft, isDirty, onDirtyChange])

  useEffect(() => {
    onPendingFilesChange?.(Object.values(pendingFiles))
  }, [onPendingFilesChange, pendingFiles])

  useEffect(() => {
    onUploadPendingChange?.(hasAttachmentUploadPending)
  }, [hasAttachmentUploadPending, onUploadPendingChange])

  const handlePendingFileChange = useCallback(
    (fieldKey: string, file: EntityFileAssetRead | null) => {
      setPendingFiles((current) => {
        if (file) return { ...current, [fieldKey]: file }
        if (!(fieldKey in current)) return current
        const next = { ...current }
        delete next[fieldKey]
        return next
      })
    },
    [],
  )
  const handleAttachmentDraftDirtyChange = useCallback(
    (fieldKey: string, dirty: boolean) => {
      setAttachmentDraftDirty((current) => {
        if (current[fieldKey] === dirty) return current
        return { ...current, [fieldKey]: dirty }
      })
    },
    [],
  )
  const handleAttachmentUploadPendingChange = useCallback(
    (fieldKey: string, pending: boolean) => {
      setAttachmentUploadPending((current) => {
        if (current[fieldKey] === pending) return current
        return { ...current, [fieldKey]: pending }
      })
    },
    [],
  )

  const handleSubmit = form.handleSubmit((submitted) => {
    onSubmit(buildSubmitPayload(kind, submitted))
  })

  return (
    <Form {...form}>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        autoComplete="off"
        noValidate
      >
        {mode === 'newVersion' ? (
          <Alert>
            <AlertDescription data-testid="new-version-banner">
              {t('entityLibrary.form.newVersionBanner', {
                version: nextVersion,
              })}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {getDisplayEntityFields(kind, values).map((field) =>
            isFieldVisible(kind, field, values) &&
            !(
              kind === 'material_lot' &&
              field.key === 'lot_category' &&
              allowedLotCategories?.length === 1
            ) ? (
              <EntityFieldControl
                key={field.key}
                kind={kind}
                field={field}
                values={values}
                control={form.control}
                disabled={formBusy}
                token={token}
                historicalOptions={historicalSelectOptions[field.key] ?? []}
                allowedOptions={
                  field.key === 'lot_category'
                    ? allowedLotCategories
                    : undefined
                }
                initialValue={
                  typeof defaultValues[field.key] === 'string'
                    ? (defaultValues[field.key] as string)
                    : ''
                }
                onPendingFileChange={handlePendingFileChange}
                onAttachmentDraftDirtyChange={handleAttachmentDraftDirtyChange}
                onAttachmentUploadPendingChange={
                  handleAttachmentUploadPendingChange
                }
              />
            ) : null,
          )}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={formBusy}
            onClick={onCancel}
          >
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={formBusy}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('actions.save')}
          </Button>
        </div>
      </form>
    </Form>
  )
}

function EntityFieldControl({
  kind,
  field,
  values,
  control,
  disabled,
  token,
  historicalOptions,
  allowedOptions,
  initialValue,
  onPendingFileChange,
  onAttachmentDraftDirtyChange,
  onAttachmentUploadPendingChange,
}: {
  kind: EntityKind
  field: FieldMetadata
  values: EntityFormValues
  control: Control<EntityFormValues>
  disabled: boolean
  token: string
  historicalOptions: readonly string[]
  allowedOptions?: readonly string[]
  initialValue: string
  onPendingFileChange: (
    fieldKey: string,
    file: EntityFileAssetRead | null,
  ) => void
  onAttachmentDraftDirtyChange: (fieldKey: string, dirty: boolean) => void
  onAttachmentUploadPendingChange: (fieldKey: string, pending: boolean) => void
}) {
  const { i18n, t } = useTranslation()
  const tubeShapeValue = values['tube_material_shape']
  const tubeShape =
    typeof tubeShapeValue === 'string'
      ? String(parseStructuredValue(tubeShapeValue).shape ?? '')
      : ''
  const label =
    kind === 'setup'
      ? localizedSetupFieldLabel(field, i18n.language, values['setup_origin'], {
          manufacturerBrand: t('entityLibrary.form.originalManufacturerBrand'),
          model: t('entityLibrary.form.originalEquipmentModel'),
        })
      : localizedFieldLabel(field, i18n.language)
  const required = isEffectivelyRequired(kind, field, values)
  const allowsOther = isSelectWithOtherInput(field.input)
  const multiSelect = isMultiSelectInput(field.input)
  const enumOptions = parseEnumOptions(field.input, field.options, field.key)
    ?.filter((option) => !allowsOther || !isOtherOptionMarker(option))
    .filter((option) => !allowedOptions || allowedOptions.includes(option))
    .concat(allowsOther ? historicalOptions : [])
    .filter((option, index, options) => options.indexOf(option) === index)
  const compositeInput = isCompositeInput(field.input) ? field.input : null
  const structuredInput = isStructuredInput(field.input)
  const entityFileInput = isEntityFileInput(field.input)
  const numericAttributes = numericInputAttributes(field.validation)
  const compositeOptions = compositeInput
    ? (enumOptions ?? parseCompositeOptions(field.options))
    : []
  const controlId = useId()
  const useTextarea = TEXTAREA_KEYS.has(field.key)
  const placeholder = localizedFieldPlaceholder(field, i18n.language)
  const fieldHelp = localizedFieldHelp(field, i18n.language)
  const materialFormulaInput = field.input === MATERIAL_FORMULA_INPUT
  const customControl = Boolean(
    materialFormulaInput ||
    entityFileInput ||
    isEntityJsonArrayField(field.key) ||
    structuredInput ||
    compositeInput ||
    (enumOptions && (allowsOther || multiSelect)),
  )
  const labelId = `${controlId}-label`
  const helpId = `${controlId}-help`
  const messageId = `${controlId}-message`

  const wideControl =
    useTextarea || entityFileInput || isEntityJsonArrayField(field.key)

  return (
    <FormField
      control={control}
      name={field.key}
      render={({ field: rhf, fieldState }) => (
        <FormItem className={wideControl ? 'sm:col-span-2' : undefined}>
          <FormLabel
            {...(multiSelect || isEntityJsonArrayField(field.key)
              ? { id: labelId }
              : customControl
                ? { htmlFor: controlId }
                : {})}
          >
            <span>{label}</span>
            {localizedUnitLabel(field.unit, i18n.language) ? (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {localizedUnitLabel(field.unit, i18n.language)}
              </span>
            ) : null}
            {required ? <RequiredMark /> : null}
          </FormLabel>
          {materialFormulaInput ? (
            <FormulaInput
              id={controlId}
              value={Array.isArray(rhf.value) ? '' : (rhf.value ?? '')}
              onChange={rhf.onChange}
              disabled={disabled}
              placeholder={placeholder}
              validator={validateMaterialFormula}
              ariaDescribedBy={
                [
                  fieldHelp ? helpId : null,
                  fieldState.error?.message ? messageId : null,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
            />
          ) : field.key === 'temperature_sensors' ? (
            <div
              id={controlId}
              role="group"
              aria-labelledby={labelId}
              aria-invalid={fieldState.invalid || undefined}
            >
              <TemperatureSensorsEditor
                value={parseEntityJsonArray<TemperatureSensor>(rhf.value)}
                onChange={(value) => rhf.onChange(JSON.stringify(value))}
                zoneCount={(() => {
                  const raw = values['zone_count']
                  const parsed = Number(Array.isArray(raw) ? '' : raw)
                  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
                })()}
                disabled={disabled}
                showErrors={fieldState.invalid}
                labels={buildTemperatureSensorsEditorLabels(t)}
              />
            </div>
          ) : field.key === 'gas_components' ? (
            <div
              id={controlId}
              role="group"
              aria-labelledby={labelId}
              aria-invalid={fieldState.invalid || undefined}
            >
              <GasCompositionEditor
                value={parseEntityJsonArray<GasCompositionComponent>(rhf.value)}
                onChange={(value) => rhf.onChange(JSON.stringify(value))}
                disabled={disabled}
                showErrors={fieldState.invalid}
              />
            </div>
          ) : field.key === 'capabilities' ? (
            <div
              id={controlId}
              role="group"
              aria-labelledby={labelId}
              aria-describedby={
                [
                  fieldHelp ? helpId : null,
                  fieldState.invalid ? messageId : null,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              aria-invalid={fieldState.invalid || undefined}
              className="grid gap-2 rounded-md border border-input px-3 py-2 sm:grid-cols-2"
            >
              {Object.entries(characterizationProfiles)
                .filter(([, profile]) => !profile.legacy_only)
                .sort(
                  ([a], [b]) => Number(a === 'other') - Number(b === 'other'),
                )
                .map(([code, profile]) => {
                  const capabilities =
                    parseEntityJsonArray<InstrumentCapability>(rhf.value)
                  const selected = capabilities.some(
                    (capability) =>
                      capability.code === code ||
                      (code === 'Raman' &&
                        capability.code === 'low_frequency_raman'),
                  )
                  const capability = capabilities.find(
                    (item) => item.code === code,
                  )
                  const methodNames = instrumentOtherMethodNames(
                    capability?.configuration,
                  )
                  const setMethodNames = (names: string[]) =>
                    rhf.onChange(
                      JSON.stringify(
                        capabilities.map((item) =>
                          item.code === 'other'
                            ? {
                                ...item,
                                configuration: {
                                  ...item.configuration,
                                  method_names: names,
                                },
                              }
                            : item,
                        ),
                      ),
                    )
                  return (
                    <div
                      key={code}
                      className={
                        code === 'other'
                          ? 'flex flex-col gap-3 sm:col-span-2'
                          : 'flex flex-col gap-3'
                      }
                    >
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox
                          checked={selected}
                          disabled={disabled}
                          onCheckedChange={(checked) => {
                            if (
                              !checked &&
                              code === 'other' &&
                              methodNames.some((name) => name.trim()) &&
                              !window.confirm(
                                t('entityLibrary.form.clearOtherMethods'),
                              )
                            )
                              return
                            rhf.onChange(
                              JSON.stringify(
                                checked
                                  ? [
                                      ...capabilities,
                                      {
                                        code,
                                        configuration:
                                          code === 'other'
                                            ? { method_names: [''] }
                                            : {},
                                      },
                                    ]
                                  : capabilities.filter(
                                      (item) =>
                                        item.code !== code &&
                                        !(
                                          code === 'Raman' &&
                                          item.code === 'low_frequency_raman'
                                        ),
                                    ),
                              ),
                            )
                          }}
                        />
                        <span>
                          {i18n.language.startsWith('en')
                            ? profile.label_en
                            : profile.label_zh}
                        </span>
                      </label>
                      {code === 'other' && selected ? (
                        <fieldset
                          className="flex flex-col gap-3"
                          disabled={disabled}
                        >
                          {(methodNames.length ? methodNames : ['']).map(
                            (name, index) => (
                              <div key={index} className="flex items-end gap-2">
                                <div className="flex min-w-0 flex-1 flex-col gap-2">
                                  <Label
                                    htmlFor={controlId + '-method-' + index}
                                  >
                                    {t('entityLibrary.form.methodName')}{' '}
                                    {index + 1} <RequiredMark />
                                  </Label>
                                  <Input
                                    id={controlId + '-method-' + index}
                                    value={name}
                                    maxLength={128}
                                    required
                                    disabled={disabled}
                                    aria-invalid={
                                      fieldState.invalid || undefined
                                    }
                                    onChange={(event) => {
                                      const names = methodNames.length
                                        ? [...methodNames]
                                        : ['']
                                      names[index] = event.target.value
                                      setMethodNames(names)
                                    }}
                                  />
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={disabled}
                                  aria-label={t(
                                    'entityLibrary.form.removeMethod',
                                    { index: index + 1 },
                                  )}
                                  onClick={() =>
                                    setMethodNames(
                                      methodNames.length > 1
                                        ? methodNames.filter(
                                            (_, position) => position !== index,
                                          )
                                        : [''],
                                    )
                                  }
                                >
                                  {t('entityLibrary.form.removeMethodButton')}
                                </Button>
                              </div>
                            ),
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="self-start"
                            disabled={disabled}
                            onClick={() =>
                              setMethodNames([
                                ...(methodNames.length ? methodNames : ['']),
                                '',
                              ])
                            }
                          >
                            {t('entityLibrary.form.addMethod')}
                          </Button>
                        </fieldset>
                      ) : null}
                    </div>
                  )
                })}
            </div>
          ) : entityFileInput ? (
            <EntityFileControl
              value={Array.isArray(rhf.value) ? '' : (rhf.value ?? '')}
              initialValue={initialValue}
              label={label}
              allowsNote={entityFileInputAllowsNote(field.input)}
              token={token}
              disabled={disabled}
              invalid={fieldState.invalid}
              ariaDescribedBy={
                [
                  fieldHelp ? helpId : null,
                  fieldState.invalid ? messageId : null,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              inputId={controlId}
              onChange={rhf.onChange}
              onPendingFileChange={(file) =>
                onPendingFileChange(field.key, file)
              }
              onDraftDirtyChange={(dirty) =>
                onAttachmentDraftDirtyChange(field.key, dirty)
              }
              onUploadPendingChange={(pending) =>
                onAttachmentUploadPendingChange(field.key, pending)
              }
            />
          ) : enumOptions && multiSelect ? (
            <div
              id={controlId}
              role="group"
              aria-labelledby={labelId}
              aria-describedby={
                [
                  fieldHelp ? helpId : null,
                  fieldState.invalid ? messageId : null,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              aria-invalid={fieldState.invalid || undefined}
              className="grid gap-2 rounded-md border border-input px-3 py-2 sm:grid-cols-2"
            >
              {enumOptions.map((option) => {
                const selected = Array.isArray(rhf.value) ? rhf.value : []
                return (
                  <label
                    key={option}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={selected.includes(option)}
                      disabled={disabled}
                      onCheckedChange={(checked) => {
                        if (!checked) {
                          rhf.onChange(
                            selected.filter((item) => item !== option),
                          )
                          return
                        }
                        rhf.onChange(
                          isNoneOption(option)
                            ? [option]
                            : [
                                ...selected.filter(
                                  (item) =>
                                    !isNoneOption(item) && item !== option,
                                ),
                                option,
                              ],
                        )
                      }}
                    />
                    <span>{localizedOption(option, i18n.language)}</span>
                  </label>
                )
              })}
            </div>
          ) : structuredInput ? (
            <StructuredObjectControl
              fieldKey={field.key}
              value={Array.isArray(rhf.value) ? '' : (rhf.value ?? '')}
              onChange={rhf.onChange}
              tubeShape={tubeShape}
              disabled={disabled}
              invalid={fieldState.invalid}
              ariaDescribedBy={
                [
                  fieldHelp ? helpId : null,
                  fieldState.invalid ? messageId : null,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
            />
          ) : compositeInput ? (
            <CompositeFieldControl
              input={compositeInput}
              value={Array.isArray(rhf.value) ? '' : (rhf.value ?? '')}
              options={compositeOptions}
              onChange={rhf.onChange}
              inputId={controlId}
              selectId={`${controlId}-option`}
              selectLabel={t('entityLibrary.form.fieldOptions', { label })}
              disabled={disabled}
              freePlaceholder={t('entityLibrary.form.inputPlaceholder')}
              selectPlaceholder={t('entityLibrary.form.selectPlaceholder')}
              validation={field.validation}
              optionLabel={(option) => localizedOption(option, i18n.language)}
            />
          ) : enumOptions && allowsOther ? (
            <SelectWithOtherControl
              value={Array.isArray(rhf.value) ? '' : (rhf.value ?? '')}
              options={enumOptions}
              onChange={rhf.onChange}
              disabled={disabled}
              selectId={controlId}
              invalid={fieldState.invalid}
              ariaDescribedBy={
                [
                  fieldHelp ? helpId : null,
                  fieldState.invalid ? messageId : null,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              placeholder={placeholder}
              otherLabel={t(
                field.key === 'supplier'
                  ? 'entityLibrary.form.addSupplier'
                  : 'entityLibrary.form.otherOption',
              )}
              otherInputLabel={
                field.key === 'supplier'
                  ? t('entityLibrary.form.supplierName')
                  : t('entityLibrary.form.otherInputLabel', { label })
              }
              otherPlaceholder={t(
                field.key === 'supplier'
                  ? 'entityLibrary.form.supplierNamePlaceholder'
                  : 'entityLibrary.form.otherPlaceholder',
              )}
              optionLabel={(option) => localizedOption(option, i18n.language)}
            />
          ) : enumOptions ? (
            <Select
              value={Array.isArray(rhf.value) ? '' : (rhf.value ?? '')}
              onValueChange={rhf.onChange}
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={placeholder} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {enumOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {localizedOption(option, i18n.language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <FormControl>
              {useTextarea ? (
                <Textarea
                  {...rhf}
                  value={Array.isArray(rhf.value) ? '' : (rhf.value ?? '')}
                  rows={3}
                  placeholder={placeholder}
                  disabled={disabled}
                />
              ) : (
                <Input
                  {...rhf}
                  type={
                    field.input === NUMERIC_INPUT
                      ? 'number'
                      : field.input === DATE_INPUT
                        ? 'date'
                        : 'text'
                  }
                  inputMode={
                    field.input === NUMERIC_INPUT ? 'decimal' : undefined
                  }
                  min={
                    field.input === NUMERIC_INPUT
                      ? numericAttributes.min
                      : undefined
                  }
                  max={
                    field.input === NUMERIC_INPUT
                      ? numericAttributes.max
                      : undefined
                  }
                  step={
                    field.input === NUMERIC_INPUT
                      ? numericAttributes.step
                      : undefined
                  }
                  value={Array.isArray(rhf.value) ? '' : (rhf.value ?? '')}
                  autoComplete="off"
                  placeholder={placeholder}
                  disabled={disabled}
                />
              )}
            </FormControl>
          )}
          {fieldHelp ? (
            <FormDescription
              {...(customControl ? { id: helpId } : {})}
              className="text-xs"
            >
              {fieldHelp}
            </FormDescription>
          ) : null}
          <FormMessage {...(customControl ? { id: messageId } : {})} />
        </FormItem>
      )}
    />
  )
}
