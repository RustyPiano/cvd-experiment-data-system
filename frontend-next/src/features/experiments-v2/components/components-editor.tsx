// §1b 组成明细 components[] 编辑器：逐组分 {化学式 / 角色 / 浓度 at% / 层序}。
// 结构类型≠本征时条件必填（由上层控制显隐 + 必填提示）。化学式带元素校验。
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ComponentRow } from '../field-logic'
import { emptyComponentRow, getComponentRoleOptions } from '../field-logic'
import { FormulaInput } from './formula-input'

export function ComponentsEditor({
  rows,
  onChange,
  disabled,
  showError,
}: {
  rows: ComponentRow[]
  onChange: (rows: ComponentRow[]) => void
  disabled?: boolean
  /** 上层判定「结构类型≠本征但组分为空」时置真，高亮缺失。 */
  showError?: boolean
}) {
  const { t } = useTranslation()
  const roleOptions = getComponentRoleOptions()

  const updateRow = (index: number, patch: Partial<ComponentRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  const addRow = () => onChange([...rows, emptyComponentRow()])
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
          className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[2fr_1.4fr_1fr_1fr_auto]"
        >
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`component-${index}-formula`}
              className="text-xs font-medium text-muted-foreground"
            >
              {t('experimentsV2.components.formula')}
            </label>
            <FormulaInput
              id={`component-${index}-formula`}
              value={row.formula}
              onChange={(value) => updateRow(index, { formula: value })}
              disabled={disabled}
            />
          </div>
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
              <SelectTrigger id={`component-${index}-role`} className="w-full">
                <SelectValue
                  placeholder={t('experimentsV2.form.selectPlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`component-${index}-concentration`}
              className="text-xs font-medium text-muted-foreground"
            >
              {t('experimentsV2.components.concentration')}
            </label>
            <Input
              id={`component-${index}-concentration`}
              inputMode="decimal"
              value={row.concentration_at_percent}
              onChange={(event) =>
                updateRow(index, {
                  concentration_at_percent: event.target.value,
                })
              }
              disabled={disabled}
              placeholder="at%"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`component-${index}-layer-order`}
              className="text-xs font-medium text-muted-foreground"
            >
              {t('experimentsV2.components.layerOrder')}
            </label>
            <Input
              id={`component-${index}-layer-order`}
              inputMode="numeric"
              value={row.layer_order}
              onChange={(event) =>
                updateRow(index, { layer_order: event.target.value })
              }
              disabled={disabled}
            />
          </div>
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
