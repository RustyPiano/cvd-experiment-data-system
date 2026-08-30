import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listCharacterizationItems } from './api'

const experimentApi = vi.hoisted(() => ({
  getRun: vi.fn(),
  listAllMeasurements: vi.fn(),
}))
const sampleApi = vi.hoisted(() => ({ listSamples: vi.fn() }))

vi.mock('@/features/experiments-v2/api', () => experimentApi)
vi.mock('@/features/samples/api', () => sampleApi)

describe('listCharacterizationItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sampleApi.listSamples.mockResolvedValue({
      items: [
        {
          id: 'sample-1',
          experiment_run_id: 'run-1',
          run_revision_id: 'revision-1',
          role: 'growth',
          lifecycle_state: 'active',
          sample_code: 'S-01',
          updated_at: '2026-07-24T09:00:00Z',
        },
        {
          id: 'sample-2',
          experiment_run_id: 'run-2',
          run_revision_id: 'revision-2',
          role: 'growth',
          lifecycle_state: 'active',
          sample_code: 'S-02',
          updated_at: '2026-07-24T10:30:00Z',
        },
        {
          id: 'sample-3',
          experiment_run_id: 'run-3',
          run_revision_id: 'revision-old',
          role: 'growth',
          lifecycle_state: 'active',
          sample_code: 'S-03',
          updated_at: '2026-07-24T12:00:00Z',
        },
        {
          id: 'sample-4',
          experiment_run_id: 'run-4',
          run_revision_id: null,
          role: 'derived',
          lifecycle_state: 'consumed',
          sample_code: 'S-04',
          updated_at: '2026-07-24T12:30:00Z',
        },
        {
          id: 'sample-5',
          experiment_run_id: 'run-5',
          run_revision_id: null,
          role: 'derived',
          lifecycle_state: 'consumed',
          sample_code: 'S-05',
          updated_at: '2026-07-24T13:00:00Z',
        },
      ],
      total: 5,
    })
    experimentApi.listAllMeasurements.mockResolvedValue({
      items: [
        {
          id: 'result-old',
          sample_id: 'sample-1',
          measured_at: '2026-07-24T10:00:00Z',
          evidence_present: true,
        },
        {
          id: 'result-new',
          sample_id: 'sample-2',
          measured_at: '2026-07-24T11:00:00Z',
          evidence_present: true,
        },
        {
          id: 'result-consumed',
          sample_id: 'sample-4',
          measured_at: '2026-07-24T12:00:00Z',
          evidence_present: true,
        },
      ],
      total: 3,
      next_cursor: null,
    })
    experimentApi.getRun.mockImplementation((runId: string) =>
      Promise.resolve({
        id: runId,
        current_revision_id: `revision-${runId.slice(-1)}`,
      }),
    )
  })

  it('keeps current active samples and consumed evidence while excluding stale growth', async () => {
    const items = await listCharacterizationItems('token')

    expect(experimentApi.listAllMeasurements).toHaveBeenCalledWith('token')
    expect(
      items.map(({ measurements, sample }) => [
        measurements.map((measurement) => measurement.id),
        sample.sample_code,
      ]),
    ).toEqual([
      [['result-consumed'], 'S-04'],
      [['result-new'], 'S-02'],
      [['result-old'], 'S-01'],
    ])
  })
})
