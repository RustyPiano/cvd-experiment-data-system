import { apiDownload, apiRequest } from '@/shared/api/client'
import type {
  AuditEventListResponse,
  ControlledVocabularyListResponse,
  ControlledVocabularyRead,
  ExperimentCreateRequest,
  ExperimentExportRead,
  ExperimentInvalidateRequest,
  ExperimentModuleKey,
  ExperimentModulePayloadListResponse,
  ExperimentModulePayloadRead,
  ExperimentModulePayloadUpsertRequest,
  ExperimentValidationResponse,
  ExperimentListResponse,
  ExperimentRead,
  ExperimentUpdateRequest,
  FileAssetListResponse,
  FileAssetRead,
  RecipeRead,
  SampleListResponse,
  SetupMethodsMutationResponse,
  SetupMethodsRead,
  SetupMethodsUpsertRequest,
} from '@/shared/types/api'

type ListExperimentFilesFilters = {
  experimentId: string
  fileCategory?: string | null
  method?: string | null
  sampleId?: string | null
  assetRole?: 'characterization_file' | 'setup_diagram' | null
}

export type ExperimentSortField =
  | 'run_code'
  | 'material_system'
  | 'experiment_date'
  | 'status'
  | 'updated_at'

export type ListExperimentsFilters = {
  mine?: boolean
  status?: string[]
  materialSystem?: string | null
  owner?: string | null
  q?: string | null
  page?: number
  pageSize?: number
  sortBy?: ExperimentSortField | null
  sortOrder?: 'asc' | 'desc' | null
}

type UploadExperimentFileInput = {
  file: File
  fileCategory: string
  method?: string
  assetRole?: 'characterization_file' | 'setup_diagram'
  note?: string
  sampleId?: string | null
  signal?: AbortSignal
}

function buildQueryString(
  params: Record<string, string | number | boolean | null | undefined>,
) {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value))
    }
  }

  const serialized = searchParams.toString()
  return serialized ? `?${serialized}` : ''
}

export function listExperiments(
  token: string,
  filters: ListExperimentsFilters = {},
) {
  return apiRequest<ExperimentListResponse>(
    `/api/v1/experiments${buildQueryString({
      mine: filters.mine ? 'true' : null,
      status: filters.status?.length ? filters.status.join(',') : null,
      material_system: filters.materialSystem ?? null,
      owner_id: filters.owner ?? null,
      q: filters.q ?? null,
      page: filters.page ?? null,
      page_size: filters.pageSize ?? null,
      sort_by: filters.sortBy ?? null,
      sort_order: filters.sortOrder ?? null,
    })}`,
    {
      token,
    },
  )
}

export function createExperiment(
  token: string,
  payload: ExperimentCreateRequest,
) {
  return apiRequest<ExperimentRead>('/api/v1/experiments', {
    method: 'POST',
    body: payload,
    token,
  })
}

export function createExperimentFromRecipe(
  accessToken: string,
  data: { recipe_id: string; experiment_date?: string; objective?: string },
): Promise<ExperimentRead> {
  return apiRequest<ExperimentRead>('/api/v1/experiments/from-recipe', {
    method: 'POST',
    body: data,
    token: accessToken,
  })
}

export function saveExperimentAsRecipe(
  accessToken: string,
  experimentId: string,
  data: { name: string; description?: string },
): Promise<RecipeRead> {
  return apiRequest<RecipeRead>(
    `/api/v1/experiments/${experimentId}/save-as-recipe`,
    {
      method: 'POST',
      body: data,
      token: accessToken,
    },
  )
}

export function getExperiment(token: string, experimentId: string) {
  return apiRequest<ExperimentRead>(`/api/v1/experiments/${experimentId}`, {
    token,
  })
}

export function updateExperiment(
  token: string,
  experimentId: string,
  payload: ExperimentUpdateRequest,
) {
  return apiRequest<ExperimentRead>(`/api/v1/experiments/${experimentId}`, {
    method: 'PATCH',
    body: payload,
    token,
  })
}

export function listExperimentModules(token: string, experimentId: string) {
  return apiRequest<ExperimentModulePayloadListResponse>(
    `/api/v1/experiments/${experimentId}/modules`,
    {
      token,
    },
  )
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
      method: 'PUT',
      body: payload,
      token,
    },
  )
}

export function getSetupMethods(token: string, experimentId: string) {
  return apiRequest<SetupMethodsRead>(
    `/api/v1/experiments/${experimentId}/setup-methods`,
    {
      token,
    },
  )
}

export function upsertSetupMethods(
  token: string,
  experimentId: string,
  payload: SetupMethodsUpsertRequest,
) {
  return apiRequest<SetupMethodsMutationResponse>(
    `/api/v1/experiments/${experimentId}/setup-methods`,
    {
      method: 'PUT',
      body: payload,
      token,
    },
  )
}

export function confirmSetupMethods(token: string, experimentId: string) {
  return apiRequest<SetupMethodsMutationResponse>(
    `/api/v1/experiments/${experimentId}/setup-methods/confirm`,
    {
      method: 'POST',
      token,
    },
  )
}

export function createSetupMethodsFromLibrary(
  token: string,
  experimentId: string,
  setupLibraryId: string,
) {
  return apiRequest<SetupMethodsMutationResponse>(
    `/api/v1/experiments/${experimentId}/setup-methods/from-library`,
    {
      method: 'POST',
      body: {
        setup_library_id: setupLibraryId,
      },
      token,
    },
  )
}

export function submitExperiment(token: string, experimentId: string) {
  return apiRequest<ExperimentRead>(
    `/api/v1/experiments/${experimentId}/submit`,
    {
      method: 'POST',
      token,
    },
  )
}

export function validateExperiment(token: string, experimentId: string) {
  return apiRequest<ExperimentValidationResponse>(
    `/api/v1/experiments/${experimentId}/validate`,
    {
      method: 'POST',
      token,
    },
  )
}

export function returnExperimentToDraft(token: string, experimentId: string) {
  return apiRequest<ExperimentRead>(
    `/api/v1/experiments/${experimentId}/return-to-draft`,
    {
      method: 'POST',
      token,
    },
  )
}

export function lockExperiment(token: string, experimentId: string) {
  return apiRequest<ExperimentRead>(
    `/api/v1/experiments/${experimentId}/lock`,
    {
      method: 'POST',
      token,
    },
  )
}

export function invalidateExperiment(
  token: string,
  experimentId: string,
  payload: ExperimentInvalidateRequest,
) {
  return apiRequest<ExperimentRead>(
    `/api/v1/experiments/${experimentId}/invalidate`,
    {
      method: 'POST',
      body: payload,
      token,
    },
  )
}

export function cloneExperiment(token: string, experimentId: string) {
  return apiRequest<ExperimentRead>(
    `/api/v1/experiments/${experimentId}/clone`,
    {
      method: 'POST',
      token,
    },
  )
}

export function listExperimentAuditEvents(token: string, experimentId: string) {
  return apiRequest<AuditEventListResponse>(
    `/api/v1/experiments/${experimentId}/audit-events`,
    {
      token,
    },
  )
}

export function listExperimentFiles(
  token: string,
  filters: ListExperimentFilesFilters,
) {
  return apiRequest<FileAssetListResponse>(
    `/api/v1/files${buildQueryString({
      experiment_id: filters.experimentId,
      file_category: filters.fileCategory ?? null,
      method: filters.method ?? null,
      sample_id: filters.sampleId ?? null,
      asset_role: filters.assetRole ?? null,
    })}`,
    {
      token,
    },
  )
}

export function uploadExperimentFile(
  token: string,
  experimentId: string,
  payload: UploadExperimentFileInput,
) {
  const formData = new FormData()
  formData.set('file', payload.file)
  formData.set('file_category', payload.fileCategory)
  if (payload.method) {
    formData.set('method', payload.method)
  }
  if (payload.assetRole) {
    formData.set('asset_role', payload.assetRole)
  }
  if (payload.note) {
    formData.set('note', payload.note)
  }
  if (payload.sampleId) {
    formData.set('sample_id', payload.sampleId)
  }

  return apiRequest<FileAssetRead>(
    `/api/v1/experiments/${experimentId}/files`,
    {
      method: 'POST',
      body: formData,
      signal: payload.signal,
      token,
    },
  )
}

export function deleteExperimentFile(token: string, fileId: string) {
  return apiRequest<void>(`/api/v1/files/${fileId}`, {
    method: 'DELETE',
    token,
  })
}

export function downloadExperimentFile(token: string, fileId: string) {
  return apiDownload(`/api/v1/files/${fileId}/download`, {
    token,
  })
}

export function downloadExperimentExcel(token: string, experimentId: string) {
  return apiDownload(`/api/v1/experiments/${experimentId}/export/excel`, {
    token,
  })
}

export function exportExperimentJson(token: string, experimentId: string) {
  return apiRequest<ExperimentExportRead>(
    `/api/v1/experiments/${experimentId}/export/json`,
    {
      token,
    },
  )
}

export function listExperimentSamples(token: string, experimentId: string) {
  return apiRequest<SampleListResponse>(
    `/api/v1/samples${buildQueryString({
      experiment_id: experimentId,
    })}`,
    {
      token,
    },
  )
}

export function listActiveVocabularies(token: string, vocabKey: string) {
  return apiRequest<ControlledVocabularyListResponse>(
    `/api/v1/vocabularies${buildQueryString({ vocab_key: vocabKey })}`,
    {
      token,
    },
  )
}

/**
 * Contribute a user-typed value to a shared, user-extendable vocabulary
 * (e.g. a material brand). Idempotent on the server: an existing value is
 * returned as-is. Returns the canonical vocabulary entry.
 */
export function createVocabularyValue(
  token: string,
  payload: { vocab_key: string; value: string },
) {
  return apiRequest<ControlledVocabularyRead>(`/api/v1/vocabularies`, {
    method: 'POST',
    body: payload,
    token,
  })
}

export type ExperimentVersionSummary = {
  id: string
  version_number: number
  change_note: string | null
  created_by_id: string
  created_by_name: string | null
  created_at: string
}

export type ExperimentVersionRead = ExperimentVersionSummary & {
  snapshot_json: Record<string, unknown>
}

export type ExperimentVersionListResponse = {
  items: ExperimentVersionSummary[]
  total: number
}

export function listExperimentVersions(token: string, experimentId: string) {
  return apiRequest<ExperimentVersionListResponse>(
    `/api/v1/experiments/${experimentId}/versions`,
    { token },
  )
}

export function getExperimentVersion(
  token: string,
  experimentId: string,
  versionNumber: number,
) {
  return apiRequest<ExperimentVersionRead>(
    `/api/v1/experiments/${experimentId}/versions/${versionNumber}`,
    { token },
  )
}

export function saveExperimentVersion(
  token: string,
  experimentId: string,
  payload: { change_note?: string | null },
) {
  return apiRequest<ExperimentRead>(
    `/api/v1/experiments/${experimentId}/versions`,
    {
      method: 'POST',
      body: payload,
      token,
    },
  )
}

export function restoreExperimentVersion(
  token: string,
  experimentId: string,
  versionNumber: number,
) {
  return apiRequest<ExperimentRead>(
    `/api/v1/experiments/${experimentId}/versions/${versionNumber}/restore`,
    {
      method: 'POST',
      token,
    },
  )
}

export type ImportProfileInfo = {
  key: string
  display_name: string
  description: string | null
}

export type ImportProfileListResponse = { profiles: ImportProfileInfo[] }

export type ParsedExperimentDraft = {
  source_row: number
  run_level: Record<string, unknown>
  module_payloads: Record<string, Record<string, unknown>>
  warnings: string[]
}

export type ImportPreviewResponse = {
  profile_key: string
  drafts: ParsedExperimentDraft[]
  global_warnings: string[]
}

export type ImportCommitResultItem = {
  source_row: number
  experiment_id: string
  run_code: string
}

export type ImportCommitResponse = { created: ImportCommitResultItem[] }

export function listImportProfiles(token: string) {
  return apiRequest<ImportProfileListResponse>('/api/v1/imports/profiles', {
    token,
  })
}

export function previewImport(token: string, file: File, profileKey: string) {
  const formData = new FormData()
  formData.set('file', file)
  formData.set('profile_key', profileKey)
  return apiRequest<ImportPreviewResponse>('/api/v1/imports/preview', {
    method: 'POST',
    body: formData,
    token,
  })
}

export function commitImport(
  token: string,
  payload: { profile_key: string; drafts: ParsedExperimentDraft[] },
) {
  return apiRequest<ImportCommitResponse>('/api/v1/imports/commit', {
    method: 'POST',
    body: payload,
    token,
  })
}
