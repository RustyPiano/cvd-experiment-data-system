import type { ComponentType } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { ResultsSection } from './results-section'

const resultsApi = vi.hoisted(() => ({
  createCharacterizationRecord: vi.fn(),
  createMeasuredProduct: vi.fn(),
  createSample: vi.fn(),
  deleteCharacterizationRecord: vi.fn(),
  deleteMeasuredProduct: vi.fn(),
  listCharacterizationRecords: vi.fn(),
  listMeasuredProducts: vi.fn(),
  listSamples: vi.fn(),
}))
const filesApi = vi.hoisted(() => ({
  deleteExperimentFile: vi.fn(),
  downloadExperimentFile: vi.fn(),
  listExperimentFiles: vi.fn(),
  uploadExperimentFile: vi.fn(),
}))
const download = vi.hoisted(() => ({ triggerBlobDownload: vi.fn() }))

vi.mock('../api', () => resultsApi)
vi.mock('@/features/samples/api', () => filesApi)
vi.mock('@/shared/lib/download', () => download)
vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({
    session: { accessToken: 'token', isAuthenticated: true },
  }),
}))
vi.mock('./entity-reference-select', () => ({
  EntityReferenceSelect: () => null,
}))

const sample = {
  id: 'sample-1',
  sample_code: 'RUN-F4-S1',
  role: 'product',
}
const record = {
  id: 'record-1',
  sample_id: sample.id,
  method_instrument: 'Raman',
  test_conditions: '532 nm',
}
const attachment = {
  id: 'file-1',
  original_name: 'evidence.csv',
  size_bytes: 1536,
}

function renderResults(readOnly = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Component = ResultsSection as ComponentType<{
    runId: string
    readOnly: boolean
  }>
  return {
    queryClient,
    ...render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <Component runId="run-1" readOnly={readOnly} />
        </QueryClientProvider>
      </I18nextProvider>,
    ),
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
  resultsApi.listSamples.mockResolvedValue({ items: [sample], total: 1 })
  resultsApi.listCharacterizationRecords.mockResolvedValue({
    items: [record],
    total: 1,
  })
  resultsApi.listMeasuredProducts.mockResolvedValue({ items: [], total: 0 })
  filesApi.listExperimentFiles.mockResolvedValue({
    items: [attachment],
    total: 1,
  })
  filesApi.uploadExperimentFile.mockResolvedValue(attachment)
  filesApi.deleteExperimentFile.mockResolvedValue(undefined)
  filesApi.downloadExperimentFile.mockResolvedValue({
    blob: new Blob(['peak=404']),
    filename: 'evidence.csv',
  })
})

describe('characterization attachments', () => {
  it('renders filename and size and reuses the shared download flow', async () => {
    const user = userEvent.setup()
    renderResults()

    expect(await screen.findByText('evidence.csv')).toBeInTheDocument()
    expect(screen.getByText('1.5 KiB')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Download evidence.csv' }),
    )

    expect(filesApi.downloadExperimentFile).toHaveBeenCalledWith(
      'token',
      'file-1',
    )
    expect(download.triggerBlobDownload).toHaveBeenCalledWith(
      expect.any(Blob),
      'evidence.csv',
    )
  })

  it('uploads one file with the record method and id', async () => {
    renderResults()
    const input = await screen.findByLabelText('Upload attachment for Raman')
    const file = new File(['image'], 'raman.png', { type: 'image/png' })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() =>
      expect(filesApi.uploadExperimentFile).toHaveBeenCalledWith(
        'token',
        'run-1',
        {
          file,
          method: 'Raman',
          characterizationRecordId: 'record-1',
        },
      ),
    )
  })

  it('confirms attachment soft-delete accessibly and invalidates only that record', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderResults()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(
      await screen.findByRole('button', { name: 'Delete evidence.csv' }),
    )
    expect(
      screen.getByRole('alertdialog', { name: 'Delete attachment?' }),
    ).toHaveAccessibleDescription()
    await user.click(screen.getByRole('button', { name: 'Delete attachment' }))

    await waitFor(() =>
      expect(filesApi.deleteExperimentFile).toHaveBeenCalledWith(
        'token',
        'file-1',
      ),
    )
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['v2-characterization-files', 'record-1', 'token'],
    })
  })

  it('keeps locked-style results enabled and makes invalid results read-only', async () => {
    const { unmount } = renderResults(false)
    expect(
      await screen.findByLabelText('Upload attachment for Raman'),
    ).toBeEnabled()
    unmount()

    renderResults(true)
    expect(
      await screen.findByLabelText('Upload attachment for Raman'),
    ).toBeDisabled()
    expect(
      await screen.findByRole('button', { name: 'Delete evidence.csv' }),
    ).toBeDisabled()
  })
})
