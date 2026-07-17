import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import i18n from '@/shared/i18n'
import { SampleDetailPage } from './sample-detail-page'

let sampleData: Record<string, unknown> = {}
const parentSampleData = {
  id: 'parent-sample-1',
  sample_code: 'CVD-2026-0001-S01',
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="#test">{children}</a>
  ),
  getRouteApi: () => ({ useParams: () => ({ sampleId: 'sample-1' }) }),
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
vi.mock('./api', () => ({
  downloadExperimentFile: vi.fn(),
  getExperiment: vi.fn(),
  getSample: vi.fn(),
  listExperimentFiles: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'experiments') {
      return {
        data: {
          id: 'run-1',
          owner_id: 'owner-1',
          run_code: 'CVD-2026-0001',
          status: 'locked',
        },
        isLoading: false,
        isError: false,
      }
    }
    if (queryKey[1] === 'files') {
      return {
        data: { items: [] },
        isLoading: false,
        isError: false,
      }
    }
    if (queryKey[1] === 'parent') {
      return {
        data: parentSampleData,
        isLoading: false,
        isError: false,
      }
    }
    return {
      data: sampleData,
      isLoading: false,
      isError: false,
    }
  },
}))

beforeEach(async () => {
  await i18n.changeLanguage('zh')
  sampleData = {
    id: 'sample-1',
    experiment_run_id: 'run-1',
    sample_code: 'CVD-2026-0001-S01',
    role: 'growth',
    material_system: 'MoS2',
    parent_sample_id: null,
    source_substrate_snapshot_json: {
      material: 'SiO₂/Si',
      oxide_thickness_nm: 285,
      source_id: 'internal-id-must-not-render',
    },
    metadata_json: { raw: 'must not render' },
  }
})

describe('structured sample provenance', () => {
  it('renders substrate fields structurally without exposing internal JSON', () => {
    render(<SampleDetailPage />)

    expect(screen.getByText('来源与谱系')).toBeInTheDocument()
    expect(screen.getByText('SiO₂/Si')).toBeInTheDocument()
    expect(screen.getByText('285')).toBeInTheDocument()
    expect(screen.queryByText('元数据 JSON')).not.toBeInTheDocument()
    expect(
      screen.queryByText(/internal-id-must-not-render/),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/must not render/)).not.toBeInTheDocument()
  })

  it('shows derived-sample lineage as a parent sample link', () => {
    sampleData = {
      ...sampleData,
      role: 'derived',
      parent_sample_id: 'parent-sample-1',
      source_substrate_snapshot_json: null,
    }

    render(<SampleDetailPage />)

    expect(screen.getByText('父样品')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'CVD-2026-0001-S01' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('parent-sample-1')).not.toBeInTheDocument()
  })

  it('shows an explicit empty provenance message for control samples', () => {
    sampleData = {
      ...sampleData,
      role: 'control',
      source_substrate_snapshot_json: null,
    }

    render(<SampleDetailPage />)

    expect(
      screen.getByText('该样品没有衬底来源或父样品记录。'),
    ).toBeInTheDocument()
  })
})
