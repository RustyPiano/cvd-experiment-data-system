import { describe, expect, it, vi } from 'vitest'

import {
  defaultMeasurementRegion,
  WORKFLOW_STEPS,
} from './scientific-experiment-form'

import {
  channelsForSetupZoneCount,
  materialAssertionValue,
  peakTemperatureC,
  processChannelTitle,
  saveBeforeStepChange,
  targetSummary,
  targetValidationIssue,
  timelineValidationIssue,
  tubeUsageParts,
  tubeUsagePartsValidity,
  withProcessChannelSubject,
} from './scientific-form-workflow'

describe('scientific experiment workflow helpers', () => {
  it('defaults advanced measurements to an explicit whole-sample region', () => {
    expect(defaultMeasurementRegion('Raman')).toEqual({
      geometryType: 'whole_sample',
      label: 'whole_sample',
    })
  })

  it('drops only temperature channels outside a replacement setup', () => {
    expect(
      channelsForSetupZoneCount(
        [
          { channel_type: 'temperature', zone_index: 1, key: 'zone-1' },
          { channel_type: 'temperature', zone_index: 2, key: 'zone-2' },
          { channel_type: 'flow', key: 'gas' },
        ],
        1,
      ).map((channel) => channel.key),
    ).toEqual(['zone-1', 'gas'])
  })

  it('keeps the two tube-usage fields deterministic', () => {
    expect(tubeUsageParts(' 2, 7 ')).toEqual(['2', '7'])
    expect(
      tubeUsageParts(
        JSON.stringify({ reset_count: 0, use_number_since_reset: 1 }),
      ),
    ).toEqual(['0', '1'])
    expect(tubeUsagePartsValidity('0,1')).toEqual([true, true])
    expect(tubeUsagePartsValidity(',')).toEqual([false, false])
    expect(tubeUsagePartsValidity('1.5,0')).toEqual([false, false])
  })

  it('does not treat an empty scientific timeline as completed', () => {
    expect(timelineValidationIssue([], [])).toBe(
      '请至少添加一项温度、气体、压力或设备条件。',
    )
  })

  it('validates a user-entered gas-flow condition without machine wording', () => {
    const channel = {
      channel_key: 'channel_1',
      channel_type: 'flow',
      source_type: 'setpoint',
      subject_type: 'gas_species',
      subject_ref: 'Ar',
      subject_instance_ref: 'MFC-1',
      gas_species_code: 'Ar',
      data_kind: 'scalar' as const,
      scalar_value: 100,
    }
    expect(processChannelTitle(channel)).toBe('Ar 流量')
    expect(timelineValidationIssue([], [channel])).toBeNull()
  })

  it('allows setpoint and measured values for the same temperature zone', () => {
    const channels = ['setpoint', 'measured'].map((sourceType, index) => ({
      channel_key: `channel_${index}`,
      channel_type: 'temperature',
      source_type: sourceType,
      subject_type: 'temperature_zone',
      subject_ref: 'zone_1',
      subject_instance_ref: 'TC-zone1-A',
      zone_index: 1,
      unit: '°C',
      data_kind: 'scalar' as const,
      scalar_value: 750 + index,
    }))
    expect(
      timelineValidationIssue(
        [{ segment_type: 'growth', start_s: 0, end_s: 60 }],
        channels,
      ),
    ).toBeNull()
  })

  it('allows multiple physical gas lines and valves of the same category', () => {
    const channels = [
      ...['MFC-Ar-1', 'MFC-Ar-2'].map((subject_instance_ref, index) => ({
        channel_key: `channel_gas_${index}`,
        channel_type: 'flow',
        source_type: 'measured',
        subject_type: 'gas_species',
        subject_ref: 'Ar',
        subject_instance_ref,
        gas_species_code: 'Ar',
        unit: 'sccm',
        data_kind: 'scalar' as const,
        scalar_value: 50,
      })),
      ...['valve-1', 'valve-2'].map((subject_instance_ref, index) => ({
        channel_key: `channel_valve_${index}`,
        channel_type: 'valve_state',
        source_type: 'measured',
        subject_type: 'device',
        subject_ref: 'valve_state',
        subject_instance_ref,
        unit: 'state',
        data_kind: 'interval_series' as const,
        series: [{ start_s: 0, end_s: 60, value: 'open' }],
      })),
    ]
    expect(
      timelineValidationIssue(
        [{ segment_type: 'growth', start_s: 0, end_s: 60 }],
        channels,
      ),
    ).toBeNull()
  })

  it('keeps file identity stable when a gas species is corrected', () => {
    const channel = {
      channel_key: 'channel_stable',
      channel_type: 'flow',
      source_type: 'measured',
      subject_type: 'gas_species',
      subject_ref: 'Ar',
      subject_instance_ref: 'MFC-1',
      gas_species_code: 'Ar',
      data_kind: 'timeseries_file' as const,
      file_asset_id: 'file-1',
    }
    expect(
      withProcessChannelSubject(channel, {
        subject_ref: 'N2',
        gas_species_code: 'N2',
      }),
    ).toMatchObject({
      channel_key: 'channel_stable',
      file_asset_id: 'file-1',
      gas_species_code: 'N2',
    })
  })

  it('normalizes mixed temperature units before building the summary', () => {
    expect(
      peakTemperatureC([
        {
          channel_key: 'channel_c',
          channel_type: 'temperature',
          source_type: 'setpoint',
          subject_ref: 'zone_1',
          unit: '°C',
          data_kind: 'scalar',
          scalar_value: 750,
        },
        {
          channel_key: 'channel_k',
          channel_type: 'temperature',
          source_type: 'measured',
          subject_ref: 'zone_2',
          unit: 'K',
          data_kind: 'scalar',
          scalar_value: 1023,
        },
      ]),
    ).toBe(750)
  })

  it('does not treat an empty temperature point as 0 °C', () => {
    expect(
      peakTemperatureC([
        {
          channel_key: 'channel_empty',
          channel_type: 'temperature',
          source_type: 'setpoint',
          subject_ref: 'zone_1',
          unit: '°C',
          data_kind: 'interval_series',
          series: [{ start_s: 0, value: '' }],
        },
      ]),
    ).toBeNull()
  })

  it('renders canonical single, doped, and alloy target summaries', () => {
    expect(
      targetSummary({
        architecture_type: 'single_region',
        material_regions: [
          {
            region_key: 'film',
            formula: 'MoS2',
            target_bulk_phase: '2H',
            target_bulk_space_group_number: 194,
          },
        ],
        composition_relations: [],
      }),
    ).toBe('2H-MoS₂')
    expect(
      targetSummary({
        architecture_type: 'single_region',
        material_regions: [
          { region_key: 'film', formula: 'MoS2', target_bulk_phase: '2H' },
        ],
        composition_relations: [
          {
            relation_type: 'doped_by',
            host_region_key: 'film',
            species: 'Pt',
            nominal_value: 1,
            value_basis: 'at_percent',
            site_or_location: 'Mo_site',
          },
        ],
      }),
    ).toBe('Pt 掺杂 2H-MoS₂（1 at.%；Mo 位点）')
    expect(
      targetSummary({
        architecture_type: 'single_region',
        material_regions: [
          { region_key: 'film', formula: 'MoS2', target_bulk_phase: '2H' },
        ],
        composition_relations: [
          {
            relation_type: 'doped_by',
            host_region_key: 'film',
            species: 'Pt',
            nominal_value: 1,
            value_basis: 'at_percent',
          },
        ],
      }),
    ).toBe('Pt 掺杂 2H-MoS₂（1 at.%）')
    expect(
      targetSummary({
        architecture_type: 'single_region',
        material_regions: [
          { region_key: 'film', formula: 'MoS2', target_bulk_phase: '2H' },
        ],
        composition_relations: [
          {
            relation_type: 'doped_by',
            host_region_key: 'film',
            species: 'Pt',
            value_basis: 'unspecified',
            site_or_location: 'Mo_site',
          },
        ],
      }),
    ).toBe('Pt 掺杂 2H-MoS₂（Mo 位点）')
    expect(
      targetSummary({
        architecture_type: 'single_region',
        material_regions: [
          {
            region_key: 'film',
            formula: 'Mo0.5W0.5S2',
            target_bulk_phase: '2H',
          },
        ],
        composition_relations: [
          {
            relation_type: 'solid_solution_component',
            host_region_key: 'film',
            species: 'MoS2',
            nominal_value: 0.5,
            value_basis: 'mol_fraction',
          },
          {
            relation_type: 'solid_solution_component',
            host_region_key: 'film',
            species: 'WS2',
            nominal_value: 0.5,
            value_basis: 'mol_fraction',
          },
        ],
      }),
    ).toBe('2H-Mo₀.₅W₀.₅S₂')
  })

  it('renders vertical and lateral regions without empty punctuation', () => {
    expect(
      targetSummary({
        architecture_type: 'vertical_stack',
        material_regions: [
          {
            region_key: 'bottom',
            formula: 'MoS2',
            layer_index: 1,
            target_layer_count: 1,
            target_bulk_phase: '2H',
          },
          {
            region_key: 'top',
            formula: 'WS2',
            layer_index: 2,
            target_layer_count: 2,
            target_bulk_phase: '3R',
          },
        ],
        composition_relations: [],
      }),
    ).toBe('2H-MoS₂（1层） / 3R-WS₂（2层）')
    expect(
      targetSummary({
        architecture_type: 'lateral_junction',
        material_regions: [
          { region_key: 'a', formula: 'MoS2', target_bulk_phase: '2H' },
          { region_key: 'b', formula: 'WS2', target_bulk_phase: '2H' },
        ],
        composition_relations: [],
      }),
    ).toBe('2H-MoS₂–2H-WS₂ 横向异质结构')
  })

  it('validates formulas, alloy fractions, layer order, and phase matches', () => {
    const single = {
      architecture_type: 'single_region',
      material_regions: [
        {
          region_key: 'film',
          formula: 'MoS2',
          target_bulk_phase: '2H',
          target_bulk_space_group_number: 194,
        },
      ],
      composition_relations: [],
    }
    expect(targetValidationIssue(single)).toBeNull()
    expect(
      targetValidationIssue({
        ...single,
        material_regions: [
          {
            ...single.material_regions[0],
            target_bulk_space_group_number: 160,
          },
        ],
      }),
    ).toContain('必须使用 No. 194')
    expect(
      targetValidationIssue({
        ...single,
        material_regions: [
          {
            ...single.material_regions[0],
            formula: 'Mo0.5W0.5S2',
          },
        ],
        composition_relations: [
          {
            relation_type: 'solid_solution_component',
            host_region_key: 'film',
            species: 'MoS2',
            nominal_value: 0.6,
            value_basis: 'mol_fraction',
          },
          {
            relation_type: 'solid_solution_component',
            host_region_key: 'film',
            species: 'WS2',
            nominal_value: 0.5,
            value_basis: 'mol_fraction',
          },
        ],
      }),
    ).toContain('总和为 1')
  })

  it('saves the current step before top navigation', async () => {
    const save = vi.fn(async () => true)
    await expect(saveBeforeStepChange(false, true, save)).resolves.toBe(true)
    expect(save).toHaveBeenCalledOnce()

    save.mockClear()
    await expect(saveBeforeStepChange(false, false, save)).resolves.toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it('builds assertion values with the backend scientific keys', () => {
    expect(materialAssertionValue('phase_identity', '2H-MoS2', [], '')).toEqual(
      { phase: '2H-MoS2' },
    )
    expect(materialAssertionValue('layer_count', '1', [], '')).toEqual({
      count: 1,
    })
  })
})

describe('scientific experiment form steps', () => {
  it('collects substrates before precursor surface bindings', () => {
    expect(WORKFLOW_STEPS).toEqual([
      '基本信息',
      '目标材料',
      '装置与衬底',
      '前驱体装载',
      '生长条件',
      '检查并提交',
    ])
  })
})
