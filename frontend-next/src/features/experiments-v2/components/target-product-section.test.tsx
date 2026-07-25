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
  })

  it('uses one structure type and updates the guide when it changes', async () => {
    const user = userEvent.setup()

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
          onComponentsChange={vi.fn()}
        />
      )
    }

    render(
      <I18nextProvider i18n={i18n}>
        <EditableSection />
      </I18nextProvider>,
    )

    expect(screen.getByText(/不填组成明细/)).toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: '结构类型' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: /结构类型/ }))
    await user.click(screen.getByRole('option', { name: '掺杂' }))

    expect(screen.getByText(/不强制把掺杂剂与主体材料拼成/)).toBeInTheDocument()
    expect(screen.queryByText(/不填组成明细/)).not.toBeInTheDocument()

    await user.type(
      screen.getByRole('combobox', { name: '体相空间群' }),
      'P6_3/mmc',
    )
    await user.tab()
    expect(screen.getByRole('combobox', { name: '体相空间群' })).toHaveValue(
      '194',
    )
    const symbol = screen.getByText('空间群符号：P6₃/mmc')
    expect(symbol).toBeInTheDocument()
    expect(
      screen
        .getByRole('combobox', { name: '体相空间群' })
        .getAttribute('aria-describedby')
        ?.split(' '),
    ).toContain(symbol.id)
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
    expect(screen.getByText(/主体材料和一个或多个掺杂剂/)).toHaveTextContent(
      '角色术语待组内最终统一',
    )
    expect(
      screen.queryByRole('spinbutton', { name: '层序' }),
    ).not.toBeInTheDocument()
  })

  it('does not ask intrinsic materials for composition rows', () => {
    renderSection('本征')

    expect(
      screen.getByText(/本征：只填目标材料化学式.*不填组成明细/),
    ).toBeInTheDocument()
    const spaceGroupInput = screen.getByRole('combobox', {
      name: '体相空间群',
    })
    expect(spaceGroupInput).toHaveAttribute(
      'placeholder',
      '输入编号或符号，例如 194',
    )
    const datalistId = spaceGroupInput.getAttribute('list')
    expect(datalistId).toBeTruthy()
    const datalist = document.getElementById(datalistId!)
    expect(datalist).toBeInTheDocument()
    expect(
      datalist!.querySelector('option[value="194 · P6₃/mmc"]'),
    ).toBeInTheDocument()
    expect(screen.getByText(/不知道可留空；可从 XRD 结果/)).toHaveTextContent(
      '材料数据库中的 Space group 获取',
    )
    expect(
      screen.queryByRole('link', { name: /空间群编号与符号查询/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('新增组分')).not.toBeInTheDocument()
  })
})
