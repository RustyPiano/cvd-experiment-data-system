import { apiDownload, apiRequest } from '@/shared/api/client'
import type {
  SetupLibraryCreateRequest,
  SetupLibraryListResponse,
  SetupLibraryRead,
  SetupLibraryUpdateRequest,
} from '@/shared/types/api'

export function listSetupLibrary(token: string) {
  return apiRequest<SetupLibraryListResponse>('/api/v1/setup-library', {
    token,
  })
}

export function getSetupLibraryEntry(token: string, entryId: string) {
  return apiRequest<SetupLibraryRead>(`/api/v1/setup-library/${entryId}`, {
    token,
  })
}

export function createSetupLibraryEntry(
  token: string,
  payload: SetupLibraryCreateRequest,
) {
  return apiRequest<SetupLibraryRead>('/api/v1/setup-library', {
    method: 'POST',
    body: payload,
    token,
  })
}

export function updateSetupLibraryEntry(
  token: string,
  entryId: string,
  payload: SetupLibraryUpdateRequest,
) {
  return apiRequest<SetupLibraryRead>(`/api/v1/setup-library/${entryId}`, {
    method: 'PATCH',
    body: payload,
    token,
  })
}

export function deactivateSetupLibraryEntry(token: string, entryId: string) {
  return apiRequest<void>(`/api/v1/setup-library/${entryId}`, {
    method: 'DELETE',
    token,
  })
}

export function uploadSetupLibraryDiagram(
  token: string,
  entryId: string,
  file: File,
) {
  const formData = new FormData()
  formData.set('file', file)

  return apiRequest<SetupLibraryRead>(
    `/api/v1/setup-library/${entryId}/diagram`,
    {
      method: 'POST',
      body: formData,
      token,
    },
  )
}

export function downloadSetupLibraryDiagram(token: string, entryId: string) {
  return apiDownload(`/api/v1/setup-library/${entryId}/diagram`, {
    token,
  })
}
