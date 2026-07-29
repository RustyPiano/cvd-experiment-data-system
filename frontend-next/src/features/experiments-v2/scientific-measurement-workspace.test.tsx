import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ScientificMeasurementWorkspace } from './scientific-experiment-form'

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
  EntityReferenceSelect: () => <div>Instrument selector</div>,
}))

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ScientificMeasurementWorkspace
        runId="run-1"
        token="token"
        readOnly={false}
      />
    </QueryClientProvider>,
  )
}

async function fillOpticalRequiredFields(
  user: ReturnType<typeof userEvent.setup>,
) {
  const firstSection = screen
    .getByRole('heading', { name: '1. 选择样品与表征方法' })
    .closest('section')
  expect(firstSection).not.toBeNull()
  const selectors = within(firstSection!).getAllByRole('combobox')
  await user.click(selectors[0])
  await user.click(screen.getByRole('option', { name: /S01/ }))
  await user.click(selectors[1])
  await user.click(screen.getByRole('option', { name: '光学显微镜' }))

  const conditionsSection = screen
    .getByRole('heading', { name: '2. 仪器与测量条件' })
    .closest('section')
  expect(conditionsSection).not.toBeNull()
  const conditionInputs = within(conditionsSection!).getAllByRole('textbox')
  await user.type(conditionInputs[0], '50x')
  await user.type(conditionInputs[1], 'bright field')
  await user.type(screen.getByPlaceholderText('例如样品中心'), '样品中心')
}

async function chooseGrowthConclusion(
  user: ReturnType<typeof userEvent.setup>,
) {
  const resultSection = screen
    .getByRole('heading', { name: '4. 填写结果与材料结论' })
    .closest('section')
  expect(resultSection).not.toBeNull()
  await user.click(within(resultSection!).getAllByRole('combobox')[0])
  await user.click(screen.getByRole('option', { name: '未观察到生长' }))
}

describe('ScientificMeasurementWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listSamples.mockResolvedValue({
      items: [
        {
          id: 'sample-1',
          sample_code: 'S01',
          actual_state: 'unknown',
        },
      ],
    })
    api.listMeasurements.mockResolvedValue({ items: [], total: 0 })
    filesApi.deleteExperimentFile.mockResolvedValue(undefined)
    filesApi.getExperimentFile.mockResolvedValue({
      id: 'file-1',
      characterization_record_id: null,
    })
  })

  it('requires an explicit sample choice when one run has multiple samples', async () => {
    api.listSamples.mockResolvedValue({
      items: [
        {
          id: 'sample-1',
          sample_code: 'S01',
          actual_state: 'unknown',
        },
        {
          id: 'sample-2',
          sample_code: 'S02',
          actual_state: 'unknown',
        },
      ],
    })
    api.listMeasurements.mockResolvedValue({ items: [], total: 0 })

    renderWorkspace()

    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    expect(screen.getByText('选择样品')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存表征记录' })).toBeDisabled()
  })

  it('provides repeatable Raman result rows and requires an instrument', async () => {
    const user = userEvent.setup()

    renderWorkspace()
    const firstSection = screen
      .getByRole('heading', { name: '1. 选择样品与表征方法' })
      .closest('section')
    expect(firstSection).not.toBeNull()
    const selectors = within(firstSection!).getAllByRole('combobox')
    expect(selectors).toHaveLength(2)
    await user.click(selectors[1])
    await user.click(screen.getByRole('option', { name: '拉曼光谱' }))

    expect(screen.getAllByText('测量结果')).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: '添加结果' }))
    expect(screen.getAllByText('测量结果')).toHaveLength(4)
    expect(screen.getByText('Instrument selector')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存表征记录' })).toBeDisabled()
  })

  it('requires evidence but accepts a direct optical observation conclusion', async () => {
    const user = userEvent.setup()
    renderWorkspace()

    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await fillOpticalRequiredFields(user)

    const saveButton = screen.getByRole('button', { name: '保存表征记录' })
    expect(saveButton).toBeDisabled()

    await chooseGrowthConclusion(user)
    expect(saveButton).toBeEnabled()
  })

  it('cleans up uploaded files when measurement creation fails', async () => {
    const user = userEvent.setup()
    filesApi.uploadExperimentFile.mockResolvedValue({ id: 'file-1' })
    api.createMeasurement.mockRejectedValue(new Error('measurement failed'))
    const { container } = renderWorkspace()

    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await fillOpticalRequiredFields(user)
    await chooseGrowthConclusion(user)
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).not.toBeNull()
    await user.upload(fileInput!, new File(['raw'], 'image.tif'))
    await user.click(screen.getByRole('button', { name: '保存表征记录' }))

    await waitFor(() =>
      expect(filesApi.deleteExperimentFile).toHaveBeenCalledWith(
        'token',
        'file-1',
      ),
    )
    expect(api.createMeasurement).toHaveBeenCalledWith(
      expect.objectContaining({
        measurement: expect.objectContaining({ raw_file_ids: ['file-1'] }),
      }),
      'token',
    )
  })

  it('keeps files that were attached before an ambiguous response failure', async () => {
    const user = userEvent.setup()
    filesApi.uploadExperimentFile.mockResolvedValue({ id: 'file-1' })
    filesApi.getExperimentFile.mockResolvedValue({
      id: 'file-1',
      characterization_record_id: 'measurement-1',
    })
    api.createMeasurement.mockRejectedValue(new Error('response lost'))
    const { container } = renderWorkspace()

    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await fillOpticalRequiredFields(user)
    await chooseGrowthConclusion(user)
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).not.toBeNull()
    await user.upload(fileInput!, new File(['raw'], 'image.tif'))
    await user.click(screen.getByRole('button', { name: '保存表征记录' }))

    await waitFor(() =>
      expect(filesApi.getExperimentFile).toHaveBeenCalledWith(
        'token',
        'file-1',
      ),
    )
    expect(filesApi.deleteExperimentFile).not.toHaveBeenCalled()
  })

  it('cleans up earlier uploads when a later upload fails', async () => {
    const user = userEvent.setup()
    filesApi.uploadExperimentFile
      .mockResolvedValueOnce({ id: 'file-1' })
      .mockRejectedValueOnce(new Error('upload failed'))
    const { container } = renderWorkspace()

    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await fillOpticalRequiredFields(user)
    await chooseGrowthConclusion(user)
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).not.toBeNull()
    await user.upload(fileInput!, [
      new File(['one'], 'one.tif'),
      new File(['two'], 'two.tif'),
    ])
    await user.click(screen.getByRole('button', { name: '保存表征记录' }))

    await waitFor(() =>
      expect(filesApi.deleteExperimentFile).toHaveBeenCalledWith(
        'token',
        'file-1',
      ),
    )
    expect(filesApi.uploadExperimentFile).toHaveBeenCalledTimes(2)
    expect(api.createMeasurement).not.toHaveBeenCalled()
  })
})
