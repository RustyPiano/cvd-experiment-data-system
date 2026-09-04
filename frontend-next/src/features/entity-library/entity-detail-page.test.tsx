import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { EntityDetailPage } from './entity-detail-page'

const api = vi.hoisted(() => ({
  appendEntityVersion: vi.fn(),
  getEntity: vi.fn(),
  listEntityVersions: vi.fn(),
}))

vi.mock('./api', () => api)
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))
vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({
    session: {
      accessToken: 'token',
      isAuthenticated: true,
      currentUser: { id: 'user-1' },
    },
  }),
}))
vi.mock('./entity-form', () => ({ EntityForm: () => null }))

const versions = [
  {
    id: 'version-2',
    entity_id: 'setup-1',
    version: 2,
    data: {
      setup_code: 'SETUP-01',
      setup_name: 'Main setup',
      setup_origin: 'modified',
      manufacturer_brand: 'Original Co.',
      model: 'OTF-1000',
      modification_details: 'Added independent zone control',
      tube_material_shape: { material: 'quartz', shape: 'round' },
      tube_outer_diameter_wall_mm: {
        outer_diameter_mm: 50,
        wall_thickness_mm: 2,
      },
    },
    created_at: '2026-07-24T00:00:00Z',
  },
  {
    id: 'version-1',
    entity_id: 'setup-1',
    version: 1,
    data: {
      setup_code: 'SETUP-01',
      setup_name: 'Main setup',
      setup_origin: 'modified',
      manufacturer_brand: 'Original Co.',
      model: 'OTF-1000',
      modification_details: 'Added independent zone control',
      tube_material_shape: { material: 'quartz', shape: 'round' },
      tube_outer_diameter_wall_mm: {
        outer_diameter_mm: 40,
        wall_thickness_mm: 1.5,
      },
    },
    created_at: '2026-07-23T00:00:00Z',
  },
]

function renderPage(kind: 'setup' | 'instrument' = 'setup') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <EntityDetailPage kind={kind} entityId="setup-1" />
      </QueryClientProvider>
    </I18nextProvider>,
  )
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('zh')
  api.getEntity.mockResolvedValue({
    id: 'setup-1',
    entity_type: 'setup',
    created_at: '2026-07-23T00:00:00Z',
    updated_at: '2026-07-24T00:00:00Z',
    latest_version: versions[0],
  })
  api.listEntityVersions.mockResolvedValue({ items: versions, total: 2 })
})

describe('EntityDetailPage display values', () => {
  it('shows named other methods rather than opaque JSON objects', async () => {
    api.getEntity.mockResolvedValue({
      id: 'setup-1',
      latest_version: {
        ...versions[0],
        data: {
          instrument_code: 'CUSTOM-01',
          name_type: 'other',
          capabilities: [
            { code: 'Raman', configuration: {} },
            { code: 'other', configuration: { method_names: ['XPS', 'FTIR'] } },
          ],
        },
      },
    })
    renderPage('instrument')
    expect(await screen.findByText('Raman · XPS · FTIR')).toBeInTheDocument()
    expect(screen.queryByText(/\[object Object\]/)).toBeNull()
  })

  it('renders named geometry as localized human-readable parts', async () => {
    renderPage()

    expect(
      await screen.findByText('外径（mm）：50 · 壁厚（mm）：2'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('{"outer_diameter_mm":50,"wall_thickness_mm":2}'),
    ).not.toBeInTheDocument()
  })

  it('uses original-equipment labels for a modified setup', async () => {
    renderPage()

    expect(await screen.findByText('原设备制造商或品牌')).toBeInTheDocument()
    expect(screen.getByText('原设备型号')).toBeInTheDocument()
    expect(screen.getByText('改造内容')).toBeInTheDocument()
  })

  it('labels a selected historical snapshot as the viewed version', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /v1/ }))

    expect(screen.getByText('查看版本')).toBeInTheDocument()
    expect(screen.getByText('正在查看历史版本 v1（只读）')).toBeInTheDocument()
  })
})
