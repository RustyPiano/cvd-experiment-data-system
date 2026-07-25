import { useState } from 'react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { EntityLibraryPage } from './entity-library-page'

const api = vi.hoisted(() => ({
  createEntity: vi.fn(),
  deleteEntityFile: vi.fn(),
  downloadEntityFile: vi.fn(),
  getEntityFile: vi.fn(),
  listEntities: vi.fn(),
}))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

vi.mock('./api', () => api)
vi.mock('sonner', () => ({ toast }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))
vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({
    session: {
      accessToken: 'token',
      isAuthenticated: true,
      currentUser: { id: 'user-1', role: 'admin' },
    },
  }),
}))
vi.mock('./entity-form', () => ({
  EntityForm: ({
    onCancel,
    onDirtyChange,
    onPendingFilesChange,
    onUploadPendingChange,
    onSubmit,
  }: {
    onCancel: () => void
    onDirtyChange?: (dirty: boolean) => void
    onPendingFilesChange?: (files: Array<{ id: string }>) => void
    onUploadPendingChange?: (pending: boolean) => void
    onSubmit: (payload: Record<string, unknown>) => void
  }) => {
    const [staged, setStaged] = useState(false)
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            setStaged(true)
            onDirtyChange?.(true)
            onPendingFilesChange?.([{ id: 'file-1' }])
          }}
        >
          Stage upload
        </button>
        <button type="button" onClick={onCancel}>
          Cancel form
        </button>
        <button type="button" onClick={() => onUploadPendingChange?.(true)}>
          Start upload
        </button>
        <button type="button" onClick={() => onUploadPendingChange?.(false)}>
          Finish upload
        </button>
        <button type="button" onClick={() => onSubmit({ staged })}>
          Submit entity
        </button>
      </div>
    )
  },
}))

function renderPage(
  kind: 'material_lot' | 'setup' | 'instrument' = 'material_lot',
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <EntityLibraryPage kind={kind} />
      </QueryClientProvider>
    </I18nextProvider>,
  )
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
  api.listEntities.mockResolvedValue({ items: [], total: 0 })
  api.deleteEntityFile.mockResolvedValue(undefined)
  api.getEntityFile.mockResolvedValue({
    id: 'file-1',
    original_name: 'reactor.png',
    content_type: 'image/png',
    size_bytes: 12,
    sha256: 'abc123',
  })
  api.downloadEntityFile.mockResolvedValue({
    blob: new Blob(['image'], { type: 'image/png' }),
    filename: 'reactor.png',
  })
  api.createEntity.mockResolvedValue({
    id: 'lot-1',
    latest_version: { version: 1 },
  })
})

describe('EntityLibraryPage attachment draft lifecycle', () => {
  it('does not close the dialog while an upload is still in flight', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'New Material lot' }))
    await user.click(screen.getByRole('button', { name: 'Start upload' }))
    await user.click(screen.getByRole('button', { name: 'Cancel form' }))

    expect(
      screen.getByRole('dialog', { name: 'New Material lot' }),
    ).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
    expect(api.deleteEntityFile).not.toHaveBeenCalled()
  })

  it('deletes unbound uploads only after explicit discard confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'New Material lot' }))
    await user.click(screen.getByRole('button', { name: 'Stage upload' }))
    await user.click(screen.getByRole('button', { name: 'Cancel form' }))

    expect(confirm).toHaveBeenCalledWith('Discard the unsaved form changes?')
    await waitFor(() =>
      expect(api.deleteEntityFile).toHaveBeenCalledWith('token', 'file-1'),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'New Material lot' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('keeps the dialog and upload when discard cleanup fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    api.deleteEntityFile.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'New Material lot' }))
    await user.click(screen.getByRole('button', { name: 'Stage upload' }))
    await user.click(screen.getByRole('button', { name: 'Cancel form' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(
      screen.getByRole('dialog', { name: 'New Material lot' }),
    ).toBeInTheDocument()
  })

  it('preserves the upload after save failure and never deletes it after retry succeeds', async () => {
    api.createEntity
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        id: 'lot-1',
        latest_version: { version: 1 },
      })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'New Material lot' }))
    await user.click(screen.getByRole('button', { name: 'Stage upload' }))
    await user.click(screen.getByRole('button', { name: 'Submit entity' }))
    await waitFor(() => expect(api.createEntity).toHaveBeenCalledTimes(1))
    expect(
      screen.getByRole('dialog', { name: 'New Material lot' }),
    ).toBeInTheDocument()
    expect(api.deleteEntityFile).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Submit entity' }))
    await waitFor(() => expect(api.createEntity).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'New Material lot' }),
      ).not.toBeInTheDocument(),
    )
    expect(api.deleteEntityFile).not.toHaveBeenCalled()
  })
})

describe('EntityLibraryPage display values', () => {
  it('shows the latest setup image beside the apparatus name', async () => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:reactor-preview'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    api.listEntities.mockResolvedValue({
      items: [
        {
          id: 'setup-1',
          entity_type: 'setup',
          created_at: '2026-07-24T00:00:00Z',
          updated_at: '2026-07-24T00:00:00Z',
          latest_version: {
            id: 'version-1',
            entity_id: 'setup-1',
            version: 1,
            data: {
              setup_name: 'Main reactor',
              setup_code: 'SETUP-01',
              setup_diagram: {
                file_asset_id: 'file-1',
                sha256: 'abc123',
                original_name: 'reactor.png',
                size_bytes: 12,
              },
            },
            created_at: '2026-07-24T00:00:00Z',
          },
        },
      ],
      total: 1,
    })

    const { container } = renderPage('setup')

    await waitFor(() =>
      expect(container.querySelector('img[alt=""]')).toHaveAttribute(
        'src',
        'blob:reactor-preview',
      ),
    )
  })

  it('does not request file data when a setup has no diagram', async () => {
    api.listEntities.mockResolvedValue({
      items: [
        {
          id: 'setup-1',
          entity_type: 'setup',
          created_at: '2026-07-24T00:00:00Z',
          updated_at: '2026-07-24T00:00:00Z',
          latest_version: {
            id: 'version-1',
            entity_id: 'setup-1',
            version: 1,
            data: {
              setup_name: 'Bare reactor',
              setup_code: 'SETUP-01',
            },
            created_at: '2026-07-24T00:00:00Z',
          },
        },
      ],
      total: 1,
    })

    renderPage('setup')

    expect(await screen.findByText('Bare reactor')).toBeInTheDocument()
    expect(api.getEntityFile).not.toHaveBeenCalled()
    expect(api.downloadEntityFile).not.toHaveBeenCalled()
  })

  it('shows the localized instrument type instead of its machine code', async () => {
    await i18n.changeLanguage('zh')
    api.listEntities.mockResolvedValue({
      items: [
        {
          id: 'instrument-1',
          entity_type: 'instrument',
          created_at: '2026-07-24T00:00:00Z',
          updated_at: '2026-07-24T00:00:00Z',
          latest_version: {
            id: 'version-1',
            entity_id: 'instrument-1',
            version: 1,
            data: {
              name_type: 'optical_microscopy',
              instrument_code: 'OM-01',
            },
            created_at: '2026-07-24T00:00:00Z',
          },
        },
      ],
      total: 1,
    })

    renderPage('instrument')

    expect(await screen.findByText('光镜')).toBeInTheDocument()
    expect(screen.queryByText('optical_microscopy')).not.toBeInTheDocument()
  })
})
