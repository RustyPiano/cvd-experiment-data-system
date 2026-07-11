import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SampleDetailPage } from './sample-detail-page'

let status: 'submitted' | 'locked' | 'invalid' = 'submitted'

vi.mock('@/routes/_authed/samples/$sampleId', () => ({
  Route: { useParams: () => ({ sampleId: 'sample-1' }) },
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useBlocker: () => ({ status: 'unblocked' }),
}))
vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({
    session: {
      accessToken: 'token',
      currentUser: { id: 'owner-1', role: 'member' },
      isAuthenticated: true,
    },
  }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'experiments') {
      return {
        data: {
          id: 'run-1',
          owner_id: 'owner-1',
          run_code: 'RUN-1',
          status,
        },
        isLoading: false,
        isError: false,
      }
    }
    if (queryKey[1] === 'files') {
      return {
        data: { items: [] },
        isLoading: false,
        isError: false,
      }
    }
    return {
      data: {
        id: 'sample-1',
        experiment_run_id: 'run-1',
        sample_code: 'RUN-1-S1',
        role: 'product',
        metadata_json: {},
        updated_at: '2026-07-11T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    }
  },
}))

describe('sample detail result-domain editability', () => {
  beforeEach(() => {
    status = 'submitted'
  })

  it.each(['submitted', 'locked'] as const)(
    'keeps %s samples editable',
    (runStatus) => {
      status = runStatus
      render(<SampleDetailPage />)

      expect(screen.getByLabelText('元数据 JSON')).toBeEnabled()
      expect(
        screen.getByRole('button', { name: '保存样品' }),
      ).toBeInTheDocument()
    },
  )

  it('keeps invalid samples read-only', () => {
    status = 'invalid'
    render(<SampleDetailPage />)

    expect(screen.getByLabelText('元数据 JSON')).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: '保存样品' }),
    ).not.toBeInTheDocument()
  })
})
