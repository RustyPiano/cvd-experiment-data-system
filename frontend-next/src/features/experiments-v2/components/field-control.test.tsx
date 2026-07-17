import { useState } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'

import { entities, experimentModules } from '@/shared/generated/field-metadata'
import type { FieldMetadata } from '@/shared/generated/field-metadata'
import i18n from '@/shared/i18n'
import {
  formatCompositeValue,
  isCompositeInput,
  parseCompositeOptions,
} from '@/shared/composite-field'
import { parseEnumOptions } from '../field-logic'
import { EntityForm } from '@/features/entity-library/entity-form'
import type { EntityKind } from '@/features/entity-library/config'
import { FieldControl } from './field-control'
import { localizedFieldLabel } from '@/shared/field-i18n'

function renderControl(
  moduleKey: string,
  field: FieldMetadata,
  initialValue = '',
  onChange = vi.fn(),
) {
  function Wrapper() {
    const [value, setValue] = useState(initialValue)
    return (
      <I18nextProvider i18n={i18n}>
        <FieldControl
          moduleKey={moduleKey}
          field={field}
          values={{}}
          value={value}
          onChange={(next) => {
            setValue(next)
            onChange(next)
          }}
        />
      </I18nextProvider>
    )
  }
  return { user: userEvent.setup(), ...render(<Wrapper />), onChange }
}

const compositeFields = [
  ...Object.entries(experimentModules).map(([moduleKey, fields]) => ({
    source: 'experiment' as const,
    moduleKey,
    fields,
  })),
  ...Object.entries(entities).map(([moduleKey, fields]) => ({
    source: 'entity' as const,
    moduleKey,
    fields,
  })),
].flatMap(({ source, moduleKey, fields }) =>
  fields
    .filter((field) => isCompositeInput(field.input))
    .map((field) => ({
      caseName: `${moduleKey}.${field.key}`,
      source,
      moduleKey,
      field,
    })),
)

function renderCompositeCase(
  testCase: (typeof compositeFields)[number],
  initialValue: string,
) {
  if (testCase.source === 'experiment') {
    const view = renderControl(testCase.moduleKey, testCase.field, initialValue)
    return {
      ...view,
      textbox: screen.getByRole('textbox'),
      combobox: screen.getByRole('combobox'),
      submit: async () => view.onChange.mock.lastCall?.[0],
    }
  }

  const onSubmit = vi.fn()
  const defaultData = Object.fromEntries(
    entities[testCase.moduleKey].map((field) => [
      field.key,
      field.key === testCase.field.key
        ? initialValue
        : field.key === 'lot_category'
          ? '衬底'
          : 'seed',
    ]),
  )
  const user = userEvent.setup()
  const view = render(
    <I18nextProvider i18n={i18n}>
      <EntityForm
        kind={testCase.moduleKey as EntityKind}
        mode="create"
        nextVersion={1}
        defaultData={defaultData}
        submitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    </I18nextProvider>,
  )
  const combobox = screen.getByRole('combobox', {
    name: `${localizedFieldLabel(testCase.field, 'zh')}选项`,
  })
  return {
    ...view,
    user,
    textbox: within(combobox.parentElement!).getByRole('textbox'),
    combobox,
    onChange: onSubmit,
    submit: async () => {
      await user.click(screen.getByRole('button', { name: /Save|保存/ }))
      return onSubmit.mock.lastCall?.[0]?.[testCase.field.key]
    },
  }
}

describe('FieldControl composite inputs', () => {
  it('enumerates all 12 composite fields from generated metadata', () => {
    expect(compositeFields).toHaveLength(12)
  })

  it.each(compositeFields)(
    '$caseName renders, composes, reads back, keeps halves, and falls back',
    async (testCase) => {
      const { field } = testCase
      const input = field.input
      if (!isCompositeInput(input)) throw new Error('not composite')
      const options =
        parseEnumOptions(field.input, field.options) ??
        parseCompositeOptions(field.options)
      const option = options[0]
      const free = '12.5'
      const combined = formatCompositeValue(input, free, option)

      let view = renderCompositeCase(testCase, combined)
      expect(view.textbox).toHaveValue(free)
      expect(view.combobox).toHaveTextContent(option)
      view.unmount()

      view = renderCompositeCase(testCase, free)
      expect(view.textbox).toHaveValue(free)
      expect(view.combobox).toHaveAttribute('data-placeholder')
      view.unmount()

      view = renderCompositeCase(testCase, option)
      expect(view.textbox).toHaveValue('')
      expect(view.combobox).toHaveTextContent(option)
      view.unmount()

      view = renderCompositeCase(testCase, 'legacy malformed value')
      expect(view.textbox).toHaveValue('legacy malformed value')
      expect(view.combobox).toHaveAttribute('data-placeholder')
      await view.user.clear(view.textbox)
      await view.user.type(view.textbox, free)
      await view.user.click(view.combobox)
      await view.user.click(screen.getByRole('option', { name: option }))
      expect(await view.submit()).toBe(combined)
      cleanup()
    },
  )
})

describe('FieldControl dropdown with other value', () => {
  it('does not submit the vocabulary note and accepts a free-text value', async () => {
    await i18n.changeLanguage('zh')
    const field = experimentModules.precursors.find(
      (item) => item.key === 'name_formula',
    )!
    const view = renderControl('precursors', field)

    await view.user.click(
      screen.getByRole('combobox', { name: /名称\/化学式/ }),
    )
    expect(
      screen.queryByRole('option', { name: '受控+其他' }),
    ).not.toBeInTheDocument()
    await view.user.click(screen.getByRole('option', { name: '其他' }))
    await view.user.type(
      screen.getByRole('textbox', { name: '名称/化学式的其他内容' }),
      'MoO3',
    )

    expect(view.onChange).toHaveBeenLastCalledWith('MoO3')
  })
})
