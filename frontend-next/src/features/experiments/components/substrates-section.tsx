import { Trash2 } from 'lucide-react'

import {
  createEmptySubstrateItem
  
  
  
} from '../editor-types'
import type {SubstrateItemValues, SubstratesValues, VocabularySelectOption} from '../editor-types';
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/shared/ui/required-mark'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CreatableVocabularyCombobox } from './creatable-vocabulary-combobox'
import { VocabularyCombobox } from './vocabulary-combobox'

const substrateRoles = [
  { role: 'top', title: '上基底' },
  { role: 'bottom', title: '下基底' },
]
const substrateRoleSet = new Set(substrateRoles.map((item) => item.role))
// radix Select 禁止空字符串作为 item value，用哨兵代表"无"。
const POSITION_NONE = '__none__'
const positionOptions = [
  { label: '无', value: '' },
  { label: '-2', value: '-2' },
  { label: '-1', value: '-1' },
  { label: '0', value: '0' },
  { label: '1', value: '1' },
  { label: '2', value: '2' },
]

function createEmptySubstrateItemForRole(role: string): SubstrateItemValues {
  return {
    ...createEmptySubstrateItem(),
    role,
  }
}

function hasSourcePayload(item: SubstrateItemValues) {
  return Boolean(
    item.sourcePayload && Object.keys(item.sourcePayload).length > 0,
  )
}

function hasSubstrateFieldValue(item: SubstrateItemValues) {
  return [
    item.type,
    item.brand,
    item.sizeMm,
    item.batchNo,
    item.treatmentMethod,
    item.positionMm,
    item.treatmentTemperatureC,
    item.treatmentDurationMin,
    item.treatmentPowerW,
    item.treatmentGas,
  ].some((value) => value.trim().length > 0)
}

function withLegacyPositionOption(currentValue: string) {
  if (
    !currentValue ||
    positionOptions.some((option) => option.value === currentValue)
  ) {
    return positionOptions
  }
  return [{ label: currentValue, value: currentValue }, ...positionOptions]
}

export function SubstratesSection({
  disabled,
  gasOptions,
  onChange,
  substrateBrandOptions,
  substrateSizeOptions,
  substrateTreatmentMethodOptions,
  substrateTypeOptions,
  value,
}: {
  disabled: boolean
  gasOptions: VocabularySelectOption[]
  onChange: (nextValue: SubstratesValues) => void
  substrateBrandOptions: VocabularySelectOption[]
  substrateSizeOptions: VocabularySelectOption[]
  substrateTreatmentMethodOptions: VocabularySelectOption[]
  substrateTypeOptions: VocabularySelectOption[]
  value: SubstratesValues
}) {
  const updateRoleItem = (
    role: string,
    patch: Partial<SubstrateItemValues>,
  ) => {
    const existing = value.items.find((item) => item.role === role)
    const nextItem = {
      ...(existing ?? createEmptySubstrateItemForRole(role)),
      ...patch,
      role,
    }
    const nextItems = substrateRoles
      .map((roleConfig) =>
        roleConfig.role === role
          ? nextItem
          : value.items.find((item) => item.role === roleConfig.role),
      )
      .filter((item): item is SubstrateItemValues =>
        Boolean(
          item && (hasSourcePayload(item) || hasSubstrateFieldValue(item)),
        ),
      )

    onChange({ ...value, items: nextItems })
  }

  const clearRoleItem = (role: string) => {
    onChange({
      ...value,
      items: value.items.filter(
        (item) => item.role !== role && substrateRoleSet.has(item.role),
      ),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {substrateRoles.map((roleConfig) => {
        const item =
          value.items.find((substrate) => substrate.role === roleConfig.role) ??
          createEmptySubstrateItemForRole(roleConfig.role)
        const showTreatmentParams =
          item.treatmentMethod.trim().length > 0 &&
          item.treatmentMethod !== 'none'
        const isUvCleaning = item.treatmentMethod === 'uv_cleaning'
        const isClearDisabled =
          disabled ||
          !value.items.some((substrate) => substrate.role === roleConfig.role)
        const resolvedPositionOptions = withLegacyPositionOption(
          item.positionMm,
        )

        return (
          <div key={roleConfig.role} className="rounded-md border p-4">
            <div className="mb-4 flex items-center justify-between gap-4">
              <span className="text-sm font-semibold">{roleConfig.title}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isClearDisabled}
                onClick={() => clearRoleItem(roleConfig.role)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
                {`清空${roleConfig.title}`}
              </Button>
            </div>

            <div className="editor-grid">
              <div className="editor-field">
                <Label>
                  基底类型
                  <RequiredMark />
                </Label>
                <VocabularyCombobox
                  ariaLabel={`基底类型 ${roleConfig.title}`}
                  disabled={disabled}
                  onChange={(nextValue) =>
                    updateRoleItem(roleConfig.role, { type: nextValue })
                  }
                  options={substrateTypeOptions}
                  placeholder="选择或输入基底类型"
                  value={item.type}
                />
              </div>

              <div className="editor-field">
                <Label>{`品牌`}</Label>
                <CreatableVocabularyCombobox
                  ariaLabel={`品牌 ${roleConfig.title}`}
                  disabled={disabled}
                  onChange={(nextValue) =>
                    updateRoleItem(roleConfig.role, { brand: nextValue })
                  }
                  options={substrateBrandOptions}
                  placeholder="选择或输入品牌"
                  value={item.brand}
                  vocabKey="substrate_brand"
                />
              </div>

              <div className="editor-field">
                <Label>{`尺寸`}</Label>
                <VocabularyCombobox
                  ariaLabel={`尺寸 ${roleConfig.title}`}
                  disabled={disabled}
                  onChange={(nextValue) =>
                    updateRoleItem(roleConfig.role, { sizeMm: nextValue })
                  }
                  options={substrateSizeOptions}
                  placeholder="选择或输入尺寸"
                  value={item.sizeMm}
                />
              </div>

              <div className="editor-field">
                <Label
                  htmlFor={`substrate-${roleConfig.role}-batch`}
                >{`基底批次`}</Label>
                <Input
                  id={`substrate-${roleConfig.role}-batch`}
                  aria-label={`基底批次 ${roleConfig.title}`}
                  autoComplete="off"
                  disabled={disabled}
                  placeholder="填写基底批次"
                  value={item.batchNo}
                  onChange={(event) =>
                    updateRoleItem(roleConfig.role, {
                      batchNo: event.target.value,
                    })
                  }
                />
              </div>

              <div className="editor-field">
                <Label>{`处理方式`}</Label>
                <VocabularyCombobox
                  ariaLabel={`处理方式 ${roleConfig.title}`}
                  disabled={disabled}
                  onChange={(nextValue) => {
                    const patch: Partial<SubstrateItemValues> = {
                      treatmentMethod: nextValue,
                    }
                    if (nextValue === 'uv_cleaning') {
                      patch.treatmentGas = 'air'
                      patch.treatmentPowerW = ''
                    }
                    updateRoleItem(roleConfig.role, patch)
                  }}
                  options={substrateTreatmentMethodOptions}
                  placeholder="选择或输入处理方式"
                  value={item.treatmentMethod}
                />
              </div>

              <div className="editor-field">
                <Label
                  htmlFor={`substrate-${roleConfig.role}-position`}
                >{`相对温区位置`}</Label>
                <Select
                  disabled={disabled}
                  value={item.positionMm || POSITION_NONE}
                  onValueChange={(nextValue) =>
                    updateRoleItem(roleConfig.role, {
                      positionMm: nextValue === POSITION_NONE ? '' : nextValue,
                    })
                  }
                >
                  <SelectTrigger
                    id={`substrate-${roleConfig.role}-position`}
                    aria-label={`相对温区位置 ${roleConfig.title}`}
                  >
                    <SelectValue placeholder="选择相对温区位置" />
                  </SelectTrigger>
                  <SelectContent>
                    {resolvedPositionOptions.map((option) => (
                      <SelectItem
                        key={option.value || POSITION_NONE}
                        value={option.value || POSITION_NONE}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {showTreatmentParams ? (
                <>
                  <div className="editor-field">
                    <Label
                      htmlFor={`substrate-${roleConfig.role}-treat-temp`}
                    >{`处理参数温度`}</Label>
                    <Input
                      id={`substrate-${roleConfig.role}-treat-temp`}
                      aria-label={`处理参数温度 ${roleConfig.title}`}
                      autoComplete="off"
                      disabled={disabled}
                      placeholder="°C"
                      value={item.treatmentTemperatureC}
                      onChange={(event) =>
                        updateRoleItem(roleConfig.role, {
                          treatmentTemperatureC: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="editor-field">
                    <Label
                      htmlFor={`substrate-${roleConfig.role}-treat-duration`}
                    >{`处理参数时长`}</Label>
                    <Input
                      id={`substrate-${roleConfig.role}-treat-duration`}
                      aria-label={`处理参数时长 ${roleConfig.title}`}
                      autoComplete="off"
                      disabled={disabled}
                      placeholder="min"
                      value={item.treatmentDurationMin}
                      onChange={(event) =>
                        updateRoleItem(roleConfig.role, {
                          treatmentDurationMin: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="editor-field">
                    <Label
                      htmlFor={`substrate-${roleConfig.role}-treat-power`}
                    >{`处理参数功率`}</Label>
                    <Input
                      id={`substrate-${roleConfig.role}-treat-power`}
                      aria-label={`处理参数功率 ${roleConfig.title}`}
                      autoComplete="off"
                      disabled={disabled || isUvCleaning}
                      placeholder={isUvCleaning ? '不可调' : 'W'}
                      value={item.treatmentPowerW}
                      onChange={(event) =>
                        updateRoleItem(roleConfig.role, {
                          treatmentPowerW: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="editor-field">
                    <Label>{`处理参数气体`}</Label>
                    <VocabularyCombobox
                      ariaLabel={`处理参数气体 ${roleConfig.title}`}
                      disabled={disabled || isUvCleaning}
                      onChange={(nextValue) =>
                        updateRoleItem(roleConfig.role, {
                          treatmentGas: nextValue,
                        })
                      }
                      options={gasOptions}
                      placeholder={isUvCleaning ? '恒为空气' : '选择或输入气体'}
                      value={item.treatmentGas}
                    />
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
