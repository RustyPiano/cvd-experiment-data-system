import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
  const measuredAt = screen.getByLabelText(/^测量时间/)
  await user.clear(measuredAt)
  await user.type(measuredAt, '2026-07-30T14:30')
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
  if (method === 'TEM') {
    await user.click(screen.getByLabelText(/^数据类型/))
    await user.click(screen.getByRole('option', { name: '图像' }))
  }
  await user.click(
    screen.getByLabelText(method === 'TEM' ? /^成像模式/ : /^成像或分析模式/),
  )
  await user.click(
    screen.getByRole('option', {
      name: method === 'SEM' ? '二次电子成像（SE）' : 'HRTEM',
    }),
  )
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

  describe('measurement settings constraints', () => {
    it('accepts zero and negative bounded values and caps percentage power', () => {
      const tilt = characterizationProfiles.SEM.condition_fields.find(
        (field) => field.key === 'stage_tilt_deg',
      )!
      for (const value of ['-90', '-20', '0', '90'])
        expect(
          characterizationConditionIssue(tilt, { stage_tilt_deg: value }),
        ).toBeNull()
      expect(
        characterizationConditionIssue(tilt, { stage_tilt_deg: '91' }),
      ).toBe('请输入 -90 ° 至 90 ° 范围内的数值。')
      const power = characterizationProfiles.Raman.condition_fields.find(
        (field) => field.key === 'excitation_power_value',
      )!
      expect(
        characterizationConditionIssue(power, {
          excitation_power_value: '101',
          excitation_power_basis: 'instrument_percent',
        }),
      ).toBe('不能大于 100%')
      expect(
        characterizationConditionIssue(power, {
          excitation_power_value: '101',
          excitation_power_basis: 'sample_plane_mW',
        }),
      ).toBeNull()
    })

    it('accepts signed Raman and omega ranges but constrains 2theta', () => {
      const raman = characterizationProfiles.Raman.condition_fields.find(
        (field) => field.key === 'raman_shift_range_cm1',
      )!
      expect(
        characterizationConditionIssue(raman, {
          'raman_shift_range_cm1.start': '-50',
          'raman_shift_range_cm1.end': '500',
        }),
      ).toBeNull()
      const xrd = characterizationProfiles.XRD.condition_fields.find(
        (field) => field.key === 'scan_range_deg',
      )!
      expect(
        characterizationConditionIssue(xrd, {
          'scan_range_deg.start': '-1',
          'scan_range_deg.end': '1',
          scan_axis: 'omega',
        }),
      ).toBeNull()
      expect(
        characterizationConditionIssue(xrd, {
          'scan_range_deg.start': '-1',
          'scan_range_deg.end': '1',
          scan_axis: 'two_theta',
        }),
      ).toBe('请输入 0 ° 至 180 ° 范围内的数值。')
      expect(
        characterizationConditionIssue(raman, {
          'raman_shift_range_cm1.start': '-10',
          'raman_shift_range_cm1.end': '-50',
        }),
      ).toBe('终点应大于起点。')
    })

    it('accepts a historical low-frequency Raman instrument for Raman', () => {
      expect(
        instrumentSupportsMethod(
          { capabilities: [{ code: 'low_frequency_raman' }] },
          'Raman',
        ),
      ).toBe(true)
      expect(
        instrumentSupportsMethod(
          { capabilities: [{ code: 'low_frequency_raman' }] },
          'SHG',
        ),
      ).toBe(false)
    })

    it('shows SHG pulse parameters only for pulsed excitation and clears hidden values', async () => {
      const user = userEvent.setup()
      renderWorkspace()
      await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
      await chooseSampleAndMethod(user, 'SHG')
      await user.click(screen.getByLabelText(/^数据类型/))
      await user.click(screen.getByRole('option', { name: '偏振扫描' }))
      expect(screen.queryByRole('button', { name: '添加峰' })).toBeNull()
      await user.click(screen.getByLabelText('激光输出'))
      await user.click(screen.getByRole('option', { name: '脉冲' }))
      await user.click(screen.getByText('其他采集参数'))
      await user.type(screen.getByLabelText('脉冲宽度（fs）'), '100')
      await user.click(screen.getByLabelText('激光输出'))
      await user.click(screen.getByRole('option', { name: '连续' }))
      expect(screen.queryByLabelText('脉冲宽度（fs）')).toBeNull()
      await user.click(screen.getByLabelText('激光输出'))
      await user.click(screen.getByRole('option', { name: '脉冲' }))
      expect(screen.getByLabelText('脉冲宽度（fs）')).toHaveValue(null)
    })
  })

  it('does not auto-select a sample and hides technical result editors', async () => {
    renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())

    expect(screen.getAllByText('请选择样品')).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: '保存表征记录' })).toBeDisabled()
    expect(screen.getByLabelText(/^测量时间/)).not.toHaveValue('')
    expect(screen.queryByText('分析软件信息')).not.toBeInTheDocument()
    expect(screen.queryByText('添加材料结论')).not.toBeInTheDocument()
    expect(screen.queryByText('不确定度')).not.toBeInTheDocument()
  })

  it('keeps the method selector in parity with generated profiles', () => {
    expect(new Set(METHOD_ORDER)).toEqual(
      new Set(
        Object.entries(characterizationProfiles)
          .filter(([, profile]) => !profile.legacy_only)
          .map(([code]) => code),
      ),
    )
  })

  it('records unassigned peaks with their own widths and units', async () => {
    const user = userEvent.setup()
    const { container } = renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, 'Raman')
    await fillSharedMeasurementInfo(user)
    await chooseInstrument(user)
    await fillRequiredCondition(user, 'Raman')
    expect(screen.queryByLabelText(/A₁g|E₂g|物相|层数|区域类型/)).toBeNull()
    await user.upload(
      container.querySelector<HTMLInputElement>('#characterization-raw-files')!,
      new File(['raw'], 'raman.txt'),
    )
    await user.click(screen.getByRole('button', { name: '添加峰' }))
    await user.type(screen.getByLabelText('峰 1 峰位 (cm⁻¹)'), '385')
    await user.type(screen.getByLabelText('峰 1 半高全宽 (cm⁻¹)'), '4')
    await user.click(screen.getByRole('button', { name: '添加峰' }))
    await user.type(screen.getByLabelText('峰 2 峰位 (cm⁻¹)'), '405')
    await user.type(screen.getByLabelText('峰 2 半高全宽 (cm⁻¹)'), '6')
    await user.click(screen.getByRole('button', { name: '保存表征记录' }))
    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
    const payload = api.createMeasurement.mock.calls[0][0]
    expect(payload.measurement).not.toHaveProperty('sample_region')
    expect(payload.assertions).toEqual([])
    expect(payload.properties).toContainEqual(
      expect.objectContaining({
        property_code: 'spectral_peaks',
        structured_value: expect.objectContaining({
          status: 'recorded',
          position_unit: 'cm⁻¹',
          source_file_id: 'file-1',
          peaks: [
            { id: 1, position: 385, fwhm: 4 },
            { id: 2, position: 405, fwhm: 6 },
          ],
        }),
      }),
    )
  })

  it('preserves peak source indices and confirms before removing their evidence', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { container } = renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, 'Raman')
    await user.upload(
      container.querySelector<HTMLInputElement>('#characterization-raw-files')!,
      [new File(['a'], 'first.txt'), new File(['b'], 'second.txt')],
    )
    await user.click(screen.getByRole('button', { name: '添加峰' }))
    await user.type(screen.getByLabelText('峰 1 峰位 (cm⁻¹)'), '385')
    await user.click(screen.getByLabelText('对应原始光谱'))
    await user.click(screen.getByRole('option', { name: 'second.txt' }))
    await user.click(screen.getByRole('button', { name: '移除文件 first.txt' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByLabelText('峰 1 峰位 (cm⁻¹)')).toHaveValue(385)
    await user.click(
      screen.getByRole('button', { name: '移除文件 second.txt' }),
    )
    expect(confirm).toHaveBeenCalled()
    expect(screen.getByLabelText('峰 1 峰位 (cm⁻¹)')).toHaveValue(385)
    confirm.mockReturnValue(true)
    await user.click(
      screen.getByRole('button', { name: '移除文件 second.txt' }),
    )
    expect(screen.queryByLabelText('峰 1 峰位 (cm⁻¹)')).toBeNull()
    expect(screen.queryByText('second.txt')).toBeNull()
    confirm.mockRestore()
  })

  it('saves an optical observation without a material verdict or raw file', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, 'OM')
    await fillSharedMeasurementInfo(user)
    await user.type(screen.getByLabelText('观察说明'), '未见独立岛状对象')
    await user.click(screen.getByRole('button', { name: '保存表征记录' }))
    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
    const payload = api.createMeasurement.mock.calls[0][0]
    expect(payload.measurement).not.toHaveProperty('sample_region')
    expect(payload.assertions).toEqual([])
    expect(payload.properties).toContainEqual(
      expect.objectContaining({
        property_code: 'observation_note',
        text_value: '未见独立岛状对象',
      }),
    )
  })

  it('submits an optional optical instrument with its frozen version', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, 'OM')
    await fillSharedMeasurementInfo(user)
    await chooseInstrument(user)
    await user.type(screen.getByLabelText('观察说明'), '未见独立岛状对象')
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
    await chooseSampleAndMethod(user, 'OM')
    await fillSharedMeasurementInfo(user)
    await user.type(screen.getByLabelText('观察说明'), '可见片状对象')
    await chooseInstrument(user)

    await user.click(screen.getByRole('button', { name: '清除表征仪器' }))

    expect(screen.queryByLabelText(/^仪器版本/)).toBeNull()
    expect(screen.getByLabelText(/^测量时间/)).toHaveValue('2026-07-30T14:30')
    expect(screen.getByLabelText('观察说明')).toHaveValue('可见片状对象')
    await user.click(screen.getByRole('button', { name: '保存表征记录' }))

    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
    expect(
      api.createMeasurement.mock.calls[0][0].measurement,
    ).not.toHaveProperty('instrument_id')
  })

  it.each(['Raman', 'AFM', 'SEM', 'TEM'] as const)(
    'links %s directly to the sample without region inputs',
    async (method) => {
      const user = userEvent.setup()
      const { container } = renderWorkspace()
      await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
      await chooseSampleAndMethod(user, method)
      await fillSharedMeasurementInfo(user)
      await chooseInstrument(user)
      await fillRequiredCondition(user, method)
      expect(
        screen.queryByLabelText(/区域类型|区域标签|X 坐标|像素区域/),
      ).toBeNull()
      await user.upload(
        container.querySelector<HTMLInputElement>(
          '#characterization-raw-files',
        )!,
        new File(['raw'], method + '.dat'),
      )
      await user.click(screen.getByRole('button', { name: '保存表征记录' }))
      await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
      expect(
        api.createMeasurement.mock.calls[0][0].measurement,
      ).not.toHaveProperty('sample_region')
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
    ).toBe('终点应大于起点。')
    expect(
      characterizationConditionIssue(
        {
          key: 'scan_size_um',
          label_zh: '扫描尺寸',
          label_en: 'Scan size',
          value_type: 'size',
          validation: { gt: 0, le: 100 },
          components: [
            { key: 'x', label_zh: 'X', label_en: 'X' },
            { key: 'y', label_zh: 'Y', label_en: 'Y' },
          ],
        },
        { 'scan_size_um.x': '10', 'scan_size_um.y': '101' },
      ),
    ).toBe('不能大于 100')
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

  it.each(['raw', 'property'] as const)(
    'allows an optical %s-only record without a growth assertion',
    async (evidenceType) => {
      const user = userEvent.setup()
      const { container } = renderWorkspace()
      await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
      await chooseSampleAndMethod(user, 'OM')
      await fillSharedMeasurementInfo(user)

      if (evidenceType === 'raw') {
        const fileInput = container.querySelector<HTMLInputElement>(
          '#characterization-raw-files',
        )!
        await user.upload(fileInput, new File(['image'], 'optical.png'))
      } else {
        await user.type(screen.getByLabelText('观察说明'), '可见片状对象')
      }

      await user.click(screen.getByRole('button', { name: '保存表征记录' }))
      await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
      expect(api.createMeasurement.mock.calls[0][0].assertions).toEqual([])
    },
  )

  it('keeps TEM spectroscopy as raw evidence without generic analysis or quantification', async () => {
    const user = userEvent.setup()
    const { container } = renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, 'TEM')
    await fillSharedMeasurementInfo(user)
    await chooseInstrument(user)
    await user.type(screen.getByLabelText(/^加速电压/), '80')
    await user.click(screen.getByLabelText(/^数据类型/))
    await user.click(screen.getByRole('option', { name: '能谱' }))
    await user.click(screen.getByLabelText(/^能谱方法/))
    await user.click(screen.getByRole('option', { name: 'EDS' }))
    expect(screen.queryByText('补充数据与处理记录')).toBeNull()
    expect(
      screen.queryByLabelText(/元素符号|软件名称|分析开始时间|晶格间距/),
    ).toBeNull()
    await user.upload(
      container.querySelector<HTMLInputElement>('#characterization-raw-files')!,
      new File(['spectrum'], 'eds.dat'),
    )
    await user.click(screen.getByRole('button', { name: '保存表征记录' }))
    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
    expect(api.createMeasurement.mock.calls[0][0]).toMatchObject({
      measurement: { raw_file_ids: ['file-1'] },
      analyses: [],
      properties: [],
      assertions: [],
    })
    expect(filesApi.uploadExperimentFile.mock.calls[0][2].fileCategory).toBe(
      'raw',
    )
  })

  it('preserves the save error and committed files when cleanup fails', async () => {
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
    await chooseSampleAndMethod(user, 'OM')
    await fillSharedMeasurementInfo(user)
    await user.upload(
      container.querySelector<HTMLInputElement>('#characterization-raw-files')!,
      [
        new File(['raw'], 'source.txt', { type: 'text/plain' }),
        new File(['result'], 'processed.csv', { type: 'text/csv' }),
      ],
    )
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
      within(screen.getByRole('list', { name: '已选择的数据文件' })).getByText(
        'processed.csv',
      ),
    ).toBeInTheDocument()
  })

  it.each(['OM', 'Raman', 'AFM', 'SEM', 'TEM', 'SHG'])(
    'omits deferred fields from %s new entry',
    async (method) => {
      const user = userEvent.setup()
      renderWorkspace()
      await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
      await chooseSampleAndMethod(user, method)
      expect(
        screen.queryByLabelText(
          /统计对象|尺寸定义|照明模式|滤光配置|高度数据处理|导电处理或镀膜|表征前制样|检偏设置|角度零点|覆盖率|粗糙度|对象尺寸|对象密度/,
        ),
      ).toBeNull()
      expect(screen.queryByText('补充数据与处理记录')).toBeNull()
      expect(
        screen.queryByLabelText(/软件名称|分析开始时间|参数名|不确定度类型/),
      ).toBeNull()
    },
  )

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
    await chooseSampleAndMethod(user, 'OM')
    const fileInput = container.querySelector<HTMLInputElement>(
      '#characterization-raw-files',
    )!
    await user.upload(fileInput, new File(['image'], 'optical.png'))

    const sampleSelect = screen.getByLabelText(/^样品/)
    await user.click(sampleSelect)
    await user.click(screen.getByRole('option', { name: /S02/ }))
    expect(confirm).toHaveBeenCalled()
    expect(sampleSelect).toHaveTextContent('S01')
    expect(screen.getAllByText('optical.png')).not.toHaveLength(0)

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

  it('appends uploaded files and lets the user remove one', async () => {
    const user = userEvent.setup()
    const { container } = renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, 'OM')
    const input = container.querySelector<HTMLInputElement>(
      '#characterization-raw-files',
    )!
    await user.upload(
      input,
      new File(['a'], 'first.png', { type: 'image/png' }),
    )
    await user.upload(
      input,
      new File(['b'], 'second.png', { type: 'image/png' }),
    )

    expect(screen.getAllByText('first.png')).not.toHaveLength(0)
    expect(screen.getAllByText('second.png')).not.toHaveLength(0)
    await user.click(screen.getByRole('button', { name: '移除文件 first.png' }))
    expect(screen.queryByText('first.png')).toBeNull()
    expect(screen.getAllByText('second.png')).not.toHaveLength(0)
  })

  it('omits quality grading from new measurements', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
    await chooseSampleAndMethod(user, 'OM')
    await fillSharedMeasurementInfo(user)
    expect(screen.queryByLabelText('数据质量')).toBeNull()
    expect(screen.queryByLabelText('结果质量')).toBeNull()
    expect(screen.queryByText(/选填|可选/)).toBeNull()
    expect(screen.getByLabelText('数据文件')).not.toBeRequired()
    expect(screen.queryByLabelText(/^软件名称/)).toBeNull()
    await user.type(screen.getByLabelText('观察说明'), '未见独立岛状对象')
    await user.click(screen.getByRole('button', { name: '保存表征记录' }))
    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
    expect(
      api.createMeasurement.mock.calls[0][0].measurement,
    ).not.toHaveProperty('quality_flag')
  })

  it('records an AFM value without inventing statistics and preserves detection-limit semantics', async () => {
    const user = userEvent.setup()
    const { container } = renderWorkspace()
    await waitFor(() => expect(api.getRun).toHaveBeenCalled())
    await chooseSampleAndMethod(user, 'AFM')
    await fillSharedMeasurementInfo(user)
    await chooseInstrument(user)
    await fillRequiredCondition(user, 'AFM')
    await user.upload(
      container.querySelector<HTMLInputElement>('#characterization-raw-files')!,
      new File(['height'], 'height.dat'),
    )
    const height = screen.getByLabelText(/台阶高度（nm）/)
    await user.type(height, '0.3')
    await user.click(within(height.parentElement!).getByText('数值说明'))
    expect(screen.queryByLabelText(/统计方式|统计样本数|不确定度/)).toBeNull()
    await user.click(within(height.parentElement!).getByLabelText('数值类型'))
    await user.click(screen.getByRole('option', { name: '低于检出限' }))
    expect(screen.getByRole('button', { name: '保存表征记录' })).toBeDisabled()
    await user.type(screen.getByLabelText(/^检出限依据/), '报告所列阈值 0.3 nm')
    await user.click(screen.getByRole('button', { name: '保存表征记录' }))
    await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
    const value = api.createMeasurement.mock.calls[0][0].properties[0]
    expect(value).toMatchObject({
      property_code: 'afm_step_height',
      numeric_value: 0.3,
      quality_flag: 'below_detection_limit',
      quality_note: '报告所列阈值 0.3 nm',
    })
    expect(value).not.toHaveProperty('statistic')
    expect(value).not.toHaveProperty('sample_count')
    expect(value).not.toHaveProperty('analysis_index')
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
    await chooseSampleAndMethod(user, 'OM')

    expect(screen.getByLabelText('物镜规格')).toHaveAttribute(
      'maxlength',
      '128',
    )
  })

  it.each(['未检出可分辨峰', '不填写峰参数'])(
    'saves %s without inventing a numeric peak or material verdict',
    async (status) => {
      const user = userEvent.setup()
      const { container } = renderWorkspace()
      await waitFor(() => expect(api.listSamples).toHaveBeenCalled())
      await chooseSampleAndMethod(user, 'Raman')
      await fillSharedMeasurementInfo(user)
      await chooseInstrument(user)
      await fillRequiredCondition(user, 'Raman')
      await user.upload(
        container.querySelector<HTMLInputElement>(
          '#characterization-raw-files',
        )!,
        new File(['raw'], 'spectrum.txt'),
      )
      expect(screen.queryByLabelText('峰提取状态')).toBeNull()
      expect(screen.queryByText('尚未分析')).toBeNull()
      if (status === '未检出可分辨峰')
        await user.click(screen.getByRole('checkbox', { name: status }))
      await user.click(screen.getByRole('button', { name: '保存表征记录' }))
      await waitFor(() => expect(api.createMeasurement).toHaveBeenCalled())
      const payload = api.createMeasurement.mock.calls[0][0]
      expect(payload.assertions).toEqual([])
      if (status === '未检出可分辨峰') {
        expect(payload.properties[0].structured_value).toMatchObject({
          status: 'not_detected',
          peaks: [],
          source_file_id: 'file-1',
        })
      } else expect(payload.properties).toEqual([])
    },
  )

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
    await chooseSampleAndMethod(user, 'OM')
    await fillSharedMeasurementInfo(user)
    await user.type(screen.getByLabelText('观察说明'), '未见独立岛状对象')
    await user.click(screen.getByRole('button', { name: '保存表征记录' }))

    expect(
      await screen.findByRole('button', { name: '保存中…' }),
    ).toBeDisabled()
    expect(screen.getByLabelText(/^样品/)).toBeDisabled()
    expect(screen.getByLabelText(/^表征方法/)).toBeDisabled()
    expect(screen.getByLabelText(/^测量时间/)).toBeDisabled()
    expect(screen.getByLabelText('数据文件')).toBeDisabled()
    for (const quality of screen.queryAllByLabelText('结果质量')) {
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

    expect(await screen.findByText('已有表征记录')).toBeInTheDocument()
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

    const measuredAt = screen.getByLabelText(/^Measured at/)
    await user.clear(measuredAt)
    await user.type(measuredAt, '2026-07-30T14:30')
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
    })
    await waitFor(() =>
      expect(notifications.success).toHaveBeenCalledWith(
        'Characterization record saved',
      ),
    )
    confirm.mockRestore()
  })
})
