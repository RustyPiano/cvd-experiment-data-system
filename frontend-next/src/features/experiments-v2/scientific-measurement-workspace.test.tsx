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

vi.mock('./api', () => api)
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

describe('ScientificMeasurementWorkspace', () => {
  beforeEach(() => vi.clearAllMocks())

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
})
