import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { emptyModuleValues } from '../field-logic'
import { TargetProductSection } from './target-product-section'

function renderSection(structureType: string) {
  render(
    <I18nextProvider i18n={i18n}>
      <TargetProductSection
        values={{
          ...emptyModuleValues('target_product'),
          structure_type: structureType,
        }}
        onChange={vi.fn()}
        components={[]}
        onComponentsChange={vi.fn()}
      />
    </I18nextProvider>,
  )
}

describe('TargetProductSection composition guide', () => {
  beforeEach(async () => i18n.changeLanguage('zh'))

  it('shows the exact rule for the selected structure type', () => {
    renderSection('掺杂')

    expect(screen.getByText('填写规则')).toBeInTheDocument()
    expect(screen.getByText(/Nb:MoS2/)).toHaveTextContent('掺杂剂:基体')
  })

  it('does not ask intrinsic materials for composition rows', () => {
    renderSection('本征')

    expect(screen.getByText(/MoS2/)).toHaveTextContent('不填组成明细')
    const spaceGroupInput = screen.getByRole('spinbutton', { name: '体相空间群' })
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
