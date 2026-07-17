import type { ComponentType } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { HttpError } from '@/shared/api/http-error'
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
  updateCharacterizationRecord: vi.fn(),
  updateMeasuredProduct: vi.fn(),
}))
const filesApi = vi.hoisted(() => ({
  deleteExperimentFile: vi.fn(),
  downloadExperimentFile: vi.fn(),
  listExperimentFiles: vi.fn(),
  uploadExperimentFile: vi.fn(),
}))
const download = vi.hoisted(() => ({ triggerBlobDownload: vi.fn() }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

vi.mock('../api', () => resultsApi)
vi.mock('@/features/samples/api', () => filesApi)
vi.mock('@/shared/lib/download', () => download)
vi.mock('sonner', () => ({ toast }))
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
const product = {
  id: 'product-1',
  sample_id: sample.id,
  characterization_record_id: record.id,
  observed_phenomena: ['不连续覆盖'],
  detected_phase_stacking: '2H-MoS2',
  measured_layers_coverage: '1 layer',
  domain_nucleation_continuity: 'small domains',
  key_spectral_metrics: { note: 'E2g 384 cm-1' },
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
  resultsApi.createSample.mockResolvedValue(sample)
  resultsApi.createCharacterizationRecord.mockResolvedValue(record)
  resultsApi.updateCharacterizationRecord.mockResolvedValue(record)
  resultsApi.createMeasuredProduct.mockResolvedValue(product)
  resultsApi.updateMeasuredProduct.mockResolvedValue(product)
  resultsApi.deleteCharacterizationRecord.mockResolvedValue(undefined)
  resultsApi.deleteMeasuredProduct.mockResolvedValue(undefined)
})

describe('results behavior', () => {
  it('creates a selected sample role and refreshes the rendered sample list', async () => {
    const created = {
      ...sample,
      id: 'sample-2',
      sample_code: 'RUN-F5-S1',
      role: 'bottom',
    }
    resultsApi.listSamples
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValue({ items: [created], total: 1 })
    resultsApi.createSample.mockResolvedValue(created)
    const user = userEvent.setup()
    renderResults()

    await user.click(await screen.findByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'Bottom' }))
    await user.click(screen.getByRole('button', { name: 'Add sample' }))

    expect(resultsApi.createSample).toHaveBeenCalledWith(
      'run-1',
      { role: 'bottom' },
      'token',
    )
    expect(await screen.findAllByText('RUN-F5-S1 · bottom')).not.toHaveLength(0)
    expect(resultsApi.listSamples).toHaveBeenCalledTimes(2)
  })

  it('creates characterization metadata from generated field options and refreshes', async () => {
    resultsApi.listCharacterizationRecords.mockResolvedValue({
      items: [],
      total: 0,
    })
    const user = userEvent.setup()
    renderResults()
    const section = (
      await screen.findByRole('heading', {
        name: 'Characterization records',
      })
    ).parentElement!
    const controls = within(section)

    await user.click(controls.getAllByRole('combobox')[1])
    await user.click(screen.getByRole('option', { name: 'Raman' }))
    await user.type(controls.getByRole('textbox'), '532 nm')
    await user.click(
      controls.getByRole('button', { name: 'Add characterization record' }),
    )

    expect(resultsApi.createCharacterizationRecord).toHaveBeenCalledWith(
      'run-1',
      {
        sample_id: 'sample-1',
        instrument_id: null,
        instrument_version: null,
        method_instrument: 'Raman',
        test_conditions: '532 nm',
      },
      'token',
    )
    await waitFor(() =>
      expect(
        resultsApi.listCharacterizationRecords.mock.calls.length,
      ).toBeGreaterThan(1),
    )
  })

  it('edits a characterization record', async () => {
    const user = userEvent.setup()
    renderResults()

    await user.click(await screen.findByRole('button', { name: 'Edit Raman' }))
    const section = screen.getByRole('heading', {
      name: 'Characterization records',
    }).parentElement!
    const input = within(section).getByRole('textbox')
    await user.clear(input)
    await user.type(input, '633 nm')
    await user.click(within(section).getByRole('button', { name: 'Save' }))

    expect(resultsApi.updateCharacterizationRecord).toHaveBeenCalledWith(
      'record-1',
      { method_instrument: 'Raman', test_conditions: '633 nm' },
      'token',
    )
  })

  it('confirms characterization deletion before calling the api', async () => {
    const user = userEvent.setup()
    renderResults()

    await user.click(
      await screen.findByRole('button', { name: 'Delete Raman' }),
    )
    expect(resultsApi.deleteCharacterizationRecord).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Delete characterization record' }),
    )

    await waitFor(() =>
      expect(resultsApi.deleteCharacterizationRecord).toHaveBeenCalledWith(
        'record-1',
        'token',
      ),
    )
  })

  it('creates a measured product linked to a characterization record', async () => {
    const user = userEvent.setup()
    renderResults()
    const section = (
      await screen.findByRole('heading', { name: 'Measured products' })
    ).parentElement!
    const controls = within(section)

    await user.click(
      controls.getByRole('combobox', {
        name: 'Linked characterization record',
      }),
    )
    await user.click(screen.getByRole('option', { name: 'Raman' }))
    await user.click(controls.getAllByRole('checkbox')[0])
    await user.type(controls.getAllByRole('textbox')[0], '2H-MoS2')
    await user.click(
      controls.getByRole('button', { name: 'Add measured product' }),
    )

    expect(resultsApi.createMeasuredProduct).toHaveBeenCalledWith(
      'sample-1',
      expect.objectContaining({
        characterization_record_id: 'record-1',
        detected_phase_stacking: '2H-MoS2',
        observed_phenomena: [expect.any(String)],
      }),
      'token',
    )
  })

  it('edits and deletes a measured product', async () => {
    resultsApi.listMeasuredProducts.mockResolvedValue({
      items: [product],
      total: 1,
    })
    const user = userEvent.setup()
    renderResults()

    await user.click(
      await screen.findByRole('button', { name: 'Edit measured product' }),
    )
    const section = screen.getByRole('heading', {
      name: 'Measured products',
    }).parentElement!
    const phase = within(section).getAllByRole('textbox')[0]
    await user.clear(phase)
    await user.type(phase, '3R-MoS2')
    await user.click(within(section).getByRole('button', { name: 'Save' }))
    expect(resultsApi.updateMeasuredProduct).toHaveBeenCalledWith(
      'product-1',
      expect.objectContaining({ detected_phase_stacking: '3R-MoS2' }),
      'token',
    )

    await user.click(
      screen.getByRole('button', { name: 'Delete measured product' }),
    )
    expect(resultsApi.deleteMeasuredProduct).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Confirm delete measured product' }),
    )
    await waitFor(() =>
      expect(resultsApi.deleteMeasuredProduct).toHaveBeenCalledWith(
        'product-1',
        'token',
      ),
    )
  })

  it('keeps downloads enabled while read-only and disables result creation', async () => {
    renderResults(true)

    expect(
      (await screen.findAllByRole('combobox', { name: 'Sample' }))[0],
    ).toBeEnabled()
    expect(
      await screen.findByRole('button', { name: 'Download evidence.csv' }),
    ).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Add sample' })).toBeDisabled()
  })

  it('shows a sample load error instead of the no-samples empty state', async () => {
    resultsApi.listSamples.mockRejectedValueOnce(new Error('network down'))
    renderResults()

    expect(
      await screen.findByText('Failed to load samples'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/no samples yet/i)).not.toBeInTheDocument()
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

  it('shows an upload failure detail from the api', async () => {
    filesApi.uploadExperimentFile.mockRejectedValue(
      new HttpError(422, 'Spectrum format is not supported', {}),
    )
    renderResults()
    const input = await screen.findByLabelText('Upload attachment for Raman')

    fireEvent.change(input, {
      target: { files: [new File(['bad'], 'bad.exe')] },
    })

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The input is invalid. Check it and try again.',
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

  it('keeps every result write enabled when locked-style editable and disables them when invalid', async () => {
    resultsApi.listMeasuredProducts.mockResolvedValue({
      items: [product],
      total: 1,
    })
    const { unmount } = renderResults(false)
    expect(
      await screen.findByLabelText('Upload attachment for Raman'),
    ).toBeEnabled()
    expect(
      await screen.findByRole('button', { name: 'Add sample' }),
    ).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'Add characterization record' }),
    ).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'Add measured product' }),
    ).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Edit Raman' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Delete Raman' })).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'Edit measured product' }),
    ).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'Delete measured product' }),
    ).toBeEnabled()
    unmount()

    renderResults(true)
    expect(
      await screen.findByLabelText('Upload attachment for Raman'),
    ).toBeDisabled()
    expect(
      await screen.findByRole('button', { name: 'Delete evidence.csv' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add sample' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Add characterization record' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Add measured product' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit Raman' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete Raman' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Edit measured product' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Delete measured product' }),
    ).toBeDisabled()
  })
})
