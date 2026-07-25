import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
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
  kind?: 'number' | 'integer' | 'select' | 'text'
  options?: Array<{ value: string; label: string }>
  required?: boolean
  min?: number
  max?: number
}

type StructuredLabelKey =
  | 'material'
  | 'shape'
  | 'quartz'
  | 'alumina'
  | 'round'
  | 'square'
  | 'rectangular'
  | 'otherShape'
  | 'otherMaterialName'
  | 'otherPlacementName'
  | 'tiltAngle'
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
  | 'roughnessMetric'
  | 'roughnessRa'
  | 'roughnessRms'
  | 'roughnessValue'
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
            ...(object.material === 'other'
              ? [
                  {
                    key: 'material_other',
                    label: label('otherMaterialName'),
                    kind: 'text' as const,
                    required: true,
                  },
                ]
              : []),
            { key: 'length_mm', label: label('length'), kind: 'number' },
            { key: 'width_mm', label: label('width'), kind: 'number' },
            { key: 'height_mm', label: label('height'), kind: 'number' },
            { key: 'diameter_mm', label: label('diameter'), kind: 'number' },
          ]
        : fieldKey === 'tube_material_shape'
          ? [
              {
                key: 'material',
                label: label('material'),
                kind: 'select',
                required: true,
                options: [
                  { value: 'quartz', label: label('quartz') },
                  { value: 'alumina', label: label('alumina') },
                  { value: 'other', label: label('otherMaterial') },
                ],
              },
              ...(object.material === 'other'
                ? [
                    {
                      key: 'material_other',
                      label: label('otherMaterialName'),
                      kind: 'text' as const,
                      required: true,
                    },
                  ]
                : []),
              {
                key: 'shape',
                label: label('shape'),
                kind: 'select',
                required: true,
                options: [
                  { value: 'round', label: label('round') },
                  { value: 'square', label: label('square') },
                  { value: 'rectangular', label: label('rectangular') },
                  { value: 'other', label: label('otherShape') },
                ],
              },
              ...(object.shape === 'other'
                ? [
                    {
                      key: 'shape_other',
                      label: label('otherShape'),
                      kind: 'text' as const,
                      required: true,
                    },
                  ]
                : []),
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
                  required: true,
                  options: [
                    { value: 'face_up', label: label('faceUp') },
                    { value: 'face_down', label: label('faceDown') },
                    { value: 'tilted', label: label('tilted') },
                    { value: 'upright', label: label('upright') },
                    { value: 'other', label: label('otherPlacement') },
                  ],
                },
                ...(object.placement === 'tilted'
                  ? [
                      {
                        key: 'tilt_angle_deg',
                        label: label('tiltAngle'),
                        kind: 'number' as const,
                        required: true,
                        min: 0,
                        max: 90,
                      },
                    ]
                  : []),
                ...(object.placement === 'other'
                  ? [
                      {
                        key: 'placement_other',
                        label: label('otherPlacementName'),
                        kind: 'text' as const,
                        required: true,
                      },
                    ]
                  : []),
              ]
            : fieldKey === 'surface_roughness'
              ? [
                  {
                    key: 'metric',
                    label: label('roughnessMetric'),
                    kind: 'select',
                    required: true,
                    options: [
                      { value: 'Ra', label: label('roughnessRa') },
                      { value: 'RMS', label: label('roughnessRms') },
                    ],
                  },
                  {
                    key: 'value_nm',
                    label: label('roughnessValue'),
                    kind: 'number',
                    required: true,
                    min: 0,
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
    const updated = { ...object, [key]: next }
    if (key === 'material' && next !== 'other') delete updated.material_other
    if (key === 'shape' && next !== 'other') delete updated.shape_other
    if (key === 'placement') {
      if (next !== 'tilted') delete updated.tilt_angle_deg
      if (next !== 'other') delete updated.placement_other
    }
    onChange(encodeStructuredValue(updated))
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
                  <SelectGroup>
                    {part.options?.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={id}
                type={part.kind === 'text' ? 'text' : 'number'}
                inputMode={part.kind === 'text' ? undefined : 'decimal'}
                step={
                  part.kind === 'text'
                    ? undefined
                    : part.kind === 'integer'
                      ? 1
                      : 'any'
                }
                min={part.min ?? (part.key === 'zone_index' ? 1 : undefined)}
                max={part.max}
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
