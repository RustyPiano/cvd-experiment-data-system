import { apiRequest } from "../../shared/api/client";
import type {
  ExperimentCreateRequest,
  ExperimentInvalidateRequest,
  ExperimentModuleKey,
  ExperimentModulePayloadListResponse,
  ExperimentModulePayloadRead,
  ExperimentModulePayloadUpsertRequest,
  ExperimentListResponse,
  ExperimentRead,
  ExperimentUpdateRequest,
} from "../../shared/types/api";

export function listExperiments(token: string) {
  return apiRequest<ExperimentListResponse>("/api/v1/experiments", {
    token,
  });
}

export function createExperiment(token: string, payload: ExperimentCreateRequest) {
  return apiRequest<ExperimentRead>("/api/v1/experiments", {
    method: "POST",
    body: payload,
    token,
  });
}

export function getExperiment(token: string, experimentId: string) {
  return apiRequest<ExperimentRead>(`/api/v1/experiments/${experimentId}`, {
    token,
  });
}

export function updateExperiment(
  token: string,
  experimentId: string,
  payload: ExperimentUpdateRequest,
) {
  return apiRequest<ExperimentRead>(`/api/v1/experiments/${experimentId}`, {
    method: "PATCH",
    body: payload,
    token,
  });
}

export function listExperimentModules(token: string, experimentId: string) {
  return apiRequest<ExperimentModulePayloadListResponse>(
    `/api/v1/experiments/${experimentId}/modules`,
    {
      token,
    },
  );
}

export function upsertExperimentModule(
  token: string,
  experimentId: string,
  moduleKey: ExperimentModuleKey,
  payload: ExperimentModulePayloadUpsertRequest,
) {
  return apiRequest<ExperimentModulePayloadRead>(
    `/api/v1/experiments/${experimentId}/modules/${moduleKey}`,
    {
      method: "PUT",
      body: payload,
      token,
    },
  );
}

export function submitExperiment(token: string, experimentId: string) {
  return apiRequest<ExperimentRead>(`/api/v1/experiments/${experimentId}/submit`, {
    method: "POST",
    token,
  });
}

export function returnExperimentToDraft(token: string, experimentId: string) {
  return apiRequest<ExperimentRead>(`/api/v1/experiments/${experimentId}/return-to-draft`, {
    method: "POST",
    token,
  });
}

export function lockExperiment(token: string, experimentId: string) {
  return apiRequest<ExperimentRead>(`/api/v1/experiments/${experimentId}/lock`, {
    method: "POST",
    token,
  });
}

export function invalidateExperiment(
  token: string,
  experimentId: string,
  payload: ExperimentInvalidateRequest,
) {
  return apiRequest<ExperimentRead>(`/api/v1/experiments/${experimentId}/invalidate`, {
    method: "POST",
    body: payload,
    token,
  });
}

export function cloneExperiment(token: string, experimentId: string) {
  return apiRequest<ExperimentRead>(`/api/v1/experiments/${experimentId}/clone`, {
    method: "POST",
    token,
  });
}
