import { describe, expect, it } from 'vitest'

import { buildGroupUpsertPayload, emptyGroupFormState } from './group-utils'

describe('buildGroupUpsertPayload', () => {
  it('builds a valid payload, trimming fields and nulling empty English label', () => {
    const result = buildGroupUpsertPayload('failure_mode', {
      groupKey: '  morphology  ',
      groupLabelZh: '  形貌与厚度  ',
      groupLabelEn: '',
      groupSortOrder: '2',
      memberIds: ['id-1', 'id-2'],
    })
    expect(result.error).toBeNull()
    expect(result.payload).toEqual({
      vocab_key: 'failure_mode',
      group_key: 'morphology',
      group_label_zh: '形貌与厚度',
      group_label_en: null,
      group_sort_order: 2,
      member_ids: ['id-1', 'id-2'],
    })
  })

  it('keeps a provided English label', () => {
    const result = buildGroupUpsertPayload('failure_mode', {
      ...emptyGroupFormState,
      groupKey: 'morphology',
      groupLabelZh: '形貌',
      groupLabelEn: 'Morphology',
      groupSortOrder: '1',
    })
    expect(result.payload?.group_label_en).toBe('Morphology')
  })

  it('allows an empty member list (relabel existing group only)', () => {
    const result = buildGroupUpsertPayload('failure_mode', {
      ...emptyGroupFormState,
      groupKey: 'morphology',
      groupLabelZh: '形貌',
    })
    expect(result.error).toBeNull()
    expect(result.payload?.member_ids).toEqual([])
  })

  it('rejects an empty group key', () => {
    const result = buildGroupUpsertPayload('failure_mode', {
      ...emptyGroupFormState,
      groupLabelZh: '形貌',
    })
    expect(result.payload).toBeNull()
    expect(result.error).toContain('分组键')
  })

  it('rejects an empty Chinese label', () => {
    const result = buildGroupUpsertPayload('failure_mode', {
      ...emptyGroupFormState,
      groupKey: 'morphology',
    })
    expect(result.payload).toBeNull()
    expect(result.error).toContain('中文标签')
  })

  it('rejects a non-integer sort order', () => {
    const result = buildGroupUpsertPayload('failure_mode', {
      ...emptyGroupFormState,
      groupKey: 'morphology',
      groupLabelZh: '形貌',
      groupSortOrder: '1.5',
    })
    expect(result.payload).toBeNull()
    expect(result.error).toContain('排序')
  })
})
