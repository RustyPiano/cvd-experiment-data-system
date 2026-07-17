import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/shared/i18n'
import { EntityForm } from './entity-form'

afterEach(async () => {
  await i18n.changeLanguage('zh')
})

function renderForm(props: Partial<React.ComponentProps<typeof EntityForm>>) {
  return render(
    <I18nextProvider i18n={i18n}>
      <EntityForm
        kind="material_lot"
        mode="create"
        nextVersion={1}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        {...props}
      />
    </I18nextProvider>,
  )
}

describe('EntityForm — "改动即新版本" semantics prompt', () => {
  it('shows no version banner in create mode', () => {
    renderForm({ mode: 'create', nextVersion: 1 })
    expect(screen.queryByTestId('new-version-banner')).toBeNull()
  })

  it('warns that saving generates the next version, leaving old refs intact', () => {
    renderForm({
      mode: 'newVersion',
      nextVersion: 3,
      defaultData: { lot_category: '衬底', substance_name: 'MoO₃' },
    })
    const banner = screen.getByTestId('new-version-banner')
    // interpolated target version + the "old references unaffected" promise
    expect(banner).toHaveTextContent('v3')
    expect(banner).toHaveTextContent('历史版本')
    expect(banner).toHaveTextContent('炉次不会改变')
  })
})

describe('EntityForm — required markers (导师 B93 明显标识)', () => {
  it('renders red asterisks for required fields', () => {
    renderForm({ mode: 'create' })
    // required labels (批次类别 / 物质名称 / 化学式 / 批号) each carry a "*"
    expect(screen.getAllByText('*').length).toBeGreaterThan(0)
    // the accessible label is announced too
    expect(screen.getAllByText('（必填）').length).toBeGreaterThan(0)
  })

  it('hides conditional substrate/gas sub-fields until a category is chosen', () => {
    renderForm({ mode: 'create' })
    // ▸气瓶·纯度等级 must not appear before lot_category is set
    expect(screen.queryByText('▸气瓶·纯度等级')).toBeNull()
    expect(screen.queryByText('▸衬底·材料')).toBeNull()
    // but always-visible required fields are present
    expect(screen.getByText('批次类别')).toBeInTheDocument()
  })
})

describe('EntityForm — select with other accessibility', () => {
  it('associates the field label with the custom select trigger', () => {
    renderForm({ kind: 'setup' })

    expect(
      screen.getByRole('combobox', { name: '品牌/型号' }),
    ).toBeInTheDocument()
  })
})
