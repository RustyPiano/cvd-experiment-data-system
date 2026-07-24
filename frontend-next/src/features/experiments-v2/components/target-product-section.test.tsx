import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { emptyModuleValues } from '../field-logic'
import type { ModuleFieldValue, ModuleValues } from '../field-logic'
import { hermannMauguinSymbol } from '../space-groups'
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
    expect(hermannMauguinSymbol(1)).toBe('P1')
    expect(hermannMauguinSymbol(194)).toBe('P6₃/mmc')
    expect(hermannMauguinSymbol(230)).toBe('Ia-3d')
    expect(hermannMauguinSymbol(231)).toBeUndefined()
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

    expect(screen.getByText(/掺杂剂:基体/)).toBeInTheDocument()
    expect(screen.queryByText(/不填组成明细/)).not.toBeInTheDocument()

    await user.type(
      screen.getByRole('spinbutton', { name: '体相空间群' }),
      '194',
    )
    const symbol = screen.getByText('Hermann–Mauguin 符号：P6₃/mmc')
    expect(symbol).toBeInTheDocument()
    expect(
      screen
        .getByRole('spinbutton', { name: '体相空间群' })
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
    expect(screen.getByText(/Nb:MoS2/)).toHaveTextContent('掺杂剂:基体')
    expect(
      screen.queryByRole('spinbutton', { name: '层序' }),
    ).not.toBeInTheDocument()
  })

  it('does not ask intrinsic materials for composition rows', () => {
    renderSection('本征')

    expect(screen.getByText(/MoS2/)).toHaveTextContent('不填组成明细')
    const spaceGroupInput = screen.getByRole('spinbutton', {
      name: '体相空间群',
    })
    expect(spaceGroupInput).toHaveAttribute('placeholder', '例如 194')
    expect(spaceGroupInput).toHaveAttribute('step', '1')
    expect(spaceGroupInput).toHaveAttribute('min', '1')
    expect(spaceGroupInput).toHaveAttribute('max', '230')
    expect(
      screen.getByText(/填写 International Tables 空间群号/),
    ).toHaveTextContent('不清楚可留空')
    expect(screen.queryByText('新增组分')).not.toBeInTheDocument()
  })
})
