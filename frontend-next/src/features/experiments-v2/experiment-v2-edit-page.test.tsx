import { beforeEach, expect, it, vi } from 'vitest'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { ExperimentV2EditPage } from './experiment-v2-edit-page'

const api = vi.hoisted(() => ({
  downloadRunExport: vi.fn(),
  getModuleOrNull: vi.fn(),
  getRun: vi.fn(),
  listRunRevisions: vi.fn(),
  reviewRun: vi.fn(),
  setNotCharacterized: vi.fn(),
  transitionRun: vi.fn(),
}))

vi.mock('./api', () => api)
vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({
    session: {
      accessToken: 'token',
      isAuthenticated: true,
      currentUser: { id: 'user-1', role: 'member' },
    },
  }),
}))
vi.mock('./components/run-audit-section', () => ({
  RunAuditSection: () => null,
}))
vi.mock('./scientific-experiment-form', () => ({
  ScientificExperimentForm: ({
    canLock,
    onRequestLock,
    onProcessDirtyChange,
    onDirtyChange,
  }: {
    canLock?: boolean
    onRequestLock?: () => void
    onProcessDirtyChange?: (dirty: boolean) => void
    onDirtyChange?: (dirty: boolean) => void
  }) => (
    <>
      <button type="button" disabled={!canLock} onClick={onRequestLock}>
        Lock process
      </button>
      <button
        type="button"
        onClick={() => {
          onProcessDirtyChange?.(true)
          onDirtyChange?.(true)
        }}
      >
        Make process dirty
      </button>
    </>
  ),
}))

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
  api.getModuleOrNull.mockResolvedValue(null)
  api.listRunRevisions.mockResolvedValue({ items: [], total: 0 })
})

it('shows a retryable error without a simultaneous loading state', async () => {
  api.getRun.mockRejectedValue(new Error('offline'))
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ExperimentV2EditPage runId="run-1" />
      </QueryClientProvider>
    </I18nextProvider>,
  )

  expect(await screen.findByText('offline')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  expect(screen.queryByText('Loading')).not.toBeInTheDocument()
})

it('uses the run code and status as the primary page identity', async () => {
  api.getRun.mockResolvedValue({
    id: 'run-1',
    run_code: 'CVD-2026-0042',
    status: 'draft',
    owner_id: 'user-1',
    setup_ref: null,
    setup_ref_version: null,
    setup_ref_snapshot_json: null,
    result_missing_todo: false,
    not_characterized_at: null,
  })
  api.transitionRun.mockResolvedValue({
    id: 'run-1',
    run_code: 'CVD-2026-0042',
    status: 'locked',
    owner_id: 'user-1',
    setup_ref: null,
    setup_ref_version: null,
    setup_ref_snapshot_json: null,
    result_missing_todo: true,
    not_characterized_at: null,
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ExperimentV2EditPage runId="run-1" />
      </QueryClientProvider>
    </I18nextProvider>,
  )

  expect(
    await screen.findByRole('heading', { name: 'CVD-2026-0042' }),
  ).toBeInTheDocument()
  expect(screen.getByText('Recording')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Lock process' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Export this run' }),
  ).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Lock process' }))
  expect(
    screen.getByRole('heading', { name: 'Lock the process?' }),
  ).toBeInTheDocument()
  expect(api.transitionRun).not.toHaveBeenCalled()

  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Lock process',
    }),
  )
  await waitFor(() =>
    expect(api.transitionRun).toHaveBeenCalledWith(
      'run-1',
      'lock',
      'token',
      undefined,
    ),
  )
})

it('disables export and locking while process sections are unsaved', async () => {
  api.getRun.mockResolvedValue({
    id: 'run-1',
    run_code: 'CVD-2026-0042',
    status: 'draft',
    owner_id: 'user-1',
    setup_ref: null,
    setup_ref_version: null,
    setup_ref_snapshot_json: null,
    result_missing_todo: false,
    not_characterized_at: null,
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ExperimentV2EditPage runId="run-1" />
      </QueryClientProvider>
    </I18nextProvider>,
  )

  fireEvent.click(
    await screen.findByRole('button', { name: 'Make process dirty' }),
  )

  expect(screen.getByRole('button', { name: 'Lock process' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Export this run' })).toBeDisabled()
  expect(
    screen.getByText(/Save the affected sections before exporting or locking/),
  ).toBeInTheDocument()
})
