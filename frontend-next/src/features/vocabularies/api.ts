import { apiRequest } from '@/shared/api/client'
import type {
  ControlledVocabularyCreateRequest,
  ControlledVocabularyListResponse,
  ControlledVocabularyRead,
  ControlledVocabularyUpdateRequest,
} from '@/shared/types/api'

// M4 的请求体在生成的 openapi 类型刷新前先本地声明（与后端 schema 对齐）。
export type VocabularyUpdateWithGroup = ControlledVocabularyUpdateRequest & {
  /** 分组成员变更：填已存在分组键则归入并继承其标签；置 null/空清除分组。 */
  group_key?: string | null
}

export type VocabularyReorderRequest = {
  vocab_key: string
  ordered_ids: string[]
}

export type VocabularyGroupUpsertRequest = {
  vocab_key: string
  group_key: string
  group_label_zh: string
  group_label_en?: string | null
  group_sort_order: number
  member_ids: string[]
}

function buildQueryString(params: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value)
    }
  }

  const serialized = searchParams.toString()
  return serialized ? `?${serialized}` : ''
}

export function listAdminVocabularies(token: string, vocabKey?: string | null) {
  return apiRequest<ControlledVocabularyListResponse>(
    `/api/v1/admin/vocabularies${buildQueryString({ vocab_key: vocabKey ?? null })}`,
    {
      token,
    },
  )
}

export function createVocabulary(
  token: string,
  payload: ControlledVocabularyCreateRequest,
) {
  return apiRequest<ControlledVocabularyRead>('/api/v1/admin/vocabularies', {
    method: 'POST',
    body: payload,
    token,
  })
}

export function updateVocabulary(
  token: string,
  vocabId: string,
  payload: VocabularyUpdateWithGroup,
) {
  return apiRequest<ControlledVocabularyRead>(
    `/api/v1/admin/vocabularies/${vocabId}`,
    {
      method: 'PATCH',
      body: payload,
      token,
    },
  )
}

export function reorderVocabularies(
  token: string,
  payload: VocabularyReorderRequest,
) {
  return apiRequest<ControlledVocabularyListResponse>(
    '/api/v1/admin/vocabularies/reorder',
    {
      method: 'POST',
      body: payload,
      token,
    },
  )
}

export function upsertVocabularyGroup(
  token: string,
  payload: VocabularyGroupUpsertRequest,
) {
  return apiRequest<ControlledVocabularyListResponse>(
    '/api/v1/admin/vocabularies/groups',
    {
      method: 'PUT',
      body: payload,
      token,
    },
  )
}
