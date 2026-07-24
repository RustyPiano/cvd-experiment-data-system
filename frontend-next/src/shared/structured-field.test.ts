import { describe, expect, it } from 'vitest'

import {
  encodeStructuredValue,
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
