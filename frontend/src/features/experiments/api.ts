import { apiRequest } from "../../shared/api/client";
import type {
  ExperimentCreateRequest,
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
