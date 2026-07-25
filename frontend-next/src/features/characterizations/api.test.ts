import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listCharacterizationItems } from './api'

const experimentApi = vi.hoisted(() => ({ listResults: vi.fn() }))
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
          sample_code: 'S-01',
          updated_at: '2026-07-24T09:00:00Z',
        },
        {
          id: 'sample-2',
          sample_code: 'S-02',
          updated_at: '2026-07-24T10:30:00Z',
        },
        {
          id: 'sample-3',
          sample_code: 'S-03',
          updated_at: '2026-07-24T12:00:00Z',
        },
      ],
      total: 3,
    })
    experimentApi.listResults
      .mockResolvedValueOnce({
        items: [{ id: 'result-old', created_at: '2026-07-24T10:00:00Z' }],
        total: 1,
      })
      .mockResolvedValueOnce({
        items: [{ id: 'result-new', created_at: '2026-07-24T11:00:00Z' }],
        total: 1,
      })
      .mockResolvedValueOnce({ items: [], total: 0 })
  })

  it('keeps samples without results and sorts by latest sample activity', async () => {
    const items = await listCharacterizationItems('token')

    expect(experimentApi.listResults).toHaveBeenCalledTimes(3)
    expect(experimentApi.listResults).toHaveBeenNthCalledWith(
      1,
      'sample-1',
      'token',
    )
    expect(
      items.map(({ results, sample }) => [
        results.map((result) => result.id),
        sample.sample_code,
      ]),
    ).toEqual([
      [[], 'S-03'],
      [['result-new'], 'S-02'],
      [['result-old'], 'S-01'],
    ])
  })
})
