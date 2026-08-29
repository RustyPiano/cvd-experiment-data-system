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
  simpleSubstrateIsValid,
  sourceLoadIngredientsAreValid,
  sourcePreparationStepsAreValid,
} from './simple-preparation-editors'
import type {
  SimpleProcessSettings,
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

    expect(screen.queryByText('补充目标信息')).not.toBeInTheDocument()
    expect(screen.getByText('目标原子层数')).toBeInTheDocument()
    expect(screen.getByText('目标几何形态')).toBeInTheDocument()
    expect(screen.queryByText('目标覆盖状态')).not.toBeInTheDocument()
    expect(screen.getByText('目标性能或研究目的')).toBeInTheDocument()
    expect(screen.getByText('补充说明')).toBeInTheDocument()
    expect(document.querySelectorAll('.text-destructive')).toHaveLength(2)
    expect(screen.queryByText(/选填/)).not.toBeInTheDocument()
    expect(document.querySelector('details')).toBeNull()

    fireEvent.change(screen.getByPlaceholderText('例如 MoS2'), {
      target: { value: 'BN' },
    })

    expect(
      screen.getByText('原体相与新化学式不匹配，已清除，请重新选择。'),
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

    expect(screen.getAllByText('端元材料化学式')).toHaveLength(2)
    expect(screen.getAllByText('目标摩尔分数')).toHaveLength(2)
    expect(screen.getByText('Mo₀.₅W₀.₅S₂')).toBeInTheDocument()
    expect(screen.queryByText('被取代元素')).not.toBeInTheDocument()
    expect(screen.queryByText('取代元素')).not.toBeInTheDocument()
  })

  it('shows coverage only for sheets and clears it for other forms', async () => {
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
      dimensional_form: 'sheet',
      coverage_state: 'continuous',
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

    expect(screen.getByText('目标覆盖状态')).toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: '目标几何形态' }))
    await user.click(screen.getByRole('option', { name: '纳米管' }))

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dimensional_form: 'tube',
        coverage_state: undefined,
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

    await user.click(screen.getByRole('combobox', { name: '目标位点' }))

    expect(screen.getByText('取代位点')).toBeInTheDocument()
    expect(screen.getByText('非取代位点')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Mo 位点' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'S 位点' })).toBeInTheDocument()
  })
})

describe('simple precursor position editing', () => {
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
    expect(screen.getByText('请选择对应加热温区。')).toBeInTheDocument()
    expect(
      screen.getByText('请填写相对所选温区热电偶的位置。'),
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

    const unit = screen.getByRole('textbox', { name: /单位/ })
    expect(unit).toHaveAttribute('placeholder', '例如 mg、g、μL 或 mL')
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
          process_roles: [],
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
      screen.getByRole('button', { name: '添加同一装载中的材料' }),
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
        process_roles: [],
      },
    ])
    expect(sourceLoadIngredientsAreValid(load.ingredients)).toBe(false)
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
        '以所选温区热电偶为 0 mm；沿气流方向，上游填负值，下游填正值。',
      ),
    ).toBeInTheDocument()
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
        '此记录使用旧装置原点参照；请按当前规则重新确认温区和相对热电偶位置。',
      ),
    ).toBeInTheDocument()
  })

  it('binds a surface load by stable substrate id and stores optional process roles', async () => {
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

    expect(screen.getByText('历史作用分类：金属源')).toBeInTheDocument()
    expect(screen.getByText('温区 2，相对热电偶 15 mm')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /衬底片 1/ }))
    await user.click(screen.getByRole('checkbox', { name: '促进反应或成核' }))
    await user.click(screen.getByRole('checkbox', { name: '其他' }))
    await user.type(screen.getByLabelText(/^其他工艺作用/), '表面活性剂')

    const load = JSON.parse(
      screen.getByTestId('loads').textContent ?? '',
    )[0] as SimpleSourceLoad
    expect(load.substrate_source_ids).toEqual(['stable-substrate-id'])
    expect(load.ingredients[0].process_roles).toEqual([
      'reaction_or_nucleation_promoter',
      'other',
    ])
    expect(load.ingredients[0].process_role_other).toBe('表面活性剂')
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
            length_mm: 10,
            width_mm: 10,
            placement: 'other',
          }),
        },
        2,
      ),
    ).toBe(false)
  })

  it('requires a thermocouple reference and rejects a 90 degree tilt', () => {
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
            tilt_angle_deg: 90,
          }),
        },
        2,
      ),
    ).toBe(false)
  })

  it('keeps ordered pretreatment steps and clears position when copying', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const item = {
      ...substrate,
      piece_label: 'S1',
      crystal_orientation: '110；single_side_polished',
      pretreatment_steps: JSON.stringify([
        { type: 'acetone_clean', parameters: { duration_min: 5 } },
        { type: 'nitrogen_dry', parameters: {} },
      ]),
    }

    render(
      <I18nextProvider i18n={i18n}>
        <SimpleSubstratesEditor
          substrates={[item]}
          zoneCount={2}
          disabled={false}
          onChange={onChange}
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
  })
})
