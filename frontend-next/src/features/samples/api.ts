import { apiDownload, apiRequest } from '@/shared/api/client'
import type {
  FileAssetRead,
  FileAssetListResponse,
  SampleListResponse,
  SampleRead,
  SampleUpdateRequest,
} from '@/shared/types/api'
import type { components } from '@/shared/types/openapi'

type V2ExperimentRead = components['schemas']['V2ExperimentRead']

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

export function updateSample(
  token: string,
  sampleId: string,
  payload: SampleUpdateRequest,
) {
  return apiRequest<SampleRead>(`/api/v1/samples/${sampleId}`, {
    method: 'PATCH',
    body: payload,
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
  },
) {
  const query = new URLSearchParams()
  if (filters.experimentId) query.set('experiment_id', filters.experimentId)
  if (filters.sampleId) query.set('sample_id', filters.sampleId)
  if (filters.characterizationRecordId) {
    query.set(
      'characterization_record_id',
      filters.characterizationRecordId,
    )
  }
  return apiRequest<FileAssetListResponse>(`/api/v1/files?${query}`, { token })
}

export function uploadExperimentFile(
  token: string,
  experimentId: string,
  payload: {
    file: File
    method: string
    characterizationRecordId: string
  },
) {
  const body = new FormData()
  body.set('file', payload.file)
  body.set('method', payload.method)
  body.set('characterization_record_id', payload.characterizationRecordId)
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
