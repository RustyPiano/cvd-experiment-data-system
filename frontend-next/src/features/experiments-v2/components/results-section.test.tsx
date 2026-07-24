import type { ComponentType } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { ResultsSection } from './results-section'

const resultsApi = vi.hoisted(() => ({
  createResult: vi.fn(),
  createSample: vi.fn(),
  deleteResult: vi.fn(),
  listResults: vi.fn(),
  listSamples: vi.fn(),
  updateResult: vi.fn(),
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
  sample_code: 'RUN-S01',
  role: 'growth',
}
const directResult = {
  id: 'result-direct',
  sample_id: sample.id,
  kind: 'direct_observation',
  characterization_record_id: null,
  instrument_id: null,
  instrument_version: null,
  method_instrument: null,
  test_conditions: null,
  observed_phenomena: ['不连续覆盖'],
  detected_phase_stacking: null,
  layer_count: null,
  coverage_percent: null,
  domain_size_um: null,
  nucleation_density_cm2: null,
  measured_layers_coverage: null,
  domain_nucleation_continuity: null,
  key_spectral_metrics: null,
}
const characterizationResult = {
  ...directResult,
  id: 'result-characterization',
  kind: 'characterization',
  characterization_record_id: 'record-1',
  method_instrument: 'Raman',
  test_conditions: '532 nm',
  detected_phase_stacking: '2H-MoS2',
  layer_count: 2,
  coverage_percent: 87.5,
  domain_size_um: 12.4,
  nucleation_density_cm2: 1.2e6,
  key_spectral_metrics: [
    { metric_code: 'raman_e2g', value: 384, unit: 'cm⁻¹' },
  ],
}
const attachment = {
  id: 'file-1',
  original_name: 'evidence.csv',
  size_bytes: 1536,
}

function renderResults(readOnly = false, onDirtyChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Component = ResultsSection as ComponentType<{
    runId: string
    readOnly: boolean
    onDirtyChange?: (dirty: boolean) => void
  }>
  return {
    queryClient,
    ...render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <Component
            runId="run-1"
            readOnly={readOnly}
            onDirtyChange={onDirtyChange}
          />
        </QueryClientProvider>
      </I18nextProvider>,
    ),
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
  resultsApi.listSamples.mockResolvedValue({ items: [sample], total: 1 })
  resultsApi.listResults.mockResolvedValue({ items: [], total: 0 })
  resultsApi.createSample.mockResolvedValue(sample)
  resultsApi.createResult.mockResolvedValue(directResult)
  resultsApi.updateResult.mockResolvedValue(directResult)
  resultsApi.deleteResult.mockResolvedValue(undefined)
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

describe('unified sample results', () => {
  it('creates a direct observation through one result endpoint', async () => {
    const user = userEvent.setup()
    renderResults()

    await user.click((await screen.findAllByRole('checkbox'))[0])
    await user.click(screen.getByRole('button', { name: 'Add result' }))

    expect(resultsApi.createResult).toHaveBeenCalledWith(
      'sample-1',
      expect.objectContaining({
        kind: 'direct_observation',
        observed_phenomena: [expect.any(String)],
        method_instrument: null,
      }),
      'token',
    )
  })

  it('reports an unsaved draft and clears it only after a successful save', async () => {
    const onDirtyChange = vi.fn()
    const user = userEvent.setup()
    renderResults(false, onDirtyChange)

    await user.click((await screen.findAllByRole('checkbox'))[0])
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))
    await user.click(screen.getByRole('button', { name: 'Add result' }))
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
  })

  it('does not switch to another result when the user keeps an unsaved draft', async () => {
    resultsApi.listResults.mockResolvedValue({
      items: [
        characterizationResult,
        {
          ...directResult,
          id: 'result-second',
          observed_phenomena: ['wrinkles'],
        },
      ],
      total: 2,
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    renderResults()

    const editButtons = await screen.findAllByRole('button', {
      name: 'Edit result',
    })
    await user.click(editButtons[0])
    fireEvent.change(document.querySelector('#result-phase')!, {
      target: { value: 'draft must survive' },
    })
    await user.click(editButtons[1])

    expect(confirm).toHaveBeenCalled()
    expect(document.querySelector('#result-phase')).toHaveValue(
      'draft must survive',
    )
    confirm.mockRestore()
  })

  it('creates a characterization result with method and measured fields together', async () => {
    resultsApi.createResult.mockResolvedValueOnce(characterizationResult)
    const user = userEvent.setup()
    renderResults()

    await screen.findByText('Record type')
    await user.click(document.querySelector('#result-kind')!)
    await user.click(
      screen.getByRole('option', { name: 'Characterization result' }),
    )
    await user.click(document.querySelector('#result-method')!)
    await user.click(screen.getByRole('option', { name: 'Raman' }))
    fireEvent.change(document.querySelector('#result-conditions')!, {
      target: { value: '532 nm' },
    })
    fireEvent.change(document.querySelector('#result-phase')!, {
      target: { value: '2H-MoS2' },
    })
    fireEvent.change(document.querySelector('#result-layer-count')!, {
      target: { value: '2' },
    })
    fireEvent.change(document.querySelector('#result-coverage-percent')!, {
      target: { value: '87.5' },
    })
    fireEvent.change(document.querySelector('#result-domain-size')!, {
      target: { value: '12.4' },
    })
    fireEvent.change(document.querySelector('#result-nucleation-density')!, {
      target: { value: '1200000' },
    })
    await user.click(
      screen.getByRole('button', { name: 'Add spectral metric' }),
    )
    fireEvent.change(document.querySelector('#result-spectral-code-0')!, {
      target: { value: 'raman_e2g' },
    })
    fireEvent.change(document.querySelector('#result-spectral-value-0')!, {
      target: { value: '384' },
    })
    fireEvent.change(document.querySelector('#result-spectral-unit-0')!, {
      target: { value: 'cm⁻¹' },
    })
    const attachmentFile = new File(['spectrum'], 'raman.csv', {
      type: 'text/csv',
    })
    fireEvent.change(screen.getByLabelText('Attachments (optional)'), {
      target: { files: [attachmentFile] },
    })
    await user.click(screen.getByRole('button', { name: 'Add result' }))

    expect(resultsApi.createResult).toHaveBeenCalledWith(
      'sample-1',
      expect.objectContaining({
        kind: 'characterization',
        method_instrument: 'Raman',
        test_conditions: '532 nm',
        detected_phase_stacking: '2H-MoS2',
        layer_count: 2,
        coverage_percent: 87.5,
        domain_size_um: 12.4,
        nucleation_density_cm2: 1200000,
        key_spectral_metrics: [
          { metric_code: 'raman_e2g', value: 384, unit: 'cm⁻¹' },
        ],
      }),
      'token',
    )
    await waitFor(() =>
      expect(filesApi.uploadExperimentFile).toHaveBeenCalledWith(
        'token',
        'run-1',
        {
          file: attachmentFile,
          method: 'Raman',
          characterizationRecordId: 'record-1',
        },
      ),
    )
  })

  it('rejects a zero domain size before submission', async () => {
    const user = userEvent.setup()
    renderResults()

    await screen.findByText('Record type')
    await user.click(document.querySelector('#result-kind')!)
    await user.click(
      screen.getByRole('option', { name: 'Characterization result' }),
    )
    await user.click(document.querySelector('#result-method')!)
    await user.click(screen.getByRole('option', { name: 'Raman' }))
    fireEvent.change(document.querySelector('#result-domain-size')!, {
      target: { value: '0' },
    })

    expect(screen.getByRole('button', { name: 'Add result' })).toBeDisabled()
    expect(document.querySelector('#result-domain-size')).toHaveAttribute(
      'aria-invalid',
      'true',
    )

    fireEvent.change(document.querySelector('#result-domain-size')!, {
      target: { value: '0.1' },
    })
    await user.click(screen.getByRole('button', { name: 'Add result' }))

    expect(resultsApi.createResult).toHaveBeenCalledWith(
      'sample-1',
      expect.objectContaining({ domain_size_um: 0.1 }),
      'token',
    )
  })

  it('localizes result units in the English form and summary', async () => {
    resultsApi.listResults.mockResolvedValue({
      items: [characterizationResult],
      total: 1,
    })
    const user = userEvent.setup()
    renderResults()

    expect(await screen.findByText('2 layers')).toBeInTheDocument()
    expect(screen.queryByText('2 层')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit result' }))
    expect(screen.getByText('(layers)')).toBeInTheDocument()
    expect(screen.queryByText('（层）')).not.toBeInTheDocument()
  })

  it('keeps the saved result and explains how to retry a failed initial attachment', async () => {
    resultsApi.createResult.mockResolvedValueOnce(characterizationResult)
    filesApi.uploadExperimentFile.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    renderResults()

    await screen.findByText('Record type')
    await user.click(document.querySelector('#result-kind')!)
    await user.click(
      screen.getByRole('option', { name: 'Characterization result' }),
    )
    await user.click(document.querySelector('#result-method')!)
    await user.click(screen.getByRole('option', { name: 'Raman' }))
    fireEvent.change(screen.getByLabelText('Attachments (optional)'), {
      target: {
        files: [new File(['spectrum'], 'raman.csv', { type: 'text/csv' })],
      },
    })
    await user.click(screen.getByRole('button', { name: 'Add result' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The result was saved, but some attachments failed to upload. Upload them again from the result card.',
      ),
    )
    expect(resultsApi.createResult).toHaveBeenCalledTimes(1)
  })

  it('edits and confirms deletion through the unified endpoint', async () => {
    resultsApi.listResults.mockResolvedValue({
      items: [directResult],
      total: 1,
    })
    const user = userEvent.setup()
    renderResults()

    await user.click(await screen.findByRole('button', { name: 'Edit result' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(resultsApi.updateResult).toHaveBeenCalledWith(
      'result-direct',
      expect.objectContaining({ kind: 'direct_observation' }),
      'token',
    )

    await user.click(screen.getByRole('button', { name: 'Delete result' }))
    expect(resultsApi.deleteResult).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Delete result', hidden: false }),
    )
    await waitFor(() =>
      expect(resultsApi.deleteResult).toHaveBeenCalledWith(
        'result-direct',
        'token',
      ),
    )
  })

  it('edits characterization metadata and measurements together', async () => {
    resultsApi.listResults.mockResolvedValue({
      items: [characterizationResult],
      total: 1,
    })
    const user = userEvent.setup()
    renderResults()

    await user.click(await screen.findByRole('button', { name: 'Edit result' }))
    expect(document.querySelector('#result-conditions')).toHaveValue('532 nm')
    expect(document.querySelector('#result-phase')).toHaveValue('2H-MoS2')
    fireEvent.change(document.querySelector('#result-phase')!, {
      target: { value: '3R-MoS2' },
    })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(resultsApi.updateResult).toHaveBeenCalledWith(
      'result-characterization',
      expect.objectContaining({
        kind: 'characterization',
        method_instrument: 'Raman',
        detected_phase_stacking: '3R-MoS2',
      }),
      'token',
    )
  })

  it('canonicalizes legacy result options before edit and resave', async () => {
    resultsApi.listResults.mockResolvedValue({
      items: [
        {
          ...characterizationResult,
          method_instrument: '光镜',
          observed_phenomena: ['厚层区域'],
        },
      ],
      total: 1,
    })
    const user = userEvent.setup()
    renderResults()

    await user.click(await screen.findByRole('button', { name: 'Edit result' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(resultsApi.updateResult).toHaveBeenCalledWith(
      'result-characterization',
      expect.objectContaining({
        method_instrument: 'optical_microscopy',
        observed_phenomena: ['thick_layer_regions'],
      }),
      'token',
    )
  })

  it('creates derived samples from the active sample', async () => {
    const user = userEvent.setup()
    renderResults()

    await user.click(
      await screen.findByRole('button', { name: 'Add special sample' }),
    )

    expect(resultsApi.createSample).toHaveBeenCalledWith(
      'run-1',
      { role: 'derived', parent_sample_id: 'sample-1' },
      'token',
    )
  })

  it('creates control samples without a parent', async () => {
    const user = userEvent.setup()
    renderResults()

    await user.click(await screen.findByLabelText('Sample type'))
    await user.click(screen.getByRole('option', { name: 'Control sample' }))
    await user.click(screen.getByRole('button', { name: 'Add special sample' }))

    expect(resultsApi.createSample).toHaveBeenCalledWith(
      'run-1',
      { role: 'control', parent_sample_id: null },
      'token',
    )
  })

  it('shows sample query failures instead of a misleading empty state', async () => {
    resultsApi.listSamples.mockRejectedValueOnce(new Error('network down'))
    renderResults()

    expect(
      await screen.findByText('Failed to load samples'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/no samples yet/i)).not.toBeInTheDocument()
  })
})

describe('characterization result attachments', () => {
  beforeEach(() => {
    resultsApi.listResults.mockResolvedValue({
      items: [characterizationResult],
      total: 1,
    })
  })

  it('downloads and uploads files from the characterization result card', async () => {
    const user = userEvent.setup()
    renderResults()

    expect(await screen.findByText('evidence.csv')).toBeInTheDocument()
    expect(screen.getByText('1.5 KiB')).toBeInTheDocument()
    expect(screen.getByText('Phase and stacking')).toBeInTheDocument()
    expect(screen.getByText('2H-MoS2')).toBeInTheDocument()
    expect(screen.getByText('raman_e2g: 384 cm⁻¹')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Download' }))
    expect(filesApi.downloadExperimentFile).toHaveBeenCalledWith(
      'token',
      'file-1',
    )
    expect(download.triggerBlobDownload).toHaveBeenCalledWith(
      expect.any(Blob),
      'evidence.csv',
    )

    const input = screen.getByLabelText('Upload attachment for Raman')
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

  it('localizes a canonical method in the attachment control', async () => {
    resultsApi.listResults.mockResolvedValueOnce({
      items: [{ ...characterizationResult, method_instrument: '光镜' }],
      total: 1,
    })
    renderResults()

    expect(
      await screen.findByLabelText('Upload attachment for Optical microscopy'),
    ).toBeInTheDocument()
  })

  it('confirms before soft-deleting an attachment', async () => {
    const user = userEvent.setup()
    renderResults()

    await user.click(
      await screen.findByRole('button', { name: 'Delete evidence.csv' }),
    )
    expect(filesApi.deleteExperimentFile).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Delete attachment', hidden: false }),
    )
    await waitFor(() =>
      expect(filesApi.deleteExperimentFile).toHaveBeenCalledWith(
        'token',
        'file-1',
      ),
    )
  })

  it('keeps downloads available but disables all writes when read-only', async () => {
    renderResults(true)

    expect(
      await screen.findByRole('button', { name: 'Download' }),
    ).toBeEnabled()
    expect(screen.getByLabelText('Upload attachment for Raman')).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Add special sample' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add result' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit result' })).toBeDisabled()
  })
})
