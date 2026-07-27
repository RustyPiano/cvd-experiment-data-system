// §1b 组成明细 components[] 编辑器：逐组分 {化学式 / 角色 / 浓度 at% / 层序}。
// 结构类型≠本征时条件必填（由上层控制显隐 + 必填提示）。化学式带元素校验。
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ComponentRow } from '../field-logic'
import { emptyComponentRow, getComponentRoleOptions } from '../field-logic'
import { FormulaInput } from './formula-input'
import { canonicalOption, localizedOption } from '@/shared/field-i18n'
import { SpaceGroupInput } from './space-group-input'

export function ComponentsEditor({
  rows,
  onChange,
  disabled,
  showError,
  structureType = 'other',
}: {
  rows: ComponentRow[]
  onChange: (rows: ComponentRow[]) => void
  disabled?: boolean
  /** 上层判定「结构类型≠本征但组分为空」时置真，高亮缺失。 */
  showError?: boolean
  structureType?: string
}) {
  const { i18n, t } = useTranslation()
  const roleOptions = getComponentRoleOptions()
  const structure = canonicalOption(structureType)
  const showConcentration = ['doped', 'alloy', 'other'].includes(structure)
  const showLayerOrder = structure === 'other'
  const showSpaceGroup = [
    'vertical_heterostructure',
    'lateral_heterostructure',
  ].includes(structure)
  const defaultRole = () =>
    structure === 'doped'
      ? 'dopant'
      : structure === 'alloy'
        ? 'alloy_component'
        : structure === 'vertical_heterostructure'
          ? 'material_layer'
          : structure === 'lateral_heterostructure'
            ? 'lateral_domain'
            : ''
  const rowTitle = (index: number) =>
    structure === 'vertical_heterostructure'
      ? t('experimentsV2.components.layer', { position: index + 1 })
      : structure === 'lateral_heterostructure'
        ? t('experimentsV2.components.region', { position: index + 1 })
        : structure === 'doped'
          ? t('experimentsV2.components.dopant', { position: index + 1 })
          : t('experimentsV2.components.item', { position: index + 1 })
  const formulaLabel = () =>
    structure === 'doped'
      ? t('experimentsV2.components.dopantElement')
      : structure === 'alloy'
        ? t('experimentsV2.components.alloySiteElement')
        : t('experimentsV2.components.formula')
  const formulaPlaceholder = (index: number) =>
    structure === 'doped'
      ? t('experimentsV2.components.placeholders.dopant')
      : structure === 'alloy'
        ? t('experimentsV2.components.placeholders.alloy')
        : structure === 'vertical_heterostructure' ||
            structure === 'lateral_heterostructure'
          ? t(
              index === 0
                ? 'experimentsV2.components.placeholders.materialFirst'
                : 'experimentsV2.components.placeholders.materialNext',
            )
          : t('experimentsV2.components.placeholders.materialFirst')

  const updateRow = (index: number, patch: Partial<ComponentRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  const addRow = () => {
    const index = rows.length
    onChange([
      ...rows,
      {
        ...emptyComponentRow(),
        role: defaultRole(),
        layer_order:
          structure === 'vertical_heterostructure' ? String(index + 1) : '',
      },
    ])
  }
  const removeRow = (index: number) =>
    onChange(rows.filter((_, i) => i !== index))

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {showError
            ? t('experimentsV2.components.requiredHint')
            : t('experimentsV2.components.empty')}
        </p>
      ) : null}

      {rows.map((row, index) => (
        <div
          key={index}
          className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[2fr_1fr_auto]"
        >
          <p className="text-sm font-medium sm:col-span-3">{rowTitle(index)}</p>
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`component-${index}-formula`}
              className="text-xs font-medium text-muted-foreground"
            >
              {formulaLabel()}
            </label>
            <FormulaInput
              id={`component-${index}-formula`}
              value={row.formula}
              onChange={(value) => updateRow(index, { formula: value })}
              disabled={disabled}
              placeholder={formulaPlaceholder(index)}
            />
          </div>
          {structure === 'other' ? (
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`component-${index}-role`}
                className="text-xs font-medium text-muted-foreground"
              >
                {t('experimentsV2.components.role')}
              </label>
              <Select
                value={row.role || ''}
                onValueChange={(value) => updateRow(index, { role: value })}
                disabled={disabled}
              >
                <SelectTrigger
                  id={`component-${index}-role`}
                  className="w-full"
                >
                  <SelectValue
                    placeholder={t('experimentsV2.form.selectPlaceholder')}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {roleOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {localizedOption(option, i18n.language)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {showConcentration ? (
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`component-${index}-concentration`}
                className="text-xs font-medium text-muted-foreground"
              >
                {t(
                  structure === 'alloy'
                    ? 'experimentsV2.components.siteFraction'
                    : 'experimentsV2.components.nominalContent',
                )}
              </label>
              <Input
                id={`component-${index}-concentration`}
                type="number"
                inputMode="decimal"
                step="any"
                value={row.concentration_at_percent}
                onChange={(event) =>
                  updateRow(index, {
                    concentration_at_percent: event.target.value,
                  })
                }
                disabled={disabled}
                placeholder={t(
                  structure === 'alloy'
                    ? 'experimentsV2.components.placeholders.siteFraction'
                    : 'experimentsV2.components.placeholders.nominalContent',
                )}
              />
            </div>
          ) : null}
          {showSpaceGroup ? (
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`component-${index}-space-group`}
                className="text-xs font-medium text-muted-foreground"
              >
                {t('experimentsV2.components.bulkSpaceGroup')}
              </label>
              <SpaceGroupInput
                id={`component-${index}-space-group`}
                value={row.bulk_space_group ?? ''}
                formula={row.formula}
                onChange={(value) =>
                  updateRow(index, { bulk_space_group: value })
                }
                disabled={disabled}
                placeholder={t(
                  'experimentsV2.sections.targetProduct.spaceGroupPlaceholder',
                )}
              />
            </div>
          ) : null}
          {showLayerOrder ? (
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`component-${index}-layer-order`}
                className="text-xs font-medium text-muted-foreground"
              >
                {t('experimentsV2.components.layerOrder')}
              </label>
              <Input
                id={`component-${index}-layer-order`}
                type="number"
                inputMode="numeric"
                step="1"
                value={row.layer_order}
                onChange={(event) =>
                  updateRow(index, { layer_order: event.target.value })
                }
                disabled={disabled}
              />
            </div>
          ) : null}
          <div className="flex items-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={t('experimentsV2.components.remove')}
              onClick={() => removeRow(index)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={addRow}
        >
          <Plus className="size-4" />
          {t('experimentsV2.components.add')}
        </Button>
      </div>
    </div>
  )
}
