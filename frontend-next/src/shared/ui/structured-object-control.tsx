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
import { canonicalOption } from '@/shared/field-i18n'
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
  disabled?: boolean
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
  | 'dimensionDescription'
  | 'outerDiameter'
  | 'outerSide'
  | 'outerWidth'
  | 'outerHeight'
  | 'wallThickness'
  | 'thickness'
  | 'roughnessMetric'
  | 'roughnessRa'
  | 'roughnessRms'
  | 'roughnessValue'
  | 'roughnessAvailability'
  | 'roughnessReported'
  | 'roughnessNotProvided'
  | 'placement'
  | 'faceUp'
  | 'faceDown'
  | 'tilted'
  | 'upright'
  | 'otherPlacement'
  | 'zoneIndex'
  | 'temperature'
  | 'temperatureBasis'
  | 'setpoint'
  | 'measured'
  | 'estimate'
  | 'notProvided'
  | 'distance'
  | 'resetCount'
  | 'useNumberSinceReset'

const TUBE_SHAPES = new Set(['round', 'square', 'rectangular', 'other'])

export function StructuredObjectControl({
  fieldKey,
  value,
  onChange,
  tubeShape,
  zoneCount,
  loadingMethod,
  disabled,
  invalid,
  ariaDescribedBy,
}: {
  fieldKey: string
  value: string
  onChange: (value: string) => void
  tubeShape?: string | null
  zoneCount?: number | null
  loadingMethod?: string | null
  disabled?: boolean
  invalid?: boolean
  ariaDescribedBy?: string
}) {
  const { t } = useTranslation()
  const baseId = useId()
  const parsedObject = parseStructuredValue(value)
  const isRoughness =
    fieldKey === 'surface_roughness' ||
    fieldKey === 'substrate_surface_roughness'
  const object =
    isRoughness &&
    parsedObject.availability == null &&
    (parsedObject.metric != null || parsedObject.value_nm != null)
      ? { ...parsedObject, availability: 'reported' }
      : parsedObject
  const label = (key: StructuredLabelKey) => t(`structuredFields.${key}`)
  const requestedTubeShape = canonicalOption(String(tubeShape ?? ''))
  const effectiveLoadingMethod = canonicalOption(String(loadingMethod ?? ''))
  const effectiveTubeShape = TUBE_SHAPES.has(requestedTubeShape)
    ? requestedTubeShape
    : object.outer_diameter_mm != null
      ? 'round'
      : ''
  const validZoneCount =
    zoneCount != null && Number.isInteger(zoneCount) && zoneCount > 0
      ? zoneCount
      : null
  const zoneOptions =
    validZoneCount == null
      ? []
      : Array.from({ length: validZoneCount }, (_, index) => ({
          value: String(index + 1),
          label: t('structuredFields.zoneOption', { index: index + 1 }),
        }))
  const historyParts: Part[] = [
    {
      key: 'reset_count',
      label: label('resetCount'),
      kind: 'integer',
      required: true,
      min: 0,
    },
    {
      key: 'use_number_since_reset',
      label: label('useNumberSinceReset'),
      kind: 'integer',
      required: true,
      min: 1,
    },
  ]

  const tubeDimensionParts: Part[] =
    effectiveTubeShape === 'round'
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
      : effectiveTubeShape === 'square'
        ? [
            {
              key: 'outer_side_mm',
              label: label('outerSide'),
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
        : effectiveTubeShape === 'rectangular'
          ? [
              {
                key: 'outer_width_mm',
                label: label('outerWidth'),
                kind: 'number',
                required: true,
              },
              {
                key: 'outer_height_mm',
                label: label('outerHeight'),
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
          : effectiveTubeShape === 'other'
            ? [
                {
                  key: 'dimension_description',
                  label: label('dimensionDescription'),
                  kind: 'text',
                  required: true,
                },
              ]
            : []

  const parts: Part[] =
    fieldKey === 'tube_outer_diameter_wall_mm'
      ? tubeDimensionParts
      : fieldKey === 'tube_usage_history'
        ? historyParts
        : fieldKey === 'source_container'
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
              ...(effectiveLoadingMethod === 'boat'
                ? [
                    {
                      key: 'length_mm',
                      label: label('length'),
                      kind: 'number' as const,
                      required: true,
                    },
                    {
                      key: 'width_mm',
                      label: label('width'),
                      kind: 'number' as const,
                      required: true,
                    },
                    {
                      key: 'height_mm',
                      label: label('height'),
                      kind: 'number' as const,
                      required: true,
                    },
                  ]
                : effectiveLoadingMethod === 'crucible'
                  ? [
                      {
                        key: 'diameter_mm',
                        label: label('diameter'),
                        kind: 'number' as const,
                        required: true,
                      },
                      {
                        key: 'height_mm',
                        label: label('height'),
                        kind: 'number' as const,
                        required: true,
                      },
                    ]
                  : [
                      {
                        key: 'description',
                        label: label('dimensionDescription'),
                        kind: 'text' as const,
                        required: true,
                      },
                    ]),
              ...historyParts,
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
              : isRoughness
                ? [
                    {
                      key: 'availability',
                      label: label('roughnessAvailability'),
                      kind: 'select',
                      required: true,
                      options: [
                        {
                          value: 'reported',
                          label: label('roughnessReported'),
                        },
                        {
                          value: 'not_provided',
                          label: label('roughnessNotProvided'),
                        },
                      ],
                    },
                    ...(object.availability === 'reported'
                      ? [
                          {
                            key: 'metric',
                            label: label('roughnessMetric'),
                            kind: 'select' as const,
                            required: true,
                            options: [
                              { value: 'Ra', label: label('roughnessRa') },
                              { value: 'RMS', label: label('roughnessRms') },
                            ],
                          },
                          {
                            key: 'value_nm',
                            label: label('roughnessValue'),
                            kind: 'number' as const,
                            required: true,
                            min: 0,
                          },
                        ]
                      : []),
                  ]
                : fieldKey === 'source_position'
                  ? [
                      {
                        key: 'zone_index',
                        label: label('zoneIndex'),
                        kind: 'select',
                        required: true,
                        disabled: validZoneCount == null,
                        options: zoneOptions,
                      },
                      {
                        key: 'distance_mm',
                        label: label('distance'),
                        kind: 'number',
                        required: true,
                      },
                      {
                        key: 'temperature_C',
                        label: label('temperature'),
                        kind: 'number',
                      },
                      {
                        key: 'temperature_basis',
                        label: label('temperatureBasis'),
                        kind: 'select',
                        options: [
                          {
                            value: '__none__',
                            label: label('notProvided'),
                          },
                          { value: 'measured', label: label('measured') },
                          { value: 'estimate', label: label('estimate') },
                        ],
                      },
                    ]
                  : [
                      {
                        key: 'zone_index',
                        label: label('zoneIndex'),
                        kind: 'select',
                        required: true,
                        disabled: validZoneCount == null,
                        options: zoneOptions,
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
    if (next === '__none__') delete updated[key]
    if (key === 'material' && next !== 'other') delete updated.material_other
    if (key === 'shape' && next !== 'other') delete updated.shape_other
    if (key === 'placement') {
      if (next !== 'tilted') delete updated.tilt_angle_deg
      if (next !== 'other') delete updated.placement_other
    }
    if (key === 'temperature_C' && next === '') {
      delete updated.temperature_basis
    }
    if (key === 'availability' && next !== 'reported') {
      delete updated.metric
      delete updated.value_nm
    }
    onChange(encodeStructuredValue(updated))
  }

  const helper =
    fieldKey === 'tube_outer_diameter_wall_mm' && !effectiveTubeShape
      ? t('structuredFields.selectTubeShapeFirst')
      : (fieldKey === 'source_position' ||
            fieldKey === 'zone_thermocouple_distance_mm') &&
          validZoneCount == null
        ? t('structuredFields.selectSetupFirst')
        : null

  return (
    <div
      role="group"
      aria-invalid={invalid || undefined}
      aria-describedby={ariaDescribedBy}
      className="grid gap-3 rounded-md border border-input p-3 sm:grid-cols-2"
    >
      {helper ? (
        <p className="text-sm text-muted-foreground sm:col-span-2">{helper}</p>
      ) : null}
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
                disabled={disabled || part.disabled}
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
                disabled={disabled || part.disabled}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
