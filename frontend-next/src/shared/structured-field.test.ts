import { describe, expect, it } from 'vitest'

import {
  encodeStructuredValue,
  isStructuredInput,
  parseStructuredValue,
  structuredPayload,
  structuredValueFromRaw,
} from './structured-field'

describe('structured scientific fields', () => {
  it('serializes named geometry and zone values as typed objects', () => {
    expect(
      structuredPayload(
        'boat_crucible',
        encodeStructuredValue({
          material: 'quartz_boat',
          length_mm: '90',
          width_mm: '15',
        }),
      ),
    ).toEqual({
      material: 'quartz_boat',
      material_other: null,
      length_mm: 90,
      width_mm: 15,
      height_mm: null,
      diameter_mm: null,
    })
    expect(
      structuredPayload(
        'source_zone_temperature',
        encodeStructuredValue({ zone_index: '2', temperature_C: '620' }),
      ),
    ).toEqual({ zone_index: 2, temperature_C: 620 })
  })

  it('backfills the legacy tube selector/value shape into named dimensions', () => {
    expect(
      JSON.parse(
        structuredValueFromRaw('tube_outer_diameter_wall_mm', {
          option: 'tube_2_inch',
          value: 2,
        }),
      ),
    ).toEqual({ outer_diameter_mm: 50.8, wall_thickness_mm: 2 })
  })

  it('recognizes the v3.7 tube and substrate structured inputs', () => {
    expect(isStructuredInput('管材质形状对象')).toBe(true)
    expect(isStructuredInput('粗糙度对象')).toBe(true)
    expect(isStructuredInput('衬底尺寸放置对象')).toBe(true)
  })

  it('serializes a named non-negative surface roughness value', () => {
    expect(
      structuredPayload(
        'surface_roughness',
        encodeStructuredValue({ metric: 'RMS', value_nm: '0.5' }),
      ),
    ).toEqual({ metric: 'RMS', value_nm: 0.5 })
    expect(() =>
      structuredPayload(
        'surface_roughness',
        encodeStructuredValue({ metric: 'RMS', value_nm: '-0.1' }),
      ),
    ).toThrow(/non-negative/)
  })

  it('serializes tube material and shape as independent named values', () => {
    expect(
      structuredPayload(
        'tube_material_shape',
        encodeStructuredValue({ material: 'quartz', shape: 'round' }),
      ),
    ).toEqual({
      material: 'quartz',
      material_other: null,
      shape: 'round',
      shape_other: null,
    })
    expect(
      structuredPayload(
        'tube_material_shape',
        encodeStructuredValue({
          material: 'other',
          material_other: 'SiC',
          shape: 'other',
          shape_other: 'hexagonal',
        }),
      ),
    ).toEqual({
      material: 'other',
      material_other: 'SiC',
      shape: 'other',
      shape_other: 'hexagonal',
    })
  })

  it('requires conditional tube names and a valid substrate tilt angle', () => {
    expect(() =>
      structuredPayload(
        'tube_material_shape',
        encodeStructuredValue({ material: 'other', shape: 'round' }),
      ),
    ).toThrow(/material_other/)
    expect(() =>
      structuredPayload(
        'size_placement',
        encodeStructuredValue({
          length_mm: 10,
          width_mm: 10,
          placement: 'tilted',
        }),
      ),
    ).toThrow(/tilt_angle_deg/)
    expect(() =>
      structuredPayload(
        'size_placement',
        encodeStructuredValue({
          length_mm: 10,
          width_mm: 10,
          placement: 'tilted',
          tilt_angle_deg: 91,
        }),
      ),
    ).toThrow(/exceed 90/)
  })

  it('round-trips the conditional substrate placement fields', () => {
    const encoded = structuredValueFromRaw('size_placement', {
      length_mm: 10,
      width_mm: 12,
      thickness_mm: 0.5,
      placement: 'tilted',
      tilt_angle_deg: 15,
    })
    expect(parseStructuredValue(encoded)).toEqual({
      length_mm: 10,
      width_mm: 12,
      thickness_mm: 0.5,
      placement: 'tilted',
      tilt_angle_deg: 15,
    })
    expect(structuredPayload('size_placement', encoded)).toEqual({
      length_mm: 10,
      width_mm: 12,
      thickness_mm: 0.5,
      placement: 'tilted',
      tilt_angle_deg: 15,
      placement_other: null,
    })
  })

  it.each([
    [
      'boat_crucible',
      { option: '石英舟', value: 90 },
      { material: 'quartz_boat', length_mm: 90 },
    ],
    [
      'source_zone_temperature',
      { option: 'zone_1', value: 620 },
      { zone_index: 1, temperature_C: 620 },
    ],
    [
      'size_placement',
      { option: '正放', value: 10 },
      { length_mm: 10, placement: 'face_up' },
    ],
    [
      'zone_thermocouple_distance_mm',
      { option: '温区2…', value: 15 },
      { zone_index: 2, distance_mm: 15 },
    ],
  ])(
    'backfills the legacy %s selector/value shape without inventing dimensions',
    (fieldKey, legacy, expected) => {
      expect(JSON.parse(structuredValueFromRaw(fieldKey, legacy))).toEqual(
        expected,
      )
    },
  )

  it('rejects invalid geometry before it reaches JSON serialization', () => {
    expect(() =>
      structuredPayload(
        'tube_outer_diameter_wall_mm',
        encodeStructuredValue({
          outer_diameter_mm: '20',
          wall_thickness_mm: '10',
        }),
      ),
    ).toThrow(/wall thickness/i)
    expect(() =>
      structuredPayload(
        'zone_thermocouple_distance_mm',
        encodeStructuredValue({ zone_index: '0', distance_mm: '15' }),
      ),
    ).toThrow(/zone_index/)
  })
})
