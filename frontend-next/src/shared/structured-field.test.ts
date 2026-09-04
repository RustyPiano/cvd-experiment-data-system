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
        'source_container',
        encodeStructuredValue({
          material: 'quartz',
          length_mm: '90',
          width_mm: '15',
          height_mm: '5',
          reset_count: '2',
          use_number_since_reset: '3',
        }),
        { loadingMethod: 'boat' },
      ),
    ).toEqual({
      material: 'quartz',
      material_other: null,
      length_mm: 90,
      width_mm: 15,
      height_mm: 5,
      reset_count: 2,
      use_number_since_reset: 3,
    })
    expect(
      structuredPayload(
        'source_position',
        encodeStructuredValue({
          zone_index: '2',
          distance_mm: '-20',
          temperature_C: '620',
          temperature_basis: 'measured',
        }),
        { zoneCount: 3 },
      ),
    ).toEqual({
      zone_index: 2,
      distance_mm: -20,
      temperature_C: 620,
      temperature_basis: 'measured',
    })
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
    expect(isStructuredInput('炉管尺寸对象')).toBe(true)
    expect(isStructuredInput('使用履历对象')).toBe(true)
    expect(isStructuredInput('粗糙度对象')).toBe(true)
    expect(isStructuredInput('衬底尺寸放置对象')).toBe(true)
  })

  it('serializes a named non-negative surface roughness value', () => {
    expect(
      structuredPayload(
        'surface_roughness',
        encodeStructuredValue({ metric: 'RMS', value_nm: '0.5' }),
      ),
    ).toEqual({ availability: 'reported', metric: 'RMS', value_nm: 0.5 })
    expect(() =>
      structuredPayload(
        'surface_roughness',
        encodeStructuredValue({ metric: 'RMS', value_nm: '-0.1' }),
      ),
    ).toThrow(/non-negative/)
    expect(
      structuredPayload(
        'substrate_surface_roughness',
        encodeStructuredValue({ metric: 'Ra', value_nm: '0.25' }),
      ),
    ).toEqual({ availability: 'reported', metric: 'Ra', value_nm: 0.25 })
    expect(
      structuredPayload(
        'surface_roughness',
        encodeStructuredValue({ availability: 'not_provided' }),
      ),
    ).toEqual({ availability: 'not_provided' })
    expect(() =>
      structuredPayload(
        'surface_roughness',
        encodeStructuredValue({
          availability: 'not_provided',
          metric: 'RMS',
          value_nm: '0.5',
        }),
      ),
    ).toThrow(/cannot include/)
  })

  it('serializes tube dimensions according to the selected cross-section', () => {
    expect(
      structuredPayload(
        'tube_outer_diameter_wall_mm',
        encodeStructuredValue({
          outer_side_mm: '50',
          wall_thickness_mm: '2',
        }),
        { tubeShape: 'square' },
      ),
    ).toEqual({ outer_side_mm: 50, wall_thickness_mm: 2 })
    expect(
      structuredPayload(
        'tube_outer_diameter_wall_mm',
        encodeStructuredValue({
          outer_width_mm: '60',
          outer_height_mm: '40',
          wall_thickness_mm: '2',
          outer_diameter_mm: 'stale',
        }),
        { tubeShape: 'rectangular' },
      ),
    ).toEqual({
      outer_width_mm: 60,
      outer_height_mm: 40,
      wall_thickness_mm: 2,
    })
    expect(
      structuredPayload(
        'tube_outer_diameter_wall_mm',
        encodeStructuredValue({ dimension_description: 'hexagonal 40 mm' }),
        { tubeShape: 'other' },
      ),
    ).toEqual({ dimension_description: 'hexagonal 40 mm' })
  })

  it('requires valid furnace and boat usage history counters', () => {
    expect(
      structuredPayload(
        'tube_usage_history',
        encodeStructuredValue({
          reset_count: '0',
          use_number_since_reset: '1',
        }),
      ),
    ).toEqual({ reset_count: 0, use_number_since_reset: 1 })
    expect(() =>
      structuredPayload(
        'tube_usage_history',
        encodeStructuredValue({
          reset_count: '-1',
          use_number_since_reset: '1',
        }),
      ),
    ).toThrow(/non-negative/)
    expect(() =>
      structuredPayload(
        'source_container',
        encodeStructuredValue({
          material: 'quartz',
          length_mm: '90',
          width_mm: '15',
          height_mm: '5',
        }),
        { loadingMethod: 'boat' },
      ),
    ).toThrow(/reset_count/)
  })

  it('allows an optional independent precursor temperature only with its basis', () => {
    expect(
      structuredPayload(
        'source_position',
        encodeStructuredValue({ zone_index: '1', distance_mm: '-20' }),
        { zoneCount: 2 },
      ),
    ).toEqual({
      zone_index: 1,
      distance_mm: -20,
      temperature_C: null,
      temperature_basis: null,
    })
    expect(() =>
      structuredPayload(
        'source_position',
        encodeStructuredValue({ zone_index: '3', distance_mm: '-20' }),
        { zoneCount: 2 },
      ),
    ).toThrow(/zone count/)
    expect(() =>
      structuredPayload(
        'source_position',
        encodeStructuredValue({
          zone_index: '1',
          distance_mm: '-20',
          temperature_C: '650',
        }),
        { zoneCount: 2 },
      ),
    ).toThrow(/provided together/)
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
          tilt_angle_deg: 90,
        }),
      ),
    ).toThrow(/between -90 and 90/)
    expect(() =>
      structuredPayload(
        'size_placement',
        encodeStructuredValue({
          length_mm: 10,
          width_mm: 10,
          placement: 'tilted',
          tilt_angle_deg: 0,
          tilt_azimuth_deg: 180,
        }),
      ),
    ).toThrow(/non-zero/)
  })

  it('round-trips the conditional substrate placement fields', () => {
    const encoded = structuredValueFromRaw('size_placement', {
      length_mm: 12,
      width_mm: 10,
      thickness_mm: 0.5,
      placement: 'tilted',
      tilt_angle_deg: -15,
      tilt_azimuth_deg: 180,
    })
    expect(parseStructuredValue(encoded)).toEqual({
      length_mm: 12,
      width_mm: 10,
      thickness_mm: 0.5,
      placement: 'tilted',
      tilt_angle_deg: -15,
      tilt_azimuth_deg: 180,
    })
    expect(structuredPayload('size_placement', encoded)).toEqual({
      length_mm: 12,
      width_mm: 10,
      thickness_mm: 0.5,
      placement: 'tilted',
      tilt_angle_deg: -15,
      tilt_azimuth_deg: 180,
      upright_growth_face_direction: null,
      placement_other: null,
    })
    expect(
      structuredPayload(
        'size_placement',
        encodeStructuredValue({
          length_mm: 12,
          width_mm: 10,
          placement: 'upright',
          upright_growth_face_direction: 'downstream',
        }),
      ),
    ).toMatchObject({
      placement: 'upright',
      upright_growth_face_direction: 'downstream',
    })
  })

  it.each([
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
