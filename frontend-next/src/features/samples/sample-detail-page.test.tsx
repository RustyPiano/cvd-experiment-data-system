import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ReactModule from 'react'

import { SampleDetailPage } from './sample-detail-page'
import { updateSample } from './api'

let status: 'submitted' | 'locked' | 'invalid' = 'submitted'
let mutationPending = false
let sampleData = {
  id: 'sample-1',
  experiment_run_id: 'run-1',
  sample_code: 'RUN-1-S1',
  role: 'product',
  metadata_json: {},
  updated_at: '2026-07-11T00:00:00Z',
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  getRouteApi: () => ({ useParams: () => ({ sampleId: 'sample-1' }) }),
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
vi.mock('./api', () => ({ updateSample: vi.fn() }))
vi.mock('@tanstack/react-query', async () => {
  const React = await vi.importActual<typeof ReactModule>('react')
  return {
  useQueryClient: () => ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    setQueryData: vi.fn((queryKey: string[], value: typeof sampleData) => {
      if (queryKey[0] === 'samples' && queryKey[1] === 'detail') {
        sampleData = value
      }
    }),
  }),
  useMutation: (options: {
    mutationFn: () => Promise<unknown>
    onSuccess?: (data: unknown) => Promise<void> | void
    onError?: (error: unknown) => void
    onSettled?: () => void
  }) => {
    const [internalPending, setInternalPending] = React.useState(false)
    const optionsRef = React.useRef(options)
    optionsRef.current = options
    const mutate = React.useCallback(async () => {
      setInternalPending(true)
      try {
        const data = await optionsRef.current.mutationFn()
        await optionsRef.current.onSuccess?.(data)
      } catch (error) {
        optionsRef.current.onError?.(error)
      } finally {
        setInternalPending(false)
        optionsRef.current.onSettled?.()
      }
    }, [])
    return { isPending: mutationPending || internalPending, mutate }
  },
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
      data: sampleData,
      isLoading: false,
      isError: false,
    }
  },
  }
})

describe('sample detail result-domain editability', () => {
  beforeEach(() => {
    status = 'submitted'
    mutationPending = false
    sampleData = {
      id: 'sample-1',
      experiment_run_id: 'run-1',
      sample_code: 'RUN-1-S1',
      role: 'product',
      metadata_json: {},
      updated_at: '2026-07-11T00:00:00Z',
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(updateSample).mockReset()
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

  it('keeps metadata input enabled while autosave is pending', () => {
    mutationPending = true
    render(<SampleDetailPage />)

    expect(screen.getByLabelText('元数据 JSON')).toBeEnabled()
    expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled()
  })

  it('autosaves edits made while a previous autosave is in flight', async () => {
    vi.useFakeTimers()
    let finishFirst:
      | ((value: Awaited<ReturnType<typeof updateSample>>) => void)
      | undefined
    vi.mocked(updateSample)
      .mockImplementationOnce(
        () => new Promise((resolve) => (finishFirst = resolve)),
      )
      .mockResolvedValue({
        id: 'sample-1',
        experiment_run_id: 'run-1',
        sample_code: 'RUN-1-S1',
        role: 'product',
        metadata_json: { version: 2 },
        updated_at: '2026-07-11T00:00:01Z',
      } as never)
    render(<SampleDetailPage />)
    const input = screen.getByLabelText('元数据 JSON')

    fireEvent.change(input, { target: { value: '{"version":1}' } })
    await act(() => vi.advanceTimersByTimeAsync(900))
    expect(updateSample).toHaveBeenCalledTimes(1)

    fireEvent.change(input, { target: { value: '{"version":2}' } })
    await act(async () => {
      finishFirst?.({
        id: 'sample-1',
        experiment_run_id: 'run-1',
        sample_code: 'RUN-1-S1',
        role: 'product',
        metadata_json: { version: 1 },
        updated_at: '2026-07-11T00:00:00Z',
      } as unknown as Awaited<ReturnType<typeof updateSample>>)
      await Promise.resolve()
    })
    await act(() => vi.advanceTimersByTimeAsync(900))

    expect(updateSample).toHaveBeenCalledTimes(2)
    expect(vi.mocked(updateSample).mock.calls[1]?.[2]).toEqual({
      metadata_json: { version: 2 },
    })
  })
})
