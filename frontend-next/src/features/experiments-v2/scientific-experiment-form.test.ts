import { describe, expect, it } from 'vitest'

import {
  materialAssertionValue,
  peakTemperatureC,
  processChannelTitle,
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
      gas_species: 'Ar',
      data_kind: 'scalar' as const,
      scalar_value: 100,
      sensor_or_controller_snapshot: {
        controller_ref: 'MFC-1',
      },
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

  it('keeps file identity stable when a gas species is corrected', () => {
    const channel = {
      channel_key: 'channel_stable',
      channel_type: 'flow',
      source_type: 'measured',
      subject_type: 'gas_species',
      subject_ref: 'Ar',
      gas_species: 'Ar',
      data_kind: 'timeseries_file' as const,
      file_asset_id: 'file-1',
    }
    expect(
      withProcessChannelSubject(channel, {
        subject_ref: '氩气',
        gas_species: '氩气',
      }),
    ).toMatchObject({
      channel_key: 'channel_stable',
      file_asset_id: 'file-1',
      gas_species: '氩气',
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
        material_regions: [{ formula: 'MoS2' }],
        composition_relations: [
          {
            relation_type: 'doped_by',
            species: 'Pt',
            nominal_value: 1,
            value_basis: 'at_percent',
          },
        ],
      }),
    ).toBe('Pt 掺杂 MoS2')
    expect(
      targetSummary({
        architecture_type: 'single_region',
        material_regions: [{ formula: 'MoS2' }],
        composition_relations: [
          {
            relation_type: 'substitutional_alloy',
            species: 'W',
            nominal_value: 0.5,
            value_basis: 'site_fraction',
          },
        ],
      }),
    ).toContain('W 取代合金')
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
