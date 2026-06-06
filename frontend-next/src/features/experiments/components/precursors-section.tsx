import { Plus, Trash2 } from 'lucide-react'

import {
  createEmptyPrecursorItem,
  createPrecursorMethodPatch,
  resolvePrecursorMethodFlags
  
  
} from '../editor-types'
import type {PrecursorsValues, VocabularySelectOption} from '../editor-types';
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { VocabularyCombobox } from './vocabulary-combobox'

export function PrecursorsSection({
  disabled,
  onChange,
  precursorMethodOptions,
  value,
}: {
  disabled: boolean
  onChange: (nextValue: PrecursorsValues) => void
  precursorMethodOptions: VocabularySelectOption[]
  value: PrecursorsValues
}) {
  const updateItem = (
    index: number,
    patch: Partial<(typeof value.items)[number]>,
  ) => {
    onChange({
      ...value,
      items: value.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {value.items.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          尚未添加前驱体
        </p>
      ) : null}

      {value.items.map((item, index) => {
        const flags = resolvePrecursorMethodFlags(item.method)
        return (
          <div key={`precursor-${index + 1}`} className="rounded-md border p-4">
            <div className="mb-4 flex items-center justify-between gap-4">
              <span className="text-sm font-semibold">{`前驱体 ${index + 1}`}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  onChange({
                    ...value,
                    items: value.items.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  })
                }}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
                <span className="sr-only">删除</span>
              </Button>
            </div>

            <div className="editor-grid">
              <div className="editor-field">
                <Label
                  htmlFor={`precursor-${index}-species`}
                >{`前驱体种类 ${index + 1}`}</Label>
                <Input
                  id={`precursor-${index}-species`}
                  aria-label={`前驱体种类 ${index + 1}`}
                  autoComplete="off"
                  disabled={disabled}
                  placeholder="例如 MoO3"
                  value={item.species}
                  onChange={(event) =>
                    updateItem(index, { species: event.target.value })
                  }
                />
              </div>

              <div className="editor-field">
                <Label
                  htmlFor={`precursor-${index}-brand`}
                >{`前驱体品牌 ${index + 1}`}</Label>
                <Input
                  id={`precursor-${index}-brand`}
                  aria-label={`前驱体品牌 ${index + 1}`}
                  autoComplete="off"
                  disabled={disabled}
                  placeholder="例如 Alfa"
                  value={item.brand}
                  onChange={(event) =>
                    updateItem(index, { brand: event.target.value })
                  }
                />
              </div>

              <div className="editor-field">
                <Label>{`制备方法 ${index + 1}`}</Label>
                <VocabularyCombobox
                  ariaLabel={`制备方法 ${index + 1}`}
                  disabled={disabled}
                  onChange={(nextValue) =>
                    updateItem(index, createPrecursorMethodPatch(nextValue))
                  }
                  options={precursorMethodOptions}
                  placeholder="选择或输入制备方法"
                  value={item.method}
                />
              </div>

              {!flags.hideMassAndPrepTime ? (
                <>
                  <div className="editor-field">
                    <Label
                      htmlFor={`precursor-${index}-mass`}
                    >{`前驱体质量 ${index + 1}`}</Label>
                    <Input
                      id={`precursor-${index}-mass`}
                      aria-label={`前驱体质量 ${index + 1}`}
                      autoComplete="off"
                      disabled={disabled}
                      placeholder="mg"
                      value={item.massMg}
                      onChange={(event) =>
                        updateItem(index, { massMg: event.target.value })
                      }
                    />
                  </div>
                  <div className="editor-field">
                    <Label
                      htmlFor={`precursor-${index}-prep-time`}
                    >{`制备时长 ${index + 1}`}</Label>
                    <Input
                      id={`precursor-${index}-prep-time`}
                      aria-label={`制备时长 ${index + 1}`}
                      autoComplete="off"
                      disabled={disabled}
                      placeholder="min"
                      value={item.preparationTimeMin}
                      onChange={(event) =>
                        updateItem(index, {
                          preparationTimeMin: event.target.value,
                        })
                      }
                    />
                  </div>
                </>
              ) : null}

              <div className="editor-field">
                <Label
                  htmlFor={`precursor-${index}-batch`}
                >{`前驱体批次 ${index + 1}`}</Label>
                <Input
                  id={`precursor-${index}-batch`}
                  aria-label={`前驱体批次 ${index + 1}`}
                  autoComplete="off"
                  disabled={disabled}
                  placeholder="例如 MO-2026-01"
                  value={item.batchNo}
                  onChange={(event) =>
                    updateItem(index, { batchNo: event.target.value })
                  }
                />
              </div>

              {flags.showConcentrationFields ? (
                <>
                  <div className="editor-field">
                    <Label
                      htmlFor={`precursor-${index}-concentration`}
                    >{`浓度 ${index + 1}`}</Label>
                    <Input
                      id={`precursor-${index}-concentration`}
                      aria-label={`浓度 ${index + 1}`}
                      autoComplete="off"
                      disabled={disabled}
                      placeholder="例如 0.5"
                      value={item.concentration}
                      onChange={(event) =>
                        updateItem(index, { concentration: event.target.value })
                      }
                    />
                  </div>
                  <div className="editor-field">
                    <Label
                      htmlFor={`precursor-${index}-concentration-unit`}
                    >{`浓度单位 ${index + 1}`}</Label>
                    <Input
                      id={`precursor-${index}-concentration-unit`}
                      aria-label={`浓度单位 ${index + 1}`}
                      autoComplete="off"
                      disabled={disabled}
                      placeholder="例如 mol/L"
                      value={item.concentrationUnit}
                      onChange={(event) =>
                        updateItem(index, {
                          concentrationUnit: event.target.value,
                        })
                      }
                    />
                  </div>
                </>
              ) : null}

              {flags.showSpinFields ? (
                <>
                  <div className="editor-field">
                    <Label
                      htmlFor={`precursor-${index}-pre-spin-speed`}
                    >{`预旋涂转速 ${index + 1}`}</Label>
                    <Input
                      id={`precursor-${index}-pre-spin-speed`}
                      aria-label={`预旋涂转速 ${index + 1}`}
                      autoComplete="off"
                      disabled={disabled}
                      placeholder="rpm"
                      value={item.preSpinSpeedRpm}
                      onChange={(event) =>
                        updateItem(index, {
                          preSpinSpeedRpm: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="editor-field">
                    <Label
                      htmlFor={`precursor-${index}-pre-spin-time`}
                    >{`预旋涂时长 ${index + 1}`}</Label>
                    <Input
                      id={`precursor-${index}-pre-spin-time`}
                      aria-label={`预旋涂时长 ${index + 1}`}
                      autoComplete="off"
                      disabled={disabled}
                      placeholder="s"
                      value={item.preSpinTimeS}
                      onChange={(event) =>
                        updateItem(index, { preSpinTimeS: event.target.value })
                      }
                    />
                  </div>
                  <div className="editor-field">
                    <Label
                      htmlFor={`precursor-${index}-spin-speed`}
                    >{`旋涂转速 ${index + 1}`}</Label>
                    <Input
                      id={`precursor-${index}-spin-speed`}
                      aria-label={`旋涂转速 ${index + 1}`}
                      autoComplete="off"
                      disabled={disabled}
                      placeholder="rpm"
                      value={item.spinSpeedRpm}
                      onChange={(event) =>
                        updateItem(index, { spinSpeedRpm: event.target.value })
                      }
                    />
                  </div>
                  <div className="editor-field">
                    <Label
                      htmlFor={`precursor-${index}-spin-time`}
                    >{`旋涂时长 ${index + 1}`}</Label>
                    <Input
                      id={`precursor-${index}-spin-time`}
                      aria-label={`旋涂时长 ${index + 1}`}
                      autoComplete="off"
                      disabled={disabled}
                      placeholder="s"
                      value={item.spinTimeS}
                      onChange={(event) =>
                        updateItem(index, { spinTimeS: event.target.value })
                      }
                    />
                  </div>
                </>
              ) : null}

              {flags.showMeltingFields ? (
                <div className="editor-field">
                  <Label
                    htmlFor={`precursor-${index}-melting-temp`}
                  >{`熔融温度 ${index + 1}`}</Label>
                  <Input
                    id={`precursor-${index}-melting-temp`}
                    aria-label={`熔融温度 ${index + 1}`}
                    autoComplete="off"
                    disabled={disabled}
                    placeholder="°C"
                    value={item.meltingTemperatureC}
                    onChange={(event) =>
                      updateItem(index, {
                        meltingTemperatureC: event.target.value,
                      })
                    }
                  />
                </div>
              ) : null}
            </div>
          </div>
        )
      })}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            onChange({
              ...value,
              items: [...value.items, createEmptyPrecursorItem()],
            })
          }}
        >
          <Plus className="size-4" />
          添加前驱体
        </Button>
      </div>
    </div>
  )
}
