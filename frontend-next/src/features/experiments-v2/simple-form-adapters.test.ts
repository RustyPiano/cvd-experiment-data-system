import { describe, expect, it } from 'vitest'

import {
  buildEventDescription,
  buildSimpleCreatePayload,
  compositionValueForDisplay,
  compositionValueForPayload,
  simpleGrowthIssue,
  simpleCreateIssue,
  splitEventDescription,
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

  it('maps displayed mol% and the two anomaly text fields without losing data', () => {
    expect(compositionValueForPayload('1', 'mol_fraction')).toBe(0.01)
    expect(compositionValueForDisplay(0.01, 'mol_fraction')).toBe('1')

    const stored = buildEventDescription('气流中断', '更换气瓶')
    expect(splitEventDescription(stored)).toEqual({
      description: '气流中断',
      action: '更换气瓶',
    })
  })

  it('requires a zero-based increasing temperature program and no fake atmospheric pressure', () => {
    const segments = [{ segment_type: 'growth', start_s: 0, end_s: 3600 }]
    const temperature = {
      channel_type: 'temperature',
      source_type: 'setpoint',
      zone_index: 1,
      series: [{ start_s: 0, value: 700 }],
    }
    expect(
      simpleGrowthIssue(
        segments,
        [temperature],
        { pressure_regime: 'atmospheric', cooling_method: 'natural' },
        1,
      ),
    ).toBeNull()
    expect(
      simpleGrowthIssue(
        segments,
        [{ ...temperature, series: [{ start_s: 60, value: 700 }] }],
        { pressure_regime: 'atmospheric', cooling_method: 'natural' },
        1,
      ),
    ).toContain('0 分钟')
  })
})
