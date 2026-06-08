import { Plus, Trash2 } from 'lucide-react'

import type {
  CharacterizationValues,
  VocabularySelectOption,
} from '../editor-types'
import { createEmptyCharacterizationMethod } from '../editor-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { CharacterizationFileUpload } from './characterization-file-upload'
import { VocabularyCombobox } from './vocabulary-combobox'

export function CharacterizationSection({
  characterizationMethodOptions,
  disabled,
  experimentId,
  onChange,
  value,
}: {
  characterizationMethodOptions: VocabularySelectOption[]
  disabled: boolean
  experimentId: string
  onChange: (nextValue: CharacterizationValues) => void
  value: CharacterizationValues
}) {
  const updateItem = (
    index: number,
    patch: Partial<(typeof value.methods)[number]>,
  ) => {
    onChange({
      ...value,
      methods: value.methods.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {value.methods.length === 0 ? (
        <p className="py-2 text-center text-sm text-muted-foreground">
          尚未添加表征记录
        </p>
      ) : null}

      {value.methods.map((item, index) => (
        <div
          key={`characterization-${index + 1}`}
          className="rounded-md border p-4"
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <span className="text-sm font-semibold">{`表征记录 ${index + 1}`}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                onChange({
                  ...value,
                  methods: value.methods.filter(
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
              <Label>{`表征方法 ${index + 1}`}</Label>
              <VocabularyCombobox
                ariaLabel={`表征方法 ${index + 1}`}
                disabled={disabled}
                onChange={(nextValue) => updateItem(index, { method: nextValue })}
                options={characterizationMethodOptions}
                placeholder="选择或输入表征方法"
                value={item.method}
              />
            </div>

            <div className="editor-field">
              <Label htmlFor={`characterization-${index}-enabled`}>
                {`启用表征 ${index + 1}`}
              </Label>
              <div className="flex h-9 items-center">
                <Switch
                  id={`characterization-${index}-enabled`}
                  aria-label={`启用表征 ${index + 1}`}
                  checked={item.enabled}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    updateItem(index, { enabled: checked })
                  }
                />
              </div>
            </div>

            <div className="editor-field">
              <Label htmlFor={`characterization-${index}-excitation`}>
                {`激发波长 ${index + 1}`}
              </Label>
              <Input
                id={`characterization-${index}-excitation`}
                aria-label={`激发波长 ${index + 1}`}
                autoComplete="off"
                disabled={disabled}
                placeholder="nm"
                value={item.excitationNm}
                onChange={(event) =>
                  updateItem(index, { excitationNm: event.target.value })
                }
              />
            </div>

            <div className="editor-field editor-field-wide">
              <Label htmlFor={`characterization-${index}-result`}>
                {`表征结果 ${index + 1}`}
              </Label>
              <Input
                id={`characterization-${index}-result`}
                aria-label={`表征结果 ${index + 1}`}
                autoComplete="off"
                disabled={disabled}
                placeholder="例如 peak visible"
                value={item.result}
                onChange={(event) =>
                  updateItem(index, { result: event.target.value })
                }
              />
            </div>

            <div className="editor-field editor-field-wide">
              <Label htmlFor={`characterization-${index}-note`}>
                {`表征备注 ${index + 1}`}
              </Label>
              <Textarea
                id={`characterization-${index}-note`}
                aria-label={`表征备注 ${index + 1}`}
                disabled={disabled}
                rows={2}
                placeholder="记录测量条件、设备或备注"
                value={item.note}
                onChange={(event) =>
                  updateItem(index, { note: event.target.value })
                }
              />
            </div>

            <div className="editor-field editor-field-wide">
              <Label>{`表征文件 ${index + 1}`}</Label>
              <CharacterizationFileUpload
                disabled={disabled}
                experimentId={experimentId}
                method={item.method}
              />
            </div>
          </div>
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            onChange({
              ...value,
              methods: [
                ...value.methods,
                createEmptyCharacterizationMethod(),
              ],
            })
          }}
        >
          <Plus className="size-4" />
          添加表征记录
        </Button>
      </div>
    </div>
  )
}
