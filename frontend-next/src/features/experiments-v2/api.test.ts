import { describe, expect, it, vi } from 'vitest'

import { apiDownload, apiRequest } from '@/shared/api/client'
import { downloadRunsExport, listRuns } from './api'

vi.mock('@/shared/api/client', () => ({
  apiRequest: vi.fn(),
  apiDownload: vi.fn(),
}))

describe('listRuns', () => {
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
