import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { CharacterizationListPage } from './characterization-list-page'

const api = vi.hoisted(() => ({ listCharacterizationItems: vi.fn() }))
vi.mock('./api', () => api)
vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({
    session: {
      accessToken: 'token',
      currentUser: { id: 'user-1' },
      isAuthenticated: true,
    },
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    hash,
    search,
  }: {
    children: ReactNode
    to: string
    params?: Record<string, string>
    hash?: string
    search?: Record<string, string>
  }) => {
    const href = Object.entries(params ?? {}).reduce(
      (path, [key, value]) => path.replace(`$${key}`, value),
      to,
    )
    const query = new URLSearchParams(search).toString()
    return (
      <a href={`${href}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`}>
        {children}
      </a>
    )
  },
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <CharacterizationListPage />
      </QueryClientProvider>
    </I18nextProvider>,
  )
}

describe('CharacterizationListPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('zh')
    api.listCharacterizationItems.mockResolvedValue([
      {
        sample: {
          id: 'sample-1',
          experiment_run_id: 'run-1',
          run_code: 'CVD-2026-0001',
          sample_code: 'CVD-2026-0001-S01',
          material_system: 'MoS2',
        },
        results: [
          {
            id: 'result-1',
            kind: 'characterization',
            method_instrument: 'optical_microscopy',
            method_other: null,
            created_at: '2026-07-24T11:00:00',
          },
        ],
      },
      {
        sample: {
          id: 'sample-2',
          experiment_run_id: 'run-2',
          run_code: 'CVD-2026-0002',
          sample_code: 'CVD-2026-0002-S01',
          material_system: 'WS2',
        },
        results: [
          {
            id: 'result-2',
            kind: 'direct_observation',
            method_instrument: null,
            method_other: null,
            created_at: '2026-07-24T10:00:00',
          },
        ],
      },
      {
        sample: {
          id: 'sample-3',
          experiment_run_id: 'run-3',
          run_code: 'CVD-2026-0003',
          sample_code: 'CVD-2026-0003-S01',
          material_system: 'WSe2',
        },
        results: [],
      },
    ])
  })

  it('lists results and samples still awaiting characterization', async () => {
    renderPage()

    expect(await screen.findByText('CVD-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('CVD-2026-0001-S01')).toBeInTheDocument()
    expect(screen.getByText('光镜')).toBeInTheDocument()
    expect(screen.getByText('2026-07-24 11:00')).toBeInTheDocument()
    expect(screen.getByText('CVD-2026-0003-S01')).toBeInTheDocument()
    expect(screen.getByText('待表征')).toBeInTheDocument()
    expect(
      screen.getAllByRole('link', { name: '补录或查看表征' }),
    ).toHaveLength(3)
    expect(
      screen.getAllByRole('link', { name: '补录或查看表征' })[2],
    ).toHaveAttribute('href', '/characterizations?runId=run-3')
  })

  it('filters by preparation record, sample, material, or method', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('CVD-2026-0001')
    await user.type(screen.getByLabelText('搜索表征实验记录'), 'WS2')

    expect(screen.queryByText('CVD-2026-0001-S01')).not.toBeInTheDocument()
    expect(screen.getByText('CVD-2026-0002-S01')).toBeInTheDocument()
  })

  it('points an empty list back to preparation records', async () => {
    api.listCharacterizationItems.mockResolvedValue([])
    renderPage()

    expect(
      await screen.findByText('还没有可表征样品。请先锁定制备工艺以生成样品。'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '前往制备实验记录' }),
    ).toHaveAttribute('href', '/experiments')
  })
})
