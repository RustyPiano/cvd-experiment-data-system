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
import { ModuleCard } from './module-card'
import { localizedFieldLabel, localizedUnit } from '@/shared/field-i18n'

function referenceId(value: ModuleFieldValue | undefined): string {
  const text = moduleValueAsString(value)
  if (!text) return ''
  try {
    const parsed = JSON.parse(text) as { entity_id?: unknown }
    return typeof parsed.entity_id === 'string' ? parsed.entity_id : ''
  } catch {
    return text
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
  subtitle,
  addLabel,
  emptyHint,
  itemLabel,
  items,
  onItemsChange,
  disabled,
  showErrors,
  save,
}: {
  moduleKey: string
  index: string
  title: string
  subtitle: string
  addLabel: string
  emptyHint: string
  itemLabel: (position: number) => string
  items: ModuleValues[]
  onItemsChange: (items: ModuleValues[]) => void
  disabled?: boolean
  showErrors?: boolean
  save?: ModuleSaveProps
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
    onItemsChange([...items, item])
  }
  const removeItem = (itemIndex: number) =>
    onItemsChange(items.filter((_, i) => i !== itemIndex))

  return (
    <ModuleCard
      id={`module-${moduleKey}`}
      index={index}
      title={title}
      subtitle={subtitle}
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
            key={moduleValueAsString(item['source_id']) || itemIndex}
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
                disabled={disabled}
                aria-label={t('experimentsV2.form.removeItem')}
                onClick={() => removeItem(itemIndex)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields
                .filter((field) => isFieldVisible(moduleKey, field, item))
                .map((field) => {
                  const referenceKind = REFERENCE_FIELD_KINDS[field.key]
                  if (referenceKind) {
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
                          value={referenceId(item[field.key])}
                          onChange={(_entityId, entity) => {
                            const version = entity?.latest_version
                            setItemValue(
                              itemIndex,
                              field.key,
                              entity && version
                                ? JSON.stringify({
                                    entity_id: entity.id,
                                    version: version.version,
                                    snapshot: version.data,
                                  })
                                : '',
                            )
                          }}
                          disabled={disabled}
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
                    />
                  )
                })}
            </div>
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
