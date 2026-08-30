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

import i18n from '@/shared/i18n'
import { HttpError } from '@/shared/api/http-error'
import { characterizationProfiles } from '@/shared/generated/field-metadata'
import {
  characterizationConditionIssue,
  characterizationResultIssue,
  instrumentSupportsMethod,
  METHOD_ORDER,
  SimpleCharacterizationWorkspace,
} from './simple-characterization-workspace'

const api = vi.hoisted(() => ({
  createMeasurement: vi.fn(),
  getRun: vi.fn(),
  listAllMeasurements: vi.fn(),
  listSamples: vi.fn(),
}))
const filesApi = vi.hoisted(() => ({
  deleteExperimentFile: vi.fn(),
  getExperimentFile: vi.fn(),
  uploadExperimentFile: vi.fn(),
}))
const entityApi = vi.hoisted(() => ({ listEntityVersions: vi.fn() }))
const notifications = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('./api', () => api)
vi.mock('@/features/samples/api', () => filesApi)
vi.mock('@/features/entity-library/api', () => entityApi)
vi.mock('sonner', () => ({ toast: notifications }))
vi.mock('@/shared/ui/route-leave-guard', () => ({
  RouteLeaveGuard: ({ when, message }: { when: boolean; message: string }) => (
    <span
      data-testid="route-leave-guard"
      data-active={String(when)}
      data-message={message}
    />
  ),
}))
vi.mock('@/features/characterizations/measurement-details', () => ({
  MeasurementDetails: ({
    measurementId,
    allowInvalidate,
  }: {
    measurementId: string
    allowInvalidate?: boolean
  }) => (
    <div>
      Details {measurementId}
      {allowInvalidate ? (
        <button type="button">Invalidate record</button>
      ) : null}
    </div>
  ),
}))
vi.mock('./components/entity-reference-select', () => ({
  EntityReferenceSelect: ({
    onChange,
    value,
    clearable,
  }: {
    value: string
    clearable?: boolean
    onChange: (
      id: string,
      entity: {
        latest_version: { version: number; data: Record<string, unknown> }
      } | null,
    ) => void
  }) => (
    <>
      <button
        type="button"
        onClick={() =>
          onChange('instrument-1', {
            latest_version: {
              version: 3,
              data: {
                name_type: 'Raman',
                capabilities: [
                  'optical_microscopy',
                  'Raman',
                  'AFM',
                  'SEM',
                  'TEM',
                ].map((code) => ({ code, configuration: {} })),
              },
            },
          })
        }
      >
        选择表征仪器
      </button>
      {clearable && value ? (
        <button type="button" onClick={() => onChange('', null)}>
          清除表征仪器
        </button>
      ) : null}
    </>
  ),
}))

function renderWorkspace(readOnly = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SimpleCharacterizationWorkspace
        runId="run-1"
        token="token"
        readOnly={readOnly}
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
) {
  await user.type(screen.getByLabelText(/^测量时间/), '2026-07-30T14:30')
}

async function chooseInstrument(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '选择表征仪器' }))
  await waitFor(() =>
    expect(screen.getByLabelText(/^仪器版本/)).toHaveTextContent('v3'),
  )
}

async function fillRequiredCondition(
  user: ReturnType<typeof userEvent.setup>,
  method: 'Raman' | 'AFM' | 'SEM' | 'TEM',
) {
  if (method === 'Raman') {
    await user.type(screen.getByLabelText(/^激光波长/), '532')
    return
  }
  if (method === 'AFM') {
    await user.type(screen.getByLabelText('扫描尺寸 X'), '10')
    await user.type(screen.getByLabelText('扫描尺寸 Y'), '12')
    return
  }
  await user.type(screen.getByLabelText(/^加速电压/), '80')
}

describe('SimpleCharacterizationWorkspace', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('zh')
    api.listSamples.mockResolvedValue({
      items: [
        {
          id: 'sample-1',
          experiment_run_id: 'run-1',
          run_revision_id: 'revision-current',
          role: 'growth',
          lifecycle_state: 'active',
          sample_code: 'S01',
          actual_state: 'unknown',
          actual_material_summary: null,
        },
        {
          id: 'sample-2',
          experiment_run_id: 'run-1',
          run_revision_id: null,
          role: 'control',
          lifecycle_state: 'active',
          sample_code: 'S02',
          actual_state: 'unknown',
          actual_material_summary: null,
        },
      ],
    })
    api.getRun.mockResolvedValue({
      id: 'run-1',
      current_revision_id: 'revision-current',
    })
    api.listAllMeasurements.mockResolvedValue({
      items: [],
      total: 0,
      next_cursor: null,
    })
    api.createMeasurement.mockResolvedValue({ id: 'measurement-1' })
    filesApi.uploadExperimentFile.mockResolvedValue({ id: 'file-1' })
    filesApi.getExperimentFile.mockResolvedValue({
      id: 'file-1',
      characterization_record_id: null,
    })
    entityApi.listEntityVersions.mockResolvedValue({
      items: [
        {
          id: 'instrument-version-3',
          entity_id: 'instrument-1',
          version: 3,
          data: {
            name_type: 'Raman',
            capabilities: [
              'optical_microscopy',
              'Raman',
              'AFM',
              'SEM',
              'TEM',
            ].map((code) => ({ code, configuration: {} })),
          },
          created_at: '2026-07-30T00:00:00Z',
        },
        {
          id: 'instrument-version-2',
          entity_id: 'instrument-1',
          version: 2,
          data: {
            name_type: 'Raman',
            capabilities: [
              'optical_microscopy',
              'Raman',
              'AFM',
              'SEM',
              'TEM',
            ].map((code) => ({ code, configuration: {} })),
          },
          created_at: '2026-06-30T00:00:00Z',
        },
        {
          id: 'instrument-version-1',
          entity_id: 'instrument-1',
          version: 1,
          data: {
            name_type: 'SEM',
            capabilities: [{ code: 'SEM', configuration: {} }],
          },
          created_at: '2026-05-30T00:00:00Z',
        },
      ],
      total: 3,
    })
  })

  it('does not auto-select a sample and hides technical result editors', async () => {
    renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())

    expect(screen.getAllByText('请选择样品')).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: '保存表征记录' })).toBeDisabled()
    expect(screen.queryByText('分析软件信息')).not.toBeInTheDocument()
    expect(screen.queryByText('添加材料结论')).not.toBeInTheDocument()
    expect(screen.queryByText('不确定度')).not.toBeInTheDocument()
  })

  it('keeps the method selector in parity with generated profiles', () => {
    expect(new Set(METHOD_ORDER)).toEqual(
      new Set(Object.keys(characterizationProfiles)),
    )
  })

  it('renders result units from generated property metadata', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, 'XRD')

    expect(screen.getByLabelText('XRD 衍射峰位（° 2θ）')).toBeInTheDocument()
  })

  it('shows only the minimum Raman condition and fixed Raman results', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, 'Raman')

    expect(screen.getByText(/激光波长（nm）/)).toBeInTheDocument()
    expect(screen.getByText('更多测量参数')).toBeInTheDocument()
    expect(screen.getByText('Raman E₂g 峰位（cm⁻¹）')).toBeInTheDocument()
    expect(screen.getByText('Raman A₁g 峰位（cm⁻¹）')).toBeInTheDocument()
    expect(screen.getByText('物相')).toBeInTheDocument()
    expect(screen.getByText('层数结论')).toBeInTheDocument()
    expect(screen.getByText('更多科学结果')).toBeInTheDocument()
    expect(screen.getByText('Raman 峰宽（cm⁻¹）')).toBeInTheDocument()
    expect(screen.getByText('Raman 强度比（ratio）')).toBeInTheDocument()
  })

  it('saves a direct no-growth optical observation without a raw file', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, '光学显微镜')
    await fillSharedMeasurementInfo(user)

    await user.click(screen.getByLabelText(/^是否观察到生长/))
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
          sample_region: {
            geometry_type: 'whole_sample',
            label: 'whole_sample',
            coordinate_system: 'sample_local',
          },
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
  })

  it('submits an optional optical instrument with its frozen version', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, '光学显微镜')
    await fillSharedMeasurementInfo(user)
    await chooseInstrument(user)
    await user.click(screen.getByLabelText(/^是否观察到生长/))
    await user.click(screen.getByRole('option', { name: '未观察到生长' }))
    await user.click(screen.getByRole('button', { name: '保存表征记录' }))

    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
    expect(api.createMeasurement.mock.calls[0][0].measurement).toMatchObject({
      method_profile: 'optical_microscopy',
      instrument_id: 'instrument-1',
      instrument_version: 3,
    })
  })

  it('clears an optional instrument without resetting the measurement draft', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, '光学显微镜')
    await fillSharedMeasurementInfo(user)
    await user.type(screen.getByLabelText('覆盖率（%）'), '5')
    await chooseInstrument(user)

    await user.click(screen.getByRole('button', { name: '清除表征仪器' }))

    expect(screen.queryByLabelText(/^仪器版本/)).toBeNull()
    expect(screen.getByLabelText(/^测量时间/)).toHaveValue('2026-07-30T14:30')
    expect(screen.getByLabelText('覆盖率（%）')).toHaveValue(5)
    await user.click(screen.getByRole('button', { name: '保存表征记录' }))

    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
    expect(
      api.createMeasurement.mock.calls[0][0].measurement,
    ).not.toHaveProperty('instrument_id')
  })

  it.each([
    {
      methodLabel: 'Raman',
      method: 'Raman' as const,
      geometryLabel: '线扫',
      geometry: 'line',
      fields: { x: '1', y: '2', width: '10' },
    },
    {
      methodLabel: 'AFM',
      method: 'AFM' as const,
      geometryLabel: '矩形区域',
      geometry: 'area',
      fields: { x: '1', y: '2', width: '10', height: '20' },
    },
    {
      methodLabel: 'SEM',
      method: 'SEM' as const,
      geometryLabel: '点测量',
      geometry: 'point',
      fields: { x: '1', y: '2' },
    },
    {
      methodLabel: 'TEM',
      method: 'TEM' as const,
      geometryLabel: '薄片',
      geometry: 'lamella',
      fields: {},
    },
    {
      methodLabel: 'TEM',
      method: 'TEM' as const,
      geometryLabel: '颗粒',
      geometry: 'particle',
      fields: {},
    },
  ])(
    'submits an explicit $method $geometry sample region',
    async ({ methodLabel, method, geometryLabel, geometry, fields }) => {
      const user = userEvent.setup()
      const { container } = renderWorkspace()
      await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
      await chooseSampleAndMethod(user, methodLabel)
      await fillSharedMeasurementInfo(user)
      await chooseInstrument(user)
      await fillRequiredCondition(user, method)
      await user.click(screen.getByLabelText(/^区域类型/))
      await user.click(screen.getByRole('option', { name: geometryLabel }))

      if ('x' in fields) {
        await user.type(
          container.querySelector<HTMLInputElement>(
            '#characterization-region-x',
          )!,
          fields.x!,
        )
        await user.type(
          container.querySelector<HTMLInputElement>(
            '#characterization-region-y',
          )!,
          fields.y!,
        )
      }
      if ('width' in fields) {
        await user.type(
          screen.getByLabelText(geometry === 'line' ? /^线长/ : /^宽度/),
          fields.width!,
        )
      }
      if ('height' in fields) {
        await user.type(screen.getByLabelText(/^高度/), fields.height!)
      }
      await user.upload(
        container.querySelector<HTMLInputElement>(
          '#characterization-raw-files',
        )!,
        new File(['raw'], `${method}.dat`),
      )
      await user.click(screen.getByRole('button', { name: '保存表征记录' }))

      await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
      expect(
        api.createMeasurement.mock.calls[0][0].measurement.sample_region,
      ).toEqual({
        geometry_type: geometry,
        label: geometry,
        coordinate_system: 'sample_local',
        ...('x' in fields
          ? { x: Number(fields.x), y: Number(fields.y), unit: 'μm' }
          : {}),
        ...('width' in fields ? { width: Number(fields.width) } : {}),
        ...('height' in fields ? { height: Number(fields.height) } : {}),
      })
    },
  )

  it('requires a Raman raw file and cleans it up after a failed save', async () => {
    const user = userEvent.setup()
    api.createMeasurement.mockRejectedValue(new Error('save failed'))
    const { container } = renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, 'Raman')
    await fillSharedMeasurementInfo(user)
    await user.click(screen.getByRole('button', { name: '选择表征仪器' }))
    await user.click(await screen.findByLabelText(/^仪器版本/))
    expect(
      screen.getByRole('option', { name: /^v1.*不支持当前方法/ }),
    ).toHaveAttribute('data-disabled')
    await user.click(screen.getByRole('option', { name: /^v2/ }))

    const laser = screen
      .getByText(/激光波长（nm）/)
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
    expect(api.createMeasurement.mock.calls[0][0].measurement).toMatchObject({
      instrument_id: 'instrument-1',
      instrument_version: 2,
    })
  })

  it('rejects zero, incomplete sizes, and reversed ranges before saving', () => {
    expect(
      characterizationConditionIssue(
        {
          key: 'laser_wavelength_nm',
          label_zh: '激光波长',
          label_en: 'Laser wavelength',
          value_type: 'number',
        },
        { laser_wavelength_nm: '0' },
        true,
      ),
    ).toBe('请输入大于 0 的数值。')
    expect(
      characterizationConditionIssue(
        {
          key: 'scan_size_um',
          label_zh: '扫描尺寸',
          label_en: 'Scan size',
          value_type: 'size',
          components: [
            { key: 'x', label_zh: 'X', label_en: 'X' },
            { key: 'y', label_zh: 'Y', label_en: 'Y' },
          ],
        },
        { 'scan_size_um.x': '10', 'scan_size_um.y': '' },
        true,
      ),
    ).toBe('请补齐全部数值。')
    expect(
      characterizationConditionIssue(
        {
          key: 'scan_range',
          label_zh: '扫描范围',
          label_en: 'Scan range',
          value_type: 'range',
          components: [
            { key: 'start', label_zh: '起点', label_en: 'Start' },
            { key: 'end', label_zh: '终点', label_en: 'End' },
          ],
        },
        { 'scan_range.start': '20', 'scan_range.end': '10' },
        true,
      ),
    ).toContain('终点必须大于起点')
    const textField = {
      key: 'method_description',
      label_zh: '方法说明',
      label_en: 'Method description',
      value_type: 'text' as const,
      validation: { min_length: 2, max_length: 3 },
    }
    expect(
      characterizationConditionIssue(
        textField,
        { method_description: 'a' },
        true,
      ),
    ).toBe('至少输入 2 个字符。')
    expect(
      characterizationConditionIssue(
        textField,
        { method_description: 'abcd' },
        true,
      ),
    ).toBe('不能超过 3 个字符。')
  })

  it('uses capability rows before the legacy instrument type', () => {
    expect(
      instrumentSupportsMethod(
        {
          name_type: 'other',
          capabilities: [{ code: 'Raman', configuration: {} }],
        },
        'Raman',
      ),
    ).toBe(true)
    expect(
      instrumentSupportsMethod(
        {
          name_type: 'Raman',
          capabilities: [{ code: 'SEM', configuration: {} }],
        },
        'Raman',
      ),
    ).toBe(false)
    expect(instrumentSupportsMethod({ name_type: 'other' }, 'AFM')).toBe(true)
  })

  it('accepts zero detected layers and rejects negative or fractional counts', () => {
    const layerCount = {
      key: 'layers',
      label: '层数结论',
      kind: 'layer_count' as const,
    }
    expect(characterizationResultIssue(layerCount, '0')).toBeNull()
    expect(characterizationResultIssue(layerCount, '-1')).toContain('不小于 0')
    expect(characterizationResultIssue(layerCount, '1.5')).toContain('不小于 0')
  })

  it.each([
    'phase_identity',
    'polytype',
    'stacking_order',
    'orientation_relationship',
  ] as const)('limits %s assertion text to 256 characters', (assertionType) => {
    const assertion = {
      key: assertionType,
      label: '判定结论',
      kind: 'text' as const,
      assertionType,
    }
    expect(characterizationResultIssue(assertion, 'x'.repeat(256))).toBeNull()
    expect(characterizationResultIssue(assertion, 'x'.repeat(257))).toBe(
      '判定结论不能超过 256 个字符',
    )
  })

  it('applies the assertion limit to the rendered textarea', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, 'Raman')

    const phase = screen.getByLabelText('物相')
    expect(phase).toHaveAttribute('maxlength', '256')
    fireEvent.change(phase, { target: { value: 'x'.repeat(257) } })
    expect(screen.getAllByText('物相不能超过 256 个字符')).not.toHaveLength(0)
  })

  it.each(['raw', 'property'] as const)(
    'allows an optical %s-only record without a growth assertion',
    async (evidenceType) => {
      const user = userEvent.setup()
      const { container } = renderWorkspace()
      await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
      await chooseSampleAndMethod(user, '光学显微镜')
      await fillSharedMeasurementInfo(user)

      if (evidenceType === 'raw') {
        const fileInput = container.querySelector<HTMLInputElement>(
          '#characterization-raw-files',
        )!
        await user.upload(fileInput, new File(['image'], 'optical.png'))
      } else {
        await user.type(screen.getByLabelText('覆盖率（%）'), '5')
      }

      await user.click(screen.getByRole('button', { name: '保存表征记录' }))
      await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
      expect(api.createMeasurement.mock.calls[0][0].assertions).toEqual([])
    },
  )

  it('submits advanced assertions, composition, and analysis provenance', async () => {
    const user = userEvent.setup()
    const { container } = renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, '光学显微镜')
    await fillSharedMeasurementInfo(user)
    await user.upload(
      container.querySelector<HTMLInputElement>('#characterization-raw-files')!,
      new File(['image'], 'optical.png'),
    )
    await user.click(screen.getByText('高级结论与分析溯源'))

    expect(screen.getByLabelText('物相判定')).toBeInTheDocument()
    expect(screen.getByLabelText('多型判定')).toBeInTheDocument()
    expect(screen.getByLabelText('堆叠判定')).toBeInTheDocument()
    expect(screen.getByLabelText('取向关系判定')).toBeInTheDocument()
    expect(screen.getByLabelText('层数判定')).toBeInTheDocument()
    await user.type(screen.getByLabelText('物相判定'), '2H')

    await user.click(screen.getByRole('button', { name: '添加组分' }))
    await user.click(screen.getByRole('button', { name: '添加组分' }))
    const species = screen.getAllByLabelText('组分物种')
    const fractions = screen.getAllByLabelText('分数（0–1）')
    await user.type(species[0], 'Mo')
    await user.type(fractions[0], '0.4')
    await user.type(species[1], 'S')
    await user.type(fractions[1], '0.6')

    await user.type(screen.getByLabelText('软件名称'), 'ImageJ')
    await user.type(screen.getByLabelText('软件版本'), '1.54')
    await user.type(screen.getByLabelText('分析开始时间'), '2026-07-30T15:00')
    fireEvent.change(screen.getByLabelText('分析参数 JSON（选填）'), {
      target: { value: '{"threshold":"otsu"}' },
    })
    await user.click(screen.getByLabelText('将 optical.png 作为分析输入'))
    await user.click(screen.getByRole('button', { name: '保存表征记录' }))

    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
    const payload = api.createMeasurement.mock.calls[0][0]
    expect(payload.analyses).toEqual([
      expect.objectContaining({
        software_name: 'ImageJ',
        software_version: '1.54',
        parameters: { threshold: 'otsu' },
        input_file_ids: ['file-1'],
        output_file_ids: [],
      }),
    ])
    expect(payload.assertions).toContainEqual(
      expect.objectContaining({
        assertion_type: 'phase_identity',
        value: { phase: '2H' },
        analysis_index: 0,
      }),
    )
    expect(payload.assertions).toContainEqual(
      expect.objectContaining({
        assertion_type: 'composition',
        value: {
          basis: 'atomic_fraction',
          components: [
            { species: 'Mo', fraction: 0.4 },
            { species: 'S', fraction: 0.6 },
          ],
        },
        analysis_index: 0,
      }),
    )
  })

  it('submits analysis outputs and a pixel ROI against an uploaded region image', async () => {
    filesApi.uploadExperimentFile
      .mockResolvedValueOnce({ id: 'raw-file' })
      .mockResolvedValueOnce({ id: 'output-file' })
      .mockResolvedValueOnce({ id: 'region-file' })
    const user = userEvent.setup()
    const { container } = renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, '光学显微镜')
    await fillSharedMeasurementInfo(user)
    const raw = new File(['raw'], 'source.txt', { type: 'text/plain' })
    const output = new File(['result'], 'processed.csv', {
      type: 'text/csv',
    })
    const regionImage = new File(['image'], 'region.png', {
      type: 'image/png',
    })
    await user.upload(
      container.querySelector<HTMLInputElement>('#characterization-raw-files')!,
      [raw, output, regionImage],
    )

    await user.click(screen.getByLabelText(/^区域图像/))
    await user.click(screen.getByRole('option', { name: 'region.png' }))
    expect(screen.getByRole('button', { name: '保存表征记录' })).toBeDisabled()
    await user.type(screen.getByLabelText(/^像素区域 X/), '0')
    await user.type(screen.getByLabelText(/^像素区域 Y/), '1')
    await user.type(screen.getByLabelText(/^像素区域宽度/), '20')
    await user.type(screen.getByLabelText(/^像素区域高度/), '10')

    await user.click(screen.getByText('高级结论与分析溯源'))
    await user.type(screen.getByLabelText('软件名称'), 'ImageJ')
    await user.type(screen.getByLabelText('软件版本'), '1.54')
    await user.type(screen.getByLabelText('分析开始时间'), '2026-07-30T15:00')
    await user.click(screen.getByLabelText('将 source.txt 作为分析输入'))
    await user.click(screen.getByLabelText('将 processed.csv 作为分析输出'))
    await user.click(screen.getByRole('button', { name: '保存表征记录' }))

    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
    expect(filesApi.uploadExperimentFile.mock.calls).toEqual([
      [
        'token',
        'run-1',
        expect.objectContaining({ file: raw, fileCategory: 'raw' }),
      ],
      [
        'token',
        'run-1',
        expect.objectContaining({ file: output, fileCategory: 'processed' }),
      ],
      [
        'token',
        'run-1',
        expect.objectContaining({ file: regionImage, fileCategory: 'raw' }),
      ],
    ])
    const payload = api.createMeasurement.mock.calls[0][0]
    expect(payload.measurement.raw_file_ids).toEqual([
      'raw-file',
      'region-file',
    ])
    expect(payload.measurement.sample_region).toMatchObject({
      image_file_id: 'region-file',
      pixel_roi: { x: 0, y: 1, width: 20, height: 10 },
    })
    expect(payload.analyses[0]).toMatchObject({
      input_file_ids: ['raw-file'],
      output_file_ids: ['output-file'],
    })
  })

  it('preserves the save error when committed analysis outputs reject cleanup', async () => {
    api.createMeasurement.mockRejectedValue(
      new Error('response lost after commit'),
    )
    filesApi.uploadExperimentFile
      .mockResolvedValueOnce({ id: 'raw-file' })
      .mockResolvedValueOnce({ id: 'output-file' })
    filesApi.getExperimentFile.mockImplementation(
      (_token: string, fileId: string) =>
        Promise.resolve({
          id: fileId,
          characterization_record_id:
            fileId === 'raw-file' ? 'measurement-1' : null,
        }),
    )
    filesApi.deleteExperimentFile.mockRejectedValue(
      new HttpError(409, 'File is referenced by scientific provenance', {
        detail: 'File is referenced by scientific provenance',
      }),
    )
    const user = userEvent.setup()
    const { container } = renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, '光学显微镜')
    await fillSharedMeasurementInfo(user)
    await user.upload(
      container.querySelector<HTMLInputElement>('#characterization-raw-files')!,
      [
        new File(['raw'], 'source.txt', { type: 'text/plain' }),
        new File(['result'], 'processed.csv', { type: 'text/csv' }),
      ],
    )
    await user.click(screen.getByText('高级结论与分析溯源'))
    await user.type(screen.getByLabelText('软件名称'), 'ImageJ')
    await user.type(screen.getByLabelText('软件版本'), '1.54')
    await user.type(screen.getByLabelText('分析开始时间'), '2026-07-30T15:00')
    await user.click(screen.getByLabelText('将 source.txt 作为分析输入'))
    await user.click(screen.getByLabelText('将 processed.csv 作为分析输出'))
    await user.click(screen.getByRole('button', { name: '保存表征记录' }))

    await waitFor(() =>
      expect(filesApi.deleteExperimentFile).toHaveBeenCalledWith(
        'token',
        'output-file',
      ),
    )
    expect(filesApi.deleteExperimentFile).toHaveBeenCalledTimes(1)
    expect(notifications.error).toHaveBeenCalledWith(
      'response lost after commit',
    )
    expect(
      within(screen.getByRole('list', { name: '已选择的原始文件' })).getByText(
        'processed.csv',
      ),
    ).toBeInTheDocument()
  })

  it('rejects duplicate or non-unit-sum composition and malformed analysis JSON', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, '光学显微镜')
    await user.click(screen.getByText('高级结论与分析溯源'))
    await user.click(screen.getByRole('button', { name: '添加组分' }))
    await user.click(screen.getByRole('button', { name: '添加组分' }))
    const species = screen.getAllByLabelText('组分物种')
    const fractions = screen.getAllByLabelText('分数（0–1）')
    await user.type(species[0], 'Mo')
    await user.type(fractions[0], '0.4')
    await user.type(species[1], 'Mo')
    await user.type(fractions[1], '0.4')
    await user.type(screen.getByLabelText('软件名称'), 'Tool')
    fireEvent.change(screen.getByLabelText('分析参数 JSON（选填）'), {
      target: { value: '[]' },
    })

    expect(screen.getAllByText('组分物种不能重复')).not.toHaveLength(0)
    expect(screen.getAllByText('组分分数之和必须等于 1')).not.toHaveLength(0)
    expect(screen.getAllByText('分析参数必须是 JSON 对象')).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: '保存表征记录' })).toBeDisabled()
  })

  it('validates scientific property bounds from generated metadata', () => {
    expect(
      characterizationResultIssue(
        {
          key: 'coverage',
          label: '覆盖率',
          kind: 'number',
          propertyCode: 'coverage_percent',
        },
        '101',
      ),
    ).toBe('覆盖率不能大于 100')
    expect(
      characterizationResultIssue(
        {
          key: 'domain',
          label: '晶畴尺寸',
          kind: 'number',
          propertyCode: 'domain_size_um',
        },
        '0',
      ),
    ).toBe('晶畴尺寸必须大于 0')
  })

  it('keeps dirty data on a cancelled sample change and clears it when confirmed', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { container } = renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, '光学显微镜')
    const fileInput = container.querySelector<HTMLInputElement>(
      '#characterization-raw-files',
    )!
    await user.upload(fileInput, new File(['image'], 'optical.png'))

    const sampleSelect = screen.getByLabelText(/^样品/)
    await user.click(sampleSelect)
    await user.click(screen.getByRole('option', { name: /S02/ }))
    expect(confirm).toHaveBeenCalled()
    expect(sampleSelect).toHaveTextContent('S01')
    expect(fileInput.files).toHaveLength(1)

    confirm.mockReturnValue(true)
    await user.click(sampleSelect)
    await user.click(screen.getByRole('option', { name: /S02/ }))
    expect(sampleSelect).toHaveTextContent('S02')
    expect(fileInput.files).toHaveLength(0)
    expect(screen.getByTestId('route-leave-guard')).toHaveAttribute(
      'data-active',
      'false',
    )
    confirm.mockRestore()
  })

  it('submits the selected measurement quality flag', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, '光学显微镜')
    await fillSharedMeasurementInfo(user)
    await user.click(screen.getByLabelText('数据质量'))
    await user.click(screen.getByRole('option', { name: '可疑' }))
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: '可疑' })).toBeNull(),
    )
    await user.click(screen.getByLabelText(/^是否观察到生长/))
    await user.click(screen.getByRole('option', { name: '观察到生长' }))
    await user.click(screen.getByRole('button', { name: '保存表征记录' }))

    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
    expect(api.createMeasurement.mock.calls[0][0].measurement).toMatchObject({
      quality_flag: 'suspect',
    })
  })

  it('preserves property quality flags and does not offer direct invalid measurement creation', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => expect(api.getRun).toHaveBeenCalled())
    await chooseSampleAndMethod(user, '光学显微镜')
    await fillSharedMeasurementInfo(user)

    await user.click(screen.getByLabelText('数据质量'))
    expect(screen.queryByRole('option', { name: '无效' })).toBeNull()
    await user.keyboard('{Escape}')

    await user.click(screen.getByLabelText(/^是否观察到生长/))
    await user.click(screen.getByRole('option', { name: '未观察到生长' }))
    const coverage = screen.getByLabelText('覆盖率（%）')
    await user.type(coverage, '0')
    await user.click(within(coverage.parentElement!).getByLabelText('结果质量'))
    await user.click(screen.getByRole('option', { name: '低于检出限' }))
    expect(
      screen.getByText('此数值是检出阈值，不是精确观测值。'),
    ).toBeInTheDocument()

    const observation = screen.getByLabelText('观察说明')
    await user.click(
      within(observation.parentElement!).getByLabelText('结果质量'),
    )
    expect(screen.queryByRole('option', { name: '低于检出限' })).toBeNull()
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: '保存表征记录' }))

    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
    expect(api.createMeasurement.mock.calls[0][0].properties).toContainEqual(
      expect.objectContaining({
        property_code: 'coverage_percent',
        numeric_value: 0,
        quality_flag: 'below_detection_limit',
      }),
    )
  })

  it('uses current revision and lifecycle state to limit sample choices', async () => {
    api.listSamples.mockResolvedValue({
      items: [
        {
          id: 'current-growth',
          experiment_run_id: 'run-1',
          run_revision_id: 'revision-current',
          role: 'growth',
          lifecycle_state: 'active',
          sample_code: 'CURRENT',
          actual_state: 'unknown',
          actual_material_summary: null,
        },
        {
          id: 'stale-growth',
          experiment_run_id: 'run-1',
          run_revision_id: 'revision-old',
          role: 'growth',
          lifecycle_state: 'active',
          sample_code: 'STALE',
          actual_state: 'unknown',
          actual_material_summary: null,
        },
        {
          id: 'consumed-control',
          experiment_run_id: 'run-1',
          run_revision_id: null,
          role: 'control',
          lifecycle_state: 'consumed',
          sample_code: 'CONSUMED',
          actual_state: 'unknown',
          actual_material_summary: null,
        },
      ],
    })
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => expect(api.getRun).toHaveBeenCalled())

    await user.click(screen.getByLabelText(/^样品/))
    expect(screen.getByRole('option', { name: /CURRENT/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /STALE/ })).toBeNull()
    expect(screen.queryByRole('option', { name: /CONSUMED/ })).toBeNull()
  })

  it('applies generated text limits to condition inputs', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => expect(api.getRun).toHaveBeenCalled())
    await chooseSampleAndMethod(user, '光学显微镜')
    await user.click(screen.getByText('更多测量参数'))

    expect(screen.getByLabelText('物镜')).toHaveAttribute('maxlength', '128')
  })

  it('keeps sample-region labels and coordinate pairs within the API boundary', async () => {
    const user = userEvent.setup()
    const { container } = renderWorkspace()
    await waitFor(() => expect(api.getRun).toHaveBeenCalled())
    await chooseSampleAndMethod(user, '光学显微镜')
    await user.click(screen.getByLabelText(/^区域类型/))
    await user.click(screen.getByRole('option', { name: '选定区域' }))

    const label = screen.getByLabelText(/^区域标签/)
    expect(label).toHaveAttribute('maxlength', '128')
    fireEvent.change(label, { target: { value: 'x'.repeat(129) } })
    await user.type(
      container.querySelector<HTMLInputElement>('#characterization-region-x')!,
      '1',
    )
    expect(screen.getAllByText('区域标签不能超过 128 个字符')).not.toHaveLength(
      0,
    )
    expect(screen.getAllByText('X 和 Y 坐标必须同时填写')).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: '保存表征记录' })).toBeDisabled()
  })

  it('disables the whole draft while a save is pending', async () => {
    let finishSave: ((value: { id: string }) => void) | undefined
    api.createMeasurement.mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve
      }),
    )
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, '光学显微镜')
    await fillSharedMeasurementInfo(user)
    await user.click(screen.getByLabelText(/^是否观察到生长/))
    await user.click(screen.getByRole('option', { name: '观察到生长' }))
    await user.click(screen.getByRole('button', { name: '保存表征记录' }))

    expect(
      await screen.findByRole('button', { name: '保存中…' }),
    ).toBeDisabled()
    expect(screen.getByLabelText(/^样品/)).toBeDisabled()
    expect(screen.getByLabelText(/^表征方法/)).toBeDisabled()
    expect(screen.getByLabelText(/^测量时间/)).toBeDisabled()
    expect(screen.getByLabelText('原始文件（选填）')).toBeDisabled()
    for (const quality of screen.getAllByLabelText('结果质量')) {
      expect(quality).toBeDisabled()
    }

    finishSave?.({ id: 'measurement-1' })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '保存表征记录' }),
      ).toBeDisabled(),
    )
  })

  it('shows a retry action when samples fail to load', async () => {
    const user = userEvent.setup()
    api.listSamples
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ items: [] })
    renderWorkspace()

    expect(await screen.findByText('offline')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(api.listSamples).toHaveBeenCalledTimes(2))
  })

  it('associates existing-record expanders with their detail region', async () => {
    api.listAllMeasurements.mockResolvedValue({
      items: [
        {
          id: 'measurement-existing',
          sample_code: 'S01',
          method_profile: 'Raman',
          measured_at: '2026-08-30T12:00:00Z',
          quality_flag: 'valid',
          evidence_present: true,
        },
      ],
      total: 1,
      next_cursor: null,
    })
    const user = userEvent.setup()
    renderWorkspace()

    const expand = await screen.findByRole('button', { name: '查看详情' })
    expect(expand).toHaveAttribute(
      'aria-controls',
      'measurement-details-measurement-existing',
    )
    await user.click(expand)
    expect(
      screen.getByRole('region', { name: 'S01 表征详情' }),
    ).toHaveAttribute('id', 'measurement-details-measurement-existing')
  })

  it('shows existing measurements without create or invalidate actions in read-only mode', async () => {
    api.listAllMeasurements.mockResolvedValue({
      items: [
        {
          id: 'measurement-existing',
          sample_code: 'S01',
          method_profile: 'Raman',
          measured_at: '2026-08-30T12:00:00Z',
          quality_flag: 'valid',
          evidence_present: true,
        },
      ],
      total: 1,
      next_cursor: null,
    })
    const user = userEvent.setup()
    renderWorkspace(true)

    expect(await screen.findByText('已有表征记录（只读）')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^样品/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '保存表征记录' }),
    ).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '查看详情' }))
    expect(screen.getByText('Details measurement-existing')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Invalidate record' }),
    ).not.toBeInTheDocument()
    expect(api.createMeasurement).not.toHaveBeenCalled()
  })

  it('supports the key English workflow, confirmations, validation, and toast', async () => {
    await i18n.changeLanguage('en')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    const { container } = renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())

    expect(
      screen.getByRole('heading', { name: '1. Select sample and method' }),
    ).toBeInTheDocument()
    await user.click(screen.getByLabelText(/^Sample/))
    await user.click(screen.getByRole('option', { name: /S01/ }))
    await user.click(screen.getByLabelText(/^Characterization method/))
    await user.click(screen.getByRole('option', { name: 'Other' }))
    expect(screen.getByText('This field is required.')).toBeInTheDocument()
    expect(screen.getByTestId('route-leave-guard')).toHaveAttribute(
      'data-message',
      'This characterization record has unsaved changes. Leave anyway?',
    )

    await user.click(screen.getByLabelText(/^Sample/))
    await user.click(screen.getByRole('option', { name: /S02/ }))
    expect(confirm).toHaveBeenCalledWith(
      'Changing the sample clears the unsaved characterization. Continue?',
    )
    expect(screen.getByLabelText(/^Sample/)).toHaveTextContent('S01')

    await user.type(screen.getByLabelText(/^Measured at/), '2026-07-30T14:30')
    await user.type(screen.getByLabelText(/^Method description/), 'custom')
    const fileInput = container.querySelector<HTMLInputElement>(
      '#characterization-raw-files',
    )!
    await user.upload(fileInput, new File(['raw'], 'custom.dat'))

    await user.click(
      screen.getByRole('button', { name: 'Save characterization record' }),
    )
    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
    expect(api.createMeasurement.mock.calls[0][0].measurement).toMatchObject({
      method_profile: 'other',
      sample_region: {
        geometry_type: 'whole_sample',
        label: 'whole_sample',
        coordinate_system: 'sample_local',
      },
    })
    await waitFor(() =>
      expect(notifications.success).toHaveBeenCalledWith(
        'Characterization record saved',
      ),
    )
    confirm.mockRestore()
  })
})
