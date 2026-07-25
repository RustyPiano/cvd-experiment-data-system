import { useState } from 'react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { emptyModuleValues } from '../field-logic'
import { BasicInfoSection } from './basic-info-section'

// Browser automation fills datetime-local through the native input event.
// Drop React's change adapter here so the regression test exercises that exact boundary.
vi.mock('@/components/ui/input', () => ({
  Input: ({ onChange: _onChange, ...props }: ComponentProps<'input'>) => (
    <input {...props} />
  ),
}))

function renderSection(editMode: boolean, operator = '') {
  return render(
    <I18nextProvider i18n={i18n}>
      <BasicInfoSection
        values={{
          ...emptyModuleValues('basic_info'),
          run_code: 'CVD-2026-0001',
          operator,
        }}
        onChange={vi.fn()}
        editMode={editMode}
      />
    </I18nextProvider>,
  )
}

describe('BasicInfoSection run code', () => {
  beforeEach(async () => i18n.changeLanguage('zh'))

  it('disables run_code after creation and explains why', () => {
    renderSection(true)
    const input = screen.getByLabelText(/制备记录编号/)
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('title', '编号创建后不可修改')
    expect(
      screen.queryByText('可按建议格式填写，并确保组内唯一。'),
    ).not.toBeInTheDocument()
  })

  it('asks for the complete pre-run record before creating a run', () => {
    renderSection(false)
    expect(
      screen.getByLabelText(/\u5b9e\u9a8c\u65f6\u95f4/),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText(/\u5408\u6210\u65b9\u6cd5/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/\u5b9e\u9a8c\u4eba/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/制备记录编号/)).not.toBeInTheDocument()
    expect(
      screen.getByLabelText(/\u73af\u5883\u6e29\u5ea6/),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText(/\u73af\u5883\u6e7f\u5ea6/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', {
        name: /\u5b9e\u9a8c\u524d\u68c0\u67e5\u786e\u8ba4/,
      }),
    ).toBeInTheDocument()
  })

  it('does not expose PVD-family methods in the CVD-only interface', async () => {
    const user = userEvent.setup()
    renderSection(false)

    await user.click(screen.getAllByRole('combobox')[0])

    expect(screen.getByRole('option', { name: 'APCVD' })).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: 'PVD-磁控溅射' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: 'PLD' }),
    ).not.toBeInTheDocument()
  })

  it('shows the signed-in operator as a fixed value', () => {
    renderSection(false, '成员 A')

    const input = screen.getByRole('textbox', { name: /实验人/ })
    expect(input).toHaveValue('成员 A')
    expect(input).toBeDisabled()
  })

  it('keeps a datetime-local value after another field updates', async () => {
    function StatefulSection() {
      const [values, setValues] = useState({
        ...emptyModuleValues('basic_info'),
        operator: '成员 A',
      })
      return (
        <I18nextProvider i18n={i18n}>
          <BasicInfoSection
            values={values}
            onChange={(key, value) =>
              setValues((current) => ({ ...current, [key]: value }))
            }
          />
        </I18nextProvider>
      )
    }

    const user = userEvent.setup()
    render(<StatefulSection />)
    const startedAt = screen.getByLabelText(/实验时间/)

    fireEvent.input(startedAt, {
      target: { value: '2026-07-24T14:20' },
    })
    await user.click(screen.getByRole('combobox', { name: /合成方法/ }))
    await user.click(screen.getByRole('option', { name: 'CVD' }))

    expect(startedAt).toHaveValue('2026-07-24T14:20')
  })
})
