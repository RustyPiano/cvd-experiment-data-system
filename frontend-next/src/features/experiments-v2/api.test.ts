import { describe, expect, it, vi } from 'vitest'

import { apiRequest } from '@/shared/api/client'
import { listRuns } from './api'

vi.mock('@/shared/api/client', () => ({ apiRequest: vi.fn() }))

describe('listRuns', () => {
  it('sends page and page_size query parameters', () => {
    listRuns('token', { page: 2, pageSize: 50 })

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/v1/experiments?page=2&page_size=50',
      { token: 'token' },
    )
  })
})
