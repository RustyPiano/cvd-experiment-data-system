import { useState } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { entities, experimentModules } from '@/shared/generated/field-metadata'
import type { FieldMetadata } from '@/shared/generated/field-metadata'
import i18n from '@/shared/i18n'
import {
  formatCompositeValue,
  isCompositeInput,
  parseCompositeOptions,
} from '@/shared/composite-field'
import { buildItemPayload, parseEnumOptions } from '../field-logic'
import { localizedFieldLabel, localizedOption } from '@/shared/field-i18n'
import { EntityForm } from '@/features/entity-library/entity-form'
import type { EntityKind } from '@/features/entity-library/config'
import { FieldControl } from './field-control'
import type { ModuleFieldValue } from '../field-logic'

function renderControl(
  moduleKey: string,
  field: FieldMetadata,
  initialValue: ModuleFieldValue = '',
  onChange = vi.fn(),
  values: Record<string, ModuleFieldValue> = {},
) {
  function Wrapper() {
    const [value, setValue] = useState<ModuleFieldValue>(initialValue)
    return (
      <I18nextProvider i18n={i18n}>
        <FieldControl
          moduleKey={moduleKey}
          field={field}
          values={values}
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
    .filter(
      (field) => isCompositeInput(field.input) && field.input !== '文本+数值',
    )
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
      textbox: screen.queryByRole('textbox') ?? screen.getByRole('spinbutton'),
      combobox: screen.getByRole('combobox'),
      submit: async () => view.onChange.mock.lastCall?.[0],
    }
  }

  const onSubmit = vi.fn()
  const defaultData = {
    lot_category: 'substrate',
    substance_name: 'seed',
    chemical_formula: 'Al2O3',
    batch_number: 'seed',
    substrate_material: 'sapphire_al2o3',
    substrate_orientation_polish_availability: 'reported',
    substrate_miscut_availability: 'reported',
    substrate_miscut_angle_deg: '0',
    substrate_surface_roughness: JSON.stringify({
      metric: 'RMS',
      value_nm: 0.5,
    }),
    [testCase.field.key]: initialValue,
  }
  const user = userEvent.setup()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <EntityForm
          kind={testCase.moduleKey as EntityKind}
          mode="create"
          nextVersion={1}
          defaultData={defaultData}
          submitting={false}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />
      </QueryClientProvider>
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
  it('enumerates every remaining scalar-plus-option field from generated metadata', () => {
    expect(compositeFields.map((item) => item.caseName).sort()).toEqual([
      'material_lot.substrate_orientation_polish',
      'process_steps.pressure_system',
      'pvd.plasma_gas_pressure',
    ])
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
      const renderedFreeValue = input.includes('数值') ? Number(free) : free

      let view = renderCompositeCase(testCase, combined)
      expect(view.textbox).toHaveValue(renderedFreeValue)
      expect(view.combobox).toHaveTextContent(localizedOption(option, 'zh'))
      view.unmount()

      view = renderCompositeCase(testCase, free)
      expect(view.textbox).toHaveValue(renderedFreeValue)
      expect(view.combobox).toHaveAttribute('data-placeholder')
      view.unmount()

      view = renderCompositeCase(testCase, option)
      expect(view.textbox).toHaveValue(input.includes('数值') ? null : '')
      expect(view.combobox).toHaveTextContent(localizedOption(option, 'zh'))
      view.unmount()

      view = renderCompositeCase(testCase, 'legacy malformed value')
      expect(view.textbox).toHaveValue('legacy malformed value')
      expect(view.combobox).toHaveAttribute('data-placeholder')
      await view.user.clear(view.textbox)
      await view.user.type(view.textbox, free)
      await view.user.click(view.combobox)
      await view.user.click(
        screen.getByRole('option', { name: localizedOption(option, 'zh') }),
      )
      expect(await view.submit()).toEqual(
        testCase.source === 'entity'
          ? {
              value: input.includes('数值') ? Number(free) : free,
              option,
            }
          : combined,
      )
      cleanup()
    },
  )
})

describe('FieldControl dropdown with other value', () => {
  it('does not submit the vocabulary note and accepts a free-text value', async () => {
    await i18n.changeLanguage('zh')
    const field = experimentModules.precursors.find(
      (item) => item.key === 'appearance',
    )!
    const view = renderControl('precursors', field)

    await view.user.click(screen.getByRole('combobox', { name: /使用前状态/ }))
    expect(
      screen.queryByRole('option', { name: '受控+其他' }),
    ).not.toBeInTheDocument()
    await view.user.click(screen.getByRole('option', { name: '其他' }))
    await view.user.type(
      screen.getByRole('textbox', { name: /使用前状态.*其他内容/ }),
      '潮湿发黏',
    )

    expect(view.onChange).toHaveBeenLastCalledWith('潮湿发黏')
  })
})

describe('FieldControl multi-value dropdown', () => {
  it('selects, restores, and submits multiple setup capabilities without collapsing them', async () => {
    await i18n.changeLanguage('zh')
    const field = experimentModules.equipment.find(
      (item) => item.key === 'field_devices',
    )!
    let view = renderControl('equipment', field, [])

    expect(screen.getByRole('group', { name: '外场能力' })).toBeInTheDocument()
    await view.user.click(screen.getByRole('checkbox', { name: '光' }))
    await view.user.click(screen.getByRole('checkbox', { name: '电' }))
    expect(view.onChange).toHaveBeenLastCalledWith(['light', 'electric_field'])
    expect(
      buildItemPayload('equipment', {
        field_devices: view.onChange.mock.lastCall![0],
      }).field_devices,
    ).toEqual(['light', 'electric_field'])
    view.unmount()

    view = renderControl('equipment', field, ['light', 'electric_field'])
    expect(screen.getByRole('checkbox', { name: '光' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '电' })).toBeChecked()
    view.unmount()

    await i18n.changeLanguage('en')
    renderControl('equipment', field, ['light', 'electric_field'])
    expect(
      screen.getByRole('group', { name: 'External field capabilities' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'Electric field' }),
    ).toBeChecked()
  })
})

describe('FieldControl descriptions and numeric constraints', () => {
  it('shows bilingual upstream-negative and downstream-positive help on both distance controls', async () => {
    await i18n.changeLanguage('zh')
    const precursorPosition = experimentModules.precursors.find(
      (item) => item.key === 'source_position',
    )!
    const precursor = renderControl(
      'precursors',
      precursorPosition,
      JSON.stringify({ zone_index: 1, distance_mm: -20 }),
      vi.fn(),
      { phase_state: 'solid', loading_method: 'boat' },
    )
    expect(
      screen.getByText(/沿气流方向，上游填负值，下游填正值/),
    ).toBeInTheDocument()
    precursor.unmount()

    await i18n.changeLanguage('en')
    const substrateDistance = experimentModules.substrates.find(
      (item) => item.key === 'zone_thermocouple_distance_mm',
    )!
    renderControl('substrates', substrateDistance, '')
    expect(
      screen.getByText(/upstream positions as negative.*downstream.*positive/i),
    ).toBeInTheDocument()
  })

  it('shows the precursor amount unit selected by phase instead of a slash-combined label', async () => {
    await i18n.changeLanguage('zh')
    const field = experimentModules.precursors.find(
      (item) => item.key === 'amount',
    )!

    const solid = renderControl('precursors', field, '20', vi.fn(), {
      phase_state: 'solid',
    })
    expect(screen.getByLabelText(/用量.*mg/)).toBeInTheDocument()
    expect(screen.queryByText(/mg\(固\).*µL/)).not.toBeInTheDocument()
    solid.unmount()

    renderControl('precursors', field, '20', vi.fn(), {
      phase_state: 'liquid',
    })
    expect(screen.getByLabelText(/用量.*µL/)).toBeInTheDocument()
  })

  it('reports a non-finite number inline', async () => {
    await i18n.changeLanguage('en')
    const field = experimentModules.basic_info.find(
      (item) => item.key === 'ambient_temperature_C',
    )!
    renderControl('basic_info', field, '1e309')

    const input = screen.getByRole('spinbutton', {
      name: /Ambient temperature/,
    })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter a finite number')).toBeInTheDocument()
  })

  it('links help and an inline range error to the space-group input', async () => {
    await i18n.changeLanguage('zh')
    const field = experimentModules.target_product.find(
      (item) => item.key === 'bulk_space_group',
    )!
    renderControl('target_product', field, '250')

    const input = screen.getByRole('combobox', { name: '目标体相空间群' })
    const error = screen.getByText('请输入 1–230 的整数')
    const help = screen.getByText(/先从常见物相中选择/)
    const describedBy = input.getAttribute('aria-describedby')?.split(' ')

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(describedBy).toEqual(expect.arrayContaining([error.id, help.id]))
  })

  it('uses generated bounds and explains the violated boundary', async () => {
    await i18n.changeLanguage('en')
    const field = experimentModules.basic_info.find(
      (item) => item.key === 'ambient_humidity_percent',
    )!
    renderControl('basic_info', field, '101')

    const input = screen.getByRole('spinbutton', {
      name: /Ambient relative humidity/,
    })
    expect(input).toHaveAttribute('min', '0')
    expect(input).toHaveAttribute('max', '100')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter a value at most 100')).toBeInTheDocument()
  })

  it('uses integer metadata for the input step and validation', async () => {
    await i18n.changeLanguage('en')
    const field = experimentModules.target_product.find(
      (item) => item.key === 'target_layer_count',
    )!
    renderControl('target_product', field, '1.5')

    const input = screen.getByRole('spinbutton', {
      name: /Target atomic-layer count/,
    })
    expect(input).toHaveAttribute('step', '1')
    expect(screen.getByText('Enter an integer')).toBeInTheDocument()
  })
})
