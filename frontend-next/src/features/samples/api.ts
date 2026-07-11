import { apiDownload, apiRequest } from '@/shared/api/client'
import type {
  ExperimentStatus,
  FileAssetListResponse,
  SampleListResponse,
  SampleRead,
  SampleUpdateRequest,
} from '@/shared/types/api'
import type { components } from '@/shared/types/openapi'

type V2ExperimentRead = Omit<
  components['schemas']['V2ExperimentRead'],
  'status'
> & { status: ExperimentStatus }

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
  filters: { experimentId: string; sampleId: string },
) {
  const query = new URLSearchParams({
    experiment_id: filters.experimentId,
    sample_id: filters.sampleId,
  })
  return apiRequest<FileAssetListResponse>(`/api/v1/files?${query}`, { token })
}

export function downloadExperimentFile(token: string, fileId: string) {
  return apiDownload(`/api/v1/files/${fileId}/download`, { token })
}
