import { describe, expect, it } from 'vitest'

import {
  buildEventDescription,
  buildSimpleCreatePayload,
  buildSimpleSourceLoadsPayload,
  compositionValueForDisplay,
  compositionValueForPayload,
  simpleGrowthIssue,
  simpleCreateIssue,
  simpleProcessEventsIssue,
  splitEventDescription,
  temperatureStepOperation,
  updateTemperatureStepDuration,
  wholeProcessInterval,
} from './simple-form-adapters'

const valid = {
  startedAt: '2026-07-30T10:30',
  performerIds: ['user-1'],
  ambientTemperature: '25',
  ambientHumidity: '45',
}

const validProcessSettings = {
  pressure_regime: 'atmospheric',
  cooling_method: 'furnace_cooling',
} as const

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

  it('stores blank environment readings as not measured and rejects invalid values', () => {
    const blank = { ...valid, ambientTemperature: '', ambientHumidity: '' }
    expect(simpleCreateIssue(blank)).toBeNull()
    expect(buildSimpleCreatePayload(blank).ambient_temperature).toEqual({
      source_type: 'not_measured',
    })
    expect(buildSimpleCreatePayload(blank).ambient_humidity).toEqual({
      source_type: 'not_measured',
    })
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

  it('requires an explicit process deviation and occurrence time', () => {
    expect(simpleProcessEventsIssue([])).toBeNull()
    expect(
      simpleProcessEventsIssue([
        { start_s: Number.NaN, observed_deviations: [] },
      ]),
    ).toBe('请选择异常类型。')
    expect(
      simpleProcessEventsIssue([
        { start_s: Number.NaN, observed_deviations: ['gas_interruption'] },
      ]),
    ).toBe('请填写异常发生时间。')
    expect(
      simpleProcessEventsIssue([
        { start_s: 120, observed_deviations: ['gas_interruption'] },
      ]),
    ).toBeNull()
  })

  it('keeps display snapshots out of the precursor write payload', () => {
    expect(
      buildSimpleSourceLoadsPayload([
        {
          load_key: 'load_1',
          preparation_steps: [
            {
              step_type: 'spin_coat',
              parameters: { speed_rpm: 1000, duration_s: 10 },
            },
          ],
          ingredients: [
            {
              material_lot_id: 'lot-1',
              function_role: 'metal_source',
              snapshot: { substance_name: 'MoO3' },
            },
          ],
        },
      ]),
    ).toEqual({
      items: [
        {
          load_key: 'load_1',
          preparation_steps: [
            {
              step_type: 'spin_coat',
              parameters: {
                stages: [{ speed_rpm: 1000, duration_s: 10 }],
              },
            },
          ],
          ingredients: [{ material_lot_id: 'lot-1', process_roles: [] }],
        },
      ],
    })
  })

  it('requires a zero-based increasing temperature program without a separate reaction segment', () => {
    const segments: Array<{
      segment_type: string
      start_s: number
      end_s: number
    }> = []
    const temperature = {
      channel_type: 'temperature',
      source_type: 'setpoint',
      zone_index: 1,
      series: [{ start_s: 0, value: 700 }],
    }
    const gas = {
      channel_type: 'flow',
      source_type: 'setpoint',
      gas_species_code: 'Ar',
      gas_lot_id: 'lot-1',
      gas_lot_version: 1,
      measurement_source: 'mfc',
      series: [{ start_s: 0, end_s: 3600, value: 100 }],
    }
    expect(
      simpleGrowthIssue(segments, [temperature, gas], validProcessSettings, 1),
    ).toBeNull()
    expect(
      simpleGrowthIssue(
        segments,
        [{ ...temperature, series: [{ start_s: 60, value: 700 }] }, gas],
        validProcessSettings,
        1,
      ),
    ).toBe('请填写温区 1 的初始温度，并检查各温度步骤的持续时间和目标温度。')
  })

  it('requires physical cylinder references for gas exchange', () => {
    const temperature = {
      channel_type: 'temperature',
      source_type: 'setpoint',
      zone_index: 1,
      series: [{ start_s: 0, value: 700 }],
    }
    const gas = {
      channel_type: 'flow',
      source_type: 'setpoint',
      gas_species_code: 'Ar',
      gas_lot_id: 'lot-1',
      gas_lot_version: 1,
      measurement_source: 'mfc',
      series: [{ start_s: 0, end_s: 60, value: 100 }],
    }
    const preparation = {
      ...validProcessSettings,
      preparation_operations: [
        {
          operation_type: 'gas_exchange',
          duration_min: 5,
          cycle_count: 3,
          gas_sources: [
            { material_lot_id: 'purge-lot', material_lot_version: 2 },
          ],
        },
      ],
    }
    expect(simpleGrowthIssue([], [temperature, gas], preparation, 1)).toBeNull()
    expect(
      simpleGrowthIssue(
        [],
        [temperature, gas],
        {
          ...preparation,
          preparation_operations: [
            {
              ...preparation.preparation_operations[0],
              cycle_count: 1.5,
            },
          ],
        },
        1,
      ),
    ).toContain('置换次数')
    expect(
      simpleGrowthIssue(
        [],
        [temperature, gas],
        {
          ...preparation,
          preparation_operations: [
            {
              operation_type: 'gas_exchange',
              duration_min: 5,
              cycle_count: 3,
              gases: ['Ar'],
            },
          ],
        },
        1,
      ),
    ).toContain('气瓶批次')
  })

  it('rejects blank generated temperature and gas values', () => {
    const segments = [{ segment_type: 'growth', start_s: 0, end_s: 3600 }]
    const temperature = {
      channel_type: 'temperature',
      source_type: 'setpoint',
      zone_index: 1,
      series: [{ start_s: 0, value: '' }],
    }
    expect(
      simpleGrowthIssue(segments, [temperature], validProcessSettings, 1),
    ).toBe('请填写温区 1 的初始温度，并检查各温度步骤的持续时间和目标温度。')
    expect(
      simpleGrowthIssue(
        segments,
        [
          { ...temperature, series: [{ start_s: 0, value: 700 }] },
          {
            channel_type: 'flow',
            source_type: 'setpoint',
            gas_species_code: '',
            series: [],
          },
        ],
        validProcessSettings,
        1,
      ),
    ).toBe('请选择气体种类。')
  })

  it('rejects missing and non-positive working pressure', () => {
    const segments = [{ segment_type: 'growth', start_s: 0, end_s: 3600 }]
    const temperature = {
      channel_type: 'temperature',
      source_type: 'setpoint',
      zone_index: 1,
      series: [{ start_s: 0, value: 700 }],
    }
    const settings = {
      pressure_regime: 'low_pressure',
      cooling_method: 'furnace_cooling',
    }
    const gas = {
      channel_type: 'flow',
      source_type: 'setpoint',
      gas_species_code: 'Ar',
      gas_lot_id: 'lot-1',
      gas_lot_version: 1,
      measurement_source: 'mfc',
      series: [{ start_s: 0, end_s: 3600, value: 100 }],
    }

    for (const scalar_value of [undefined, 0, -1]) {
      expect(
        simpleGrowthIssue(
          segments,
          [
            temperature,
            gas,
            {
              channel_type: 'pressure',
              source_type: 'setpoint',
              scalar_value,
              pressure_type: 'absolute',
              unit: 'Pa',
            },
          ],
          settings,
          1,
        ),
      ).toBe('请填写大于 0 的工作压力。')
    }

    expect(
      simpleGrowthIssue(
        segments,
        [
          temperature,
          gas,
          {
            channel_type: 'pressure',
            source_type: 'setpoint',
            scalar_value: 100,
            pressure_type: 'absolute',
            unit: 'Pa',
          },
        ],
        settings,
        1,
      ),
    ).toBeNull()
  })

  it('rejects non-positive or overlapping gas intervals and incomplete controlled cooling', () => {
    const segments = [{ segment_type: 'growth', start_s: 60, end_s: 600 }]
    const temperature = {
      channel_type: 'temperature',
      source_type: 'setpoint',
      zone_index: 1,
      series: [{ start_s: 0, value: 700 }],
    }
    const gas = {
      channel_type: 'flow',
      source_type: 'setpoint',
      gas_species_code: 'Ar',
      gas_lot_id: 'lot-1',
      gas_lot_version: 1,
      measurement_source: 'mfc',
      series: [{ start_s: 0, end_s: 300, value: 0 }],
    }
    const settings = validProcessSettings
    expect(simpleGrowthIssue(segments, [temperature, gas], settings, 1)).toBe(
      '请填写有效的供气时间和大于 0 的流量。',
    )
    expect(
      simpleGrowthIssue(
        segments,
        [
          temperature,
          {
            ...gas,
            series: [
              { start_s: 0, end_s: 300, value: 100 },
              { start_s: 240, end_s: 480, value: 100 },
            ],
          },
        ],
        settings,
        1,
      ),
    ).toBe('同一种气体的供气区间不能重叠。')
    expect(
      simpleGrowthIssue(
        segments,
        [
          temperature,
          {
            ...gas,
            series: [
              { start_s: 300, end_s: 480, value: 100 },
              { start_s: 0, end_s: 240, value: 100 },
            ],
          },
        ],
        settings,
        1,
      ),
    ).toBe('请按开始时间顺序填写供气区间。')
    expect(
      simpleGrowthIssue(
        segments,
        [
          temperature,
          {
            ...gas,
            series: [{ start_s: 0, end_s: 300, value: 100 }],
            subject_snapshot: {
              lot_category: 'gas_cylinder',
              gas_components: [{ species: 'H2', volume_percent: 100 }],
            },
          },
        ],
        settings,
        1,
      ),
    ).toBe('所选气瓶批次与气体种类不匹配。')
    expect(
      simpleGrowthIssue(
        segments,
        [temperature, { ...gas, series: [{ ...gas.series[0], value: 100 }] }],
        {
          pressure_regime: 'atmospheric',
          cooling_method: 'controlled_cooling',
        },
        1,
      ),
    ).toBe('请填写大于 0 的受控降温速率。')
  })

  it('keeps duration-based temperature steps and whole-process gas timing stable', () => {
    const points = [
      { start_s: 0, value: 25 },
      { start_s: 1800, value: 750 },
      { start_s: 2400, value: 750 },
    ]
    expect(updateTemperatureStepDuration(points, 1, 40)).toEqual([
      { start_s: 0, value: 25 },
      { start_s: 2400, value: 750 },
      { start_s: 3000, value: 750 },
    ])
    expect(
      updateTemperatureStepDuration(
        [
          { start_s: 0, value: 25 },
          { start_s: Number.NaN, value: '' },
        ],
        1,
        30,
      ),
    ).toEqual([
      { start_s: 0, value: 25 },
      { start_s: 1800, value: '' },
    ])

    expect(wholeProcessInterval(4200)).toEqual({ start_s: 0, end_s: 4200 })
    expect(wholeProcessInterval(0)).toBeNull()
  })

  it('derives the temperature operation from adjacent steps', () => {
    expect(temperatureStepOperation(25, 750)).toBe('升温')
    expect(temperatureStepOperation(750, 750)).toBe('保温')
    expect(temperatureStepOperation(750, 100)).toBe('降温')
    expect(temperatureStepOperation(25, '')).toBeNull()
  })
})
