import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { SimpleExperimentCreateForm } from './simple-experiment-create-form'

const api = vi.hoisted(() => ({
  createRun: vi.fn(),
  listContributors: vi.fn(),
}))
vi.mock('./api', () => api)
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
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SimpleExperimentCreateForm />
      </QueryClientProvider>
    </I18nextProvider>,
  )
}

describe('SimpleExperimentCreateForm', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('zh')
    api.listContributors.mockResolvedValue([
      {
        id: 'user-1',
        name: '张俊杰',
        email: 'zhang@example.com',
        role: 'member',
      },
    ])
  })

  it('shows only the four experiment-start fields', async () => {
    renderForm()

    expect(screen.getByLabelText(/^开始时间/)).toBeInTheDocument()
    expect(screen.getByText(/^实验人员/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^实验室温度（℃）/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^实验室相对湿度（%RH）/)).toBeInTheDocument()
    expect(await screen.findByText('张俊杰')).toBeInTheDocument()

    for (const removed of [
      '目标材料',
      '本炉研究目的',
      '环境温度来源',
      '环境读取时间',
      '传感器编号',
      '已完成实验前检查',
    ]) {
      expect(screen.queryByText(removed)).not.toBeInTheDocument()
    }
  })
})
