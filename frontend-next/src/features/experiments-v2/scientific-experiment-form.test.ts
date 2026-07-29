import { describe, expect, it } from 'vitest'

import {
  machineToken,
  processChannelTitle,
  timelineValidationIssue,
  tubeUsageParts,
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
      channel_key: 'flow.ar',
      channel_type: 'flow',
      source_type: 'setpoint',
      data_kind: 'scalar' as const,
      scalar_value: 100,
      sensor_or_controller_snapshot: {
        gas_species: 'Ar',
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

  it('normalizes chemical formulae for channel keys', () => {
    expect(machineToken(' H₂ / Ar ')).toBe('h2_ar')
  })
})
