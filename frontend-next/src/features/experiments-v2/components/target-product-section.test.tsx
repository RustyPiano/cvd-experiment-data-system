import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { emptyModuleValues } from '../field-logic'
import type { ModuleFieldValue, ModuleValues } from '../field-logic'
import {
  hermannMauguinSymbol,
  spaceGroupNumber,
  spaceGroupOptions,
  suggestedBulkSpaceGroups,
} from '../space-groups'
import { TargetProductSection } from './target-product-section'

function renderSection(
  structureType: string,
  components: Parameters<typeof TargetProductSection>[0]['components'] = [],
) {
  render(
    <I18nextProvider i18n={i18n}>
      <TargetProductSection
        values={{
          ...emptyModuleValues('target_product'),
          structure_type: structureType,
        }}
        onChange={vi.fn()}
        components={components}
        onComponentsChange={vi.fn()}
      />
    </I18nextProvider>,
  )
}

describe('TargetProductSection composition guide', () => {
  beforeEach(async () => i18n.changeLanguage('zh'))

  it('maps the full International Tables number range', () => {
    expect(spaceGroupOptions).toHaveLength(230)
    expect(hermannMauguinSymbol(1)).toBe('P1')
    expect(hermannMauguinSymbol(194)).toBe('P6₃/mmc')
    expect(hermannMauguinSymbol(230)).toBe('Ia-3d')
    expect(hermannMauguinSymbol(231)).toBeUndefined()
    expect(spaceGroupNumber('P6_3/mmc')).toBe(194)
    expect(spaceGroupNumber('194 · P6₃/mmc')).toBe(194)
    expect(suggestedBulkSpaceGroups(' MoS₂ ')).toEqual([
      { phase: '2H', number: 194, symbol: 'P6₃/mmc' },
      { phase: '3R', number: 160, symbol: 'R3m' },
    ])
    expect(suggestedBulkSpaceGroups('unknown')).toEqual([])
  })

  it('uses one structure type and updates the guide when it changes', async () => {
    const user = userEvent.setup()
    const onComponentsChange = vi.fn()

    function EditableSection() {
      const [values, setValues] = useState<ModuleValues>({
        ...emptyModuleValues('target_product'),
        structure_type: 'intrinsic',
      })
      return (
        <TargetProductSection
          values={values}
          onChange={(key: string, value: ModuleFieldValue) =>
            setValues((current) => ({ ...current, [key]: value }))
          }
          components={[]}
          onComponentsChange={onComponentsChange}
        />
      )
    }

    render(
      <I18nextProvider i18n={i18n}>
        <EditableSection />
      </I18nextProvider>,
    )

    expect(screen.getByText(/只填写目标材料化学式/)).toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: '结构类型' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: /结构类型/ }))
    await user.click(screen.getByRole('option', { name: '掺杂' }))

    expect(onComponentsChange).toHaveBeenCalledWith([])
    expect(
      screen.getByText(/填写主体材料 MoS2、掺杂元素 Pt/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/只填写目标材料化学式/)).not.toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /主体材料化学式/ }),
    ).toHaveAttribute('placeholder', '例如 MoS2')
    await user.type(
      screen.getByRole('textbox', { name: /主体材料化学式/ }),
      'MoS2',
    )
    await user.click(
      screen.getByRole('combobox', {
        name: '根据 MoS2 选择常见体相',
      }),
    )
    await user.click(
      screen.getByRole('option', { name: '2H · #194 · P6₃/mmc' }),
    )
    expect(
      screen.getByRole('combobox', { name: '目标体相空间群' }),
    ).toHaveValue('194')

    await user.clear(screen.getByRole('combobox', { name: '目标体相空间群' }))
    await user.type(
      screen.getByRole('combobox', { name: '目标体相空间群' }),
      'P6_3/mmc',
    )
    await user.tab()
    expect(
      screen.getByRole('combobox', { name: '目标体相空间群' }),
    ).toHaveValue('194')
    const symbol = screen.getByText('空间群符号：P6₃/mmc')
    expect(symbol).toBeInTheDocument()
    expect(
      screen
        .getByRole('combobox', { name: '目标体相空间群' })
        .getAttribute('aria-describedby')
        ?.split(' '),
    ).toContain(symbol.id)

    await user.click(screen.getByRole('combobox', { name: /结构类型/ }))
    await user.click(screen.getByRole('option', { name: '垂直异质结' }))
    expect(screen.getByRole('textbox', { name: /体系显示式/ })).toHaveValue('')
    expect(
      screen.queryByRole('combobox', { name: '目标体相空间群' }),
    ).not.toBeInTheDocument()
  })

  it('shows the exact rule for the selected structure type', () => {
    renderSection('掺杂', [
      {
        formula: 'Nb',
        role: 'dopant',
        concentration_at_percent: '0.5',
        layer_order: '2',
      },
    ])

    expect(screen.getByText('填写规则')).toBeInTheDocument()
    expect(
      screen.getByText(/填写主体材料 MoS2、掺杂元素 Pt/),
    ).toHaveTextContent('已知的名义含量')
    expect(screen.getAllByText('掺杂元素')).toHaveLength(2)
    expect(screen.getByRole('textbox', { name: '掺杂元素' })).toHaveAttribute(
      'placeholder',
      '例如 Pt',
    )
    expect(
      screen.queryByRole('spinbutton', { name: '层序' }),
    ).not.toBeInTheDocument()
  })

  it('does not ask intrinsic materials for composition rows', () => {
    renderSection('本征')

    expect(
      screen.getByText(/例：MoS2。只填写目标材料化学式/),
    ).toBeInTheDocument()
    const spaceGroupInput = screen.getByRole('combobox', {
      name: '目标体相空间群',
    })
    expect(spaceGroupInput).toHaveAttribute(
      'placeholder',
      '搜索编号或符号，例如 194 或 P6₃/mmc',
    )
    const datalistId = spaceGroupInput.getAttribute('list')
    expect(datalistId).toBeTruthy()
    const datalist = document.getElementById(datalistId!)
    expect(datalist).toBeInTheDocument()
    expect(
      datalist!.querySelector('option[value="194 · P6₃/mmc"]'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/输入化学式后，先从常见物相中选择/),
    ).toHaveTextContent('没有合适候选时，可搜索全部空间群编号或符号')
    expect(
      screen.queryByRole('link', { name: /空间群编号与符号查询/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('新增组分')).not.toBeInTheDocument()
  })
})
