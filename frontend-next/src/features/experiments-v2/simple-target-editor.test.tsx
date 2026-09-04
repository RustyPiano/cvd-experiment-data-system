import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'

import i18n from '@/shared/i18n'

import { TargetBulkPhaseSelect } from './components/target-bulk-phase-select'
import {
  SimpleGrowthEditor,
  SimpleSourceLoadsEditor,
  SimpleSubstratesEditor,
  SimpleTargetEditor,
  simpleSubstrateRelationsAreValid,
  simpleSubstrateIsValid,
  sourceLoadIngredientsAreValid,
  sourcePreparationStepsAreValid,
  sourceSolutionMode,
} from './simple-preparation-editors'
import type {
  SimpleChannel,
  SimpleProcessSettings,
  SimpleProcessEvent,
  SimpleSourceLoad,
  SimpleTarget,
} from './simple-preparation-editors'

vi.mock('./components/entity-reference-select', () => ({
  EntityReferenceSelect: ({
    allowedLotCategories,
    onChange,
  }: {
    allowedLotCategories?: string[]
    onChange: (id: string, entity: unknown) => void
  }) =>
    allowedLotCategories?.includes('gas_cylinder') ? (
      <button
        type="button"
        onClick={() =>
          onChange('gas-lot-1', {
            latest_version: {
              version: 2,
              data: {
                lot_category: 'gas_cylinder',
                substance_name: '5% H2 / Ar',
                gas_components: [
                  { species: 'H2', volume_percent: 5 },
                  { species: 'Ar', volume_percent: 95 },
                ],
              },
            },
          })
        }
      >
        选择气瓶批次
      </button>
    ) : (
      <div>物料批次选择器</div>
    ),
}))

describe('simple target phase editing', () => {
  it('locates a missing required formula at the field', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <SimpleTargetEditor
          target={{
            architecture_type: 'single_region',
            material_regions: [
              {
                region_key: 'film',
                formula: '',
                spatial_role: 'single_region',
              },
            ],
            composition_relations: [],
          }}
          onChange={vi.fn()}
          disabled={false}
          showErrors
        />
      </I18nextProvider>,
    )

    expect(screen.getByPlaceholderText('例如 MoS2')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByText('请填写材料化学式。')).toBeInTheDocument()
    expect(screen.getByText('此项为必填')).toBeInTheDocument()
  })

  it('selects one catalog phase and returns its space group', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <I18nextProvider i18n={i18n}>
        <TargetBulkPhaseSelect formula="MoS2" onChange={onChange} />
      </I18nextProvider>,
    )

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: /2H.*No. 194/ }))

    expect(onChange).toHaveBeenCalledWith('2H', 194)
  })

  it('clears a phase that no longer matches an edited formula', () => {
    const initial: SimpleTarget = {
      architecture_type: 'single_region',
      material_regions: [
        {
          region_key: 'film',
          formula: 'MoS2',
          spatial_role: 'single_region',
          target_bulk_phase: '2H',
          target_bulk_space_group_number: 194,
        },
      ],
      composition_relations: [],
    }
    function Wrapper() {
      const [target, setTarget] = useState(initial)
      return (
        <I18nextProvider i18n={i18n}>
          <SimpleTargetEditor
            target={target}
            onChange={setTarget}
            disabled={false}
          />
        </I18nextProvider>
      )
    }
    render(<Wrapper />)

    expect(screen.getByText(/目标材料体系/)).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: '目标材料体系' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('补充目标信息')).not.toBeInTheDocument()
    expect(screen.getByText('目标层数')).toBeInTheDocument()
    expect(screen.getByText('目标产物形态')).toBeInTheDocument()
    expect(screen.queryByText('目标覆盖状态')).not.toBeInTheDocument()
    expect(screen.queryByText('目标平面轮廓')).not.toBeInTheDocument()
    expect(screen.queryByText('目标生长取向')).not.toBeInTheDocument()
    expect(screen.getByText('实验目标')).toBeInTheDocument()
    expect(screen.getByText('补充说明')).toBeInTheDocument()
    expect(document.querySelectorAll('.text-destructive')).toHaveLength(2)
    expect(screen.getByText('目标晶体结构')).toBeInTheDocument()
    expect(document.querySelector('details')).toBeNull()

    fireEvent.change(screen.getByPlaceholderText('例如 MoS2'), {
      target: { value: 'BN' },
    })

    expect(
      screen.getByText('化学式已变更，原晶体结构选择已清除，请重新选择。'),
    ).toBeInTheDocument()
  })

  it('edits an alloy as equal solid-solution components', () => {
    const target: SimpleTarget = {
      architecture_type: 'single_region',
      material_regions: [
        {
          region_key: 'film',
          formula: 'Mo0.5W0.5S2',
          spatial_role: 'single_region',
        },
      ],
      composition_relations: ['MoS2', 'WS2'].map((species) => ({
        relation_type: 'solid_solution_component',
        host_region_key: 'film',
        species,
        nominal_value: 0.5,
        value_basis: 'mol_fraction',
      })),
    }
    render(
      <I18nextProvider i18n={i18n}>
        <SimpleTargetEditor
          target={target}
          onChange={vi.fn()}
          disabled={false}
        />
      </I18nextProvider>,
    )

    expect(screen.getAllByText('材料化学式')).toHaveLength(2)
    expect(screen.getAllByText('目标摩尔分数')).toHaveLength(2)
    expect(screen.getByText('Mo₀.₅W₀.₅S₂')).toBeInTheDocument()
    expect(screen.queryByText('被取代元素')).not.toBeInTheDocument()
    expect(screen.queryByText('取代元素')).not.toBeInTheDocument()
  })

  it('shows planar outline only for discrete planar crystals and clears it for other forms', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const target: SimpleTarget = {
      architecture_type: 'single_region',
      material_regions: [
        {
          region_key: 'film',
          formula: 'MoS2',
          spatial_role: 'single_region',
        },
      ],
      composition_relations: [],
      dimensional_form: 'discrete_planar_crystal',
      in_plane_outline: 'triangle',
    }
    render(
      <I18nextProvider i18n={i18n}>
        <SimpleTargetEditor
          target={target}
          onChange={onChange}
          disabled={false}
        />
      </I18nextProvider>,
    )

    expect(screen.getByText('目标平面轮廓')).toBeInTheDocument()
    expect(screen.queryByText('目标覆盖状态')).not.toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: '目标产物形态' }))
    await user.click(screen.getByRole('option', { name: '管状' }))

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dimensional_form: 'tube',
        in_plane_outline: undefined,
      }),
    )
  })

  it('groups substitutional and non-substitutional dopant sites', async () => {
    const user = userEvent.setup()
    const target: SimpleTarget = {
      architecture_type: 'single_region',
      material_regions: [
        {
          region_key: 'film',
          formula: 'MoS2',
          spatial_role: 'single_region',
        },
      ],
      composition_relations: [
        {
          relation_type: 'doped_by',
          host_region_key: 'film',
          species: 'Pt',
          value_basis: 'at_percent',
        },
      ],
    }
    render(
      <I18nextProvider i18n={i18n}>
        <SimpleTargetEditor
          target={target}
          onChange={vi.fn()}
          disabled={false}
        />
      </I18nextProvider>,
    )

    expect(screen.getByText('目标层数')).toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: '目标位点' }))

    expect(screen.getByText('取代位点')).toBeInTheDocument()
    expect(screen.getByText('非取代位点')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Mo 位点' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'S 位点' })).toBeInTheDocument()
  })
})

describe('simple precursor position editing', () => {
  it('explains the required empty state before the first precursor is added', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <I18nextProvider i18n={i18n}>
        <SimpleSourceLoadsEditor
          loads={[]}
          zoneCount={1}
          disabled={false}
          onChange={onChange}
        />
      </I18nextProvider>,
    )

    expect(
      screen.getByText('尚未添加前驱体；本步骤至少需要一处前驱体装载。'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '添加另一处装载' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '添加前驱体' }))
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        loading_method: '',
        ingredients: [expect.objectContaining({ material_lot_id: '' })],
      }),
    ])
  })

  it('locates missing loading and position fields', () => {
    const load: SimpleSourceLoad = {
      load_key: 'load_1',
      loading_method: '',
      preparation_steps: [],
      position_program: [],
      ingredients: [
        {
          material_lot_id: '',
          material_lot_version: 0,
          function_role: '',
        },
      ],
    }
    const view = render(
      <I18nextProvider i18n={i18n}>
        <SimpleSourceLoadsEditor
          loads={[load]}
          zoneCount={2}
          disabled={false}
          showErrors
          onChange={vi.fn()}
        />
      </I18nextProvider>,
    )

    expect(screen.getByText('请选择装载方式。')).toBeInTheDocument()

    view.rerender(
      <I18nextProvider i18n={i18n}>
        <SimpleSourceLoadsEditor
          loads={[{ ...load, loading_method: 'boat' }]}
          zoneCount={2}
          disabled={false}
          showErrors
          onChange={vi.fn()}
        />
      </I18nextProvider>,
    )
    expect(screen.getByText('请选择所在温区。')).toBeInTheDocument()
    expect(
      screen.getByText('请填写相对于所选温区测温点的位置。'),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText('例如 -20')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('rejects duplicate lots and invalid precursor amounts', () => {
    const ingredient = {
      material_lot_id: 'lot_1',
      material_lot_version: 1,
      function_role: 'metal_source',
      amount: 1,
      unit: 'mg',
    }
    expect(sourceLoadIngredientsAreValid([ingredient])).toBe(true)
    expect(sourceLoadIngredientsAreValid([ingredient, ingredient])).toBe(false)
    expect(sourceLoadIngredientsAreValid([{ ...ingredient, amount: 0 }])).toBe(
      false,
    )
    expect(sourceLoadIngredientsAreValid([{ ...ingredient, amount: -1 }])).toBe(
      false,
    )
    expect(
      sourceLoadIngredientsAreValid([{ ...ingredient, amount: Number.NaN }]),
    ).toBe(false)
  })

  it('marks the unit as required after an amount is entered', async () => {
    const user = userEvent.setup()
    const initial: SimpleSourceLoad = {
      load_key: 'load_1',
      loading_method: 'substrate_surface',
      preparation_steps: [],
      position_program: [],
      ingredients: [
        {
          material_lot_id: 'lot_1',
          material_lot_version: 1,
          function_role: 'metal_source',
          amount: 12,
        },
      ],
    }

    function Wrapper() {
      const [loads, setLoads] = useState([initial])
      return (
        <I18nextProvider i18n={i18n}>
          <SimpleSourceLoadsEditor
            loads={loads}
            zoneCount={2}
            disabled={false}
            showErrors
            onChange={setLoads}
          />
        </I18nextProvider>
      )
    }

    render(<Wrapper />)

    const unit = screen.getByLabelText(/单位/)
    expect(unit).toHaveAttribute('placeholder', '选择或输入单位')
    expect(unit).toHaveAttribute('list', 'load_1-ingredient-0-unit-options')
    expect(unit).toHaveAttribute('aria-invalid', 'true')
    expect(
      document.querySelector('label[for="load_1-ingredient-0-unit"]'),
    ).toHaveTextContent('单位 *')
    expect(screen.getByText('请填写用量单位。')).toBeInTheDocument()

    await user.type(unit, 'mg')

    expect(unit).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText('请填写用量单位。')).not.toBeInTheDocument()
  })

  it('uses gas cylinders without a redundant amount and clears incompatible fields when switching', async () => {
    const user = userEvent.setup()
    const initial: SimpleSourceLoad = {
      load_key: 'load_gas',
      loading_method: 'boat',
      heating_zone_ref: 'zone_1',
      initial_position: { axial_mm: -20, reference: 'zone_thermocouple' },
      position_program: [
        {
          t_s: 60,
          axial_mm: 0,
          reference: 'zone_thermocouple',
        },
      ],
      substrate_source_ids: ['substrate-1'],
      preparation_steps: [
        {
          step_type: 'spin_coat',
          sequence: 1,
          parameters: {
            stages: [{ speed_rpm: 1000, duration_s: 10 }],
          },
        },
      ],
      ingredients: [
        {
          material_lot_id: 'chemical-lot-1',
          material_lot_version: 1,
          process_roles: ['transport_agent'],
          amount: 1,
          unit: 'mL',
          concentration_value: 0.5,
          concentration_unit: 'mol_per_L',
        },
      ],
    }

    function Wrapper() {
      const [loads, setLoads] = useState([initial])
      return (
        <I18nextProvider i18n={i18n}>
          <SimpleSourceLoadsEditor
            loads={loads}
            zoneCount={2}
            disabled={false}
            showErrors
            onChange={setLoads}
          />
          <output data-testid="loads">{JSON.stringify(loads)}</output>
        </I18nextProvider>
      )
    }

    render(<Wrapper />)

    await user.click(screen.getAllByRole('combobox')[0])
    await user.click(screen.getByRole('option', { name: '气路供给' }))

    let load = JSON.parse(
      screen.getByTestId('loads').textContent ?? '',
    )[0] as SimpleSourceLoad
    expect(load).toMatchObject({
      loading_method: 'gas_line',
      preparation_steps: [],
      position_program: [],
      substrate_source_ids: [],
      ingredients: [
        {
          material_lot_id: '',
          material_lot_version: 0,
        },
      ],
    })
    expect(load).not.toHaveProperty('heating_zone_ref')
    expect(load).not.toHaveProperty('initial_position')
    expect(screen.queryByText('用量')).not.toBeInTheDocument()
    expect(screen.queryByText('处理方式')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '选择气瓶批次' }))
    load = JSON.parse(
      screen.getByTestId('loads').textContent ?? '',
    )[0] as SimpleSourceLoad
    expect(load.ingredients[0]).toMatchObject({
      material_lot_id: 'gas-lot-1',
      material_lot_version: 2,
    })
    expect(sourceLoadIngredientsAreValid(load.ingredients, false, false)).toBe(
      true,
    )
    expect(
      screen.getByRole('button', { name: '添加另一种物料' }),
    ).toBeInTheDocument()

    await user.click(screen.getAllByRole('combobox')[0])
    await user.click(screen.getByRole('option', { name: '舟' }))
    load = JSON.parse(
      screen.getByTestId('loads').textContent ?? '',
    )[0] as SimpleSourceLoad
    expect(load.ingredients).toEqual([
      {
        material_lot_id: '',
        material_lot_version: 0,
      },
    ])
    expect(sourceLoadIngredientsAreValid(load.ingredients)).toBe(false)
  })

  it('records drop volume and switches immersion to concentration and time without amount', async () => {
    const user = userEvent.setup()
    const initial: SimpleSourceLoad = {
      load_key: 'coating',
      loading_method: 'substrate_surface',
      preparation_steps: [],
      position_program: [],
      ingredients: [{ material_lot_id: 'lot', material_lot_version: 1 }],
    }
    function Wrapper() {
      const [loads, setLoads] = useState([initial])
      return (
        <I18nextProvider i18n={i18n}>
          <SimpleSourceLoadsEditor
            loads={loads}
            zoneCount={1}
            disabled={false}
            showErrors
            onChange={setLoads}
          />
          <output data-testid="coating-loads">{JSON.stringify(loads)}</output>
        </I18nextProvider>
      )
    }
    render(<Wrapper />)
    await user.click(screen.getByRole('button', { name: '新增处理步骤' }))
    await user.click(screen.getByRole('combobox', { name: /^处理方式/ }))
    expect(
      screen.queryByRole('option', { name: '研磨' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: '混合' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: '预退火' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: '滴涂' }))
    await user.type(screen.getByRole('textbox', { name: /^溶剂/ }), '水')
    expect(screen.getByText('滴加体积')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^溶液浓度/), '0.1')
    await user.click(screen.getByRole('combobox', { name: /^浓度单位/ }))
    await user.click(screen.getByRole('option', { name: 'mol/L' }))
    await user.type(screen.getByRole('spinbutton', { name: '' }), '20')
    await user.type(screen.getByLabelText(/^单位/), 'μL')
    let load = JSON.parse(
      screen.getByTestId('coating-loads').textContent ?? '',
    )[0] as SimpleSourceLoad
    expect(
      sourceLoadIngredientsAreValid(load.ingredients, true, true, true, true),
    ).toBe(true)
    expect(load.ingredients[0].amount).toBe(20)
    await user.click(screen.getByRole('combobox', { name: /^处理方式/ }))
    await user.click(screen.getByRole('option', { name: '浸渍' }))
    await user.type(screen.getByRole('textbox', { name: /^溶剂/ }), '水')
    await user.type(screen.getByLabelText(/^浸渍时长/), '5')
    expect(screen.queryByText('滴加体积')).not.toBeInTheDocument()
    expect(screen.queryByText('用量')).not.toBeInTheDocument()
    load = JSON.parse(
      screen.getByTestId('coating-loads').textContent ?? '',
    )[0] as SimpleSourceLoad
    expect(load.ingredients[0].amount).toBeUndefined()
    expect(sourceSolutionMode(load.preparation_steps).immersionOnly).toBe(true)
    expect(
      sourcePreparationStepsAreValid(
        load.preparation_steps,
        'substrate_surface',
      ),
    ).toBe(true)
    expect(sourcePreparationStepsAreValid(load.preparation_steps, 'boat')).toBe(
      false,
    )
    expect(
      sourceLoadIngredientsAreValid(load.ingredients, true, false, true),
    ).toBe(true)
    expect(
      sourceLoadIngredientsAreValid(
        [
          {
            ...load.ingredients[0],
            concentration_value: undefined,
            concentration_unit: undefined,
          },
        ],
        true,
        false,
        true,
      ),
    ).toBe(false)
  })

  it('expands and stores the selected precursor treatment parameters', async () => {
    const user = userEvent.setup()
    const initial: SimpleSourceLoad = {
      load_key: 'load_1',
      loading_method: 'substrate_surface',
      preparation_steps: [],
      position_program: [],
      ingredients: [
        {
          material_lot_id: '',
          material_lot_version: 0,
          function_role: '',
        },
      ],
    }

    function Wrapper() {
      const [loads, setLoads] = useState([initial])
      return (
        <I18nextProvider i18n={i18n}>
          <SimpleSourceLoadsEditor
            loads={loads}
            zoneCount={2}
            disabled={false}
            onChange={setLoads}
          />
          <output data-testid="loads">{JSON.stringify(loads)}</output>
        </I18nextProvider>
      )
    }

    render(<Wrapper />)

    await user.click(screen.getByRole('button', { name: '新增处理步骤' }))
    await user.click(screen.getByRole('combobox', { name: /^处理方式/ }))
    await user.click(screen.getByRole('option', { name: '旋涂' }))
    await user.type(screen.getByLabelText(/^转速 \(rpm\)/), '3000')
    await user.type(screen.getByLabelText(/^时长 \(s\)/), '60')

    const loads = JSON.parse(
      screen.getByTestId('loads').textContent ?? '',
    ) as SimpleSourceLoad[]
    expect(loads[0].preparation_steps).toEqual([
      {
        step_type: 'spin_coat',
        sequence: 1,
        parameters: {
          stages: [{ speed_rpm: 3000, duration_s: 60 }],
        },
      },
    ])
    expect(sourcePreparationStepsAreValid(loads[0].preparation_steps)).toBe(
      true,
    )
  })

  it('uses the selected zone thermocouple as zero with signed flow direction', async () => {
    const user = userEvent.setup()
    const initial: SimpleSourceLoad = {
      load_key: 'load_1',
      loading_method: 'boat',
      preparation_steps: [],
      position_program: [],
      ingredients: [
        {
          material_lot_id: '',
          material_lot_version: 0,
          function_role: '',
        },
      ],
    }

    function Wrapper() {
      const [loads, setLoads] = useState([initial])
      return (
        <I18nextProvider i18n={i18n}>
          <SimpleSourceLoadsEditor
            loads={loads}
            zoneCount={2}
            disabled={false}
            onChange={setLoads}
          />
        </I18nextProvider>
      )
    }

    render(<Wrapper />)

    expect(
      screen.getByText(
        '相对于所选温区的测温点位置：以测温点为 0 mm；沿气流方向，上游填负值，下游填正值。',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('相对测温点位置（mm）')).toBeInTheDocument()
    const position = screen.getByPlaceholderText('例如 -20')
    expect(position).toBeDisabled()

    await user.click(screen.getAllByRole('combobox')[1])
    await user.click(screen.getByRole('option', { name: '温区 1' }))
    expect(position).toBeEnabled()

    await user.type(position, '-20')
    expect(position).toHaveValue(-20)
  })

  it('does not silently reinterpret a legacy setup-origin position', () => {
    const load: SimpleSourceLoad = {
      load_key: 'legacy_load',
      loading_method: 'boat',
      heating_zone_ref: 'zone_1',
      initial_position: {
        axial_mm: -20,
        reference: 'setup_origin',
      },
      preparation_steps: [],
      position_program: [],
      ingredients: [
        {
          material_lot_id: '',
          material_lot_version: 0,
          function_role: '',
        },
      ],
    }

    render(
      <I18nextProvider i18n={i18n}>
        <SimpleSourceLoadsEditor
          loads={[load]}
          zoneCount={2}
          disabled={false}
          onChange={vi.fn()}
        />
      </I18nextProvider>,
    )

    expect(
      screen.getByText(
        '此记录使用旧装置原点参照；请按当前规则重新确认温区和相对测温点位置。',
      ),
    ).toBeInTheDocument()
  })

  it('binds a surface load without presenting inferred process roles', async () => {
    const user = userEvent.setup()
    const initial: SimpleSourceLoad = {
      load_key: 'load_surface',
      loading_method: 'substrate_surface',
      substrate_source_ids: [],
      preparation_steps: [],
      position_program: [],
      ingredients: [
        {
          material_lot_id: 'lot_1',
          material_lot_version: 1,
          function_role: 'metal_source',
          process_roles: [],
        },
      ],
    }
    function Wrapper() {
      const [loads, setLoads] = useState([initial])
      return (
        <I18nextProvider i18n={i18n}>
          <SimpleSourceLoadsEditor
            loads={loads}
            substrates={[
              {
                source_id: 'stable-substrate-id',
                piece_label: 'S1',
                zone_thermocouple_distance_mm: JSON.stringify({
                  zone_index: 2,
                  distance_mm: 15,
                }),
              },
            ]}
            zoneCount={2}
            disabled={false}
            showErrors
            onChange={setLoads}
          />
          <output data-testid="loads">{JSON.stringify(loads)}</output>
        </I18nextProvider>
      )
    }
    render(<Wrapper />)

    expect(screen.queryByText(/历史作用分类/)).not.toBeInTheDocument()
    expect(screen.queryByText(/工艺作用/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', { name: '促进反应或成核' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('温区 2，相对测温点 15 mm')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /衬底片 1/ }))

    const load = JSON.parse(
      screen.getByTestId('loads').textContent ?? '',
    )[0] as SimpleSourceLoad
    expect(load.substrate_source_ids).toEqual(['stable-substrate-id'])
  })

  it('rejects a surface binding whose substrate was deleted', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <SimpleSourceLoadsEditor
          loads={[
            {
              load_key: 'stale_surface',
              loading_method: 'substrate_surface',
              substrate_source_ids: ['deleted-substrate'],
              preparation_steps: [],
              position_program: [],
              ingredients: [
                {
                  material_lot_id: 'lot_1',
                  material_lot_version: 1,
                  process_roles: [],
                },
              ],
            },
          ]}
          substrates={[]}
          zoneCount={2}
          disabled={false}
          showErrors
          onChange={vi.fn()}
        />
      </I18nextProvider>,
    )

    expect(
      screen.getByText(
        '请至少选择一片当前衬底；如关联的衬底已删除，请重新选择。',
      ),
    ).toBeInTheDocument()
  })

  it('requires paired concentration fields only for a spin-coated load', async () => {
    const user = userEvent.setup()
    const initial: SimpleSourceLoad = {
      load_key: 'load_spin',
      loading_method: 'boat',
      heating_zone_ref: 'zone_1',
      initial_position: { axial_mm: 0, reference: 'zone_thermocouple' },
      substrate_source_ids: [],
      preparation_steps: [
        {
          step_type: 'spin_coat',
          sequence: 1,
          parameters: {
            stages: [{ speed_rpm: 1000, duration_s: 10 }],
          },
        },
      ],
      position_program: [],
      ingredients: [
        {
          material_lot_id: 'lot_1',
          material_lot_version: 1,
          process_roles: [],
          amount: 1,
          unit: 'mL',
        },
      ],
    }
    function Wrapper() {
      const [loads, setLoads] = useState([initial])
      return (
        <I18nextProvider i18n={i18n}>
          <SimpleSourceLoadsEditor
            loads={loads}
            zoneCount={2}
            disabled={false}
            showErrors
            onChange={setLoads}
          />
          <output data-testid="loads">{JSON.stringify(loads)}</output>
        </I18nextProvider>
      )
    }
    render(<Wrapper />)

    await user.type(screen.getByRole('spinbutton', { name: '溶液浓度' }), '0.5')
    expect(screen.getByText('填写浓度后，请选择单位。')).toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: /浓度单位/ }))
    await user.click(screen.getByRole('option', { name: 'mol/L' }))

    const load = JSON.parse(
      screen.getByTestId('loads').textContent ?? '',
    )[0] as SimpleSourceLoad
    expect(load.ingredients[0]).toMatchObject({
      concentration_value: 0.5,
      concentration_unit: 'mol_per_L',
    })
    expect(sourceLoadIngredientsAreValid(load.ingredients, true)).toBe(true)
  })
})

describe('simple substrate validation', () => {
  it('explains that at least one substrate is required', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <I18nextProvider i18n={i18n}>
        <SimpleSubstratesEditor
          substrates={[]}
          placementRelations={[]}
          zoneCount={1}
          disabled={false}
          onChange={onChange}
          onPlacementRelationsChange={vi.fn()}
        />
      </I18nextProvider>,
    )

    expect(
      screen.getByText('尚未添加衬底片；本步骤至少需要一片衬底。'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '添加衬底片' }))
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ piece_label: 'S1' }),
    ])
  })

  const substrate = {
    lot_ref: '{"entity_id":"lot_1","version":1,"snapshot":{}}',
    zone_thermocouple_distance_mm: JSON.stringify({
      zone_index: 1,
      distance_mm: 0,
    }),
    pretreatment_steps: '[]',
    size_placement: JSON.stringify({
      length_mm: 10,
      width_mm: 10,
      placement: 'face_up',
    }),
  }

  it('区分尚未选择批次与已选批次未记录晶向', () => {
    const props = {
      placementRelations: [],
      zoneCount: 1,
      disabled: false,
      onChange: vi.fn(),
      onPlacementRelationsChange: vi.fn(),
    }
    const { rerender } = render(
      <SimpleSubstratesEditor
        {...props}
        substrates={[{ ...substrate, lot_ref: '' }]}
      />,
    )
    expect(screen.queryByText('批次未记录')).not.toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    rerender(<SimpleSubstratesEditor {...props} substrates={[substrate]} />)
    expect(screen.getByText('批次未记录')).toBeInTheDocument()
    expect(screen.queryByText('衬底处理（推荐填写）')).not.toBeInTheDocument()
    expect(screen.getByText('衬底处理')).toBeInTheDocument()
  })

  it('allows omitted thickness and rejects invalid placement details', () => {
    expect(simpleSubstrateIsValid(substrate, 2)).toBe(true)
    expect(
      simpleSubstrateIsValid(
        {
          ...substrate,
          size_placement: JSON.stringify({
            length_mm: 10,
            width_mm: 10,
            thickness_mm: 0,
            placement: 'face_up',
          }),
        },
        2,
      ),
    ).toBe(false)
    expect(
      simpleSubstrateIsValid(
        {
          ...substrate,
          size_placement: JSON.stringify({
            length_mm: 5,
            width_mm: 10,
            placement: 'face_up',
          }),
        },
        2,
      ),
    ).toBe(false)
    expect(
      simpleSubstrateIsValid(
        {
          ...substrate,
          size_placement: JSON.stringify({
            length_mm: 10,
            width_mm: 10,
            placement: 'other',
          }),
        },
        2,
      ),
    ).toBe(false)
  })

  it('requires a thermocouple reference and rejects invalid tilt boundaries', () => {
    expect(
      simpleSubstrateIsValid(
        {
          ...substrate,
          zone_thermocouple_distance_mm: '',
          axial_position_mm: '20',
        },
        2,
      ),
    ).toBe(false)
    expect(
      simpleSubstrateIsValid(
        {
          ...substrate,
          size_placement: JSON.stringify({
            length_mm: 10,
            width_mm: 10,
            placement: 'tilted',
            tilt_angle_deg: 0,
            tilt_azimuth_deg: 0,
          }),
        },
        2,
      ),
    ).toBe(false)
    expect(
      simpleSubstrateIsValid(
        {
          ...substrate,
          size_placement: JSON.stringify({
            length_mm: 10,
            width_mm: 10,
            placement: 'tilted',
            tilt_angle_deg: 90,
            tilt_azimuth_deg: 0,
          }),
        },
        2,
      ),
    ).toBe(false)
  })

  it('requires two tilt angles, an upright direction, and valid piece relations', () => {
    expect(
      simpleSubstrateIsValid(
        {
          ...substrate,
          size_placement: JSON.stringify({
            length_mm: 10,
            width_mm: 5,
            placement: 'tilted',
            tilt_angle_deg: -15,
            tilt_azimuth_deg: 180,
          }),
        },
        2,
      ),
    ).toBe(true)
    expect(
      simpleSubstrateIsValid(
        {
          ...substrate,
          size_placement: JSON.stringify({
            length_mm: 10,
            width_mm: 5,
            placement: 'upright',
          }),
        },
        2,
      ),
    ).toBe(false)
    const pieces = [
      { ...substrate, piece_label: 'S1' },
      { ...substrate, piece_label: 'S2' },
    ]
    expect(
      simpleSubstrateRelationsAreValid(pieces, [
        { piece_a_label: 'S1', piece_b_label: 'S2', gap_mm: 0 },
      ]),
    ).toBe(true)
    expect(
      simpleSubstrateRelationsAreValid(pieces, [
        { piece_a_label: 'S1', piece_b_label: 'S1' },
      ]),
    ).toBe(false)
  })

  it('adds a face-to-face relation with the only two pieces preselected', async () => {
    const user = userEvent.setup()
    const onPlacementRelationsChange = vi.fn()
    render(
      <I18nextProvider i18n={i18n}>
        <SimpleSubstratesEditor
          substrates={[
            { ...substrate, piece_label: 'S1' },
            { ...substrate, piece_label: 'S2' },
          ]}
          placementRelations={[]}
          zoneCount={2}
          disabled={false}
          onChange={vi.fn()}
          onPlacementRelationsChange={onPlacementRelationsChange}
        />
      </I18nextProvider>,
    )

    await user.click(screen.getByRole('button', { name: '添加一组' }))
    expect(onPlacementRelationsChange).toHaveBeenCalledWith([
      { piece_a_label: 'S1', piece_b_label: 'S2' },
    ])
  })

  it('keeps ordered pretreatment steps and clears position when copying', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const item = {
      ...substrate,
      piece_label: 'S1',
      crystal_orientation: '110；single_side_polished',
      pretreatment_steps: JSON.stringify([
        {
          type: 'solvent_cleaning',
          parameters: {
            solvent: 'acetone',
            cleaning_method: 'ultrasonic',
            duration_min: 5,
          },
        },
        { type: 'nitrogen_dry', parameters: {} },
      ]),
    }

    render(
      <I18nextProvider i18n={i18n}>
        <SimpleSubstratesEditor
          substrates={[item]}
          placementRelations={[]}
          zoneCount={2}
          disabled={false}
          onChange={onChange}
          onPlacementRelationsChange={vi.fn()}
        />
      </I18nextProvider>,
    )

    expect(screen.getByText('衬底片 1（S1）')).toBeInTheDocument()
    expect(screen.getByText('晶向与抛光')).toBeInTheDocument()
    expect(screen.getByText('110；单面抛')).toBeInTheDocument()
    expect(screen.getByText('处理步骤 1')).toBeInTheDocument()
    expect(screen.getByText('处理步骤 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '复制本片' }))
    const copied = onChange.mock.calls[0]?.[0] as Array<Record<string, string>>
    expect(copied[1].piece_label).toBe('S2')
    expect(copied[1].zone_thermocouple_distance_mm).toBe('')
    expect(copied[1].pretreatment_steps).toBe(item.pretreatment_steps)
  })
})

describe('simple growth preparation editing', () => {
  it('用勾选框记录本炉异常并同步异常事件', async () => {
    const user = userEvent.setup()
    function Wrapper() {
      const [confirmed, setConfirmed] = useState(false)
      const [events, setEvents] = useState<SimpleProcessEvent[]>([])
      return (
        <I18nextProvider i18n={i18n}>
          <SimpleGrowthEditor
            segments={[]}
            channels={[]}
            settings={{
              pressure_regime: 'atmospheric',
              cooling_method: 'furnace_cooling',
            }}
            events={events}
            processEventsConfirmed={confirmed}
            runId=""
            token="token"
            setupId="setup-1"
            setupSnapshot={{}}
            zoneCount={0}
            disabled={false}
            onTimelineChange={vi.fn()}
            onSettingsChange={vi.fn()}
            onEventsChange={setEvents}
            onProcessEventsConfirmedChange={setConfirmed}
          />
          <output data-testid="anomaly-state">{String(confirmed)}</output>
          <output data-testid="anomaly-count">{events.length}</output>
          <output data-testid="anomaly-types">
            {events[0]?.observed_deviations.join(',')}
          </output>
        </I18nextProvider>
      )
    }
    render(<Wrapper />)

    const checkbox = screen.getByRole('checkbox', {
      name: '本炉发生过异常',
    })
    expect(checkbox).not.toBeChecked()
    await user.click(checkbox)

    expect(checkbox).toBeChecked()
    expect(screen.getByTestId('anomaly-state')).toHaveTextContent('true')
    expect(screen.getByTestId('anomaly-count')).toHaveTextContent('1')

    await user.click(screen.getByRole('combobox', { name: '异常类型' }))
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual([
      '供电中断',
      '供水中断',
      '供气中断',
      '管路堵塞',
      '压力突变',
      '设备报警',
      '信号异常',
      '计划变更',
      '其他',
    ])
    await user.click(screen.getByRole('option', { name: '计划变更' }))
    expect(screen.getByTestId('anomaly-types')).toHaveTextContent(
      'plan_changed',
    )
    expect(screen.getByText('采取的处理')).toBeInTheDocument()
    expect(screen.getByText('处理结果')).toBeInTheDocument()

    await user.click(checkbox)

    expect(screen.getByTestId('anomaly-state')).toHaveTextContent('false')
    expect(screen.getByTestId('anomaly-count')).toHaveTextContent('0')
  })

  it('分开填写初始设定温度与温度步骤，并只在可判断时显示操作', async () => {
    const user = userEvent.setup()
    function Wrapper() {
      const [settings, setSettings] = useState<SimpleProcessSettings>({
        pressure_regime: 'atmospheric',
        cooling_method: 'furnace_cooling',
      })
      const [channels, setChannels] = useState<SimpleChannel[]>([
        {
          channel_key: 'temperature-zone-1',
          channel_type: 'temperature',
          source_type: 'setpoint',
          subject_type: 'temperature_zone',
          subject_ref: 'zone_1',
          subject_instance_ref: 'setup:setup-1:zone:1',
          zone_index: 1,
          unit: '°C',
          data_kind: 'interval_series',
          series: [{ start_s: 0, value: 20 }],
        },
      ])
      return (
        <I18nextProvider i18n={i18n}>
          <SimpleGrowthEditor
            segments={[]}
            channels={channels}
            settings={settings}
            events={[]}
            processEventsConfirmed={false}
            runId="run-1"
            token="token"
            setupId="setup-1"
            setupSnapshot={{}}
            zoneCount={1}
            disabled={false}
            onTimelineChange={(_, nextChannels) => setChannels(nextChannels)}
            onSettingsChange={setSettings}
            onEventsChange={vi.fn()}
          />
          <output data-testid="growth-channels">
            {JSON.stringify(channels)}
          </output>
        </I18nextProvider>
      )
    }
    render(<Wrapper />)

    expect(screen.getByLabelText(/初始设定温度/)).toHaveValue(20)
    expect(
      screen.getByText(
        '每个温区上传一个 CSV：time_s 为距实验开始的秒数，value 为温度（℃）。',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/先填写初始/)).not.toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: '降温方式' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('待判断')).not.toBeInTheDocument()
    expect(screen.getByText('尚未添加气体')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '添加温度步骤' }))

    expect(screen.getByText('步骤 1')).toBeInTheDocument()
    expect(screen.queryByText('待判断')).not.toBeInTheDocument()
    await user.type(
      screen.getByLabelText('温区 1 第 1 步持续时间（min）'),
      '30',
    )
    await user.type(
      screen.getByLabelText('温区 1 第 1 步终点设定温度（℃）'),
      '750',
    )
    expect(screen.getByText('升温')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^过程总时长/), '100')
    await user.click(screen.getByRole('button', { name: '添加气体' }))
    const channels = JSON.parse(
      screen.getByTestId('growth-channels').textContent ?? '[]',
    ) as SimpleChannel[]
    expect(
      channels.find((channel) => channel.channel_type === 'flow')?.series,
    ).toEqual([
      {
        start_s: 0,
        end_s: 6000,
        value: '',
        timing_preset: 'whole_process',
      },
    ])
    expect(screen.getByText('流量测量方式')).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: '供气使用时段' }),
    ).toHaveTextContent('全程（0–100 min）')
    await user.click(screen.getByRole('combobox', { name: '气体种类' }))
    await user.click(screen.getByRole('option', { name: '预混气' }))
    await user.click(screen.getByRole('combobox', { name: '流量测量方式' }))
    await user.click(
      screen.getByRole('option', { name: '浮子流量计（转子流量计）' }),
    )
    await user.click(screen.getByRole('combobox', { name: '流量单位' }))
    await user.click(screen.getByRole('option', { name: /^L\/min$/ }))
    await user.type(screen.getByLabelText('预混气总流量读数（L/min）'), '1')
    const raw = JSON.parse(
      screen.getByTestId('growth-channels').textContent ?? '[]',
    ) as SimpleChannel[]
    expect(
      raw.find((channel) => channel.channel_type === 'flow'),
    ).toMatchObject({
      gas_species_code: 'premixed',
      measurement_source: 'rotameter',
      source_type: 'measured',
      unit: 'L/min',
      series: [{ value: 1, end_s: 6000 }],
    })
    await user.clear(screen.getByLabelText(/^过程总时长/))
    await user.type(screen.getByLabelText(/^过程总时长/), '120')
    expect(
      screen.getByRole('combobox', { name: '供气使用时段' }),
    ).toHaveTextContent('全程（0–120 min）')
    await user.click(screen.getByRole('combobox', { name: '降温方式' }))
    await user.click(screen.getByRole('option', { name: '分段降温' }))
    await user.click(screen.getByRole('combobox', { name: '第 1 段降温方式' }))
    await user.click(screen.getByRole('option', { name: '程序降温' }))
    await user.click(screen.getByRole('combobox', { name: '第 2 段降温方式' }))
    await user.click(screen.getByRole('option', { name: '随炉冷却' }))
    expect(screen.getByText('降温步骤填写在温度程序中。')).toBeInTheDocument()
    expect(screen.queryByText('降温速率（℃/min）')).not.toBeInTheDocument()
  })

  it('references one premixed cylinder instead of repeating its composition', async () => {
    const user = userEvent.setup()
    const initial: SimpleProcessSettings = {
      pressure_regime: 'atmospheric',
      cooling_method: 'furnace_cooling',
      preparation_operations: [
        {
          operation_type: 'gas_exchange',
          duration_min: 5,
          cycle_count: 3,
          gas_sources: [{ material_lot_id: '' }],
        },
      ],
    }
    function Wrapper() {
      const [settings, setSettings] = useState(initial)
      return (
        <I18nextProvider i18n={i18n}>
          <SimpleGrowthEditor
            segments={[]}
            channels={[]}
            settings={settings}
            events={[]}
            runId="run-1"
            token="token"
            setupId="setup-1"
            setupSnapshot={{}}
            zoneCount={0}
            disabled={false}
            onTimelineChange={vi.fn()}
            onSettingsChange={setSettings}
            onEventsChange={vi.fn()}
          />
          <output data-testid="settings">{JSON.stringify(settings)}</output>
        </I18nextProvider>
      )
    }
    render(<Wrapper />)

    expect(screen.getByText('置换气源（气瓶批次）')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '选择气瓶批次' }))

    const settings = JSON.parse(
      screen.getByTestId('settings').textContent ?? '',
    ) as SimpleProcessSettings
    expect(settings.preparation_operations?.[0].gas_sources).toEqual([
      expect.objectContaining({
        material_lot_id: 'gas-lot-1',
        material_lot_version: 2,
      }),
    ])
    expect(settings.preparation_operations?.[0].gases).toBeUndefined()
    expect(screen.getByLabelText(/^置换方式/)).toHaveTextContent('请选择')
    await user.click(screen.getByLabelText(/^置换方式/))
    await user.click(screen.getByRole('option', { name: '连续通气' }))
    expect(screen.queryByText('循环次数')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('流量（sccm）'), '100')
    await user.type(screen.getByLabelText('准备操作 1 持续时间（min）'), '5')
    let operation = JSON.parse(screen.getByTestId('settings').textContent ?? '')
      .preparation_operations[0]
    expect(operation).toMatchObject({
      exchange_mode: 'continuous_flow',
      duration_min: 5,
      gas_sources: [expect.objectContaining({ flow_sccm: 100 })],
    })
    expect(operation.cycle_count).toBeUndefined()
    await user.click(screen.getByLabelText(/^置换方式/))
    await user.click(screen.getByRole('option', { name: '抽空—回填' }))
    expect(screen.queryByLabelText('流量（sccm）')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('准备操作 1 循环次数'), '3')
    await user.type(screen.getByLabelText('抽空终点绝对压力（Pa）'), '10')
    await user.type(screen.getByLabelText('回填终点绝对压力（Pa）'), '100000')
    operation = JSON.parse(screen.getByTestId('settings').textContent ?? '')
      .preparation_operations[0]
    expect(operation).toMatchObject({
      exchange_mode: 'evacuation_backfill',
      cycle_count: 3,
      target_absolute_pressure_Pa: 10,
      backfill_absolute_pressure_Pa: 100000,
    })
    expect(operation.duration_min).toBeUndefined()
    expect(operation.gas_sources[0].flow_sccm).toBeUndefined()
    await user.click(screen.getByRole('combobox', { name: '准备操作 1 类型' }))
    expect(
      screen.queryByRole('option', { name: '检漏' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: '抽真空' }))
    operation = JSON.parse(screen.getByTestId('settings').textContent ?? '')
      .preparation_operations[0]
    expect(operation.exchange_mode).toBeUndefined()
    expect(operation.backfill_absolute_pressure_Pa).toBeUndefined()
    expect(operation.gas_sources).toBeUndefined()
  })

  it('records pump-down pressure without forcing a duration', async () => {
    const user = userEvent.setup()
    function Wrapper() {
      const [settings, setSettings] = useState<SimpleProcessSettings>({
        pressure_regime: 'atmospheric',
        cooling_method: 'furnace_cooling',
      })
      return (
        <I18nextProvider i18n={i18n}>
          <SimpleGrowthEditor
            segments={[]}
            channels={[]}
            settings={settings}
            events={[]}
            runId="run-1"
            token="token"
            setupId="setup-1"
            setupSnapshot={{}}
            zoneCount={0}
            disabled={false}
            onTimelineChange={vi.fn()}
            onSettingsChange={setSettings}
            onEventsChange={vi.fn()}
          />
          <output data-testid="settings">{JSON.stringify(settings)}</output>
        </I18nextProvider>
      )
    }
    render(<Wrapper />)

    await user.click(screen.getByRole('button', { name: '添加实验前准备' }))
    expect(screen.getByText('无压力读数时，填写持续时间。')).toBeInTheDocument()
    await user.type(screen.getByLabelText('终点绝对压力（Pa）'), '10')

    expect(
      JSON.parse(screen.getByTestId('settings').textContent ?? ''),
    ).toEqual(
      expect.objectContaining({
        preparation_operations: [
          {
            operation_type: 'pump_down',
            target_absolute_pressure_Pa: 10,
          },
        ],
      }),
    )
  })
})
