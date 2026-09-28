import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('基本信息仅提示实际错误，温湿度留空不报漏填', async () => {
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
            substratePlacementRelations: [],
          }}
          modules={{}}
        />
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByLabelText(/开始时间/), {
      target: { value: '' },
    })
    await user.click(screen.getByRole('button', { name: '仅保存' }))
    expect(
      screen.getAllByText('请选择有效的开始时间。').length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText(/有效的温湿度/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('实验室温度（℃）')).not.toHaveAttribute(
      'aria-invalid',
    )
    expect(screen.getByLabelText('实验室相对湿度（%RH）')).not.toHaveAttribute(
      'aria-invalid',
    )
    expect(api.upsertModule).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/开始时间/), {
      target: { value: '2026-09-04T10:00' },
    })
    fireEvent.change(screen.getByLabelText('实验室相对湿度（%RH）'), {
      target: { value: '101' },
    })
    await user.click(screen.getByRole('button', { name: '仅保存' }))
    expect(
      screen.getAllByText('请填写 0–100 之间的相对湿度。').length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText('请选择有效的开始时间。')).not.toBeInTheDocument()
    expect(api.upsertModule).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('实验室相对湿度（%RH）'), {
      target: { value: '' },
    })
    await user.click(screen.getByRole('button', { name: '仅保存' }))
    await waitFor(() => expect(api.upsertModule).toHaveBeenCalledOnce())
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
            substratePlacementRelations: [],
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
