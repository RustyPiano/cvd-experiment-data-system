import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  FieldParamsEditor,
  fieldParamsAreValid,
} from './process-detail-editors'
import type {
  ActualField,
  FieldParamsEditorLabels,
} from './process-detail-editors'

const parameterLabels = {
  add: 'Add parameter',
  item: (position: number) => `Parameter ${position}`,
  name: 'Parameter name',
  value: 'Parameter value',
  unit: 'Parameter unit',
  remove: 'Remove parameter',
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
    other: 'Other',
  },
  startMinutes: 'Field start (min)',
  endMinutes: 'Field end (min)',
  removeField: 'Remove applied field',
  parameterGroups: {
    plasma: 'Plasma parameters',
    light: 'Light parameters',
    electric_field: 'Electric-field parameters',
    other: 'Other field parameters',
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
  magnitudeHints: {
    light: 'Enter either optical power or irradiance.',
    electric_field: 'Enter either voltage or field strength.',
  },
  otherParameters: 'Other parameters',
  parameters: parameterLabels,
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

function outputValue<T>(): T {
  return JSON.parse(screen.getByTestId('value').textContent ?? '') as T
}

describe('FieldParamsEditor', () => {
  it('expands plasma parameters and keeps optional extra parameters', async () => {
    const user = userEvent.setup()
    render(<FieldWrapper />)
    await user.click(screen.getByRole('button', { name: 'Add applied field' }))
    await user.click(screen.getByRole('combobox', { name: 'Field type' }))
    expect(screen.getByRole('option', { name: 'Other' })).toBeVisible()
    await user.click(screen.getByRole('option', { name: 'Plasma' }))
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
    expect(
      screen.getByLabelText('Optical power (mW)'),
    ).toHaveAccessibleDescription('Enter either optical power or irradiance.')
    expect(
      screen.getByText('Enter either optical power or irradiance.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Irradiance (mW·cm⁻²)')).toBeInTheDocument()
    expect(screen.getByLabelText(/Source distance \(mm\)/)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Wavelength \(nm\)/), '365')

    await user.click(screen.getByRole('combobox', { name: 'Field type' }))
    await user.click(screen.getByRole('option', { name: 'Electric field' }))
    expect(outputValue<ActualField[]>()[0].parameters).toEqual([])
    expect(screen.getByLabelText('Voltage (V)')).toBeInTheDocument()
    expect(screen.getByLabelText('Voltage (V)')).toHaveAccessibleDescription(
      'Enter either voltage or field strength.',
    )
    expect(
      screen.queryByText('Enter either optical power or irradiance.'),
    ).not.toBeInTheDocument()
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

  it('accepts a configured other field only with a named parameter', () => {
    const other: ActualField = {
      field_type: 'other',
      start_min: 0,
      end_min: 10,
      parameters: [{ name: 'magnetic_flux_density', value: 0.5, unit: 'T' }],
    }
    expect(fieldParamsAreValid([other], ['other'])).toBe(true)
    expect(fieldParamsAreValid([{ ...other, parameters: [] }], ['other'])).toBe(
      false,
    )
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
