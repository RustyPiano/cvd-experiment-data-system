import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { EntityFileDisplay } from './entity-file-control'
import { EntityImagePreview } from './entity-image-preview'

const api = vi.hoisted(() => ({
  downloadEntityFile: vi.fn(),
  getEntityFile: vi.fn(),
}))

vi.mock('./api', () => api)

const createObjectURL = vi.fn(() => 'blob:setup-preview')
const revokeObjectURL = vi.fn()
Object.defineProperty(URL, 'createObjectURL', {
  configurable: true,
  value: createObjectURL,
})
Object.defineProperty(URL, 'revokeObjectURL', {
  configurable: true,
  value: revokeObjectURL,
})

function renderDisplay() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <EntityFileDisplay
          value={{
            file_asset_id: 'file-1',
            sha256: 'abc123',
            original_name: 'setup.png',
            size_bytes: 12,
          }}
          token="token"
        />
      </QueryClientProvider>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  createObjectURL.mockReturnValue('blob:setup-preview')
  api.getEntityFile.mockResolvedValue({
    id: 'file-1',
    original_name: 'setup.png',
    content_type: 'image/png',
    size_bytes: 12,
    sha256: 'abc123',
  })
  api.downloadEntityFile.mockResolvedValue({
    blob: new Blob(['image'], { type: 'image/png' }),
    filename: 'setup.png',
  })
})

describe('EntityFileDisplay image preview', () => {
  it('renders an authenticated image attachment inline', async () => {
    const { unmount } = renderDisplay()

    expect(
      await screen.findByRole('img', { name: 'setup.png' }),
    ).toHaveAttribute('src', 'blob:setup-preview')
    expect(api.downloadEntityFile).toHaveBeenCalledWith(
      'token',
      'file-1',
      expect.any(AbortSignal),
    )

    unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:setup-preview')
  })

  it('replaces and revokes the preview when the file version changes', async () => {
    createObjectURL
      .mockReturnValueOnce('blob:first-preview')
      .mockReturnValueOnce('blob:second-preview')
    api.getEntityFile.mockImplementation((_token: string, fileId: string) =>
      Promise.resolve({
        id: fileId,
        original_name: `${fileId}.png`,
        content_type: 'image/png',
        size_bytes: 12,
        sha256: fileId,
      }),
    )
    api.downloadEntityFile.mockImplementation(
      (_token: string, fileId: string) =>
        Promise.resolve({
          blob: new Blob([fileId], { type: 'image/png' }),
          filename: `${fileId}.png`,
        }),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    for (const fileId of ['first', 'second']) {
      queryClient.setQueryData(['entity-file', fileId, 'token'], {
        id: fileId,
        original_name: `${fileId}.png`,
        content_type: 'image/png',
        size_bytes: 12,
        sha256: fileId,
      })
      queryClient.setQueryData(
        ['entity-file-preview', fileId, fileId, 'token'],
        new Blob([fileId], { type: 'image/png' }),
      )
    }
    const view = (fileId: string) => (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <EntityImagePreview
            value={{ file_asset_id: fileId, sha256: fileId }}
            token="token"
            alt="Reactor"
          />
        </QueryClientProvider>
      </I18nextProvider>
    )
    const { rerender } = render(view('first'))
    expect(await screen.findByRole('img', { name: 'Reactor' })).toHaveAttribute(
      'src',
      'blob:first-preview',
    )

    rerender(view('second'))

    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Reactor' })).toHaveAttribute(
        'src',
        'blob:second-preview',
      ),
    )
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first-preview')
  })

  it('does not auto-download an oversized list thumbnail', async () => {
    api.getEntityFile.mockResolvedValue({
      id: 'file-1',
      original_name: 'large.png',
      content_type: 'image/png',
      size_bytes: 6 * 1024 * 1024,
      sha256: 'abc123',
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <EntityImagePreview
            value={{ file_asset_id: 'file-1', sha256: 'abc123' }}
            token="token"
            alt="Large reactor"
            variant="thumbnail"
          />
        </QueryClientProvider>
      </I18nextProvider>,
    )

    await waitFor(() => expect(api.getEntityFile).toHaveBeenCalled())
    await act(
      () =>
        new Promise((resolve) => {
          window.setTimeout(resolve, 50)
        }),
    )
    expect(api.downloadEntityFile).not.toHaveBeenCalled()
    expect(screen.queryByRole('img', { name: 'Large reactor' })).toBeNull()
  })

  it('does not auto-download a non-image attachment', async () => {
    api.getEntityFile.mockResolvedValue({
      id: 'file-1',
      original_name: 'setup.pdf',
      content_type: 'application/pdf',
      size_bytes: 12,
      sha256: 'abc123',
    })

    renderDisplay()

    expect(await screen.findByText('setup.pdf')).toBeInTheDocument()
    expect(api.downloadEntityFile).not.toHaveBeenCalled()
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: /setup\.pdf/ }),
    ).toBeInTheDocument()
  })

  it('keeps the attachment controls when image preview loading fails', async () => {
    api.downloadEntityFile.mockRejectedValue(new Error('offline'))

    renderDisplay()

    await waitFor(() => expect(api.downloadEntityFile).toHaveBeenCalled())
    expect(screen.getByText('setup.png')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /setup\.png/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'setup.png' })).toBeNull()
  })
})
