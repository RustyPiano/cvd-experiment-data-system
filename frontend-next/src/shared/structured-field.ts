import { canonicalOption } from '@/shared/field-i18n'

const STRUCTURED_INPUTS = new Set([
  '\u5177\u540d\u5c3a\u5bf8\u5bf9\u8c61',
  '\u6e29\u533a\u6e29\u5ea6\u5bf9\u8c61',
  '\u6e29\u533a\u8ddd\u79bb\u5bf9\u8c61',
  '\u7ba1\u6750\u8d28\u5f62\u72b6\u5bf9\u8c61',
  '\u7c97\u7cd9\u5ea6\u5bf9\u8c61',
  '\u886c\u5e95\u5c3a\u5bf8\u653e\u7f6e\u5bf9\u8c61',
  '\u6e29\u5ea6\u4f20\u611f\u5668\u6570\u7ec4',
])
const BOAT_MATERIAL_CODES = new Set(['quartz_boat', 'alumina_boat', 'other'])
const TUBE_MATERIAL_CODES = new Set(['quartz', 'alumina', 'other'])
const TUBE_SHAPE_CODES = new Set(['round', 'square', 'rectangular', 'other'])
const PLACEMENT_CODES = new Set([
  'face_up',
  'face_down',
  'tilted',
  'upright',
  'other',
])
const ROUGHNESS_METRICS = new Set(['Ra', 'RMS'])

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
  if (fieldKey === 'boat_crucible' && legacyComposite) {
    return encodeStructuredValue({
      material:
        value.material ?? legacyOption(value.option, BOAT_MATERIAL_CODES),
      length_mm: value.length_mm ?? value.value,
      width_mm: value.width_mm,
      height_mm: value.height_mm,
      diameter_mm: value.diameter_mm,
    })
  }
  if (fieldKey === 'source_zone_temperature' && legacyComposite) {
    return encodeStructuredValue({
      zone_index: value.zone_index ?? legacyZoneIndex(value.option),
      temperature_C: value.temperature_C ?? value.value,
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
      placement_other: value.placement_other,
    })
  }
  if (fieldKey === 'zone_thermocouple_distance_mm' && legacyComposite) {
    return encodeStructuredValue({
      zone_index: value.zone_index ?? legacyZoneIndex(value.option),
      distance_mm: value.distance_mm ?? value.value,
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
): Record<string, unknown> | null {
  const object = parseStructuredValue(value)
  if (Object.keys(object).length === 0) return null

  if (fieldKey === 'tube_outer_diameter_wall_mm') {
    const outer = finite(object.outer_diameter_mm, 'outer_diameter_mm', {
      positive: true,
    })
    const wall = finite(object.wall_thickness_mm, 'wall_thickness_mm', {
      positive: true,
    })
    if (wall * 2 >= outer) {
      throw new RangeError('wall thickness must be less than the radius')
    }
    return { outer_diameter_mm: outer, wall_thickness_mm: wall }
  }
  if (fieldKey === 'boat_crucible') {
    const material = canonicalOption(String(object.material ?? ''))
    if (!BOAT_MATERIAL_CODES.has(material)) {
      throw new RangeError('material is required')
    }
    const materialOther =
      material === 'other' ? String(object.material_other ?? '').trim() : ''
    if (material === 'other' && !materialOther) {
      throw new RangeError('material_other is required')
    }
    const result = {
      material,
      material_other: materialOther || null,
      length_mm: optionalPositive(object.length_mm, 'length_mm'),
      width_mm: optionalPositive(object.width_mm, 'width_mm'),
      height_mm: optionalPositive(object.height_mm, 'height_mm'),
      diameter_mm: optionalPositive(object.diameter_mm, 'diameter_mm'),
    }
    if (
      [
        result.length_mm,
        result.width_mm,
        result.height_mm,
        result.diameter_mm,
      ].every((item) => item == null)
    ) {
      throw new RangeError('at least one named dimension is required')
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
        ? finite(object.tilt_angle_deg, 'tilt_angle_deg', { positive: true })
        : null
    if (tiltAngle != null && tiltAngle > 90) {
      throw new RangeError('tilt_angle_deg must not exceed 90')
    }
    const placementOther =
      placement === 'other' ? String(object.placement_other ?? '').trim() : ''
    if (placement === 'other' && !placementOther) {
      throw new RangeError('placement_other is required')
    }
    return {
      length_mm: finite(object.length_mm, 'length_mm', { positive: true }),
      width_mm: finite(object.width_mm, 'width_mm', { positive: true }),
      thickness_mm: optionalPositive(object.thickness_mm, 'thickness_mm'),
      placement,
      tilt_angle_deg: tiltAngle,
      placement_other: placementOther || null,
    }
  }
  if (fieldKey === 'surface_roughness') {
    const metric = String(object.metric ?? '')
    if (!ROUGHNESS_METRICS.has(metric)) {
      throw new RangeError('roughness metric is required')
    }
    const roughnessValue = finite(object.value_nm, 'value_nm')
    if (roughnessValue < 0) {
      throw new RangeError('value_nm must be non-negative')
    }
    return { metric, value_nm: roughnessValue }
  }
  if (fieldKey === 'source_zone_temperature') {
    return {
      zone_index: finite(object.zone_index, 'zone_index', {
        positive: true,
        integer: true,
      }),
      temperature_C: finite(object.temperature_C, 'temperature_C'),
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
