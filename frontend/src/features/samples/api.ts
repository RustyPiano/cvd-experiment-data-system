import { apiRequest } from "../../shared/api/client";
import type { SampleRead, SampleUpdateRequest } from "../../shared/types/api";

export function getSample(token: string, sampleId: string) {
  return apiRequest<SampleRead>(`/api/v1/samples/${sampleId}`, {
    token,
  });
}

export function updateSample(token: string, sampleId: string, payload: SampleUpdateRequest) {
  return apiRequest<SampleRead>(`/api/v1/samples/${sampleId}`, {
    method: "PATCH",
    body: payload,
    token,
  });
}
