import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { SampleListPage } from './sample-list-page'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="#test">{children}</a>
  ),
}))
vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({
    session: {
      accessToken: 'token',
      currentUser: { id: 'owner-1', role: 'member' },
      isAuthenticated: true,
    },
  }),
}))
vi.mock('./api', () => ({ listSamples: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      items: [
        {
          id: 'sample-1',
          sample_code: 'CVD-2026-0001-S01',
          experiment_run_id: 'run-1',
          run_code: 'CVD-2026-0001',
          target_material_system: 'MoS₂',
          actual_state: 'growth_present',
          actual_material_summary: '2H-MoS₂',
          characterization_count: 3,
          source_substrate_snapshot_json: {
            material: 'sio2_si',
            lot_ref: { snapshot: { batch_number: 'SUB-DEMO-01' } },
          },
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

describe('sample list product view', () => {
  it('renders only the experiment-facing columns', () => {
    render(<SampleListPage />)

    for (const heading of [
      '样品编号',
      '来源实验',
      '衬底',
      '目标材料',
      '实际结果',
      '表征记录',
      '操作',
    ]) {
      expect(
        screen.getByRole('columnheader', { name: heading }),
      ).toBeInTheDocument()
    }
    expect(screen.getByText(/SUB-DEMO-01/)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/角色|生命周期|更新时间|修订/)
  })
})
