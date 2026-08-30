import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import i18n from '@/shared/i18n'
import { MeasurementDetails } from './measurement-details'

const measurementApi = vi.hoisted(() => ({
  getMeasurement: vi.fn(),
  invalidateMeasurement: vi.fn(),
}))
const sampleApi = vi.hoisted(() => ({
  downloadExperimentFile: vi.fn(),
}))
const download = vi.hoisted(() => ({ triggerBlobDownload: vi.fn() }))

vi.mock('@/features/experiments-v2/api', () => measurementApi)
vi.mock('@/features/samples/api', () => sampleApi)
vi.mock('@/shared/lib/download', () => download)

const detail = {
  id: 'measurement-1',
  revision_number: 2,
  can_invalidate: true,
  method_profile: 'Raman',
  quality_flag: 'valid',
  performed_by_id: 'measurement-user-id',
  instrument_snapshot_json: {
    name_type_snapshot: 'Raman',
    instrument_code_snapshot: 'RAMAN-01',
    instrument_version: 3,
  },
  typed_conditions: { laser_wavelength_nm: 532, vendor_mode: 'raw-code' },
  sample_region: {
    geometry_type: 'selected_area',
    label: 'center',
    coordinate_system: 'sample_local',
    unknown_axis: 'raw-region',
  },
  properties: [
    {
      id: 'property-1',
      property_code: 'raman_e2g_peak_position',
      numeric_value: 384.2,
      text_value: null,
      structured_value: null,
      unit: 'cm⁻¹',
      analysis_run_id: null,
      statistic: null,
      uncertainty_value: null,
      uncertainty_type: null,
      sample_count: null,
      quality_flag: 'valid',
    },
  ],
  assertions: [
    {
      id: 'assertion-1',
      assertion_type: 'phase_identity',
      value: { phase: '2H' },
      analysis_run_id: null,
      confidence: null,
      validity: 'active',
    },
    {
      id: 'assertion-2',
      assertion_type: 'mystery_assertion',
      value: { mystery_key: 'mystery_value' },
      analysis_run_id: null,
      confidence: null,
      validity: 'active',
    },
  ],
  raw_files: [
    {
      id: 'file-1',
      original_name: 'spectrum.txt',
      sha256: 'abc123',
      content_type: 'text/plain',
      size_bytes: 1024,
      method: 'Raman',
      file_category: 'raw',
      deleted_at: null,
    },
  ],
  region_image_file: {
    id: 'region-file',
    original_name: 'region.png',
    sha256: 'region-sha',
    content_type: 'image/png',
    size_bytes: 4096,
    method: 'Raman',
    file_category: 'region_image',
    deleted_at: '2026-08-30T12:00:00Z',
  },
  analyses: [
    {
      id: 'analysis-1',
      performed_by_id: 'analysis-user-id',
      software_name: 'LabFit',
      software_version: '2.0',
      code_commit: 'abc987',
      parameters: {
        baseline_correction: 'polynomial',
        vendor_parameter: 7,
      },
      started_at: '2026-08-30T10:00:00Z',
      completed_at: '2026-08-30T10:05:00Z',
      input_file_ids: ['file-1'],
      output_file_ids: ['file-2'],
      input_files: [
        {
          id: 'file-1',
          original_name: 'spectrum.txt',
          sha256: 'abc123',
          content_type: 'text/plain',
          size_bytes: 1024,
          method: 'Raman',
          file_category: 'raw',
          deleted_at: null,
        },
      ],
      output_files: [
        {
          id: 'file-2',
          original_name: 'fitted.csv',
          sha256: 'def456',
          content_type: 'text/csv',
          size_bytes: 2048,
          method: 'Raman',
          file_category: 'processed',
          deleted_at: null,
        },
      ],
    },
  ],
  invalidation_reason: null,
  invalidated_by_id: null,
  invalidated_at: null,
}

function renderDetails() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MeasurementDetails measurementId="measurement-1" token="token" />
    </QueryClientProvider>,
  )
}

describe('MeasurementDetails', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('zh')
    measurementApi.getMeasurement.mockResolvedValue(detail)
    measurementApi.invalidateMeasurement.mockResolvedValue({
      ...detail,
      quality_flag: 'invalid',
      can_invalidate: false,
      invalidation_reason: 'wrong sample',
    })
    sampleApi.downloadExperimentFile.mockResolvedValue({
      blob: new Blob(['raw']),
      filename: 'spectrum.txt',
    })
  })

  it('shows scientific values, provenance, and downloadable raw files', async () => {
    const user = userEvent.setup()
    renderDetails()

    expect(await screen.findByText('384.2 cm⁻¹')).toBeInTheDocument()
    expect(screen.getByText('Raman · RAMAN-01 · v3')).toBeInTheDocument()
    expect(screen.getByText('测量执行人').parentElement).toHaveTextContent(
      'measurement-user-id',
    )
    expect(screen.getByText('分析执行人').parentElement).toHaveTextContent(
      'analysis-user-id',
    )
    expect(screen.getAllByText(/SHA-256 abc123/)).not.toHaveLength(0)
    expect(screen.getByText(/532 nm/)).toBeInTheDocument()
    expect(screen.getByText('激光波长')).toBeInTheDocument()
    expect(screen.getByText('区域类型').parentElement).toHaveTextContent(
      '选定区域',
    )
    expect(screen.getByText(/raw-region/)).toBeInTheDocument()
    expect(screen.getByText(/物相判定/)).toBeInTheDocument()
    expect(screen.getByText(/mystery_assertion/)).toBeInTheDocument()
    expect(screen.getByText('基线校正')).toBeInTheDocument()
    expect(screen.getByText(/vendor_parameter/)).toBeInTheDocument()
    expect(await screen.findByText('fitted.csv')).toBeInTheDocument()
    expect(screen.getByText('region.png')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '下载 region.png' }),
    ).toBeDisabled()
    await user.click(
      screen.getAllByRole('button', { name: '下载 spectrum.txt' })[0],
    )
    await waitFor(() =>
      expect(sampleApi.downloadExperimentFile).toHaveBeenCalledWith(
        'token',
        'file-1',
      ),
    )
    await user.click(screen.getByRole('button', { name: '下载 fitted.csv' }))
    await waitFor(() =>
      expect(sampleApi.downloadExperimentFile).toHaveBeenCalledWith(
        'token',
        'file-2',
      ),
    )
  })

  it('shows analysis timing and result-level provenance metadata', async () => {
    measurementApi.getMeasurement.mockResolvedValue({
      ...detail,
      properties: [
        {
          ...detail.properties[0],
          analysis_run_id: 'analysis-1',
          statistic: 'mean',
          uncertainty_value: 0.4,
          uncertainty_type: 'standard_deviation',
          sample_count: 5,
        },
      ],
      assertions: [
        {
          ...detail.assertions[0],
          analysis_run_id: 'analysis-1',
          confidence: 0.92,
        },
      ],
    })
    renderDetails()

    expect(await screen.findByText('统计量：mean')).toBeInTheDocument()
    expect(
      screen.getByText('不确定度：0.4 cm⁻¹（standard_deviation）'),
    ).toBeInTheDocument()
    expect(screen.getByText('样本数：5')).toBeInTheDocument()
    expect(screen.getByText('置信度：0.92')).toBeInTheDocument()
    expect(
      screen.getAllByText('分析运行：LabFit 2.0 · analysis-1'),
    ).toHaveLength(2)
    expect(screen.getByText('分析开始时间').parentElement).toHaveTextContent(
      new Date(detail.analyses[0].started_at).toLocaleString('zh'),
    )
    expect(screen.getByText('分析完成时间').parentElement).toHaveTextContent(
      new Date(detail.analyses[0].completed_at).toLocaleString('zh'),
    )
  })

  it('uses the server permission flag and submits an append-only invalidation', async () => {
    const user = userEvent.setup()
    renderDetails()

    await user.click(
      await screen.findByRole('button', { name: '标记此记录失效' }),
    )
    await user.type(screen.getByLabelText('失效原因'), 'wrong sample')
    await user.click(screen.getByRole('button', { name: '确认失效' }))

    await waitFor(() =>
      expect(measurementApi.invalidateMeasurement).toHaveBeenCalledWith(
        'measurement-1',
        'wrong sample',
        'token',
      ),
    )
  })

  it('does not offer invalidation without server authorization', async () => {
    measurementApi.getMeasurement.mockResolvedValue({
      ...detail,
      can_invalidate: false,
    })
    renderDetails()

    expect(await screen.findByText('384.2 cm⁻¹')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '标记此记录失效' })).toBeNull()
  })

  it('shows invalidation actor and timestamp in English', async () => {
    const invalidatedAt = '2026-08-30T12:30:00Z'
    await i18n.changeLanguage('en')
    measurementApi.getMeasurement.mockResolvedValue({
      ...detail,
      quality_flag: 'invalid',
      can_invalidate: false,
      invalidation_reason: 'duplicate measurement',
      invalidated_by_id: 'invalidator-user-id',
      invalidated_at: invalidatedAt,
    })
    renderDetails()

    expect(await screen.findByText('Measurement performed by')).toBeVisible()
    expect(screen.getByText('Invalidated by').parentElement).toHaveTextContent(
      'invalidator-user-id',
    )
    expect(screen.getByText('Invalidated at').parentElement).toHaveTextContent(
      new Date(invalidatedAt).toLocaleString('en'),
    )
    expect(
      screen.getByText('Analysis performed by').parentElement,
    ).toHaveTextContent('analysis-user-id')
  })

  it('labels below-detection-limit properties and disables deleted raw files', async () => {
    measurementApi.getMeasurement.mockResolvedValue({
      ...detail,
      properties: [
        {
          ...detail.properties[0],
          numeric_value: 0,
          quality_flag: 'below_detection_limit',
        },
      ],
      raw_files: [
        {
          id: 'deleted-file',
          original_name: 'deleted.txt',
          sha256: 'deleted-sha',
          content_type: 'text/plain',
          size_bytes: 12,
          method: 'Raman',
          file_category: 'raw',
          deleted_at: '2026-08-30T12:00:00Z',
        },
      ],
    })
    renderDetails()

    expect(await screen.findByText('记录阈值：0 cm⁻¹')).toBeInTheDocument()
    expect(screen.getAllByText('低于检出限')).not.toHaveLength(0)
    expect(screen.getAllByText('已删除')).not.toHaveLength(0)
    expect(
      screen.getByRole('button', { name: '下载 deleted.txt' }),
    ).toBeDisabled()
  })
})
