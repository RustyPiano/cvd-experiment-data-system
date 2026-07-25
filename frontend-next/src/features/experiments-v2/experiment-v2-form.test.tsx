import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import type * as RepeatableItemsModule from './components/repeatable-items-section'
import type { V2EntityRead } from '@/features/entity-library/api'

import i18n from '@/shared/i18n'
import { HttpError } from '@/shared/api/http-error'
import { emptyModuleValues } from './field-logic'
import type { ModuleSaveProps } from './form-types'
import {
  ExperimentV2Form,
  reconcileProcessTemperaturePrograms,
  shouldBlockExperimentLeave,
} from './experiment-v2-form'

const api = vi.hoisted(() => ({
  createRun: vi.fn(),
  setSetupReference: vi.fn(),
  upsertModule: vi.fn(),
}))
const navigate = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
const queryClient = vi.hoisted(() => ({
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
}))
const guard = vi.hoisted(() => ({ when: false }))

vi.mock('./api', () => api)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => queryClient,
}))
vi.mock('@/shared/ui/route-leave-guard', () => ({
  RouteLeaveGuard: ({ when }: { when: boolean }) => {
    guard.when = when
    return null
  },
}))
vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({ session: { accessToken: 'token' } }),
}))
vi.mock('sonner', () => ({ toast }))

type SectionProps = {
  save?: ModuleSaveProps
  onChange?: (key: string, value: string) => void
  onSelectSetup?: (entityId: string, entity: V2EntityRead | null) => void
  footer?: ReactNode
}

function sectionStub(moduleKey: string, save?: ModuleSaveProps) {
  return save ? (
    <div>
      <button type="button" onClick={save.onSave}>
        save-{moduleKey}
      </button>
      {save.error ? <span>{save.error}</span> : null}
    </div>
  ) : null
}

vi.mock('./components/basic-info-section', () => ({
  BasicInfoSection: ({ save, onChange, footer }: SectionProps) => (
    <div>
      {sectionStub('basic_info', save)}
      <button type="button" onClick={() => onChange?.('operator', 'changed')}>
        dirty-basic_info
      </button>
      {footer}
    </div>
  ),
}))
vi.mock('./components/target-product-section', () => ({
  TargetProductSection: ({ save }: SectionProps) =>
    sectionStub('target_product', save),
}))
vi.mock('./components/equipment-section', () => ({
  EquipmentSection: ({ save, onSelectSetup }: SectionProps) => (
    <div>
      {sectionStub('equipment', save)}
      <button
        type="button"
        onClick={() =>
          onSelectSetup?.('setup-2', {
            id: 'setup-2',
            latest_version: {
              version: 1,
              data: {
                setup_code: 'SET-2',
                setup_name: 'Second setup',
                zone_count: 2,
              },
            },
          } as unknown as V2EntityRead)
        }
      >
        select-setup-2
      </button>
    </div>
  ),
}))
vi.mock('./components/repeatable-items-section', async () => {
  const actual = await vi.importActual<typeof RepeatableItemsModule>(
    './components/repeatable-items-section',
  )
  return {
    ...actual,
    RepeatableItemsSection: ({
      moduleKey,
      save,
    }: SectionProps & { moduleKey: string }) => sectionStub(moduleKey, save),
  }
})
vi.mock('./components/process-steps-section', () => ({
  ProcessStepsSection: ({ save }: SectionProps) =>
    sectionStub('process_steps', save),
  setupFieldTypes: () => [],
}))
vi.mock('./components/results-section', () => ({ ResultsSection: () => null }))

describe('reconcileProcessTemperaturePrograms', () => {
  it('keeps one temperature program row per selected setup zone', () => {
    const steps = [
      {
        stage_type: 'reaction_conditions',
        temperature_program: JSON.stringify({
          zones: [
            {
              zone_index: 2,
              points: [{ elapsed_min: 0, setpoint_C: 700 }],
            },
            {
              zone_index: 1,
              points: [{ elapsed_min: 0, setpoint_C: 650 }],
            },
            {
              zone_index: 3,
              points: [{ elapsed_min: 0, setpoint_C: 750 }],
            },
          ],
        }),
      },
    ]

    const reconciled = reconcileProcessTemperaturePrograms(steps, {
      zone_count: 2,
    })
    expect(JSON.parse(String(reconciled[0].temperature_program))).toEqual({
      zones: [
        {
          zone_index: 1,
          points: [{ elapsed_min: 0, setpoint_C: 650 }],
        },
        {
          zone_index: 2,
          points: [{ elapsed_min: 0, setpoint_C: 700 }],
        },
      ],
    })
  })
})

function completeState() {
  const precursorLotRef = {
    entity_id: '00000000-0000-4000-8000-000000000001',
    version: 1,
    snapshot: {
      lot_category: 'chemical',
      chemical_formula: 'MoO3',
      attrs: { cas_number: '1313-27-5' },
    },
  }
  const substrateLotRef = {
    entity_id: '00000000-0000-4000-8000-000000000003',
    version: 1,
    snapshot: {
      lot_category: 'substrate',
      chemical_formula: 'Al2O3',
      attrs: {
        substrate_material: 'sapphire_al2o3',
        substrate_orientation_polish: {
          value: 'c-plane',
          option: 'single_side_polished',
        },
        substrate_miscut_angle_deg: 0,
        substrate_surface_roughness: {
          availability: 'reported',
          metric: 'RMS',
          value_nm: 0.2,
        },
      },
    },
  }
  return {
    basic_info: {
      ...emptyModuleValues('basic_info'),
      started_at: '2026-07-11T08:30',
      synthesis_method: 'APCVD',
      operator: 'operator-1',
      run_code: 'RUN-DRAFT',
      ambient_temperature_C: '23',
      ambient_humidity_percent: '45',
      precheck_confirmed: 'true',
    },
    target_product: {
      ...emptyModuleValues('target_product'),
      chemical_formula: 'MoS2',
      structure_type: '本征',
      target_morphology: 'nanoflake',
    },
    components: [],
    equipment: {
      setupId: 'setup-1',
      version: 2,
      snapshot: null,
      tubeUsageHistory: JSON.stringify({
        reset_count: 0,
        use_number_since_reset: 3,
      }),
    },
    precursors: [
      {
        ...emptyModuleValues('precursors'),
        name_formula: 'MoO3',
        phase_state: '气',
        lot_ref: JSON.stringify(precursorLotRef),
      },
    ],
    substrates: [
      {
        ...emptyModuleValues('substrates'),
        material: 'sapphire_al2o3',
        lot_ref: JSON.stringify(substrateLotRef),
        chemical_formula: 'Al2O3',
        orientation_polish_availability: 'reported',
        crystal_orientation: 'c-plane',
        miscut_availability: 'reported',
        miscut_angle_deg: '0',
        miscut_direction: '',
        surface_roughness: JSON.stringify({ metric: 'RMS', value_nm: 0.2 }),
        size_placement: JSON.stringify({
          length_mm: 10,
          width_mm: 10,
          placement: 'face_up',
        }),
      },
    ],
    process_steps: [
      {
        ...emptyModuleValues('process_steps'),
        stage_type: 'preparation',
        preparation_operations: JSON.stringify([
          {
            operation_type: 'pump_down',
            target_absolute_pressure_Pa: 100,
            duration_min: 5,
          },
        ]),
      },
    ],
    process_events: [
      {
        ...emptyModuleValues('process_events'),
        event_id: '00000000-0000-4000-8000-000000000002',
        event_type: 'manual_intervention',
        occurred_at: '2026-07-11T08:35',
        terminated_run: 'false',
        action_taken: 'checked',
      },
    ],
  }
}

function renderForm(
  mode: 'new' | 'edit',
  onProcessDirtyChange?: (dirty: boolean) => void,
  initialState = completeState(),
) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ExperimentV2Form
        mode={mode}
        runId={mode === 'edit' ? 'run-existing' : undefined}
        initialState={initialState}
        onProcessDirtyChange={onProcessDirtyChange}
      />
    </I18nextProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.createRun.mockResolvedValue({ id: 'run-created', run_code: 'RUN-001' })
  api.setSetupReference.mockResolvedValue({})
  api.upsertModule.mockResolvedValue({
    module_key: 'basic_info',
    payload_json: {},
  })
  guard.when = false
})

describe('ExperimentV2Form module saves', () => {
  it('blocks only when dirty and not submitting', () => {
    expect(shouldBlockExperimentLeave(1, false)).toBe(true)
    expect(shouldBlockExperimentLeave(0, false)).toBe(false)
    expect(shouldBlockExperimentLeave(1, true)).toBe(false)
  })
  it.each([
    ['basic_info', { started_at: expect.stringMatching(/^2026-07-11T/) }],
    ['target_product', { chemical_formula: 'MoS2', components: null }],
    [
      'precursors',
      { items: [expect.objectContaining({ name_formula: 'MoO3' })] },
    ],
    [
      'substrates',
      { items: [expect.objectContaining({ material: 'sapphire_al2o3' })] },
    ],
    [
      'process_steps',
      { items: [expect.objectContaining({ stage_type: 'preparation' })] },
    ],
    [
      'process_events',
      {
        items: [
          expect.objectContaining({
            action_taken: 'checked',
            terminated_run: false,
          }),
        ],
      },
    ],
  ])(
    'saves %s to its module endpoint with its payload',
    async (moduleKey, payload) => {
      renderForm('edit')

      fireEvent.click(screen.getByRole('button', { name: `save-${moduleKey}` }))

      await waitFor(() =>
        expect(api.upsertModule).toHaveBeenCalledWith(
          'run-existing',
          moduleKey,
          expect.objectContaining(payload),
          'token',
        ),
      )
      expect(api.setSetupReference).not.toHaveBeenCalled()
    },
  )

  it('saves equipment through setup-reference instead of module upsert', async () => {
    renderForm('edit')

    fireEvent.click(screen.getByRole('button', { name: 'save-equipment' }))

    await waitFor(() =>
      expect(api.setSetupReference).toHaveBeenCalledWith(
        'run-existing',
        'setup-1',
        2,
        { reset_count: 0, use_number_since_reset: 3 },
        'token',
      ),
    )
    expect(api.upsertModule).not.toHaveBeenCalled()
  })

  it('requires tube history again after switching to another setup', async () => {
    renderForm('edit')

    fireEvent.click(screen.getByRole('button', { name: 'select-setup-2' }))
    fireEvent.click(screen.getByRole('button', { name: 'save-equipment' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n.t('validation.usageHistory'),
      ),
    )
    expect(api.setSetupReference).not.toHaveBeenCalled()
  })

  it('saves an old substrate draft from its authoritative lot snapshot', async () => {
    const state = completeState()
    state.substrates[0] = {
      ...state.substrates[0],
      material: 'forged',
      chemical_formula: 'forged',
      orientation_polish_availability: '',
      miscut_availability: '',
      miscut_direction: 'stale direction',
    }
    renderForm('edit', undefined, state)

    fireEvent.click(screen.getByRole('button', { name: 'save-substrates' }))

    await waitFor(() =>
      expect(api.upsertModule).toHaveBeenCalledWith(
        'run-existing',
        'substrates',
        {
          items: [
            expect.objectContaining({
              material: 'sapphire_al2o3',
              chemical_formula: 'Al2O3',
              orientation_polish_availability: 'reported',
              miscut_availability: 'reported',
              miscut_angle_deg: 0,
              miscut_direction: null,
            }),
          ],
        },
        'token',
      ),
    )
  })

  it('shows the failed module error and leaves it unsaved', async () => {
    api.upsertModule.mockRejectedValueOnce(new Error('save failed'))
    renderForm('edit')

    fireEvent.click(screen.getByRole('button', { name: 'save-basic_info' }))

    expect(await screen.findByText('save failed')).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('labels structured invalid fields from metadata', async () => {
    api.upsertModule.mockRejectedValueOnce(
      new HttpError(422, 'invalid', {
        detail: { invalid: [{ key: 'operator', reason: 'bad' }] },
      }),
    )
    renderForm('edit')

    fireEvent.click(screen.getByRole('button', { name: 'save-basic_info' }))

    expect(
      await screen.findByText(
        i18n.t('experimentsV2.form.invalidFields', { fields: '实验人' }),
      ),
    ).toBeInTheDocument()
  })

  it('writes a successful module response into the experiment cache', async () => {
    const response = {
      module_key: 'basic_info',
      payload_json: { operator: 'operator-1' },
    }
    api.upsertModule.mockResolvedValueOnce(response)
    renderForm('edit')

    fireEvent.click(screen.getByRole('button', { name: 'save-basic_info' }))

    await waitFor(() => expect(queryClient.setQueryData).toHaveBeenCalled())
    const updater = queryClient.setQueryData.mock.calls[0][1]
    const cached = updater({ run: { id: 'run-existing' }, modules: {} })
    expect(cached.modules.basic_info).toBe(response)
  })

  it('blocks leaving after an edit and stops blocking after that revision saves', async () => {
    renderForm('edit')
    fireEvent.click(screen.getByRole('button', { name: 'dirty-basic_info' }))
    expect(guard.when).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'save-basic_info' }))
    await waitFor(() => expect(guard.when).toBe(false))
  })

  it('reports process dirtiness to the parent so locking cannot discard edits', async () => {
    const onProcessDirtyChange = vi.fn()
    renderForm('edit', onProcessDirtyChange)

    fireEvent.click(screen.getByRole('button', { name: 'dirty-basic_info' }))
    await waitFor(() =>
      expect(onProcessDirtyChange).toHaveBeenLastCalledWith(true),
    )

    fireEvent.click(screen.getByRole('button', { name: 'save-basic_info' }))
    await waitFor(() =>
      expect(onProcessDirtyChange).toHaveBeenLastCalledWith(false),
    )
  })
})

describe('ExperimentV2Form create and save', () => {
  it('creates a minimal run with an automatic code, then navigates to edit', async () => {
    renderForm('new')

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('experimentsV2.form.createAction'),
      }),
    )

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(api.createRun).toHaveBeenCalledWith(
      {
        started_at: expect.stringMatching(/^2026-07-11T/),
        synthesis_method: 'APCVD',
        ambient_temperature_C: 23,
        ambient_humidity_percent: 45,
        precheck_confirmed: true,
      },
      'token',
    )
    expect(api.setSetupReference).not.toHaveBeenCalled()
    expect(api.upsertModule).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith({
      to: '/experiments/$runId/edit',
      params: { runId: 'run-created' },
    })
  })

  it('stops after a create failure without saving modules or navigating', async () => {
    api.createRun.mockRejectedValueOnce(new Error('create failed'))
    renderForm('new')

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('experimentsV2.form.createAction'),
      }),
    )

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('create failed'),
    )
    expect(api.upsertModule).not.toHaveBeenCalled()
    expect(api.setSetupReference).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})
