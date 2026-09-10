import { expect, it } from 'vitest'
import validate from '@/shared/generated/measurement-validator.mjs'

it('checks the generated method/property contract without changing draft values', () => {
  const payload = {
    measurement: {
      sample_id: 'sample-1',
      method_profile: 'optical_microscopy',
      measured_at: '2026-09-10T12:00:00Z',
      typed_conditions: { observation_mode: 'visual', objective: '50x' },
    },
    properties: [{ property_code: 'observation_note', text_value: 'flakes' }],
  }
  const original = structuredClone(payload)
  expect(validate(payload)).toBe(true)
  expect(payload).toEqual(original)
  expect(
    validate({
      ...payload,
      measurement: { ...payload.measurement, method_profile: 'unknown' },
    }),
  ).toBe(false)
  expect(
    validate({
      ...payload,
      properties: [
        { property_code: 'afm_step_height', numeric_value: 2, unit: 'cm' },
      ],
    }),
  ).toBe(false)
  expect(
    validate({
      ...payload,
      measurement: {
        ...payload.measurement,
        method_profile: 'Raman',
        typed_conditions: {},
      },
    }),
  ).toBe(false)
  expect(
    validate({
      ...payload,
      properties: [{ property_code: 'observation_note', numeric_value: 2 }],
    }),
  ).toBe(false)
})
