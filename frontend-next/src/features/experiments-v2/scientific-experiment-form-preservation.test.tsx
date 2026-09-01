import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ScientificExperimentForm } from './scientific-experiment-form'

const api = vi.hoisted(() => ({
  listContributors: vi.fn(),
  upsertModule: vi.fn(),
}))

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal()),
  ...api,
}))
vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({
    session: {
      accessToken: 'token',
      currentUser: {
        id: 'user-1',
        name: '张俊杰',
        email: 'zhang@example.com',
      },
    },
  }),
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('./simple-form-adapters', async (importOriginal) => ({
  ...(await importOriginal()),
  simpleGrowthIssue: () => null,
  simpleProcessEventsIssue: () => null,
}))
vi.mock('./simple-preparation-editors', async (importOriginal) => ({
  ...(await importOriginal()),
  SimpleSourceLoadsEditor: ({
    showErrors,
    onChange,
  }: {
    showErrors: boolean
    onChange: (value: unknown[]) => void
  }) => (
    <div>
      {showErrors ? <span>前驱体错误已显示</span> : null}
      <button type="button" onClick={() => onChange([])}>
        修改前驱体
      </button>
    </div>
  ),
  SimpleGrowthEditor: ({
    segments,
    channels,
    onTimelineChange,
  }: {
    segments: unknown[]
    channels: unknown[]
    onTimelineChange: (segments: unknown[], channels: unknown[]) => void
  }) => (
    <button type="button" onClick={() => onTimelineChange(segments, channels)}>
      修改生长条件
    </button>
  ),
}))

describe('scientific process payload preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listContributors.mockResolvedValue([])
    api.upsertModule.mockResolvedValue({})
  })

  it('编辑保存时保留旧过程段与隐藏兼容字段', async () => {
    const user = userEvent.setup()
    const segments = [
      {
        segment_key: 'legacy_reaction',
        segment_type: 'reaction',
        sequence: 1,
        start_s: 0,
        end_s: 600,
      },
    ]
    const postReactionOperations = [
      { operation_type: 'gas_switch', duration_min: 5 },
    ]
    const externalFields = ['plasma']
    const fieldParams = [
      {
        field_type: 'plasma',
        start_min: 0,
        end_min: 10,
        parameters: [],
      },
    ]
    const processPayload = {
      segments,
      channels: [
        {
          channel_key: 'gas_ar',
          channel_type: 'flow',
          source_type: 'setpoint',
          subject_type: 'gas_species',
          subject_ref: 'Ar',
          subject_instance_ref: 'MFC-1',
          gas_species_code: 'Ar',
          unit: 'sccm',
          data_kind: 'scalar',
          scalar_value: 100,
        },
      ],
      pressure_regime: 'atmospheric',
      cooling_method: 'furnace_cooling',
      process_events_confirmed: false,
      preparation_operations: [],
      reaction_timer_origin: 'other',
      reaction_timer_origin_other: '打开硫源阀门',
      post_reaction_operations: postReactionOperations,
      external_fields: externalFields,
      field_params: fieldParams,
    }
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ScientificExperimentForm
          mode="edit"
          runId="run-1"
          runCode="CVD-2026-0001"
          runStatus="draft"
          initialState={{
            equipment: {
              setupId: '',
              version: null,
              snapshot: null,
              tubeUsageHistory: '',
            },
            substrates: [],
          }}
          focusModule="process_steps"
          modules={{
            process_steps: {
              id: 'module-1',
              experiment_run_id: 'run-1',
              module_key: 'process_steps',
              schema_version: 'v4.0-alpha.17',
              payload_json: processPayload,
              created_at: '2026-08-01T00:00:00Z',
              updated_at: '2026-08-01T00:00:00Z',
            },
          }}
        />
      </QueryClientProvider>,
    )

    await user.click(
      await screen.findByRole('button', { name: '修改生长条件' }),
    )
    await user.click(screen.getByRole('button', { name: '仅保存' }))

    await waitFor(() => expect(api.upsertModule).toHaveBeenCalledOnce())
    const savedPayload = api.upsertModule.mock.calls[0]?.[2]
    expect(savedPayload).toMatchObject({
      segments,
      process_events_confirmed: false,
      reaction_timer_origin: 'other',
      reaction_timer_origin_other: '打开硫源阀门',
      post_reaction_operations: postReactionOperations,
      external_fields: externalFields,
      field_params: fieldParams,
    })
  })

  it('编辑前驱体后立即清除旧错误', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ScientificExperimentForm
          mode="edit"
          runId="run-1"
          runCode="CVD-2026-0001"
          runStatus="draft"
          initialState={{
            equipment: {
              setupId: '',
              version: null,
              snapshot: null,
              tubeUsageHistory: '',
            },
            substrates: [],
          }}
          focusModule="precursors"
        />
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', { name: '修改前驱体' }))
    await user.click(screen.getByRole('button', { name: '仅保存' }))
    expect(screen.getByText('前驱体错误已显示')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '修改前驱体' }))
    expect(screen.queryByText('前驱体错误已显示')).not.toBeInTheDocument()
  })
})
