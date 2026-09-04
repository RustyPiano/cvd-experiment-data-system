import { canonicalOption } from '@/shared/field-i18n'

const STRUCTURED_INPUTS = new Set([
  '\u5177\u540d\u5c3a\u5bf8\u5bf9\u8c61',
  '\u7089\u7ba1\u5c3a\u5bf8\u5bf9\u8c61',
  '\u4f7f\u7528\u5c65\u5386\u5bf9\u8c61',
  '\u6e29\u533a\u6e29\u5ea6\u5bf9\u8c61',
  '\u6e29\u533a\u8ddd\u79bb\u5bf9\u8c61',
  '\u7ba1\u6750\u8d28\u5f62\u72b6\u5bf9\u8c61',
  '\u7c97\u7cd9\u5ea6\u5bf9\u8c61',
  '\u886c\u5e95\u5c3a\u5bf8\u653e\u7f6e\u5bf9\u8c61',
  '\u6e29\u5ea6\u4f20\u611f\u5668\u6570\u7ec4',
  '\u524d\u9a71\u4f53\u6e90\u5bb9\u5668\u5bf9\u8c61',
  '\u524d\u9a71\u4f53\u4f4d\u7f6e\u5bf9\u8c61',
])
const TUBE_MATERIAL_CODES = new Set(['quartz', 'alumina', 'other'])
const TUBE_SHAPE_CODES = new Set(['round', 'square', 'rectangular', 'other'])
const PLACEMENT_CODES = new Set([
  'face_up',
  'face_down',
  'tilted',
  'upright',
  'other',
])
const UPRIGHT_GROWTH_FACE_DIRECTIONS = new Set([
  'downstream',
  'upstream',
  'tube_left',
  'tube_right',
])
const ROUGHNESS_METRICS = new Set(['Ra', 'RMS'])
const ROUGHNESS_AVAILABILITIES = new Set(['reported', 'not_provided'])
const TEMPERATURE_BASIS_CODES = new Set(['measured', 'estimate'])

export interface StructuredFieldContext {
  tubeShape?: string | null
  zoneCount?: number | null
  loadingMethod?: string | null
}

export function isStructuredInput(input: string): boolean {
  return STRUCTURED_INPUTS.has(input)
}

export function parseStructuredValue(value: string): Record<string, unknown> {
  if (!value.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export function encodeStructuredValue(value: Record<string, unknown>): string {
  const compact = Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== '' && item != null),
  )
  return Object.keys(compact).length > 0 ? JSON.stringify(compact) : ''
}

function legacyOption(
  option: unknown,
  allowed: ReadonlySet<string>,
): string | undefined {
  const code = canonicalOption(String(option ?? ''))
  return allowed.has(code) ? code : undefined
}

function legacyZoneIndex(option: unknown): number | undefined {
  const match = canonicalOption(String(option ?? '')).match(/^zone_([1-9]\d*)$/)
  return match ? Number(match[1]) : undefined
}

export function structuredValueFromRaw(fieldKey: string, raw: unknown): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ''
  const value = raw as Record<string, unknown>
  const legacyComposite = 'value' in value || 'option' in value
  if (fieldKey === 'tube_outer_diameter_wall_mm' && legacyComposite) {
    const diameters: Record<string, number> = {
      tube_1_inch: 25.4,
      tube_2_inch: 50.8,
      tube_4_inch: 101.6,
      '1″': 25.4,
      '2″': 50.8,
      '4″': 101.6,
    }
    return encodeStructuredValue({
      outer_diameter_mm:
        diameters[String(value.option ?? '')] ?? value.outer_diameter_mm,
      wall_thickness_mm: value.value ?? value.wall_thickness_mm,
    })
  }
  if (fieldKey === 'tube_material_shape' && legacyComposite) {
    const combined = canonicalOption(String(value.option ?? ''))
    const combinedParts: Record<string, { material: string; shape: string }> = {
      quartz_round: { material: 'quartz', shape: 'round' },
      alumina_round: { material: 'alumina', shape: 'round' },
    }
    const fallback = combinedParts[combined]
    return encodeStructuredValue({
      material:
        value.material ??
        fallback?.material ??
        legacyOption(value.option, TUBE_MATERIAL_CODES),
      material_other: value.material_other,
      shape:
        value.shape ??
        fallback?.shape ??
        legacyOption(value.value, TUBE_SHAPE_CODES),
      shape_other: value.shape_other,
    })
  }
  if (fieldKey === 'size_placement' && legacyComposite) {
    return encodeStructuredValue({
      length_mm: value.length_mm ?? value.value,
      width_mm: value.width_mm,
      thickness_mm: value.thickness_mm,
      placement: value.placement ?? legacyOption(value.option, PLACEMENT_CODES),
      tilt_angle_deg: value.tilt_angle_deg,
      tilt_azimuth_deg: value.tilt_azimuth_deg,
      upright_growth_face_direction: value.upright_growth_face_direction,
      placement_other: value.placement_other,
    })
  }
  if (fieldKey === 'zone_thermocouple_distance_mm' && legacyComposite) {
    return encodeStructuredValue({
      zone_index: value.zone_index ?? legacyZoneIndex(value.option),
      distance_mm: value.distance_mm ?? value.value,
    })
  }
  if (
    fieldKey === 'surface_roughness' ||
    fieldKey === 'substrate_surface_roughness'
  ) {
    return encodeStructuredValue({
      availability:
        value.availability ??
        (value.metric != null || value.value_nm != null
          ? 'reported'
          : undefined),
      metric: value.metric,
      value_nm: value.value_nm,
    })
  }
  return encodeStructuredValue(value)
}

function finite(
  value: unknown,
  key: string,
  options: { positive?: boolean; integer?: boolean } = {},
): number {
  const number = Number(value)
  if (
    !Number.isFinite(number) ||
    (options.positive && number <= 0) ||
    (options.integer && !Number.isInteger(number))
  ) {
    throw new RangeError(`${key} is invalid`)
  }
  return number
}

function optionalPositive(value: unknown, key: string): number | null {
  return value == null || value === ''
    ? null
    : finite(value, key, { positive: true })
}

export function structuredPayload(
  fieldKey: string,
  value: string,
  context: StructuredFieldContext = {},
): Record<string, unknown> | null {
  const object = parseStructuredValue(value)
  if (Object.keys(object).length === 0) return null

  if (fieldKey === 'tube_outer_diameter_wall_mm') {
    const requestedShape = canonicalOption(String(context.tubeShape ?? ''))
    const shape = TUBE_SHAPE_CODES.has(requestedShape)
      ? requestedShape
      : object.outer_diameter_mm != null
        ? 'round'
        : ''
    if (shape === 'round') {
      const wall = finite(object.wall_thickness_mm, 'wall_thickness_mm', {
        positive: true,
      })
      const outer = finite(object.outer_diameter_mm, 'outer_diameter_mm', {
        positive: true,
      })
      if (wall * 2 >= outer) {
        throw new RangeError('wall thickness must be less than the radius')
      }
      return { outer_diameter_mm: outer, wall_thickness_mm: wall }
    }
    if (shape === 'square') {
      const wall = finite(object.wall_thickness_mm, 'wall_thickness_mm', {
        positive: true,
      })
      const side = finite(object.outer_side_mm, 'outer_side_mm', {
        positive: true,
      })
      if (wall * 2 >= side) {
        throw new RangeError('wall thickness must be less than half the side')
      }
      return { outer_side_mm: side, wall_thickness_mm: wall }
    }
    if (shape === 'rectangular') {
      const wall = finite(object.wall_thickness_mm, 'wall_thickness_mm', {
        positive: true,
      })
      const width = finite(object.outer_width_mm, 'outer_width_mm', {
        positive: true,
      })
      const height = finite(object.outer_height_mm, 'outer_height_mm', {
        positive: true,
      })
      if (wall * 2 >= Math.min(width, height)) {
        throw new RangeError(
          'wall thickness must be less than half the shortest side',
        )
      }
      return {
        outer_width_mm: width,
        outer_height_mm: height,
        wall_thickness_mm: wall,
      }
    }
    if (shape === 'other') {
      const description = String(object.dimension_description ?? '').trim()
      if (!description) {
        throw new RangeError('dimension_description is required')
      }
      return {
        dimension_description: description,
      }
    }
    throw new RangeError('tube shape is required before dimensions')
  }
  if (fieldKey === 'tube_usage_history') {
    const resetCount = finite(object.reset_count, 'reset_count', {
      integer: true,
    })
    if (resetCount < 0) {
      throw new RangeError('reset_count must be non-negative')
    }
    const useNumber = finite(
      object.use_number_since_reset,
      'use_number_since_reset',
      { positive: true, integer: true },
    )
    return {
      reset_count: resetCount,
      use_number_since_reset: useNumber,
    }
  }
  if (fieldKey === 'source_container') {
    const loadingMethod = canonicalOption(String(context.loadingMethod ?? ''))
    if (!['boat', 'crucible', 'other_container'].includes(loadingMethod)) {
      throw new RangeError('loading method is required')
    }
    const material = canonicalOption(String(object.material ?? ''))
    if (!TUBE_MATERIAL_CODES.has(material)) {
      throw new RangeError('material is required')
    }
    const materialOther =
      material === 'other' ? String(object.material_other ?? '').trim() : ''
    if (material === 'other' && !materialOther) {
      throw new RangeError('material_other is required')
    }
    const dimensions =
      loadingMethod === 'boat'
        ? {
            length_mm: finite(object.length_mm, 'length_mm', {
              positive: true,
            }),
            width_mm: finite(object.width_mm, 'width_mm', { positive: true }),
            height_mm: finite(object.height_mm, 'height_mm', {
              positive: true,
            }),
          }
        : loadingMethod === 'crucible'
          ? {
              diameter_mm: finite(object.diameter_mm, 'diameter_mm', {
                positive: true,
              }),
              height_mm: finite(object.height_mm, 'height_mm', {
                positive: true,
              }),
            }
          : {
              description: String(object.description ?? '').trim(),
            }
    if (
      loadingMethod === 'other_container' &&
      !('description' in dimensions && dimensions.description)
    ) {
      throw new RangeError('description is required')
    }
    const result = {
      material,
      material_other: materialOther || null,
      ...dimensions,
      reset_count: finite(object.reset_count, 'reset_count', {
        integer: true,
      }),
      use_number_since_reset: finite(
        object.use_number_since_reset,
        'use_number_since_reset',
        { positive: true, integer: true },
      ),
    }
    if (result.reset_count < 0) {
      throw new RangeError('reset_count must be non-negative')
    }
    return result
  }
  if (fieldKey === 'tube_material_shape') {
    const material = canonicalOption(String(object.material ?? ''))
    const shape = canonicalOption(String(object.shape ?? ''))
    if (!TUBE_MATERIAL_CODES.has(material)) {
      throw new RangeError('material is required')
    }
    if (!TUBE_SHAPE_CODES.has(shape)) {
      throw new RangeError('shape is required')
    }
    const materialOther =
      material === 'other' ? String(object.material_other ?? '').trim() : ''
    const shapeOther =
      shape === 'other' ? String(object.shape_other ?? '').trim() : ''
    if (material === 'other' && !materialOther) {
      throw new RangeError('material_other is required')
    }
    if (shape === 'other' && !shapeOther) {
      throw new RangeError('shape_other is required')
    }
    return {
      material,
      material_other: materialOther || null,
      shape,
      shape_other: shapeOther || null,
    }
  }
  if (fieldKey === 'size_placement') {
    const placement = canonicalOption(String(object.placement ?? ''))
    if (!PLACEMENT_CODES.has(placement)) {
      throw new RangeError('placement is required')
    }
    const tiltAngle =
      placement === 'tilted'
        ? finite(object.tilt_angle_deg, 'tilt_angle_deg')
        : null
    if (
      tiltAngle != null &&
      (tiltAngle <= -90 || tiltAngle === 0 || tiltAngle >= 90)
    ) {
      throw new RangeError(
        'tilt_angle_deg must be between -90 and 90 and non-zero',
      )
    }
    const tiltAzimuth =
      placement === 'tilted'
        ? finite(object.tilt_azimuth_deg, 'tilt_azimuth_deg')
        : null
    if (tiltAzimuth != null && (tiltAzimuth < 0 || tiltAzimuth >= 360)) {
      throw new RangeError('tilt_azimuth_deg must be between 0 and 360')
    }
    const uprightDirection =
      placement === 'upright'
        ? canonicalOption(String(object.upright_growth_face_direction ?? ''))
        : ''
    if (
      placement === 'upright' &&
      !UPRIGHT_GROWTH_FACE_DIRECTIONS.has(uprightDirection)
    ) {
      throw new RangeError('upright_growth_face_direction is required')
    }
    const placementOther =
      placement === 'other' ? String(object.placement_other ?? '').trim() : ''
    if (placement === 'other' && !placementOther) {
      throw new RangeError('placement_other is required')
    }
    const lengthMm = finite(object.length_mm, 'length_mm', { positive: true })
    const widthMm = finite(object.width_mm, 'width_mm', { positive: true })
    if (lengthMm < widthMm) {
      throw new RangeError(
        'length_mm must be greater than or equal to width_mm',
      )
    }
    return {
      length_mm: lengthMm,
      width_mm: widthMm,
      thickness_mm: optionalPositive(object.thickness_mm, 'thickness_mm'),
      placement,
      tilt_angle_deg: tiltAngle,
      tilt_azimuth_deg: tiltAzimuth,
      upright_growth_face_direction: uprightDirection || null,
      placement_other: placementOther || null,
    }
  }
  if (
    fieldKey === 'surface_roughness' ||
    fieldKey === 'substrate_surface_roughness'
  ) {
    const availability = canonicalOption(
      String(
        object.availability ??
          (object.metric != null || object.value_nm != null ? 'reported' : ''),
      ),
    )
    if (!ROUGHNESS_AVAILABILITIES.has(availability)) {
      throw new RangeError('roughness availability is required')
    }
    if (availability === 'not_provided') {
      if (object.metric != null || object.value_nm != null) {
        throw new RangeError(
          'unreported roughness cannot include metric or value_nm',
        )
      }
      return { availability }
    }
    const metric = String(object.metric ?? '')
    if (!ROUGHNESS_METRICS.has(metric)) {
      throw new RangeError('roughness metric is required')
    }
    const roughnessValue = finite(object.value_nm, 'value_nm')
    if (roughnessValue < 0) {
      throw new RangeError('value_nm must be non-negative')
    }
    return { availability, metric, value_nm: roughnessValue }
  }
  if (fieldKey === 'source_position') {
    const zoneIndex = finite(object.zone_index, 'zone_index', {
      positive: true,
      integer: true,
    })
    if (
      context.zoneCount != null &&
      Number.isInteger(context.zoneCount) &&
      zoneIndex > context.zoneCount
    ) {
      throw new RangeError('zone_index exceeds setup zone count')
    }
    const hasTemperature =
      object.temperature_C != null && object.temperature_C !== ''
    const basis = canonicalOption(String(object.temperature_basis ?? ''))
    const hasBasis = basis !== ''
    if (hasTemperature !== hasBasis) {
      throw new RangeError(
        'temperature_C and temperature_basis must be provided together',
      )
    }
    if (hasBasis && !TEMPERATURE_BASIS_CODES.has(basis)) {
      throw new RangeError('temperature_basis is invalid')
    }
    return {
      zone_index: zoneIndex,
      distance_mm: finite(object.distance_mm, 'distance_mm'),
      temperature_C: hasTemperature
        ? finite(object.temperature_C, 'temperature_C')
        : null,
      temperature_basis: hasBasis ? basis : null,
    }
  }
  if (fieldKey === 'zone_thermocouple_distance_mm') {
    return {
      zone_index: finite(object.zone_index, 'zone_index', {
        positive: true,
        integer: true,
      }),
      distance_mm: finite(object.distance_mm, 'distance_mm'),
    }
  }
  return object
}
