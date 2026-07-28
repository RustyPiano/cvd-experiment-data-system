import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import i18n from '@/shared/i18n'
import { SampleDetailPage } from './sample-detail-page'

let sampleData: Record<string, unknown> = {}
let fileData: Record<string, unknown>[] = []
const parentSampleData = {
  id: 'parent-sample-1',
  sample_code: 'CVD-2026-0001-S01',
}
const frozenSubstrateSnapshot = {
  material: 'sapphire_al2o3',
  lot_ref: {
    entity_id: '2de609d4-82d7-4ccf-867d-73526a2f8acf',
    version: 3,
    snapshot: {
      entity_id: '2de609d4-82d7-4ccf-867d-73526a2f8acf',
      version: 3,
      lot_category: 'substrate',
      substance_name: 'High-purity sapphire wafer',
      chemical_formula: 'Al2O3',
      batch_number: 'LOT-SAP-01',
      attrs: {
        supplier: 'Crystal Supplier',
        catalog_number: 'SAP-2IN',
        internal_note: 'lot-internal-must-not-render',
      },
      schema_version: 'internal-schema-must-not-render',
    },
  },
  chemical_formula: 'Al2O3',
  crystal_orientation: 'c-plane',
  surface_roughness: {
    metric: 'RMS',
    value_nm: 0.42,
    debug_value: 'roughness-internal-must-not-render',
  },
  size_placement: {
    length_mm: 10,
    width_mm: 8,
    thickness_mm: 0.5,
    placement: 'tilted',
    tilt_angle_deg: 12,
    snapshot_id: 'placement-internal-must-not-render',
  },
  pretreatment_steps: [
    {
      type: 'plasma_treatment',
      parameters: {
        power_W: 50,
        gas_species: 'Ar',
        duration_min: 5,
        pressure_Pa: 10,
        private_debug: 'treatment-internal-must-not-render',
      },
      entity_id: 'pretreatment-internal-must-not-render',
    },
  ],
  zone_thermocouple_distance_mm: {
    zone_index: 2,
    distance_mm: 15,
    schema: 'zone-internal-must-not-render',
  },
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
  createTransformation: vi.fn(),
  downloadExperimentFile: vi.fn(),
  getExperiment: vi.fn(),
  getSample: vi.fn(),
  getSampleLineage: vi.fn(),
  listExperimentFiles: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
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
        data: { items: fileData },
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
    if (queryKey[1] === 'lineage') {
      return {
        data: { samples: [], transformations: [] },
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
  fileData = []
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

  it('renders frozen lot and nested substrate values with named Chinese labels', () => {
    sampleData = {
      ...sampleData,
      source_substrate_snapshot_json: frozenSubstrateSnapshot,
    }

    render(<SampleDetailPage />)

    expect(
      screen.getByText(/物料名称（按标签）：High-purity sapphire wafer/),
    ).toHaveTextContent('生产批号：LOT-SAP-01')
    expect(
      screen.getByText(/物料名称（按标签）：High-purity sapphire wafer/),
    ).toHaveTextContent('冻结版本：v3')
    expect(screen.getByText(/粗糙度指标：RMS/)).toHaveTextContent(
      '粗糙度数值（nm）：0.42',
    )
    expect(screen.getByText(/长度（mm）：10/)).toHaveTextContent(
      '放置方式：倾角',
    )
    expect(screen.getByText(/长度（mm）：10/)).toHaveTextContent(
      '倾斜角度（°）：12',
    )
    expect(screen.getByText(/处理方式：等离子体/)).toHaveTextContent(
      '功率（W）：50',
    )
    expect(screen.getByText(/温区编号：2/)).toHaveTextContent(
      '相对热电偶位置（mm）：15',
    )

    const pageText = document.body.textContent ?? ''
    expect(pageText).not.toMatch(
      /entity_id|snapshot|schema_version|value_nm|length_mm|placement:|internal-must-not-render/,
    )
    expect(pageText).not.toContain('2de609d4-82d7-4ccf-867d-73526a2f8acf')
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

  it('localizes array values, methods, and file categories in English', async () => {
    await i18n.changeLanguage('en')
    sampleData = {
      ...sampleData,
      source_substrate_snapshot_json: {
        material: 'SiO₂/Si',
        pretreatment_steps: ['清洗', '退火'],
      },
    }
    fileData = [
      {
        id: 'file-1',
        original_name: 'optical.png',
        method: '光镜',
        file_category: 'raw',
        size_bytes: 512,
        created_at: '2026-07-17T12:00:00Z',
        note: null,
      },
    ]

    render(<SampleDetailPage />)

    expect(screen.getByText('Clean · Anneal')).toBeInTheDocument()
    expect(screen.getByText('Optical microscopy')).toBeInTheDocument()
    expect(screen.getByText('Raw')).toBeInTheDocument()
    expect(screen.queryByText('光镜')).not.toBeInTheDocument()
  })

  it('renders frozen lot and nested substrate values with named English labels', async () => {
    await i18n.changeLanguage('en')
    sampleData = {
      ...sampleData,
      source_substrate_snapshot_json: frozenSubstrateSnapshot,
    }

    render(<SampleDetailPage />)

    expect(
      screen.getByText(/Substance name: High-purity sapphire wafer/),
    ).toHaveTextContent('Production batch number: LOT-SAP-01')
    expect(
      screen.getByText(/Substance name: High-purity sapphire wafer/),
    ).toHaveTextContent('Frozen version: v3')
    expect(screen.getByText(/Roughness metric: RMS/)).toHaveTextContent(
      'Roughness value (nm): 0.42',
    )
    expect(screen.getByText(/Length \(mm\): 10/)).toHaveTextContent(
      'Placement: Tilted',
    )
    expect(screen.getByText(/Length \(mm\): 10/)).toHaveTextContent(
      'Tilt angle (°): 12',
    )
    expect(
      screen.getByText(/Treatment type: Plasma treatment/),
    ).toHaveTextContent('Power (W): 50')
    expect(screen.getByText(/Zone number: 2/)).toHaveTextContent(
      'Position relative to thermocouple (mm): 15',
    )

    const pageText = document.body.textContent ?? ''
    expect(pageText).not.toMatch(
      /entity_id|snapshot|schema_version|value_nm|length_mm|placement:|internal-must-not-render/,
    )
    expect(pageText).not.toContain('2de609d4-82d7-4ccf-867d-73526a2f8acf')
  })
})
