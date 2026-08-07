import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import i18n from '@/shared/i18n'
import { SampleDetailPage } from './sample-detail-page'

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
  getExperiment: vi.fn(),
  getSample: vi.fn(),
}))
vi.mock('@/features/experiments-v2/api', () => ({
  listMeasurements: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'experiments') {
      return {
        data: { run_code: 'CVD-2026-0001' },
        isLoading: false,
        isError: false,
      }
    }
    if (queryKey[0] === 'measurements') {
      return {
        data: {
          items: [
            {
              id: 'measurement-1',
              method_profile: 'Raman',
              measured_at: '2026-07-29T12:00:00Z',
              raw_file_count: 1,
              property_count: 2,
              assertion_count: 1,
            },
          ],
        },
        isLoading: false,
        isError: false,
      }
    }
    return {
      data: {
        id: 'sample-1',
        experiment_run_id: 'run-1',
        sample_code: 'CVD-2026-0001-S01',
        run_code: 'CVD-2026-0001',
        target_material_system: 'MoS₂',
        actual_state: 'growth_present',
        actual_material_summary: '2H-MoS₂',
        source_substrate_snapshot_json: {
          material: 'sio2_si',
          zone_thermocouple_distance_mm: {
            zone_index: 1,
            distance_mm: 12,
          },
          face_orientation: 'face_up',
          note: '边缘有少量沉积',
          size_placement: {
            length_mm: 10,
            width_mm: 10,
            thickness_mm: 0.5,
            placement: 'face_up',
          },
          pretreatment_steps: [
            { type: 'other', other_name: '丙酮与异丙醇清洗' },
          ],
          lot_ref: {
            snapshot: { batch_number: 'SUB-DEMO-01' },
          },
        },
        metadata_json: {},
      },
      isLoading: false,
      isError: false,
    }
  },
}))

beforeEach(async () => {
  await i18n.changeLanguage('zh')
})

describe('sample detail product view', () => {
  it('shows sample facts, substrate, conclusions, records, and note', () => {
    render(<SampleDetailPage />)

    expect(screen.getAllByText('CVD-2026-0001-S01')).not.toHaveLength(0)
    expect(screen.getByText('CVD-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('观察到生长')).toBeInTheDocument()
    expect(screen.getByText('MoS₂')).toBeInTheDocument()
    expect(screen.getByText('2H-MoS₂')).toBeInTheDocument()
    expect(screen.getByText('SUB-DEMO-01')).toBeInTheDocument()
    expect(screen.getByText('10 × 10 × 0.5 mm')).toBeInTheDocument()
    expect(screen.getByText('温区 1；相对热电偶 +12 mm')).toBeInTheDocument()
    expect(screen.getByText('朝上')).toBeInTheDocument()
    expect(screen.getByText('丙酮与异丙醇清洗')).toBeInTheDocument()
    expect(screen.getByText('已有表征记录')).toBeInTheDocument()
    expect(screen.getByText('Raman')).toBeInTheDocument()
    expect(screen.getByText('边缘有少量沉积')).toBeInTheDocument()
  })

  it('does not expose lineage, transformations, revision ids, or schema data', () => {
    render(<SampleDetailPage />)

    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(
      /谱系|样品转化|生命周期|run_revision_id|revision|schema|hash/,
    )
  })
})
