import { apiRequest } from '@/shared/api/client'
import type {
  SampleListResponse,
  SampleRead,
  SampleUpdateRequest,
} from '@/shared/types/api'

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
