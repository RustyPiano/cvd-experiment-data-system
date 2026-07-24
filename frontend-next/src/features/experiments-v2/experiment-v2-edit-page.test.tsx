import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { ExperimentV2EditPage } from './experiment-v2-edit-page'

const api = vi.hoisted(() => ({
  downloadRunExport: vi.fn(),
  getModuleOrNull: vi.fn(),
  getRun: vi.fn(),
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
vi.mock('./experiment-v2-form', () => ({
  ExperimentV2Form: () => null,
}))

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
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
