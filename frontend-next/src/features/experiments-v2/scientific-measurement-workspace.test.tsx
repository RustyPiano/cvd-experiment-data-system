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

import { SimpleCharacterizationWorkspace } from './simple-characterization-workspace'

const api = vi.hoisted(() => ({
  createMeasurement: vi.fn(),
  listMeasurements: vi.fn(),
  listSamples: vi.fn(),
}))
const filesApi = vi.hoisted(() => ({
  deleteExperimentFile: vi.fn(),
  getExperimentFile: vi.fn(),
  uploadExperimentFile: vi.fn(),
}))

vi.mock('./api', () => api)
vi.mock('@/features/samples/api', () => filesApi)
vi.mock('./components/entity-reference-select', () => ({
  EntityReferenceSelect: ({
    onChange,
  }: {
    onChange: (
      id: string,
      entity: {
        latest_version: { version: number; data: Record<string, unknown> }
      },
    ) => void
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange('instrument-1', {
          latest_version: { version: 1, data: {} },
        })
      }
    >
      选择表征仪器
    </button>
  ),
}))

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SimpleCharacterizationWorkspace
        runId="run-1"
        token="token"
        readOnly={false}
      />
    </QueryClientProvider>,
  )
}

async function chooseSampleAndMethod(
  user: ReturnType<typeof userEvent.setup>,
  method: string,
) {
  const firstSection = screen
    .getByRole('heading', { name: '1. 选择样品与表征方法' })
    .closest('section')!
  const selectors = within(firstSection).getAllByRole('combobox')
  await user.click(selectors[0])
  await user.click(screen.getByRole('option', { name: /S01/ }))
  await user.click(selectors[1])
  await user.click(screen.getByRole('option', { name: method }))
}

async function fillSharedMeasurementInfo(
  user: ReturnType<typeof userEvent.setup>,
  withLocation = true,
) {
  await user.type(screen.getByLabelText('测量时间'), '2026-07-30T14:30')
  if (!withLocation) return
  const secondSection = screen
    .getByRole('heading', { name: '2. 仪器与测量信息' })
    .closest('section')!
  await user.click(within(secondSection).getByRole('combobox'))
  await user.click(screen.getByRole('option', { name: '中心' }))
}

describe('SimpleCharacterizationWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listSamples.mockResolvedValue({
      items: [
        {
          id: 'sample-1',
          sample_code: 'S01',
          actual_state: 'unknown',
          actual_material_summary: null,
        },
        {
          id: 'sample-2',
          sample_code: 'S02',
          actual_state: 'unknown',
          actual_material_summary: null,
        },
      ],
    })
    api.listMeasurements.mockResolvedValue({ items: [], total: 0 })
    api.createMeasurement.mockResolvedValue({ id: 'measurement-1' })
    filesApi.uploadExperimentFile.mockResolvedValue({ id: 'file-1' })
    filesApi.getExperimentFile.mockResolvedValue({
      id: 'file-1',
      characterization_record_id: null,
    })
  })

  it('does not auto-select a sample and hides technical result editors', async () => {
    renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())

    expect(screen.getByText('请选择样品')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存表征记录' })).toBeDisabled()
    expect(screen.queryByText('分析软件信息')).not.toBeInTheDocument()
    expect(screen.queryByText('添加材料结论')).not.toBeInTheDocument()
    expect(screen.queryByText('不确定度')).not.toBeInTheDocument()
  })

  it('shows only the minimum Raman condition and fixed Raman results', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, 'Raman')

    expect(screen.getByText('激光波长（nm）')).toBeInTheDocument()
    expect(screen.getByText('更多测量参数')).toBeInTheDocument()
    expect(screen.getByText('E₂g 峰位（cm⁻¹）')).toBeInTheDocument()
    expect(screen.getByText('A₁g 峰位（cm⁻¹）')).toBeInTheDocument()
    expect(screen.getByText('物相')).toBeInTheDocument()
    expect(screen.getByText('层数结论')).toBeInTheDocument()
  })

  it('saves a direct no-growth optical observation without a raw file', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, '光学显微镜')
    await fillSharedMeasurementInfo(user, false)

    const resultSection = screen
      .getByRole('heading', { name: '4. 填写关键结果' })
      .closest('section')!
    await user.click(within(resultSection).getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: '未观察到生长' }))

    const save = screen.getByRole('button', { name: '保存表征记录' })
    await waitFor(() => expect(save).toBeEnabled())
    await waitFor(() =>
      expect(
        screen.queryByRole('option', { name: '未观察到生长' }),
      ).not.toBeInTheDocument(),
    )
    fireEvent.click(save)

    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
    expect(api.createMeasurement).toHaveBeenCalledWith(
      expect.objectContaining({
        measurement: expect.objectContaining({
          sample_id: 'sample-1',
          method_profile: 'optical_microscopy',
          raw_file_ids: [],
        }),
        analyses: [],
        assertions: [
          expect.objectContaining({
            assertion_type: 'growth_presence',
            value: { state: 'absent' },
          }),
        ],
      }),
      'token',
    )
    expect(
      api.createMeasurement.mock.calls[0][0].measurement,
    ).not.toHaveProperty('sample_region')
  })

  it('requires a Raman raw file and cleans it up after a failed save', async () => {
    const user = userEvent.setup()
    api.createMeasurement.mockRejectedValue(new Error('save failed'))
    const { container } = renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, 'Raman')
    await fillSharedMeasurementInfo(user)
    await user.click(screen.getByRole('button', { name: '选择表征仪器' }))

    const laser = screen
      .getByText('激光波长（nm）')
      .parentElement!.querySelector('input')!
    await user.type(laser, '532')
    const fileInput = container.querySelector<HTMLInputElement>(
      '#characterization-raw-files',
    )!
    await user.upload(fileInput, new File(['raw'], 'raman.txt'))

    const save = screen.getByRole('button', { name: '保存表征记录' })
    expect(save).toBeEnabled()
    await user.click(save)

    await waitFor(() =>
      expect(filesApi.deleteExperimentFile).toHaveBeenCalledWith(
        'token',
        'file-1',
      ),
    )
  })
})
