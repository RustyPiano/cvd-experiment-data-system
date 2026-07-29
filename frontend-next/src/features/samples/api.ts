import { apiDownload, apiRequest } from '@/shared/api/client'
import { HttpError } from '@/shared/api/http-error'
import type {
  FileAssetRead,
  FileAssetListResponse,
  SampleListResponse,
  SampleRead,
} from '@/shared/types/api'
import type { components } from '@/shared/types/openapi'

type V2ExperimentRead = components['schemas']['V2ExperimentRead']
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

/** Lists all samples visible to the current user (across experiments). */
export function listSamples(token: string, role?: string | null) {
  const qs = role ? `?role=${encodeURIComponent(role)}` : ''
  return apiRequest<SampleListResponse>(`/api/v1/samples${qs}`, { token })
}

export function getSample(token: string, sampleId: string) {
  return apiRequest<SampleRead>(`/api/v1/samples/${sampleId}`, {
    token,
  })
}

export type SampleLineage = {
  samples: Array<{
    id: string
    sample_code: string
    role: string
    actual_state: string
    actual_material_summary: string | null
    lifecycle_state: string
  }>
  transformations: Array<{
    id: string
    transformation_type: string
    occurred_at: string
    operator_id: string
    input_sample_ids: string[]
    output_sample_ids: string[]
  }>
}

export function getSampleLineage(token: string, sampleId: string) {
  return apiRequest<SampleLineage>(`/api/v1/samples/${sampleId}/lineage`, {
    token,
  })
}

export function getExperiment(token: string, runId: string) {
  return apiRequest<V2ExperimentRead>(`/api/v1/experiments/${runId}`, { token })
}

export function listExperimentFiles(
  token: string,
  filters: {
    experimentId?: string
    sampleId?: string
    characterizationRecordId?: string
    assetRole?: string
    bindingType?: string
    bindingId?: string
  },
) {
  const query = new URLSearchParams()
  if (filters.experimentId) query.set('experiment_id', filters.experimentId)
  if (filters.sampleId) query.set('sample_id', filters.sampleId)
  if (filters.characterizationRecordId) {
    query.set('characterization_record_id', filters.characterizationRecordId)
  }
  if (filters.assetRole) query.set('asset_role', filters.assetRole)
  if (filters.bindingType) query.set('binding_type', filters.bindingType)
  if (filters.bindingId) query.set('binding_id', filters.bindingId)
  return apiRequest<FileAssetListResponse>(`/api/v1/files?${query}`, { token })
}

export function getExperimentFile(token: string, fileId: string) {
  return apiRequest<FileAssetRead>(`/api/v1/files/${fileId}`, { token })
}

export function uploadExperimentFile(
  token: string,
  experimentId: string,
  payload: {
    file: File
    method?: string
    sampleId?: string
    characterizationRecordId?: string
    assetRole?: string
    bindingType?: string
    bindingId?: string
  },
) {
  if (payload.file.size > MAX_UPLOAD_BYTES) {
    const detail = `Uploaded file exceeds ${MAX_UPLOAD_BYTES} bytes`
    return Promise.reject(new HttpError(413, detail, { detail }))
  }
  const body = new FormData()
  body.set('file', payload.file)
  if (payload.method) body.set('method', payload.method)
  if (payload.sampleId) body.set('sample_id', payload.sampleId)
  if (payload.characterizationRecordId) {
    body.set('characterization_record_id', payload.characterizationRecordId)
  }
  if (payload.assetRole) body.set('asset_role', payload.assetRole)
  if (payload.bindingType) body.set('binding_type', payload.bindingType)
  if (payload.bindingId) body.set('binding_id', payload.bindingId)
  return apiRequest<FileAssetRead>(
    `/api/v1/experiments/${experimentId}/files`,
    { method: 'POST', body, token },
  )
}

export function deleteExperimentFile(token: string, fileId: string) {
  return apiRequest<void>(`/api/v1/files/${fileId}`, {
    method: 'DELETE',
    token,
  })
}

export function downloadExperimentFile(token: string, fileId: string) {
  return apiDownload(`/api/v1/files/${fileId}/download`, { token })
}
