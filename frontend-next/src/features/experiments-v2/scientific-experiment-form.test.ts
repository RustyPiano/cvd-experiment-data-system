import { describe, expect, it, vi } from 'vitest'

import {
  materialAssertionValue,
  peakTemperatureC,
  processChannelTitle,
  saveBeforeStepChange,
  targetSummary,
  timelineValidationIssue,
  tubeUsageParts,
  withProcessChannelSubject,
} from './scientific-form-workflow'

describe('scientific experiment workflow helpers', () => {
  it('keeps the two tube-usage fields deterministic', () => {
    expect(tubeUsageParts(' 2, 7 ')).toEqual(['2', '7'])
  })

  it('does not treat an empty scientific timeline as completed', () => {
    expect(timelineValidationIssue([], [])).toBe('请至少添加一个实验阶段。')
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
    expect(
      timelineValidationIssue(
        [{ segment_type: 'growth', start_s: 0, end_s: 1800 }],
        [channel],
      ),
    ).toBeNull()
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

  it('keeps dopant and alloy semantics in the target summary', () => {
    expect(
      targetSummary({
        architecture_type: 'single_region',
        material_regions: [{ region_key: 'film', formula: 'MoS2' }],
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
    ).toBe('MoS2；MoS2：Pt 掺杂 1 at%')
    expect(
      targetSummary({
        architecture_type: 'single_region',
        material_regions: [{ region_key: 'film', formula: 'MoS2' }],
        composition_relations: [
          {
            relation_type: 'substitutional_alloy',
            host_region_key: 'film',
            species: 'W',
            nominal_value: 0.5,
            value_basis: 'site_fraction',
          },
        ],
      }),
    ).toContain('W 取代合金')
  })

  it('lists every composition relation with its host region', () => {
    expect(
      targetSummary({
        architecture_type: 'vertical_stack',
        material_regions: [
          { region_key: 'bottom', formula: 'MoS2' },
          { region_key: 'top', formula: 'WS2' },
        ],
        composition_relations: [
          {
            relation_type: 'doped_by',
            host_region_key: 'bottom',
            species: 'Nb',
            value_basis: 'at_percent',
          },
          {
            relation_type: 'decorated_by',
            host_region_key: 'top',
            species: 'Au',
            value_basis: 'unspecified',
          },
        ],
      }),
    ).toBe('MoS2 / WS2；MoS2：Nb 掺杂；WS2：Au 表面修饰')
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
