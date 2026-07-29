import { describe, expect, it } from 'vitest'

import {
  buildSimpleCreatePayload,
  simpleCreateIssue,
} from './simple-form-adapters'

const valid = {
  startedAt: '2026-07-30T10:30',
  performerIds: ['user-1'],
  ambientTemperature: '25',
  ambientHumidity: '45',
}

describe('simple product form adapters', () => {
  it('maps manual environment values to the experiment start time', () => {
    const payload = buildSimpleCreatePayload(valid)
    expect(payload.ambient_temperature).toEqual({
      value: 25,
      measured_at: payload.started_at,
      source_type: 'manual_entry',
    })
    expect(payload.ambient_humidity).toEqual({
      value: 45,
      measured_at: payload.started_at,
      source_type: 'manual_entry',
    })
  })

  it('rejects blank, infinite, and out-of-range values', () => {
    expect(simpleCreateIssue({ ...valid, ambientTemperature: '' })).toBe(
      'temperature',
    )
    expect(simpleCreateIssue({ ...valid, ambientTemperature: '1e309' })).toBe(
      'temperature',
    )
    expect(simpleCreateIssue({ ...valid, ambientHumidity: '101' })).toBe(
      'humidity',
    )
  })
})
