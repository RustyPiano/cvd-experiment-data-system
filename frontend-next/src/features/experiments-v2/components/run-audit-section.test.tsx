import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/shared/i18n'
import { RunAuditSection } from './run-audit-section'

const api = vi.hoisted(() => ({ listRunAuditEvents: vi.fn() }))
vi.mock('../api', () => api)

describe('RunAuditSection', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
    api.listRunAuditEvents.mockResolvedValue({
      total: 2,
      items: [
        {
          actor_name: 'Alice',
          action: 'lock',
          reason: null,
          created_at: '2026-07-17T08:30:00Z',
        },
        {
          actor_name: 'Alice',
          action: 'confirm_not_characterized',
          reason: null,
          created_at: '2026-07-17T08:31:00Z',
        },
      ],
    })
  })

  it('renders a localized activity without exposing payload snapshots', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <RunAuditSection runId="run-1" token="token" />
        </QueryClientProvider>
      </I18nextProvider>,
    )

    expect(await screen.findByText('Locked process')).toBeInTheDocument()
    expect(screen.getByText('Marked not characterized yet')).toBeInTheDocument()
    expect(screen.getAllByText('Alice')).toHaveLength(2)
    expect(api.listRunAuditEvents).toHaveBeenCalledWith('run-1', 'token')
    expect(screen.queryByText(/before_json/i)).not.toBeInTheDocument()
  })
})
