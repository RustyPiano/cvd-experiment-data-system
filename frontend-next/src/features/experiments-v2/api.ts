// v2 实验 API（P3 端点，契约见 backend/app/api/v1/endpoints/v2.py）。
// 类型走 OpenAPI 生成物的逃生舱别名。实体库列表（setups / material_lots）复用
// entity-library 的 listEntities，不重复实现。
import { apiDownload, apiRequest } from '@/shared/api/client'
import { HttpError } from '@/shared/api/http-error'
import type { components } from '@/shared/types/openapi'

type Schemas = components['schemas']

export type V2ExperimentCreate = Schemas['V2ExperimentCreate']
export type V2ExperimentRead = Schemas['V2ExperimentRead']
export type V2ExperimentListResponse = Schemas['V2ExperimentListResponse']
export type V2ModulePayloadRead = Schemas['V2ModulePayloadRead']
export type V2SetupReferenceRequest = Schemas['V2SetupReferenceRequest']
export type TubeUsageHistoryPayload = Schemas['TubeUsageHistoryPayload']

// §7 表征 + 实测产物（走各自端点，非模块 payload；均以样品为关联主键）。
export type SampleRead = Schemas['SampleRead']
export type SampleListResponse = Schemas['SampleListResponse']
export type V2ResultRead = Schemas['V2ResultRead']
export type V2ResultListResponse = Schemas['V2ResultListResponse']

export type RunFilters = {
  query?: string
  materialSystem?: string
  operator?: string
  dateFrom?: string
  dateTo?: string
  statuses?: V2ExperimentRead['status'][]
}

export type V2RunAuditEventRead = Schemas['V2RunAuditEventRead']
export type V2RunAuditEventListResponse = Schemas['V2RunAuditEventListResponse']

export type MeasurementBundleCreate = Schemas['MeasurementBundleCreate']
export type MeasurementSummary = Schemas['MeasurementSummaryRead']
export type MeasurementDetail = Schemas['MeasurementDetailRead']
export type MeasurementListResponse = Schemas['MeasurementListResponse']
export type MeasurementPropertyQuality = NonNullable<
  Schemas['PropertyValueWrite']['quality_flag']
>
export type MeasurementQuality = NonNullable<
  Schemas['MeasurementRunCreate']['quality_flag']
>

export type RunRevision = {
  id: string
  experiment_run_id: string
  revision_number: number
  supersedes_revision_id: string | null
  schema_version: string
  schema_status: string
  status: 'locked' | 'reviewed' | 'superseded'
  content_sha256: string
  correction_reason: string | null
  locked_at: string
  reviewed_at: string | null
}

export type DatasetFilter = {
  field: string
  operator: string
  value: unknown
  property_code?: string
}

export type DatasetQueryResponse = {
  items: Array<{
    run_id: string
    run_revision_id: string
    run_code: string
    revision_number: number
    locked_at: string
    target_formulas: string[]
    features: Record<string, unknown>
    provenance_complete: boolean
  }>
  next_cursor: string | null
  query_manifest: Record<string, unknown>
}

export type ContainerInstance = {
  id: string
  material_lot_id: string
  material_lot_version: number
  container_code: string
  status: string
}
export type Contributor = {
  id: string
  name: string
  email: string
  role: string
}

const BASE = '/api/v1/experiments'
const V2 = '/api/v1'

export function listContributors(token: string) {
  return apiRequest<Contributor[]>(`${V2}/contributors`, { token })
}

export function createRun(payload: V2ExperimentCreate, token: string) {
  return apiRequest<V2ExperimentRead>(BASE, {
    method: 'POST',
    body: payload,
    token,
  })
}

export function listRuns(
  token: string,
  {
    page,
    pageSize,
    filters = {},
  }: { page: number; pageSize: number; filters?: RunFilters },
) {
  const queryParams = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  appendRunFilters(queryParams, filters)
  return apiRequest<V2ExperimentListResponse>(`${BASE}?${queryParams}`, {
    token,
  })
}

function appendRunFilters(query: URLSearchParams, filters: RunFilters) {
  if (filters.query?.trim()) query.set('query', filters.query.trim())
  if (filters.materialSystem?.trim())
    query.set('target_material_system', filters.materialSystem.trim())
  if (filters.operator?.trim()) query.set('operator', filters.operator.trim())
  if (filters.dateFrom) query.set('date_from', filters.dateFrom)
  if (filters.dateTo) query.set('date_to', filters.dateTo)
  for (const status of filters.statuses ?? []) query.append('status', status)
}

export function getRun(runId: string, token: string) {
  return apiRequest<V2ExperimentRead>(`${BASE}/${runId}`, { token })
}

export function listRunAuditEvents(runId: string, token: string) {
  return apiRequest<V2RunAuditEventListResponse>(
    `${BASE}/${runId}/audit-events`,
    { token },
  )
}

export function downloadRunExport(
  runId: string,
  revisionId: string,
  token: string,
) {
  return apiDownload(
    `${BASE}/${runId}/export?revision_id=${encodeURIComponent(revisionId)}`,
    { token },
  )
}

export function downloadRunsExport(filters: RunFilters, token: string) {
  const query = new URLSearchParams()
  appendRunFilters(query, filters)
  const suffix = query.size ? `?${query}` : ''
  return apiDownload(`${V2}/exports/runs${suffix}`, { token })
}

export function transitionRun(
  runId: string,
  action: string,
  token: string,
  reason?: string,
) {
  if (action === 'unlock') {
    return createCorrectionDraft(
      runId,
      reason?.trim() || '修正已锁定科学记录',
      token,
    )
  }
  return apiRequest<V2ExperimentRead>(`${BASE}/${runId}/${action}`, {
    method: 'POST',
    body: reason === undefined ? undefined : { reason },
    token,
  })
}

export function listRunRevisions(runId: string, token: string) {
  return apiRequest<{ items: RunRevision[]; total: number }>(
    `${BASE}/${runId}/revisions`,
    { token },
  )
}

export function reviewRun(runId: string, note: string, token: string) {
  return apiRequest<RunRevision>(`${BASE}/${runId}/review`, {
    method: 'POST',
    body: { note: note.trim() || null },
    token,
  })
}

export function createCorrectionDraft(
  runId: string,
  reason: string,
  token: string,
) {
  return apiRequest<V2ExperimentRead>(`${BASE}/${runId}/correction-drafts`, {
    method: 'POST',
    body: { reason },
    token,
  })
}

export function listMeasurements(
  token: string,
  filters: {
    runId?: string
    sampleId?: string
    cursor?: string
    includeHistory?: boolean
  } = {},
) {
  const query = new URLSearchParams({ limit: '100' })
  if (filters.runId) query.set('run_id', filters.runId)
  if (filters.sampleId) query.set('sample_id', filters.sampleId)
  if (filters.cursor) query.set('cursor', filters.cursor)
  if (filters.includeHistory) query.set('include_history', 'true')
  return apiRequest<MeasurementListResponse>(`/api/v1/measurements?${query}`, {
    token,
  })
}

export async function listAllMeasurements(
  token: string,
  filters: Omit<Parameters<typeof listMeasurements>[1], 'cursor'> = {},
): Promise<MeasurementListResponse> {
  const items: MeasurementSummary[] = []
  const cursors = new Set<string>()
  let cursor: string | undefined

  do {
    const page = await listMeasurements(token, { ...filters, cursor })
    items.push(...page.items)
    if (!page.next_cursor) {
      if (items.length < page.total) {
        throw new Error('表征记录分页提前结束，无法完整加载。')
      }
      break
    }
    if (cursors.has(page.next_cursor)) {
      throw new Error('表征记录分页游标重复，无法完整加载。')
    }
    cursors.add(page.next_cursor)
    cursor = page.next_cursor
  } while (cursor)

  return { items, total: items.length, next_cursor: null }
}

export function createMeasurement(
  payload: MeasurementBundleCreate,
  token: string,
) {
  return apiRequest<MeasurementSummary>('/api/v1/measurements', {
    method: 'POST',
    body: payload,
    token,
  })
}

export function getMeasurement(measurementId: string, token: string) {
  return apiRequest<MeasurementDetail>(
    `/api/v1/measurements/${measurementId}`,
    { token },
  )
}

export function invalidateMeasurement(
  measurementId: string,
  reason: string,
  token: string,
) {
  return apiRequest<MeasurementDetail>(
    `/api/v1/measurements/${measurementId}/invalidate`,
    {
      method: 'POST',
      body: { reason },
      token,
    },
  )
}

export function createTransformation(
  payload: Record<string, unknown>,
  token: string,
) {
  return apiRequest<{
    id: string
    output_experiment_run_id: string
    transformation_type: string
    input_sample_ids: string[]
    output_sample_ids: string[]
  }>('/api/v1/transformations', {
    method: 'POST',
    body: payload,
    token,
  })
}

export function queryDataset(
  filters: DatasetFilter[],
  token: string,
  cursor?: string,
) {
  return apiRequest<DatasetQueryResponse>('/api/v1/datasets/query', {
    method: 'POST',
    body: { filters, limit: 100, ...(cursor ? { cursor } : {}) },
    token,
  })
}

export function listContainerInstances(token: string, materialLotId?: string) {
  const query = materialLotId
    ? `?material_lot_id=${encodeURIComponent(materialLotId)}`
    : ''
  return apiRequest<ContainerInstance[]>(
    `/api/v1/container-instances${query}`,
    { token },
  )
}

export function setNotCharacterized(
  runId: string,
  confirmed: boolean,
  token: string,
) {
  return apiRequest<V2ExperimentRead>(`${BASE}/${runId}/not-characterized`, {
    method: 'PUT',
    body: { confirmed },
    token,
  })
}

/** 逐模块 payload upsert（PUT /experiments/{run}/modules/{module}）。 */
export function upsertModule(
  runId: string,
  moduleKey: string,
  payloadJson: Record<string, unknown>,
  token: string,
) {
  return apiRequest<V2ModulePayloadRead>(
    `${BASE}/${runId}/modules/${moduleKey}`,
    {
      method: 'PUT',
      body: { payload_json: payloadJson },
      token,
    },
  )
}

/** 读单模块 payload；未保存过（404）时返回 null。 */
export async function getModuleOrNull(
  runId: string,
  moduleKey: string,
  token: string,
): Promise<V2ModulePayloadRead | null> {
  try {
    return await apiRequest<V2ModulePayloadRead>(
      `${BASE}/${runId}/modules/${moduleKey}`,
      { token },
    )
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null
    throw error
  }
}

/**
 * §2 装置引用：写引用即由后端冻结快照并回填 equipment 模块（只读投影，随引用冻结）。
 * 前端不直接 upsert equipment 模块——投影字段来自被引用 Setup 版本。
 */
export function setSetupReference(
  runId: string,
  setupId: string,
  version: number,
  tubeUsageHistory: TubeUsageHistoryPayload,
  token: string,
) {
  return apiRequest<V2ExperimentRead>(`${BASE}/${runId}/setup-reference`, {
    method: 'PUT',
    body: {
      setup_id: setupId,
      version,
      tube_usage_history: tubeUsageHistory,
    } satisfies V2SetupReferenceRequest,
    token,
  })
}

// ── §7 样品（表征/实测均需样品关联主键） ──
export function listSamples(runId: string, token: string) {
  return apiRequest<SampleListResponse>(
    `/api/v1/samples?experiment_id=${encodeURIComponent(runId)}`,
    { token },
  )
}

// 历史结果只读；v4 写入统一走 MeasurementRun。
export function listResults(sampleId: string, token: string) {
  return apiRequest<V2ResultListResponse>(`${V2}/samples/${sampleId}/results`, {
    token,
  })
}
