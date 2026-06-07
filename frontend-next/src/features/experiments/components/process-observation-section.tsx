import { Plus, Trash2 } from 'lucide-react'

import type { ProcessObservationValues } from '../editor-types'
import { createEmptyObservationEvent } from '../editor-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function ProcessObservationSection({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean
  onChange: (nextValue: ProcessObservationValues) => void
  value: ProcessObservationValues
}) {
  const updateEvent = (index: number, nextValue: string) => {
    onChange({
      ...value,
      abnormalEvents: value.abnormalEvents.map((item, itemIndex) =>
        itemIndex === index ? nextValue : item,
      ),
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="editor-field">
        <Label htmlFor="process-observation-color">颜色变化</Label>
        <Input
          id="process-observation-color"
          aria-label="颜色变化"
          autoComplete="off"
          disabled={disabled}
          placeholder="例如 center area darkened"
          value={value.colorChange}
          onChange={(event) =>
            onChange({ ...value, colorChange: event.target.value })
          }
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="process-observation-note">观察备注</Label>
        <Textarea
          id="process-observation-note"
          aria-label="观察备注"
          disabled={disabled}
          rows={3}
          placeholder="记录生长过程中的稳定性、沉积或异常情况"
          value={value.note}
          onChange={(event) => onChange({ ...value, note: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-3">
        {value.abnormalEvents.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">
            尚未添加异常事件
          </p>
        ) : null}
        {value.abnormalEvents.map((item, index) => (
          <div
            key={`observation-event-${index + 1}`}
            className="rounded-md border p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <span className="text-sm font-semibold">{`异常事件 ${index + 1}`}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  onChange({
                    ...value,
                    abnormalEvents: value.abnormalEvents.filter(
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
            <Input
              aria-label={`异常事件 ${index + 1}`}
              autoComplete="off"
              disabled={disabled}
              placeholder="例如 minor condensate"
              value={item}
              onChange={(event) => updateEvent(index, event.target.value)}
            />
          </div>
        ))}
      </div>

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            onChange({
              ...value,
              abnormalEvents: [
                ...value.abnormalEvents,
                createEmptyObservationEvent(),
              ],
            })
          }}
        >
          <Plus className="size-4" />
          添加异常事件
        </Button>
      </div>
    </div>
  )
}
