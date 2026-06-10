import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import { groupVocabularyOptions } from '../editor-types'
import type { VocabularySelectOption } from '../editor-types'
import { VocabularyCombobox } from './vocabulary-combobox'
import { VocabularyMultiSelect } from './vocabulary-multi-select'

const FAILURE_OPTIONS: VocabularySelectOption[] = [
  {
    value: 'multilayer',
    label: '多层',
    groupKey: 'morphology',
    groupLabel: '形貌与厚度',
    groupSortOrder: 2,
  },
  {
    value: 'no_growth',
    label: '完全无生长',
    groupKey: 'nucleation_coverage',
    groupLabel: '成核与覆盖',
    groupSortOrder: 1,
  },
  {
    value: 'low_coverage',
    label: '覆盖率低',
    groupKey: 'nucleation_coverage',
    groupLabel: '成核与覆盖',
    groupSortOrder: 1,
  },
  {
    value: 'other',
    label: '其他',
    groupKey: 'other',
    groupLabel: '其他',
    groupSortOrder: 6,
  },
]

describe('groupVocabularyOptions', () => {
  it('orders groups by groupSortOrder regardless of input order', () => {
    const groups = groupVocabularyOptions(FAILURE_OPTIONS)
    expect(groups.map((g) => g.key)).toEqual([
      'nucleation_coverage',
      'morphology',
      'other',
    ])
    expect(groups.map((g) => g.label)).toEqual([
      '成核与覆盖',
      '形貌与厚度',
      '其他',
    ])
  })

  it('keeps options contiguous within a group, preserving input order', () => {
    const groups = groupVocabularyOptions(FAILURE_OPTIONS)
    const nucleation = groups.find((g) => g.key === 'nucleation_coverage')
    expect(nucleation?.options.map((o) => o.value)).toEqual([
      'no_growth',
      'low_coverage',
    ])
  })

  it('places ungrouped options last', () => {
    const groups = groupVocabularyOptions([
      { value: 'loose', label: '散装' },
      ...FAILURE_OPTIONS,
    ])
    expect(groups.at(-1)?.key).toBeNull()
    expect(groups.at(-1)?.options.map((o) => o.value)).toEqual(['loose'])
  })

  it('returns a single ungrouped bucket when nothing is grouped', () => {
    const groups = groupVocabularyOptions([
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBeNull()
    expect(groups[0].label).toBeNull()
  })
})

describe('VocabularyMultiSelect', () => {
  it('renders grouped headers and all option chips', () => {
    render(
      <VocabularyMultiSelect
        ariaLabel="失败模式"
        options={FAILURE_OPTIONS}
        value={[]}
        onChange={() => {}}
      />,
    )
    expect(screen.getByText('成核与覆盖')).toBeInTheDocument()
    expect(screen.getByText('形貌与厚度')).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: '完全无生长' }),
    ).toBeInTheDocument()
  })

  it('adds a value when an unselected chip is clicked', () => {
    const onChange = vi.fn()
    render(
      <VocabularyMultiSelect
        ariaLabel="失败模式"
        options={FAILURE_OPTIONS}
        value={[]}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: '完全无生长' }))
    expect(onChange).toHaveBeenCalledWith(['no_growth'])
  })

  it('removes a value when a selected chip is clicked', () => {
    const onChange = vi.fn()
    render(
      <VocabularyMultiSelect
        ariaLabel="失败模式"
        options={FAILURE_OPTIONS}
        value={['no_growth', 'multilayer']}
        onChange={onChange}
      />,
    )
    const chip = screen.getByRole('checkbox', { name: '完全无生长' })
    expect(chip).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(chip)
    expect(onChange).toHaveBeenCalledWith(['multilayer'])
  })

  it('keeps a selected legacy value that is absent from the vocabulary', () => {
    render(
      <VocabularyMultiSelect
        ariaLabel="失败模式"
        options={FAILURE_OPTIONS}
        value={['legacy_reason']}
        onChange={() => {}}
      />,
    )
    expect(
      screen.getByRole('checkbox', { name: 'legacy_reason' }),
    ).toHaveAttribute('aria-checked', 'true')
  })
})

describe('VocabularyCombobox grouping', () => {
  it('renders group headers above their options when opened', () => {
    render(
      <VocabularyCombobox
        ariaLabel="失败模式选择"
        disabled={false}
        options={FAILURE_OPTIONS}
        placeholder="选择"
        value=""
        onChange={() => {}}
      />,
    )
    fireEvent.focus(screen.getByLabelText('失败模式选择'))
    const nucleationGroup = screen.getByRole('group', { name: '成核与覆盖' })
    expect(within(nucleationGroup).getByText('完全无生长')).toBeInTheDocument()
  })

  it('still shows every option when a value is already selected', () => {
    render(
      <VocabularyCombobox
        ariaLabel="失败模式选择"
        disabled={false}
        options={FAILURE_OPTIONS}
        placeholder="选择"
        value="multilayer"
        onChange={() => {}}
      />,
    )
    fireEvent.focus(screen.getByLabelText('失败模式选择'))
    // 已选中 multilayer，但其它分组的候选仍应可见（不被收窄到所选标签）。
    expect(screen.getByText('完全无生长')).toBeInTheDocument()
    expect(screen.getByText('覆盖率低')).toBeInTheDocument()
    expect(
      screen.getByRole('group', { name: '形貌与厚度' }),
    ).toBeInTheDocument()
  })
})
