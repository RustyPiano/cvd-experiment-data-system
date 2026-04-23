import { apiDownload, apiRequest } from "../../shared/api/client";
import type {
  AuditEventListResponse,
  ControlledVocabularyListResponse,
  ExperimentCreateRequest,
  ExperimentExportRead,
  ExperimentInvalidateRequest,
  ExperimentModuleKey,
  ExperimentModulePayloadListResponse,
  ExperimentModulePayloadRead,
  ExperimentModulePayloadUpsertRequest,
  ExperimentListResponse,
  ExperimentRead,
  ExperimentUpdateRequest,
  FileAssetListResponse,
  FileAssetRead,
  SampleListResponse,
} from "../../shared/types/api";

type ListExperimentFilesFilters = {
  experimentId: string;
  fileCategory?: string | null;
  method?: string | null;
  sampleId?: string | null;
};

type UploadExperimentFileInput = {
  file: File;
  fileCategory: string;
  method: string;
  note?: string;
  sampleId?: string | null;
};

function buildQueryString(params: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : "";
}

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

export function listExperimentAuditEvents(token: string, experimentId: string) {
  return apiRequest<AuditEventListResponse>(`/api/v1/experiments/${experimentId}/audit-events`, {
    token,
  });
}

export function listExperimentFiles(token: string, filters: ListExperimentFilesFilters) {
  return apiRequest<FileAssetListResponse>(
    `/api/v1/files${buildQueryString({
      experiment_id: filters.experimentId,
      file_category: filters.fileCategory ?? null,
      method: filters.method ?? null,
      sample_id: filters.sampleId ?? null,
    })}`,
    {
      token,
    },
  );
}

export function uploadExperimentFile(
  token: string,
  experimentId: string,
  payload: UploadExperimentFileInput,
) {
  const formData = new FormData();
  formData.set("file", payload.file);
  formData.set("method", payload.method);
  formData.set("file_category", payload.fileCategory);
  if (payload.note) {
    formData.set("note", payload.note);
  }
  if (payload.sampleId) {
    formData.set("sample_id", payload.sampleId);
  }

  return apiRequest<FileAssetRead>(`/api/v1/experiments/${experimentId}/files`, {
    method: "POST",
    body: formData,
    token,
  });
}

export function deleteExperimentFile(token: string, fileId: string) {
  return apiRequest<void>(`/api/v1/files/${fileId}`, {
    method: "DELETE",
    token,
  });
}

export function downloadExperimentFile(token: string, fileId: string) {
  return apiDownload(`/api/v1/files/${fileId}/download`, {
    token,
  });
}

export function downloadExperimentExcel(token: string, experimentId: string) {
  return apiDownload(`/api/v1/experiments/${experimentId}/export/excel`, {
    token,
  });
}

export function exportExperimentJson(token: string, experimentId: string) {
  return apiRequest<ExperimentExportRead>(`/api/v1/experiments/${experimentId}/export/json`, {
    token,
  });
}

export function listExperimentSamples(token: string, experimentId: string) {
  return apiRequest<SampleListResponse>(
    `/api/v1/samples${buildQueryString({
      experiment_id: experimentId,
    })}`,
    {
      token,
    },
  );
}

export function listActiveVocabularies(token: string, vocabKey: string) {
  return apiRequest<ControlledVocabularyListResponse>(
    `/api/v1/vocabularies${buildQueryString({ vocab_key: vocabKey })}`,
    {
      token,
    },
  );
}
