// 可重复条目模块（§3 前驱体 / §4 衬底）的通用区块：条目增删 + 每条目元数据驱动字段。
// 相态 / 衬底材料等判别器驱动条件必填与显隐由 field-logic 计算（红星动态出现）。
// 物料批次引用字段（lot_ref）渲染为实体引用选择器。
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { EntityKind } from '@/features/entity-library/config'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { ModuleFieldValue, ModuleValues } from '../field-logic'
import {
  emptyModuleValues,
  getModuleFields,
  isFieldVisible,
  isEffectivelyRequired,
  moduleValueAsString,
} from '../field-logic'
import type { ModuleSaveProps } from '../form-types'
import { FieldControl } from './field-control'
import { FieldLabel } from './field-bits'
import { EntityReferenceSelect } from './entity-reference-select'
import { snapshotValue } from './reference-snapshot'
import { ModuleCard } from './module-card'
import {
  canonicalOption,
  localizedFieldLabel,
  localizedUnit,
} from '@/shared/field-i18n'
import { buildTreatmentStepsEditorLabels } from '@/shared/structured-editor-labels'
import { ExperimentAttachments } from './experiment-attachments'
import { TreatmentStepsEditor } from './treatment-steps-editor'
import type { TreatmentStep } from './treatment-steps-editor'

interface FrozenReference {
  entity_id: string
  version: number
  snapshot: Record<string, unknown>
}

function referenceValue(
  value: ModuleFieldValue | undefined,
): FrozenReference | null {
  const text = moduleValueAsString(value)
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as Partial<FrozenReference>
    return typeof parsed.entity_id === 'string' &&
      typeof parsed.version === 'number' &&
      parsed.snapshot &&
      typeof parsed.snapshot === 'object'
      ? (parsed as FrozenReference)
      : null
  } catch {
    return null
  }
}

function snapshotText(snapshot: Record<string, unknown>, key: string): string {
  const value = snapshotValue(snapshot, key)
  return value == null ? '' : String(value).trim()
}

function snapshotFormValue(
  snapshot: Record<string, unknown>,
  key: string,
): string {
  const value = snapshotValue(snapshot, key)
  if (value == null || value === '') return ''
  return typeof value === 'object'
    ? JSON.stringify(value)
    : String(value).trim()
}

const MATERIAL_LOT_PROJECTED_FIELDS: Record<string, readonly string[]> = {
  precursors: ['name_formula', 'cas_inchi'],
  substrates: [
    'material',
    'chemical_formula',
    'orientation_polish_availability',
    'crystal_orientation',
    'oxide_thickness_nm',
    'miscut_availability',
    'miscut_angle_deg',
    'miscut_direction',
    'surface_roughness',
  ],
}

export function materialLotProjection(
  moduleKey: string,
  snapshot: Record<string, unknown>,
): ModuleValues {
  if (moduleKey === 'precursors') {
    return Object.fromEntries(
      Object.entries({
        name_formula:
          snapshotText(snapshot, 'chemical_formula') ||
          snapshotText(snapshot, 'substance_name'),
        cas_inchi: [
          snapshotText(snapshot, 'cas_number'),
          snapshotText(snapshot, 'inchikey_cid'),
        ]
          .filter(Boolean)
          .join(' · '),
      }).filter(([, value]) => value !== ''),
    )
  }
  if (moduleKey === 'substrates') {
    const orientation = snapshotValue(snapshot, 'substrate_orientation_polish')
    const orientationAvailability =
      snapshotText(snapshot, 'substrate_orientation_polish_availability') ||
      (orientation ? 'reported' : '')
    const miscutAngle = snapshotValue(snapshot, 'substrate_miscut_angle_deg')
    const miscutAvailability =
      snapshotText(snapshot, 'substrate_miscut_availability') ||
      (miscutAngle !== null && miscutAngle !== undefined ? 'reported' : '')
    const crystalOrientation =
      orientation && typeof orientation === 'object'
        ? ['value', 'option']
            .map((key) =>
              String(
                (orientation as Record<string, unknown>)[key] ?? '',
              ).trim(),
            )
            .filter(Boolean)
            .join('；')
        : snapshotText(snapshot, 'substrate_orientation_polish')
    return Object.fromEntries(
      Object.entries({
        material: canonicalOption(snapshotText(snapshot, 'substrate_material')),
        chemical_formula: snapshotText(snapshot, 'chemical_formula'),
        orientation_polish_availability: canonicalOption(
          orientationAvailability,
        ),
        crystal_orientation: crystalOrientation,
        oxide_thickness_nm: snapshotFormValue(
          snapshot,
          'substrate_oxide_thickness_nm',
        ),
        miscut_availability: canonicalOption(miscutAvailability),
        miscut_angle_deg:
          miscutAngle === null || miscutAngle === undefined
            ? ''
            : String(miscutAngle),
        miscut_direction: snapshotText(snapshot, 'substrate_miscut_direction'),
        surface_roughness: snapshotFormValue(
          snapshot,
          'substrate_surface_roughness',
        ),
      }).filter(([, value]) => value !== ''),
    )
  }
  return {}
}

export function materialLotAutofill(
  moduleKey: string,
  snapshot: Record<string, unknown>,
): ModuleValues {
  if (moduleKey === 'precursors') {
    const category = canonicalOption(snapshotText(snapshot, 'lot_category'))
    const form = canonicalOption(snapshotText(snapshot, 'form_appearance'))
    const phase =
      canonicalOption(snapshotText(snapshot, 'phase_state')) ||
      (category === 'gas_cylinder'
        ? 'gas'
        : ['powder', 'granules', 'bulk_solid', 'foil', 'target'].includes(form)
          ? 'solid'
          : '')
    return {
      ...materialLotProjection(moduleKey, snapshot),
      ...(phase ? { phase_state: phase } : {}),
    }
  }
  return materialLotProjection(moduleKey, snapshot)
}

function materialLotSummary(
  snapshot: Record<string, unknown>,
  sizePrefix: string,
): string {
  const purity = snapshotText(snapshot, 'purity')
  const particleSize = snapshotText(snapshot, 'particle_size_d50_um')
  const size = snapshotText(snapshot, 'substrate_size_spec')
  return [
    snapshotText(snapshot, 'supplier'),
    snapshotText(snapshot, 'batch_number'),
    purity ? `${purity}%` : '',
    particleSize ? `D50 ${particleSize} μm` : '',
    size ? `${sizePrefix}${size}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

export function materialLotMatchesItem(
  moduleKey: string,
  item: ModuleValues,
  snapshot: Record<string, unknown>,
): boolean {
  const category = canonicalOption(snapshotText(snapshot, 'lot_category'))
  if (moduleKey === 'substrates') {
    return category === 'substrate'
  }
  const phase = canonicalOption(moduleValueAsString(item['phase_state']))
  if (!phase) return category === 'chemical' || category === 'gas_cylinder'
  return category === (phase === 'gas' ? 'gas_cylinder' : 'chemical')
}

export function materialLotReferenceFirst<T extends { key: string }>(
  fields: readonly T[],
): T[] {
  return [...fields].sort(
    (left, right) =>
      Number(right.key === 'lot_ref') - Number(left.key === 'lot_ref'),
  )
}

export function materialLotFieldIsProjected(
  moduleKey: string,
  fieldKey: string,
  _item: ModuleValues,
): boolean {
  return Boolean(MATERIAL_LOT_PROJECTED_FIELDS[moduleKey]?.includes(fieldKey))
}

export function materialLotMissingStableFields(
  moduleKey: string,
  snapshot: Record<string, unknown>,
): string[] {
  if (moduleKey !== 'substrates') return []
  const projection = materialLotProjection(moduleKey, snapshot)
  const required = [
    'material',
    'chemical_formula',
    'orientation_polish_availability',
    'miscut_availability',
    'surface_roughness',
  ]
  if (projection.orientation_polish_availability === 'reported') {
    required.push('crystal_orientation')
  }
  if (projection.miscut_availability === 'reported') {
    required.push('miscut_angle_deg')
  }
  if (projection.material === 'sio2_si') required.push('oxide_thickness_nm')
  if (Number(projection.miscut_angle_deg ?? 0) > 0) {
    required.push('miscut_direction')
  }
  return required.filter(
    (key) => moduleValueAsString(projection[key]).trim() === '',
  )
}

export function materialLotProjectedItem(
  moduleKey: string,
  item: ModuleValues,
): ModuleValues {
  const reference = referenceValue(item['lot_ref'])
  if (!reference) return item
  return {
    ...applyMaterialLotSelection(moduleKey, item),
    ...materialLotProjection(moduleKey, reference.snapshot),
  }
}

export function applyMaterialLotSelection(
  moduleKey: string,
  item: ModuleValues,
  snapshot?: Record<string, unknown>,
): ModuleValues {
  const next = { ...item }
  for (const key of MATERIAL_LOT_PROJECTED_FIELDS[moduleKey] ?? []) {
    next[key] = ''
  }
  return snapshot
    ? { ...next, ...materialLotAutofill(moduleKey, snapshot) }
    : next
}

export function updateMaterialLotAwareItem(
  moduleKey: string,
  item: ModuleValues,
  key: string,
  value: ModuleFieldValue,
): ModuleValues {
  const next = { ...item, [key]: value }
  if (
    (key !== 'phase_state' && key !== 'material') ||
    !referenceValue(item['lot_ref'])
  ) {
    return next
  }
  const reference = referenceValue(item['lot_ref'])
  if (
    !reference ||
    materialLotMatchesItem(moduleKey, next, reference.snapshot)
  ) {
    return next
  }
  const cleared = applyMaterialLotSelection(moduleKey, next)
  return { ...cleared, [key]: value, lot_ref: '' }
}

function jsonArrayValue<T>(value: ModuleFieldValue | undefined): T[] {
  try {
    const parsed: unknown = JSON.parse(moduleValueAsString(value) || '[]')
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

// 引用型字段键 → 被引用实体种类。
const REFERENCE_FIELD_KINDS: Record<string, EntityKind> = {
  lot_ref: 'material_lot',
}

export function RepeatableItemsSection({
  moduleKey,
  index,
  title,
  addLabel,
  emptyHint,
  itemLabel,
  items,
  onItemsChange,
  disabled,
  showErrors,
  save,
  runId,
  zoneCount,
}: {
  moduleKey: string
  index: string
  title: string
  addLabel: string
  emptyHint: string
  itemLabel: (position: number) => string
  items: ModuleValues[]
  onItemsChange: (items: ModuleValues[]) => void
  disabled?: boolean
  showErrors?: boolean
  save?: ModuleSaveProps
  runId?: string
  zoneCount?: number | null
}) {
  const { i18n, t } = useTranslation()
  const fields = materialLotReferenceFirst(getModuleFields(moduleKey))

  const setItemValue = (
    itemIndex: number,
    key: string,
    value: ModuleFieldValue,
  ) => {
    onItemsChange(
      items.map((item, i) =>
        i === itemIndex
          ? updateMaterialLotAwareItem(moduleKey, item, key, value)
          : item,
      ),
    )
  }
  const addItem = () => {
    const item = emptyModuleValues(moduleKey)
    if (moduleKey === 'substrates') item['source_id'] = crypto.randomUUID()
    if (moduleKey === 'process_events') {
      item['event_id'] = crypto.randomUUID()
      item['terminated_run'] = 'false'
    }
    onItemsChange([...items, item])
  }
  const removeItem = (itemIndex: number) =>
    onItemsChange(items.filter((_, i) => i !== itemIndex))

  return (
    <ModuleCard
      id={`module-${moduleKey}`}
      index={index}
      title={title}
      onSave={save?.onSave}
      saving={save?.saving}
      saved={save?.saved}
      error={save?.error}
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      ) : null}

      <div className="flex flex-col gap-4">
        {items.map((item, itemIndex) => {
          const displayItem = materialLotProjectedItem(moduleKey, item)
          const itemReference = referenceValue(item['lot_ref'])
          const missingStableFields = itemReference
            ? materialLotMissingStableFields(moduleKey, itemReference.snapshot)
            : []
          return (
            <div
              key={
                moduleValueAsString(item['source_id']) ||
                moduleValueAsString(item['event_id']) ||
                itemIndex
              }
              className="rounded-md border border-border p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  {itemLabel(itemIndex + 1)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={
                    disabled ||
                    (moduleKey === 'process_events' &&
                      jsonArrayValue<string>(item['attachment_file_ids'])
                        .length > 0)
                  }
                  title={
                    moduleKey === 'process_events' &&
                    jsonArrayValue<string>(item['attachment_file_ids']).length >
                      0
                      ? t(
                          'experimentsV2.sections.processEvents.removeFilesFirst',
                        )
                      : undefined
                  }
                  aria-label={t('experimentsV2.form.removeItem')}
                  onClick={() => removeItem(itemIndex)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {fields
                  .filter((field) =>
                    isFieldVisible(moduleKey, field, displayItem),
                  )
                  .filter(
                    (field) =>
                      field.key !== 'attachment_file_ids' &&
                      field.key !== 'event_id',
                  )
                  .map((field) => {
                    const referenceKind = REFERENCE_FIELD_KINDS[field.key]
                    if (referenceKind) {
                      const reference = referenceValue(item[field.key])
                      const summary = reference
                        ? materialLotSummary(
                            reference.snapshot,
                            t(
                              'experimentsV2.sections.substrates.lotSizePrefix',
                            ),
                          )
                        : ''
                      return (
                        <div key={field.key} className="flex flex-col gap-1.5">
                          <FieldLabel
                            labelZh={localizedFieldLabel(field, i18n.language)}
                            unit={localizedUnit(field.unit, i18n.language)}
                            required={isEffectivelyRequired(
                              moduleKey,
                              field,
                              displayItem,
                            )}
                            r0={field.r0}
                          />
                          <EntityReferenceSelect
                            kind={referenceKind}
                            value={reference?.entity_id ?? ''}
                            selectedVersion={reference?.version}
                            selectedSnapshot={reference?.snapshot}
                            filter={(entity) =>
                              field.key !== 'lot_ref' ||
                              (entity.latest_version != null &&
                                materialLotMatchesItem(
                                  moduleKey,
                                  displayItem,
                                  entity.latest_version.data,
                                ) &&
                                materialLotMissingStableFields(
                                  moduleKey,
                                  entity.latest_version.data,
                                ).length === 0)
                            }
                            onChange={(_entityId, entity) => {
                              const version = entity?.latest_version
                              onItemsChange(
                                items.map((current, currentIndex) =>
                                  currentIndex === itemIndex
                                    ? {
                                        ...applyMaterialLotSelection(
                                          moduleKey,
                                          current,
                                          version?.data,
                                        ),
                                        [field.key]:
                                          entity && version
                                            ? JSON.stringify({
                                                entity_id: entity.id,
                                                version: version.version,
                                                snapshot: version.data,
                                              })
                                            : '',
                                      }
                                    : current,
                                ),
                              )
                            }}
                            disabled={disabled}
                          />
                          {summary ? (
                            <p className="text-xs text-muted-foreground">
                              {summary}
                            </p>
                          ) : null}
                          {field.key === 'lot_ref' && !reference ? (
                            <p className="text-xs text-muted-foreground">
                              {t(
                                moduleKey === 'precursors'
                                  ? 'experimentsV2.sections.precursors.selectLotFirst'
                                  : 'experimentsV2.sections.substrates.selectLotFirst',
                              )}
                            </p>
                          ) : null}
                          {field.key === 'lot_ref' &&
                          missingStableFields.length > 0 ? (
                            <p className="text-xs text-destructive">
                              {t(
                                'experimentsV2.sections.substrates.incompleteLot',
                                {
                                  fields: missingStableFields
                                    .map((key) => {
                                      const missingField = fields.find(
                                        (candidate) => candidate.key === key,
                                      )
                                      return missingField
                                        ? localizedFieldLabel(
                                            missingField,
                                            i18n.language,
                                          )
                                        : key
                                    })
                                    .join(
                                      i18n.language.startsWith('en')
                                        ? ', '
                                        : '、',
                                    ),
                                },
                              )}
                            </p>
                          ) : null}
                        </div>
                      )
                    }
                    if (
                      field.key === 'treatment_steps' ||
                      field.key === 'pretreatment_steps'
                    ) {
                      return (
                        <div
                          key={field.key}
                          className="flex flex-col gap-2 sm:col-span-2"
                        >
                          <FieldLabel
                            labelZh={localizedFieldLabel(field, i18n.language)}
                            unit={localizedUnit(field.unit, i18n.language)}
                            required={isEffectivelyRequired(
                              moduleKey,
                              field,
                              displayItem,
                            )}
                            r0={field.r0}
                          />
                          <TreatmentStepsEditor
                            kind={
                              field.key === 'treatment_steps'
                                ? 'precursor'
                                : 'substrate'
                            }
                            value={jsonArrayValue<TreatmentStep>(
                              displayItem[field.key],
                            )}
                            onChange={(value) =>
                              setItemValue(
                                itemIndex,
                                field.key,
                                JSON.stringify(value),
                              )
                            }
                            disabled={disabled}
                            showErrors={showErrors}
                            labels={buildTreatmentStepsEditorLabels(t)}
                          />
                        </div>
                      )
                    }
                    return (
                      <FieldControl
                        key={field.key}
                        moduleKey={moduleKey}
                        field={field}
                        values={displayItem}
                        value={displayItem[field.key] ?? ''}
                        onChange={(value) =>
                          setItemValue(itemIndex, field.key, value)
                        }
                        disabled={disabled}
                        showError={showErrors}
                        readOnly={materialLotFieldIsProjected(
                          moduleKey,
                          field.key,
                          item,
                        )}
                        structuredZoneCount={zoneCount}
                      />
                    )
                  })}
              </div>
              {moduleKey === 'process_events' &&
              runId &&
              moduleValueAsString(item['event_id']) ? (
                <div className="mt-4 border-t border-border pt-4">
                  <ExperimentAttachments
                    runId={runId}
                    role="process_event_attachment"
                    bindingType="process_event"
                    bindingId={moduleValueAsString(item['event_id'])}
                    readOnly={Boolean(disabled)}
                    cleanupUncommitted
                    saved={save?.saved}
                    onFilesChange={(files) =>
                      setItemValue(
                        itemIndex,
                        'attachment_file_ids',
                        JSON.stringify(files.map((file) => file.id)),
                      )
                    }
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <Separator />
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={addItem}
        >
          <Plus className="size-4" />
          {addLabel}
        </Button>
      </div>
    </ModuleCard>
  )
}
