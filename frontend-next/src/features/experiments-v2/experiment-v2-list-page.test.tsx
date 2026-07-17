import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { ExperimentV2ListPage } from './experiment-v2-list-page'

const api = vi.hoisted(() => ({ listRuns: vi.fn() }))
vi.mock('./api', () => api)
vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({ session: { accessToken: 'token', isAuthenticated: true } }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))

describe('ExperimentV2ListPage pagination', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
    api.listRuns.mockResolvedValue({
      items: [
        {
          id: 'run-1',
          run_code: 'CVD-2026-0001',
          material_system: 'MoS2',
          experiment_date: '2026-07-12',
          status: 'draft',
          result_missing_todo: false,
        },
      ],
      total: 75,
    })
  })

  it('enables next for additional results and requests the next page', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const user = userEvent.setup()
    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <ExperimentV2ListPage />
        </QueryClientProvider>
      </I18nextProvider>,
    )

    expect(await screen.findByText(/75 total/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    const next = screen.getByRole('button', { name: 'Next' })
    expect(next).toBeEnabled()
    await user.click(next)

    await waitFor(() =>
      expect(api.listRuns).toHaveBeenLastCalledWith('token', {
        page: 2,
        pageSize: 50,
      }),
    )
  })
})
