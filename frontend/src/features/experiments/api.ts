import { apiRequest } from "../../shared/api/client";
import type {
  ExperimentCreateRequest,
  ExperimentListResponse,
  ExperimentRead,
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
