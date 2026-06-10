import type { VocabularyGroupUpsertRequest } from '@/shared/types/api'

export type GroupFormState = {
  groupKey: string
  groupLabelZh: string
  groupLabelEn: string
  groupSortOrder: string
  memberIds: string[]
}

export const emptyGroupFormState: GroupFormState = {
  groupKey: '',
  groupLabelZh: '',
  groupLabelEn: '',
  groupSortOrder: '0',
  memberIds: [],
}

type BuildResult =
  | { error: string; payload: null }
  | { error: null; payload: VocabularyGroupUpsertRequest }

/**
 * 校验并构造「定义/编辑分组」的请求体。group_key 与中文标签必填，排序须为整数；
 * member_ids 可为空（仅重命名/重排既有分组成员）。纯函数，便于单测。
 */
export function buildGroupUpsertPayload(
  vocabKey: string,
  form: GroupFormState,
): BuildResult {
  const groupKey = form.groupKey.trim()
  const groupLabelZh = form.groupLabelZh.trim()
  const groupSortOrder = Number(form.groupSortOrder)

  if (!groupKey) {
    return { error: '分组键不能为空', payload: null }
  }
  if (!groupLabelZh) {
    return { error: '分组中文标签不能为空', payload: null }
  }
  if (!Number.isInteger(groupSortOrder)) {
    return { error: '分组排序必须是整数', payload: null }
  }

  return {
    error: null,
    payload: {
      vocab_key: vocabKey,
      group_key: groupKey,
      group_label_zh: groupLabelZh,
      group_label_en: form.groupLabelEn.trim() || null,
      group_sort_order: groupSortOrder,
      member_ids: form.memberIds,
    },
  }
}
