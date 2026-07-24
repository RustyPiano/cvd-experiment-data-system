import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  encodeStructuredValue,
  parseStructuredValue,
} from '@/shared/structured-field'

type Part = {
  key: string
  label: string
  kind?: 'number' | 'integer' | 'select'
  options?: Array<{ value: string; label: string }>
  required?: boolean
}

type StructuredLabelKey =
  | 'material'
  | 'quartzBoat'
  | 'aluminaBoat'
  | 'otherMaterial'
  | 'length'
  | 'width'
  | 'height'
  | 'diameter'
  | 'outerDiameter'
  | 'wallThickness'
  | 'thickness'
  | 'placement'
  | 'faceUp'
  | 'faceDown'
  | 'tilted'
  | 'upright'
  | 'otherPlacement'
  | 'zoneIndex'
  | 'temperature'
  | 'distance'

export function StructuredObjectControl({
  fieldKey,
  value,
  onChange,
  disabled,
  invalid,
  ariaDescribedBy,
}: {
  fieldKey: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  invalid?: boolean
  ariaDescribedBy?: string
}) {
  const { t } = useTranslation()
  const baseId = useId()
  const object = parseStructuredValue(value)
  const label = (key: StructuredLabelKey) => t(`structuredFields.${key}`)
  const parts: Part[] =
    fieldKey === 'tube_outer_diameter_wall_mm'
      ? [
          {
            key: 'outer_diameter_mm',
            label: label('outerDiameter'),
            kind: 'number',
            required: true,
          },
          {
            key: 'wall_thickness_mm',
            label: label('wallThickness'),
            kind: 'number',
            required: true,
          },
        ]
      : fieldKey === 'boat_crucible'
        ? [
            {
              key: 'material',
              label: label('material'),
              kind: 'select',
              required: true,
              options: [
                { value: 'quartz_boat', label: label('quartzBoat') },
                { value: 'alumina_boat', label: label('aluminaBoat') },
                { value: 'other', label: label('otherMaterial') },
              ],
            },
            { key: 'length_mm', label: label('length'), kind: 'number' },
            { key: 'width_mm', label: label('width'), kind: 'number' },
            { key: 'height_mm', label: label('height'), kind: 'number' },
            { key: 'diameter_mm', label: label('diameter'), kind: 'number' },
          ]
        : fieldKey === 'size_placement'
          ? [
              {
                key: 'length_mm',
                label: label('length'),
                kind: 'number',
                required: true,
              },
              {
                key: 'width_mm',
                label: label('width'),
                kind: 'number',
                required: true,
              },
              {
                key: 'thickness_mm',
                label: label('thickness'),
                kind: 'number',
              },
              {
                key: 'placement',
                label: label('placement'),
                kind: 'select',
                options: [
                  { value: 'face_up', label: label('faceUp') },
                  { value: 'face_down', label: label('faceDown') },
                  { value: 'tilted', label: label('tilted') },
                  { value: 'upright', label: label('upright') },
                  { value: 'other', label: label('otherPlacement') },
                ],
              },
            ]
          : fieldKey === 'source_zone_temperature'
            ? [
                {
                  key: 'zone_index',
                  label: label('zoneIndex'),
                  kind: 'integer',
                  required: true,
                },
                {
                  key: 'temperature_C',
                  label: label('temperature'),
                  kind: 'number',
                  required: true,
                },
              ]
            : [
                {
                  key: 'zone_index',
                  label: label('zoneIndex'),
                  kind: 'integer',
                  required: true,
                },
                {
                  key: 'distance_mm',
                  label: label('distance'),
                  kind: 'number',
                  required: true,
                },
              ]

  const setPart = (key: string, next: string) => {
    onChange(encodeStructuredValue({ ...object, [key]: next }))
  }

  return (
    <div
      role="group"
      aria-invalid={invalid || undefined}
      aria-describedby={ariaDescribedBy}
      className="grid gap-3 rounded-md border border-input p-3 sm:grid-cols-2"
    >
      {parts.map((part) => {
        const id = `${baseId}-${part.key}`
        const partValue = String(object[part.key] ?? '')
        return (
          <div key={part.key} className="grid gap-1.5">
            <Label htmlFor={id}>
              {part.label}
              {part.required ? (
                <span aria-hidden="true" className="ml-0.5 text-destructive">
                  *
                </span>
              ) : null}
            </Label>
            {part.kind === 'select' ? (
              <Select
                value={partValue}
                onValueChange={(next) => setPart(part.key, next)}
                disabled={disabled}
              >
                <SelectTrigger id={id} className="w-full">
                  <SelectValue placeholder={t('structuredFields.select')} />
                </SelectTrigger>
                <SelectContent>
                  {part.options?.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={id}
                type="number"
                inputMode="decimal"
                step={part.kind === 'integer' ? 1 : 'any'}
                min={part.key === 'zone_index' ? 1 : undefined}
                value={partValue}
                onChange={(event) => setPart(part.key, event.target.value)}
                disabled={disabled}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
