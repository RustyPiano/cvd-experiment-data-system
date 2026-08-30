import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiDownload, apiRequest } from '@/shared/api/client'
import {
  downloadRunsExport,
  getMeasurement,
  invalidateMeasurement,
  listAllMeasurements,
  listRuns,
} from './api'

vi.mock('@/shared/api/client', () => ({
  apiRequest: vi.fn(),
  apiDownload: vi.fn(),
}))

describe('listRuns', () => {
  beforeEach(() => vi.clearAllMocks())
  it('sends page and page_size query parameters', () => {
    listRuns('token', { page: 2, pageSize: 50 })

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/v1/experiments?page=2&page_size=50',
      { token: 'token' },
    )
  })

  it('uses the same filters for lists and ZIP exports', () => {
    const filters = {
      query: '  3201 ',
      materialSystem: ' MoS2 ',
      operator: ' Alice ',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      statuses: ['locked' as const],
    }

    listRuns('token', { page: 1, pageSize: 20, filters })
    downloadRunsExport(filters, 'token')

    const suffix =
      'query=3201&target_material_system=MoS2&operator=Alice&date_from=2026-07-01&date_to=2026-07-31&status=locked'
    expect(apiRequest).toHaveBeenLastCalledWith(
      `/api/v1/experiments?page=1&page_size=20&${suffix}`,
      { token: 'token' },
    )
    expect(apiDownload).toHaveBeenCalledWith(`/api/v1/exports/runs?${suffix}`, {
      token: 'token',
    })
  })
})

describe('measurement API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads every cursor page without silently truncating records', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({
        items: [{ id: 'measurement-1' }],
        total: 2,
        next_cursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        items: [{ id: 'measurement-2' }],
        total: 2,
        next_cursor: null,
      })

    await expect(
      listAllMeasurements('token', { sampleId: 'sample-1' }),
    ).resolves.toMatchObject({
      items: [{ id: 'measurement-1' }, { id: 'measurement-2' }],
      total: 2,
      next_cursor: null,
    })
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      '/api/v1/measurements?limit=100&sample_id=sample-1&cursor=cursor-2',
      { token: 'token' },
    )
  })

  it('fails visibly if the server truncates a measurement list', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      items: [{ id: 'measurement-1' }],
      total: 2,
      next_cursor: null,
    })

    await expect(listAllMeasurements('token')).rejects.toThrow('分页提前结束')
  })

  it('reads details and invalidates with a reason', () => {
    getMeasurement('measurement-1', 'token')
    invalidateMeasurement('measurement-1', 'wrong sample', 'token')

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      '/api/v1/measurements/measurement-1',
      { token: 'token' },
    )
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      '/api/v1/measurements/measurement-1/invalidate',
      {
        method: 'POST',
        body: { reason: 'wrong sample' },
        token: 'token',
      },
    )
  })
})
