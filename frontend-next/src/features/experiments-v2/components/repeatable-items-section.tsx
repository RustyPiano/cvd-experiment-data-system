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
        phase_state: phase,
      }).filter(([, value]) => value !== ''),
    )
  }
  if (moduleKey === 'substrates') {
    const orientation = snapshotValue(snapshot, 'substrate_orientation_polish')
    const crystalOrientation =
      orientation && typeof orientation === 'object'
        ? String((orientation as Record<string, unknown>).value ?? '').trim()
        : ''
    return Object.fromEntries(
      Object.entries({
        material: canonicalOption(snapshotText(snapshot, 'substrate_material')),
        chemical_formula: snapshotText(snapshot, 'chemical_formula'),
        crystal_orientation: crystalOrientation,
        oxide_thickness_nm: snapshotText(
          snapshot,
          'substrate_oxide_thickness_nm',
        ),
      }).filter(([, value]) => value !== ''),
    )
  }
  return {}
}

function materialLotSummary(snapshot: Record<string, unknown>): string {
  const purity = snapshotText(snapshot, 'purity')
  const particleSize = snapshotText(snapshot, 'particle_size_d50_um')
  return [
    snapshotText(snapshot, 'supplier'),
    snapshotText(snapshot, 'batch_number'),
    purity ? `${purity}%` : '',
    particleSize ? `D50 ${particleSize} μm` : '',
    snapshotText(snapshot, 'substrate_size_spec'),
  ]
    .filter(Boolean)
    .join(' · ')
}

export function materialLotMatchesItem(
  moduleKey: string,
  item: ModuleValues,
  snapshot: Record<string, unknown>,
): boolean {
  const expectedCategory =
    moduleKey === 'substrates'
      ? 'substrate'
      : canonicalOption(moduleValueAsString(item['phase_state'])) === 'gas'
        ? 'gas_cylinder'
        : 'chemical'
  return (
    canonicalOption(snapshotText(snapshot, 'lot_category')) === expectedCategory
  )
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
}) {
  const { i18n, t } = useTranslation()
  const fields = getModuleFields(moduleKey)

  const setItemValue = (
    itemIndex: number,
    key: string,
    value: ModuleFieldValue,
  ) => {
    onItemsChange(
      items.map((item, i) =>
        i === itemIndex ? { ...item, [key]: value } : item,
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
        {items.map((item, itemIndex) => (
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
                    jsonArrayValue<string>(item['attachment_file_ids']).length >
                      0)
                }
                title={
                  moduleKey === 'process_events' &&
                  jsonArrayValue<string>(item['attachment_file_ids']).length > 0
                    ? t('experimentsV2.sections.processEvents.removeFilesFirst')
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
                .filter((field) => isFieldVisible(moduleKey, field, item))
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
                      ? materialLotSummary(reference.snapshot)
                      : ''
                    return (
                      <div key={field.key} className="flex flex-col gap-1.5">
                        <FieldLabel
                          labelZh={localizedFieldLabel(field, i18n.language)}
                          unit={localizedUnit(field.unit, i18n.language)}
                          required={isEffectivelyRequired(
                            moduleKey,
                            field,
                            item,
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
                                item,
                                entity.latest_version.data,
                              ))
                          }
                          onChange={(_entityId, entity) => {
                            const version = entity?.latest_version
                            onItemsChange(
                              items.map((current, currentIndex) =>
                                currentIndex === itemIndex
                                  ? {
                                      ...current,
                                      ...(entity && version
                                        ? materialLotAutofill(
                                            moduleKey,
                                            version.data,
                                          )
                                        : {}),
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
                            item,
                          )}
                          r0={field.r0}
                        />
                        <TreatmentStepsEditor
                          kind={
                            field.key === 'treatment_steps'
                              ? 'precursor'
                              : 'substrate'
                          }
                          value={jsonArrayValue<TreatmentStep>(item[field.key])}
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
                      values={item}
                      value={item[field.key] ?? ''}
                      onChange={(value) =>
                        setItemValue(itemIndex, field.key, value)
                      }
                      disabled={disabled}
                      showError={showErrors}
                      readOnly={field.key === 'cas_inchi'}
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
        ))}
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
