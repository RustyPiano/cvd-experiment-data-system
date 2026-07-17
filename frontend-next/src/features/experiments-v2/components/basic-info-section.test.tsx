import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { emptyModuleValues } from '../field-logic'
import { BasicInfoSection } from './basic-info-section'

function renderSection(editMode: boolean) {
  return render(
    <I18nextProvider i18n={i18n}>
      <BasicInfoSection
        values={{
          ...emptyModuleValues('basic_info'),
          run_code: 'CVD-2026-0001',
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
    const input = screen.getByLabelText(
      /\u6837\u54c1\/\u5b9e\u9a8c\u7f16\u53f7/,
    )
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('title', '编号创建后不可修改')
  })

  it('keeps new run_code editable with the backend format pattern', () => {
    renderSection(false)
    const input = screen.getByLabelText(
      /\u6837\u54c1\/\u5b9e\u9a8c\u7f16\u53f7/,
    )
    expect(input).toBeEnabled()
    expect(input).toHaveAttribute('pattern', '^CVD-\\d{4}-\\d{4}$')
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
})
