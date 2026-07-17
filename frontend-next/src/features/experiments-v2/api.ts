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

// §7 表征 + 实测产物（走各自端点，非模块 payload；均以样品为关联主键）。
export type SampleRead = Schemas['SampleRead']
export type SampleListResponse = Schemas['SampleListResponse']
export type SampleCreate = Schemas['SampleCreate']
export type CharacterizationRecordCreate =
  Schemas['CharacterizationRecordCreate']
export type CharacterizationRecordRead = Schemas['CharacterizationRecordRead']
export type CharacterizationRecordUpdate =
  Schemas['CharacterizationRecordUpdate']
export type CharacterizationRecordListResponse =
  Schemas['CharacterizationRecordListResponse']
export type MeasuredProductCreate = Schemas['MeasuredProductCreate']
export type MeasuredProductRead = Schemas['MeasuredProductRead']
export type MeasuredProductUpdate = Schemas['MeasuredProductUpdate']
export type MeasuredProductListResponse = Schemas['MeasuredProductListResponse']
export type V2ResultWrite = Schemas['V2ResultWrite']
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

const BASE = '/api/v1/experiments'
const V2 = '/api/v1'

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
    query.set('material_system', filters.materialSystem.trim())
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

export function downloadRunExport(runId: string, token: string) {
  return apiDownload(`${BASE}/${runId}/export`, { token })
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
  return apiRequest<V2ExperimentRead>(`${BASE}/${runId}/${action}`, {
    method: 'POST',
    body: reason === undefined ? undefined : { reason },
    token,
  })
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
  token: string,
) {
  return apiRequest<V2ExperimentRead>(`${BASE}/${runId}/setup-reference`, {
    method: 'PUT',
    body: { setup_id: setupId, version } satisfies V2SetupReferenceRequest,
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

export function createSample(
  runId: string,
  payload: SampleCreate,
  token: string,
) {
  return apiRequest<SampleRead>(`/api/v1/experiments/${runId}/samples`, {
    method: 'POST',
    body: payload,
    token,
  })
}

// ── 样品结果：用户层统一契约，底层仍由表征记录 + 实测产物组成 ──
export function listResults(sampleId: string, token: string) {
  return apiRequest<V2ResultListResponse>(`${V2}/samples/${sampleId}/results`, {
    token,
  })
}

export function createResult(
  sampleId: string,
  payload: V2ResultWrite,
  token: string,
) {
  return apiRequest<V2ResultRead>(`${V2}/samples/${sampleId}/results`, {
    method: 'POST',
    body: payload,
    token,
  })
}

export function updateResult(
  resultId: string,
  payload: V2ResultWrite,
  token: string,
) {
  return apiRequest<V2ResultRead>(`${V2}/results/${resultId}`, {
    method: 'PUT',
    body: payload,
    token,
  })
}

export function deleteResult(resultId: string, token: string) {
  return apiRequest<void>(`${V2}/results/${resultId}`, {
    method: 'DELETE',
    token,
  })
}

// ── §7 表征记录（走 characterization-records 端点，FK→样品） ──
export function listCharacterizationRecords(runId: string, token: string) {
  return apiRequest<CharacterizationRecordListResponse>(
    `${BASE}/${runId}/characterization-records`,
    { token },
  )
}

export function createCharacterizationRecord(
  runId: string,
  payload: CharacterizationRecordCreate,
  token: string,
) {
  return apiRequest<CharacterizationRecordRead>(
    `${BASE}/${runId}/characterization-records`,
    { method: 'POST', body: payload, token },
  )
}

export function deleteCharacterizationRecord(recordId: string, token: string) {
  return apiRequest<void>(`${V2}/characterization-records/${recordId}`, {
    method: 'DELETE',
    token,
  })
}

export function updateCharacterizationRecord(
  recordId: string,
  payload: CharacterizationRecordUpdate,
  token: string,
) {
  return apiRequest<CharacterizationRecordRead>(
    `${V2}/characterization-records/${recordId}`,
    { method: 'PATCH', body: payload, token },
  )
}

// ── §7 实测产物（走 measured-products 端点，FK→样品） ──
export function listMeasuredProducts(sampleId: string, token: string) {
  return apiRequest<MeasuredProductListResponse>(
    `${V2}/samples/${sampleId}/measured-products`,
    { token },
  )
}

export function createMeasuredProduct(
  sampleId: string,
  payload: MeasuredProductCreate,
  token: string,
) {
  return apiRequest<MeasuredProductRead>(
    `${V2}/samples/${sampleId}/measured-products`,
    { method: 'POST', body: payload, token },
  )
}

export function deleteMeasuredProduct(productId: string, token: string) {
  return apiRequest<void>(`${V2}/measured-products/${productId}`, {
    method: 'DELETE',
    token,
  })
}

export function updateMeasuredProduct(
  productId: string,
  payload: MeasuredProductUpdate,
  token: string,
) {
  return apiRequest<MeasuredProductRead>(
    `${V2}/measured-products/${productId}`,
    {
      method: 'PATCH',
      body: payload,
      token,
    },
  )
}
