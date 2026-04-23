import { apiRequest } from "../../shared/api/client";
import type {
  ControlledVocabularyCreateRequest,
  ControlledVocabularyListResponse,
  ControlledVocabularyRead,
  ControlledVocabularyUpdateRequest,
} from "../../shared/types/api";

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

export function listAdminVocabularies(token: string, vocabKey?: string | null) {
  return apiRequest<ControlledVocabularyListResponse>(
    `/api/v1/admin/vocabularies${buildQueryString({ vocab_key: vocabKey ?? null })}`,
    {
      token,
    },
  );
}

export function createVocabulary(token: string, payload: ControlledVocabularyCreateRequest) {
  return apiRequest<ControlledVocabularyRead>("/api/v1/admin/vocabularies", {
    method: "POST",
    body: payload,
    token,
  });
}

export function updateVocabulary(
  token: string,
  vocabId: string,
  payload: ControlledVocabularyUpdateRequest,
) {
  return apiRequest<ControlledVocabularyRead>(`/api/v1/admin/vocabularies/${vocabId}`, {
    method: "PATCH",
    body: payload,
    token,
  });
}
