import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { HttpError } from '@/shared/api/http-error'
import { emptyModuleValues } from './field-logic'
import type { ModuleSaveProps } from './form-types'
import {
  ExperimentV2Form,
  shouldBlockExperimentLeave,
} from './experiment-v2-form'

const api = vi.hoisted(() => ({
  createRun: vi.fn(),
  setSetupReference: vi.fn(),
  upsertModule: vi.fn(),
}))
const navigate = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
const queryClient = vi.hoisted(() => ({ setQueryData: vi.fn() }))
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
  BasicInfoSection: ({ save, onChange }: SectionProps) => (
    <div>
      {sectionStub('basic_info', save)}
      <button type="button" onClick={() => onChange?.('operator', 'changed')}>
        dirty-basic_info
      </button>
    </div>
  ),
}))
vi.mock('./components/target-product-section', () => ({
  TargetProductSection: ({ save }: SectionProps) =>
    sectionStub('target_product', save),
}))
vi.mock('./components/equipment-section', () => ({
  EquipmentSection: ({ save }: SectionProps) => sectionStub('equipment', save),
}))
vi.mock('./components/repeatable-items-section', () => ({
  RepeatableItemsSection: ({
    moduleKey,
    save,
  }: SectionProps & { moduleKey: string }) => sectionStub(moduleKey, save),
}))
vi.mock('./components/process-steps-section', () => ({
  ProcessStepsSection: ({ save }: SectionProps) =>
    sectionStub('process_steps', save),
}))
vi.mock('./components/pvd-section', () => ({
  PvdSection: ({ save }: SectionProps) => sectionStub('pvd', save),
}))
vi.mock('./components/results-section', () => ({ ResultsSection: () => null }))

function completeState() {
  return {
    basic_info: {
      ...emptyModuleValues('basic_info'),
      started_at: '2026-07-11T08:30',
      synthesis_method: 'PVD-磁控溅射',
      operator: 'operator-1',
      run_code: 'RUN-DRAFT',
    },
    target_product: {
      ...emptyModuleValues('target_product'),
      chemical_formula: 'MoS2',
      structure_type: '本征',
    },
    components: [],
    equipment: {
      setupId: 'setup-1',
      version: 2,
      snapshot: null,
    },
    precursors: [
      {
        ...emptyModuleValues('precursors'),
        name_formula: 'MoO3',
        phase_state: '气',
      },
    ],
    substrates: [{ ...emptyModuleValues('substrates'), material: 'h-BN' }],
    process_steps: [
      { ...emptyModuleValues('process_steps'), stage_type: '卸样' },
    ],
    process_events: [
      {
        ...emptyModuleValues('process_events'),
        description_action: 'checked',
      },
    ],
    pvd: {
      ...emptyModuleValues('pvd'),
      target_lot_ref: 'lot-1',
      target_substrate_distance_mm: '50',
      power_bias: '100 W',
      plasma_gas_pressure: 'Ar, 1 Pa',
      presputter_shutter: '5 min',
      deposition_rate_nm_s: '0.2',
    },
  }
}

function renderForm(mode: 'new' | 'edit') {
  return render(
    <I18nextProvider i18n={i18n}>
      <ExperimentV2Form
        mode={mode}
        runId={mode === 'edit' ? 'run-existing' : undefined}
        initialState={completeState()}
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
    ['substrates', { items: [expect.objectContaining({ material: 'h-BN' })] }],
    [
      'process_steps',
      { items: [expect.objectContaining({ stage_type: '卸样' })] },
    ],
    [
      'process_events',
      { items: [expect.objectContaining({ description_action: 'checked' })] },
    ],
    ['pvd', { target_lot_ref: 'lot-1', deposition_rate_nm_s: '0.2' }],
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
        'token',
      ),
    )
    expect(api.upsertModule).not.toHaveBeenCalled()
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
})

describe('ExperimentV2Form create and save', () => {
  it('creates the run, saves every active module, then navigates to edit', async () => {
    renderForm('new')

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('experimentsV2.form.createAction'),
      }),
    )

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(api.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        synthesis_method: 'PVD-磁控溅射',
        operator: 'operator-1',
        run_code: 'RUN-DRAFT',
        chemical_formula: 'MoS2',
      }),
      'token',
    )
    expect(api.setSetupReference).toHaveBeenCalledWith(
      'run-created',
      'setup-1',
      2,
      'token',
    )
    expect(api.upsertModule.mock.calls.map((call) => call[1])).toEqual([
      'basic_info',
      'target_product',
      'precursors',
      'substrates',
      'process_steps',
      'process_events',
      'pvd',
    ])
    expect(api.upsertModule).toHaveBeenCalledWith(
      'run-created',
      'basic_info',
      expect.objectContaining({ run_code: 'RUN-001' }),
      'token',
    )
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

  it('navigates to the created run after a partial module save failure', async () => {
    api.upsertModule.mockImplementation(
      async (_runId: string, moduleKey: string) => {
        if (moduleKey === 'target_product')
          throw new Error('module save failed')
        return {}
      },
    )
    renderForm('new')

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('experimentsV2.form.createAction'),
      }),
    )

    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(api.upsertModule.mock.calls.map((call) => call[1])).toEqual([
      'basic_info',
      'target_product',
    ])
    expect(api.setSetupReference).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      i18n.t('experimentsV2.form.partialCreateError'),
    )
    expect(navigate).toHaveBeenCalledWith({
      to: '/experiments/$runId/edit',
      params: { runId: 'run-created' },
    })
  })
})
