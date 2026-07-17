import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { emptyModuleValues } from '../field-logic'
import { BasicInfoSection } from './basic-info-section'

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
    const input = screen.getByLabelText(/\u7089\u6b21\u7f16\u53f7/)
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('title', '编号创建后不可修改')
  })

  it('asks only for time, method, and operator before creating a run', () => {
    renderSection(false)
    expect(screen.getByLabelText(/\u5b9e\u9a8c\u65f6\u95f4/)).toBeInTheDocument()
    expect(screen.getByLabelText(/\u5408\u6210\u65b9\u6cd5/)).toBeInTheDocument()
    expect(screen.getByLabelText(/\u5b9e\u9a8c\u4eba/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/\u7089\u6b21\u7f16\u53f7/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/\u73af\u5883\u6e29\u5ea6/)).not.toBeInTheDocument()
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

  it('shows the signed-in operator even when the name is not in the shared vocabulary', () => {
    renderSection(false, '成员 A')

    expect(screen.getByRole('combobox', { name: /实验人/ })).toHaveTextContent('其他')
    expect(screen.getByRole('textbox', { name: '实验人的其他内容' })).toHaveValue(
      '成员 A',
    )
  })
})
