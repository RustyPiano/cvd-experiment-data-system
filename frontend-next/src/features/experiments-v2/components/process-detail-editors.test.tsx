import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  CoolingParamsEditor,
  DurationCyclesEditor,
  FieldParamsEditor,
  MeasuredTemperatureEditor,
  PreparationOperationsEditor,
  coolingParamsAreValid,
  durationCyclesAreValid,
  fieldParamsAreValid,
  measuredTemperatureIsValid,
  preparationOperationsAreValid,
} from './process-detail-editors'
import type {
  ActualField,
  CoolingParams,
  CoolingParamsEditorLabels,
  DurationCycles,
  DurationCyclesEditorLabels,
  FieldParamsEditorLabels,
  MeasuredTemperatureEditorLabels,
  MeasuredTemperatureReference,
  PreparationOperation,
  PreparationOperationsEditorLabels,
} from './process-detail-editors'

vi.mock('./entity-reference-select', () => ({
  EntityReferenceSelect: ({
    onChange,
    triggerId,
    filter,
  }: {
    onChange: (id: string, entity: unknown) => void
    triggerId?: string
    filter?: (entity: unknown) => boolean
  }) => (
    <button
      id={triggerId}
      type="button"
      onClick={() => {
        const entities = [
          {
            id: 'argon-lot',
            latest_version: {
              version: 2,
              data: {
                lot_category: 'gas_cylinder',
                substance_name: 'Argon',
                chemical_formula: 'Ar',
              },
            },
          },
          {
            id: 'ammonia-lot',
            latest_version: {
              version: 4,
              data: {
                lot_category: 'gas_cylinder',
                substance_name: 'NH3',
                chemical_formula: 'NH3',
                attrs: { gas_purity_grade: '5N' },
              },
            },
          },
        ]
        const entity = entities.find((candidate) => filter?.(candidate) ?? true)
        onChange(entity?.id ?? '', entity ?? null)
      }}
    >
      Select gas cylinder
    </button>
  ),
}))

vi.mock('./experiment-attachments', () => ({
  ExperimentAttachments: ({
    bindingType,
    bindingId,
    role,
    onFilesChange,
    cleanupUncommitted,
    saved,
  }: {
    bindingType?: string
    bindingId?: string
    role: string
    cleanupUncommitted?: boolean
    saved?: boolean
    onFilesChange?: (
      files: Array<{
        id: string
        original_name: string
        metadata_json: Record<string, unknown>
      }>,
    ) => void
  }) => (
    <button
      type="button"
      data-testid="temperature-attachments"
      data-role={role}
      data-binding-type={bindingType}
      data-binding-id={bindingId}
      data-cleanup-uncommitted={cleanupUncommitted}
      data-saved={saved}
      onClick={() =>
        onFilesChange?.([
          {
            id: 'temperature-file-1',
            original_name: 'temperature.csv',
            metadata_json: {
              columns: ['elapsed_min', 'zone_1_C', 'zone_2_C', 'note'],
              numeric_columns: ['elapsed_min', 'zone_1_C', 'zone_2_C'],
              row_count: 2,
            },
          },
          {
            id: 'temperature-file-2',
            original_name: 'temperature.xlsx',
            metadata_json: {
              columns: ['seconds', 'hot_a', 'hot_b'],
              numeric_columns: ['seconds', 'hot_a', 'hot_b'],
              row_count: 4,
            },
          },
        ])
      }
    >
      Load temperature file
    </button>
  ),
}))

const parameterLabels = {
  add: 'Add parameter',
  item: (position: number) => `Parameter ${position}`,
  name: 'Parameter name',
  value: 'Parameter value',
  unit: 'Parameter unit',
  remove: 'Remove parameter',
}

const preparationLabels: PreparationOperationsEditorLabels = {
  addOperation: 'Add operation',
  operation: (position) => `Operation ${position}`,
  operationType: 'Operation type',
  selectOperationType: 'Select operation',
  operationTypes: {
    pump_down: 'Pump down',
    gas_exchange: 'Gas exchange',
    other: 'Other operation',
  },
  moveUp: 'Move operation up',
  moveDown: 'Move operation down',
  removeOperation: 'Remove operation',
  targetAbsolutePressurePa: 'Target pressure (Pa)',
  durationMinutes: 'Duration (min)',
  cycleCount: 'Cycle count',
  addGas: 'Add exchange gas',
  gas: (position) => `Exchange gas ${position}`,
  species: 'Gas species',
  selectSpecies: 'Select gas',
  speciesOptions: {
    Ar: 'Argon',
    N2: 'Nitrogen',
    H2: 'Hydrogen',
    O2: 'Oxygen',
    CH4: 'Methane',
    other: 'Other gas',
  },
  otherGasName: 'Other gas name',
  gasCylinderLot: 'Gas cylinder lot',
  purity: 'Purity',
  flowSccm: 'Flow (sccm)',
  removeGas: 'Remove exchange gas',
  otherOperationName: 'Other operation name',
  parameters: parameterLabels,
}

const durationLabels: DurationCyclesEditorLabels = {
  durationMinutes: 'Reaction duration (min)',
  cycleCount: 'Reaction cycle count',
}

const coolingLabels: CoolingParamsEditorLabels = {
  method: 'Cooling method',
  selectMethod: 'Select cooling method',
  methods: {
    furnace_cooling: 'Furnace cooling',
    open_lid_cooling: 'Open lid cooling',
    rapid_furnace_move_cooling: 'Rapid furnace move',
    other: 'Other cooling',
  },
  lidOpenTemperatureC: 'Lid-open temperature (°C)',
  coolingRateCPerMin: 'Cooling rate (°C/min)',
  otherMethod: 'Other cooling method',
  clear: 'Clear cooling',
}

const fieldLabels: FieldParamsEditorLabels = {
  addField: 'Add applied field',
  field: (position) => `Applied field ${position}`,
  fieldType: 'Field type',
  selectFieldType: 'Select field type',
  fieldTypes: {
    plasma: 'Plasma',
    light: 'Light',
    electric_field: 'Electric field',
  },
  startMinutes: 'Field start (min)',
  endMinutes: 'Field end (min)',
  removeField: 'Remove applied field',
  parameterGroups: {
    plasma: 'Plasma parameters',
    light: 'Light parameters',
    electric_field: 'Electric-field parameters',
  },
  explicitParameters: {
    plasmaPowerW: 'Plasma power (W)',
    plasmaGasSpecies: 'Plasma gas',
    plasmaPressurePa: 'Plasma pressure (Pa)',
    lightWavelengthNm: 'Wavelength (nm)',
    lightPowerMw: 'Optical power (mW)',
    lightIrradianceMwCm2: 'Irradiance (mW·cm⁻²)',
    lightSourceDistanceMm: 'Source distance (mm)',
    electricVoltageV: 'Voltage (V)',
    electricFieldStrengthVCm: 'Field strength (V·cm⁻¹)',
    electricElectrodeGapMm: 'Electrode gap (mm)',
    electricDirection: 'Field direction',
  },
  otherParameters: 'Other parameters (optional)',
  parameters: parameterLabels,
}

const measuredLabels: MeasuredTemperatureEditorLabels = {
  files: 'Temperature files',
  file: 'Temperature file',
  selectFile: 'Select temperature file',
  clearFile: 'Clear temperature file',
  timeColumn: 'Time column',
  addChannel: 'Add temperature channel',
  channel: (position) => `Temperature channel ${position}`,
  zoneIndex: 'Channel zone',
  columnName: 'Channel column',
  removeChannel: 'Remove temperature channel',
}

function PreparationWrapper() {
  const [value, setValue] = useState<PreparationOperation[]>([])
  return (
    <>
      <PreparationOperationsEditor
        value={value}
        onChange={setValue}
        showErrors
        labels={preparationLabels}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  )
}

function DurationWrapper({
  derivedCycleCount,
}: {
  derivedCycleCount?: number | null
}) {
  const [value, setValue] = useState<DurationCycles>({
    duration_min: null,
    cycle_count: null,
  })
  return (
    <>
      <DurationCyclesEditor
        value={value}
        onChange={setValue}
        derivedCycleCount={derivedCycleCount}
        showErrors
        labels={durationLabels}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  )
}

function CoolingWrapper() {
  const [value, setValue] = useState<CoolingParams | null>(null)
  return (
    <>
      <CoolingParamsEditor
        value={value}
        onChange={setValue}
        showErrors
        labels={coolingLabels}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  )
}

function FieldWrapper({ initialValue = [] }: { initialValue?: ActualField[] }) {
  const [value, setValue] = useState<ActualField[]>(initialValue)
  return (
    <>
      <FieldParamsEditor
        value={value}
        onChange={setValue}
        showErrors
        labels={fieldLabels}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  )
}

function MeasuredWrapper() {
  const [value, setValue] = useState<MeasuredTemperatureReference | null>(null)
  return (
    <>
      <MeasuredTemperatureEditor
        runId="run-1"
        value={value}
        onChange={setValue}
        zoneCount={2}
        showErrors
        saved
        labels={measuredLabels}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  )
}

function outputValue<T>(): T {
  return JSON.parse(screen.getByTestId('value').textContent ?? '') as T
}

describe('PreparationOperationsEditor', () => {
  it('expands gas exchange into cycles, gas identity, lot and flow', async () => {
    const user = userEvent.setup()
    render(<PreparationWrapper />)

    await user.click(screen.getByRole('button', { name: 'Add operation' }))
    await user.click(screen.getByRole('combobox', { name: 'Operation type' }))
    await user.click(screen.getByRole('option', { name: 'Gas exchange' }))
    expect(screen.getByLabelText('Cycle count')).toBeInTheDocument()
    expect(screen.queryByLabelText('Target pressure (Pa)')).toBeNull()

    await user.type(screen.getByLabelText('Cycle count'), '3')
    await user.type(screen.getByLabelText('Duration (min)'), '10')
    await user.click(screen.getByRole('button', { name: 'Add exchange gas' }))
    await user.click(screen.getByRole('combobox', { name: 'Gas species' }))
    await user.click(screen.getByRole('option', { name: 'Other gas' }))
    await user.type(screen.getByLabelText('Other gas name'), 'NH3')
    await user.click(screen.getByRole('button', { name: 'Gas cylinder lot' }))
    expect(screen.getByText('Purity: 5N')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Flow (sccm)'), '12.5')

    const value = outputValue<PreparationOperation[]>()
    expect(value).toEqual([
      {
        operation_type: 'gas_exchange',
        cycle_count: 3,
        duration_min: 10,
        gases: [
          {
            species: 'other',
            other_name: 'NH3',
            lot_ref: {
              entity_id: 'ammonia-lot',
              version: 4,
              snapshot: {
                lot_category: 'gas_cylinder',
                substance_name: 'NH3',
                chemical_formula: 'NH3',
                attrs: { gas_purity_grade: '5N' },
              },
            },
            flow_sccm: 12.5,
          },
        ],
      },
    ])
    expect(preparationOperationsAreValid(value)).toBe(true)
    const gasExchange = value[0]
    if (gasExchange.operation_type !== 'gas_exchange') {
      throw new Error('Expected gas exchange operation')
    }
    expect(
      preparationOperationsAreValid([
        {
          ...gasExchange,
          gases: [
            {
              ...gasExchange.gases[0],
              lot_ref: {
                ...gasExchange.gases[0].lot_ref!,
                snapshot: { lot_category: 'chemical' },
              },
            },
          ],
        },
      ]),
    ).toBe(false)
  })

  it('renders only the selected operation branch and rejects incomplete data', async () => {
    const user = userEvent.setup()
    render(<PreparationWrapper />)
    await user.click(screen.getByRole('button', { name: 'Add operation' }))
    await user.click(screen.getByRole('combobox', { name: 'Operation type' }))
    await user.click(screen.getByRole('option', { name: 'Pump down' }))

    expect(screen.getByLabelText('Target pressure (Pa)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Cycle count')).toBeNull()
    expect(preparationOperationsAreValid(outputValue())).toBe(false)

    await user.click(screen.getByRole('combobox', { name: 'Operation type' }))
    await user.click(screen.getByRole('option', { name: 'Other operation' }))
    expect(screen.getByLabelText('Other operation name')).toBeInTheDocument()
    expect(screen.queryByLabelText('Target pressure (Pa)')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add parameter' })).toBeVisible()
    expect(
      preparationOperationsAreValid([
        {
          operation_type: 'other',
          other_name: 'Custom purge',
          parameters: [],
        },
      ]),
    ).toBe(false)
    expect(
      preparationOperationsAreValid([
        {
          operation_type: 'other',
          other_name: 'Custom purge',
          parameters: [{ name: 'pressure', value: 100, unit: 'Pa' }],
        },
      ]),
    ).toBe(true)
  })
})

describe('DurationCyclesEditor and CoolingParamsEditor', () => {
  it('records positive duration and optional integral cycles', async () => {
    const user = userEvent.setup()
    render(<DurationWrapper />)
    await user.type(screen.getByLabelText('Reaction duration (min)'), '45')
    await user.type(screen.getByLabelText('Reaction cycle count'), '2')

    const value = outputValue<DurationCycles>()
    expect(value).toEqual({ duration_min: 45, cycle_count: 2 })
    expect(durationCyclesAreValid(value)).toBe(true)
    expect(durationCyclesAreValid({ duration_min: 0, cycle_count: 1.5 })).toBe(
      false,
    )
  })

  it('shows the gas-derived reaction cycle count as read-only', () => {
    render(<DurationWrapper derivedCycleCount={3} />)

    expect(screen.getByLabelText('Reaction cycle count')).toHaveValue(3)
    expect(screen.getByLabelText('Reaction cycle count')).toHaveAttribute(
      'readonly',
    )
  })

  it('shows and clears method-specific cooling fields', async () => {
    const user = userEvent.setup()
    render(<CoolingWrapper />)
    await user.click(screen.getByRole('combobox', { name: 'Cooling method' }))
    await user.click(screen.getByRole('option', { name: 'Open lid cooling' }))
    expect(
      screen.getByLabelText('Lid-open temperature (°C)'),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText('Lid-open temperature (°C)'), '580')
    expect(coolingParamsAreValid(outputValue())).toBe(true)

    await user.click(screen.getByRole('combobox', { name: 'Cooling method' }))
    await user.click(screen.getByRole('option', { name: 'Other cooling' }))
    expect(screen.queryByLabelText('Lid-open temperature (°C)')).toBeNull()
    expect(screen.getByLabelText('Other cooling method')).toBeInTheDocument()
    expect(coolingParamsAreValid(outputValue())).toBe(false)
  })
})

describe('FieldParamsEditor', () => {
  it('expands plasma parameters and keeps optional extra parameters', async () => {
    const user = userEvent.setup()
    render(<FieldWrapper />)
    await user.click(screen.getByRole('button', { name: 'Add applied field' }))
    await user.click(screen.getByRole('combobox', { name: 'Field type' }))
    await user.click(screen.getByRole('option', { name: 'Plasma' }))
    expect(screen.queryByRole('option', { name: 'Other' })).toBeNull()
    await user.type(screen.getByLabelText('Field start (min)'), '5')
    await user.type(screen.getByLabelText('Field end (min)'), '25')
    await user.type(screen.getByLabelText(/Plasma power \(W\)/), '50')
    await user.type(screen.getByLabelText(/Plasma gas/), 'Ar')
    await user.type(screen.getByLabelText(/Plasma pressure \(Pa\)/), '100')
    await user.click(screen.getByRole('button', { name: 'Add parameter' }))
    await user.type(screen.getByLabelText('Parameter name'), 'frequency')
    await user.type(screen.getByLabelText('Parameter value'), '13.56')
    await user.type(screen.getByLabelText('Parameter unit'), 'MHz')

    const value = outputValue<ActualField[]>()
    expect(fieldParamsAreValid(value)).toBe(true)
    expect(value[0].parameters).toEqual([
      { name: 'power_W', value: 50, unit: 'W' },
      { name: 'gas_species', value: 'Ar', unit: '—' },
      { name: 'pressure_Pa', value: 100, unit: 'Pa' },
      { name: 'frequency', value: '13.56', unit: 'MHz' },
    ])
    expect(
      fieldParamsAreValid([
        {
          ...value[0],
          start_min: 25,
          end_min: 5,
        },
      ]),
    ).toBe(false)
  })

  it('shows the light and electric-field parameter sets', async () => {
    const user = userEvent.setup()
    render(<FieldWrapper />)
    await user.click(screen.getByRole('button', { name: 'Add applied field' }))
    await user.click(screen.getByRole('combobox', { name: 'Field type' }))
    await user.click(screen.getByRole('option', { name: 'Light' }))

    expect(screen.getByLabelText(/Wavelength \(nm\)/)).toBeInTheDocument()
    expect(screen.getByLabelText('Optical power (mW)')).toBeInTheDocument()
    expect(screen.getByLabelText('Irradiance (mW·cm⁻²)')).toBeInTheDocument()
    expect(screen.getByLabelText(/Source distance \(mm\)/)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Wavelength \(nm\)/), '365')

    await user.click(screen.getByRole('combobox', { name: 'Field type' }))
    await user.click(screen.getByRole('option', { name: 'Electric field' }))
    expect(outputValue<ActualField[]>()[0].parameters).toEqual([])
    expect(screen.getByLabelText('Voltage (V)')).toBeInTheDocument()
    expect(screen.getByLabelText('Field strength (V·cm⁻¹)')).toBeInTheDocument()
    expect(screen.getByLabelText(/Electrode gap \(mm\)/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Field direction/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Wavelength (nm)')).not.toBeInTheDocument()
  })

  it('requires the explicit positive parameter contract for each field type', () => {
    const light: ActualField = {
      field_type: 'light',
      start_min: 0,
      end_min: 10,
      parameters: [
        { name: 'wavelength_nm', value: 365, unit: 'nm' },
        { name: 'power_mW', value: 10, unit: 'mW' },
        { name: 'source_distance_mm', value: 30, unit: 'mm' },
      ],
    }
    expect(fieldParamsAreValid([light])).toBe(true)
    expect(
      fieldParamsAreValid([
        {
          ...light,
          parameters: [
            ...light.parameters,
            {
              name: 'irradiance_mW_cm2',
              value: 5,
              unit: 'mW·cm⁻²',
            },
          ],
        },
      ]),
    ).toBe(false)
    expect(
      fieldParamsAreValid([
        {
          ...light,
          parameters: [
            { name: 'wavelength_nm', value: 0, unit: 'nm' },
            { name: 'power_mW', value: 10, unit: 'mW' },
            { name: 'source_distance_mm', value: 30, unit: 'mm' },
          ],
        },
      ]),
    ).toBe(false)
    expect(
      fieldParamsAreValid([
        {
          ...light,
          parameters: [{ name: 'frequency', value: 13.56, unit: 'MHz' }],
        },
      ]),
    ).toBe(false)
  })

  it('maps recognized legacy parameters without dropping unknown entries', async () => {
    const user = userEvent.setup()
    render(
      <FieldWrapper
        initialValue={[
          {
            field_type: 'plasma',
            start_min: 5,
            end_min: 25,
            parameters: [
              { name: 'power', value: 50, unit: 'W' },
              { name: 'legacy_mode', value: 'pulse', unit: '—' },
            ],
          },
        ]}
      />,
    )

    expect(screen.getByLabelText(/Plasma power \(W\)/)).toHaveValue(50)
    expect(screen.getByLabelText('Parameter name')).toHaveValue('legacy_mode')
    await user.clear(screen.getByLabelText(/Plasma power \(W\)/))
    await user.type(screen.getByLabelText(/Plasma power \(W\)/), '60')

    const parameters = outputValue<ActualField[]>()[0].parameters
    expect(parameters).toHaveLength(2)
    expect(parameters).toEqual(
      expect.arrayContaining([
        { name: 'power_W', value: 60, unit: 'W' },
        { name: 'legacy_mode', value: 'pulse', unit: '—' },
      ]),
    )
  })
})

describe('MeasuredTemperatureEditor', () => {
  it('binds uploaded time series to reaction conditions and maps zone columns', async () => {
    const user = userEvent.setup()
    render(<MeasuredWrapper />)
    const attachments = screen.getByTestId('temperature-attachments')
    expect(attachments).toHaveAttribute('data-role', 'temperature_timeseries')
    expect(attachments).toHaveAttribute('data-binding-type', 'process_step')
    expect(attachments).toHaveAttribute(
      'data-binding-id',
      'reaction_conditions',
    )
    expect(attachments).toHaveAttribute('data-cleanup-uncommitted', 'true')
    expect(attachments).toHaveAttribute('data-saved', 'true')

    await user.click(
      screen.getByRole('button', { name: 'Load temperature file' }),
    )
    await user.click(screen.getByRole('combobox', { name: 'Temperature file' }))
    await user.click(screen.getByRole('option', { name: 'temperature.csv' }))

    const value = outputValue<MeasuredTemperatureReference>()
    expect(value.file_asset_id).toBe('temperature-file-1')
    expect(value.time_column).toBe('elapsed_min')
    expect(value.channels).toEqual([
      { zone_index: 1, column_name: 'zone_1_C' },
      { zone_index: 2, column_name: 'zone_2_C' },
    ])
    expect(measuredTemperatureIsValid(value, 2)).toBe(true)
    await user.click(screen.getByRole('combobox', { name: 'Time column' }))
    expect(screen.getByRole('option', { name: 'elapsed_min' })).toBeVisible()
    expect(screen.queryByRole('option', { name: 'note' })).toBeNull()
    await user.keyboard('{Escape}')
    await user.click(
      screen.getAllByRole('combobox', { name: 'Channel column' })[0],
    )
    expect(screen.getByRole('option', { name: 'zone_1_C' })).toBeVisible()
    expect(screen.queryByRole('option', { name: 'note' })).toBeNull()
    expect(
      screen.queryByRole('textbox', { name: 'Time column' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'Channel column' }),
    ).not.toBeInTheDocument()
  })

  it('clears old mappings and suggests columns from the newly selected file', async () => {
    const user = userEvent.setup()
    render(<MeasuredWrapper />)
    await user.click(
      screen.getByRole('button', { name: 'Load temperature file' }),
    )
    await user.click(screen.getByRole('combobox', { name: 'Temperature file' }))
    await user.click(screen.getByRole('option', { name: 'temperature.csv' }))
    await user.click(screen.getByRole('combobox', { name: 'Temperature file' }))
    await user.click(screen.getByRole('option', { name: 'temperature.xlsx' }))

    expect(outputValue<MeasuredTemperatureReference>()).toEqual({
      file_asset_id: 'temperature-file-2',
      time_column: 'seconds',
      channels: [
        { zone_index: 1, column_name: 'hot_a' },
        { zone_index: 2, column_name: 'hot_b' },
      ],
    })
  })

  it('rejects duplicate/out-of-range zone mappings and duplicate columns', () => {
    expect(
      measuredTemperatureIsValid(
        {
          file_asset_id: 'temperature-file-1',
          time_column: 'elapsed_min',
          channels: [
            { zone_index: 1, column_name: 'temperature_C' },
            { zone_index: 1, column_name: 'temperature_C' },
          ],
        },
        2,
      ),
    ).toBe(false)
    expect(
      measuredTemperatureIsValid(
        {
          file_asset_id: 'temperature-file-1',
          time_column: 'elapsed_min',
          channels: [{ zone_index: 3, column_name: 'zone_3_C' }],
        },
        2,
      ),
    ).toBe(false)
  })
})
