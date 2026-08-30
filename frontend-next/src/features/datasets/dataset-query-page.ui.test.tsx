import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { DatasetQueryPage } from './dataset-query-page'

const api = vi.hoisted(() => ({ queryDataset: vi.fn() }))

vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({ session: { accessToken: 'token' } }),
}))
vi.mock('@/features/experiments-v2/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  queryDataset: api.queryDataset,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

const page = (cursor: string | null, suffix: string) => ({
  items: [
    {
      run_revision_id: `revision-${suffix}`,
      run_id: `run-${suffix}`,
      run_code: `RUN-${suffix}`,
      revision_number: 1,
      target_formulas: ['MoS₂'],
      provenance_complete: true,
      locked_at: '2026-08-30T12:00:00Z',
    },
  ],
  next_cursor: cursor,
  query_manifest: {
    query_sha256: 'abcdef1234567890',
    schema_version: 'v4',
    run_revision_ids: [`revision-${suffix}`],
  },
})

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <DatasetQueryPage />
    </QueryClientProvider>,
  )
}

describe('DatasetQueryPage pagination snapshot', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gives every filter control an ordinal accessible name', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(
      screen.getByRole('combobox', {
        name: '第 1 个筛选条件的字段',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', {
        name: '第 1 个筛选条件的运算符',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: '第 1 个筛选条件的值' }),
    ).toHaveAttribute('maxlength', '255')
    expect(
      screen.getByRole('button', { name: '删除第 1 个筛选条件' }),
    ).toBeDisabled()

    await user.click(
      screen.getByRole('combobox', {
        name: '第 1 个筛选条件的字段',
      }),
    )
    await user.click(screen.getByRole('option', { name: '实测属性' }))
    expect(
      screen.getByRole('combobox', {
        name: '第 1 个筛选条件的实测属性',
      }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '添加条件' }))
    expect(
      screen.getByRole('button', { name: '删除第 2 个筛选条件' }),
    ).toBeEnabled()
    await user.click(
      screen.getByRole('combobox', {
        name: '第 2 个筛选条件的字段',
      }),
    )
    await user.click(screen.getByRole('option', { name: '是否有过程事件' }))
    expect(
      screen.getByRole('combobox', { name: '第 2 个筛选条件的值' }),
    ).toBeInTheDocument()
  })

  it('reuses the normalized first-query filters when loading another page', async () => {
    api.queryDataset
      .mockResolvedValueOnce(page('cursor-a', 'A'))
      .mockResolvedValueOnce(page(null, 'B'))
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByPlaceholderText('值'), ' MoS2 ')
    await user.click(screen.getByRole('button', { name: '构建数据集' }))
    await user.click(await screen.findByRole('button', { name: '加载更多' }))

    await waitFor(() => expect(api.queryDataset).toHaveBeenCalledTimes(2))
    expect(api.queryDataset.mock.calls[0]).toEqual([
      [{ field: 'target_formula', operator: 'contains', value: 'MoS2' }],
      'token',
      undefined,
    ])
    expect(api.queryDataset.mock.calls[1]).toEqual([
      [{ field: 'target_formula', operator: 'contains', value: 'MoS2' }],
      'token',
      'cursor-a',
    ])
  })

  it('clears results and the old cursor as soon as a filter is edited', async () => {
    api.queryDataset.mockResolvedValueOnce(page('cursor-a', 'A'))
    const user = userEvent.setup()
    renderPage()
    const value = screen.getByPlaceholderText('值')
    await user.type(value, 'MoS2')
    await user.click(screen.getByRole('button', { name: '构建数据集' }))
    expect(await screen.findByText('RUN-A')).toBeInTheDocument()

    await user.type(value, 'x')

    expect(screen.queryByText('RUN-A')).toBeNull()
    expect(screen.queryByRole('button', { name: '加载更多' })).toBeNull()
  })
})
