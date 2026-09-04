import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  TreatmentStepsEditor,
  treatmentStepsAreValid,
} from './treatment-steps-editor'
import type {
  TreatmentKind,
  TreatmentStep,
  TreatmentStepsEditorLabels,
} from './treatment-steps-editor'

const labels: TreatmentStepsEditorLabels = {
  addStep: 'Add step',
  step: (position) => `Step ${position}`,
  type: 'Treatment type',
  selectType: 'Select treatment',
  moveUp: 'Move up',
  moveDown: 'Move down',
  removeStep: 'Remove step',
  otherName: 'Other treatment name',
  addParameter: 'Add parameter',
  parameter: (position) => `Parameter ${position}`,
  parameterName: 'Parameter name',
  parameterValue: 'Parameter value',
  parameterUnit: 'Parameter unit',
  removeParameter: 'Remove parameter',
  addSpinStage: 'Add spin stage',
  spinStage: (position) => `Spin stage ${position}`,
  removeSpinStage: 'Remove spin stage',
  selectAtmosphere: 'Select atmosphere',
  noAtmosphere: 'Not provided',
  otherAtmosphereName: 'Other atmosphere name',
  selectOption: 'Select option',
  requiredMessage: 'This field is required',
  invalidMessage: 'Enter a valid value',
  numberGtMessage: (limit) => `Enter a number greater than ${limit}`,
  atmosphereOptions: {
    air: 'Air',
    vacuum: 'Vacuum',
    other: 'Other',
  },
  options: {
    acetone: 'Acetone',
    isopropanol: 'Isopropanol',
    ethanol: 'Ethanol',
    methanol: 'Methanol',
    deionized_water: 'Deionized water',
    ultrasonic: 'Ultrasonic',
    soak: 'Soak',
    rinse: 'Rinse',
    wipe: 'Wipe',
    other: 'Other',
    not_recorded: 'Not recorded',
  },
  types: {
    direct_load: 'Direct load',
    melt_solidify: 'Melt and solidify',
    melt: 'Melt',
    dry: 'Dry',
    drop_cast: 'Drop cast',
    dip_coat: 'Immerse',
    pelletize: 'Pelletize',
    spin_coat: 'Spin coat',
    anneal: 'Anneal',
    grind: 'Grind',
    other: 'Other',
    solvent_cleaning: 'Solvent cleaning',
    nitrogen_dry: 'Nitrogen dry',
    plasma_treatment: 'Plasma treatment',
    uv_ozone_treatment: 'UV/ozone treatment',
  },
  fields: {
    temperature_C: 'Temperature',
    duration_min: 'Duration',
    duration_s: 'Duration',
    speed_rpm: 'Speed',
    atmosphere: 'Atmosphere',
    power_W: 'Power',
    gas_species: 'Gas species',
    pressure_Pa: 'Pressure',
    pressure_MPa: 'Pressure',
    die_diameter_mm: 'Die diameter',
    solvent: 'Solvent',
    solvent_other: 'Other solvent',
    cleaning_method: 'Cleaning method',
    cleaning_method_other: 'Other cleaning method',
  },
}

function Wrapper({
  kind,
  initial = [],
}: {
  kind: TreatmentKind
  initial?: TreatmentStep[]
}) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <TreatmentStepsEditor
        kind={kind}
        value={value}
        onChange={setValue}
        showErrors
        labels={labels}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  )
}

function topRows(container: HTMLElement): HTMLFieldSetElement[] {
  return Array.from(
    container.querySelectorAll(
      ':scope > div:first-child > fieldset[data-row-id]',
    ),
  )
}

describe('TreatmentStepsEditor', () => {
  it('stores known treatment parameters as ordered typed objects', async () => {
    const user = userEvent.setup()
    const { container } = render(<Wrapper kind="precursor" />)

    await user.click(screen.getByRole('button', { name: 'Add step' }))
    await user.click(screen.getByRole('button', { name: 'Add step' }))
    const selectors = screen.getAllByRole('combobox', {
      name: /^Treatment type/,
    })
    await user.click(selectors[0])
    await user.click(screen.getByRole('option', { name: 'Spin coat' }))
    await user.click(selectors[1])
    await user.click(screen.getByRole('option', { name: 'Anneal' }))

    await user.type(screen.getByLabelText(/^Speed \(rpm\)/), '3000')
    await user.type(screen.getByLabelText(/^Duration \(s\)/), '60')
    await user.type(screen.getByLabelText(/^Temperature \(°C\)/), '750')
    await user.type(screen.getByLabelText(/^Duration \(min\)/), '30')

    const before = topRows(container).map((row) => row.dataset.rowId)
    await user.click(
      within(topRows(container)[0]).getAllByRole('button', {
        name: 'Move down',
      })[0],
    )

    expect(JSON.parse(screen.getByTestId('value').textContent ?? '')).toEqual([
      {
        type: 'anneal',
        parameters: { temperature_C: 750, duration_min: 30 },
      },
      {
        type: 'spin_coat',
        parameters: {
          stages: [{ speed_rpm: 3000, duration_s: 60 }],
        },
      },
    ])
    expect(topRows(container).map((row) => row.dataset.rowId)).toEqual([
      before[1],
      before[0],
    ])
  })

  it('requires a named parameter for custom treatments', async () => {
    const user = userEvent.setup()
    render(<Wrapper kind="substrate" />)

    await user.click(screen.getByRole('button', { name: 'Add step' }))
    await user.click(screen.getByRole('combobox', { name: /^Treatment type/ }))
    await user.click(screen.getByRole('option', { name: 'Other' }))
    await user.type(screen.getByLabelText(/^Other treatment name/), 'UV ozone')
    await user.click(screen.getByRole('button', { name: 'Add parameter' }))
    await user.type(screen.getByLabelText(/^Parameter name/), 'duration')
    await user.type(screen.getByLabelText(/^Parameter value/), '10')
    await user.type(screen.getByLabelText(/^Parameter unit/), 'min')

    const value = JSON.parse(
      screen.getByTestId('value').textContent ?? '',
    ) as TreatmentStep[]
    expect(value).toEqual([
      {
        type: 'other',
        other_name: 'UV ozone',
        parameters: {
          items: [{ name: 'duration', value: '10', unit: 'min' }],
        },
      },
    ])
    expect(treatmentStepsAreValid('substrate', value)).toBe(true)
  })

  it('uses canonical atmosphere options and a named fallback', async () => {
    const user = userEvent.setup()
    render(<Wrapper kind="source_load" />)

    await user.click(screen.getByRole('button', { name: 'Add step' }))
    await user.click(screen.getByRole('combobox', { name: /^Treatment type/ }))
    await user.click(screen.getByRole('option', { name: 'Dry' }))
    await user.type(screen.getByLabelText(/^Temperature \(°C\)/), '500')
    await user.type(screen.getByLabelText(/^Duration \(min\)/), '20')

    await user.click(screen.getByRole('combobox', { name: /^Atmosphere/ }))
    await user.click(screen.getByRole('option', { name: 'Ar' }))
    expect(JSON.parse(screen.getByTestId('value').textContent ?? '')).toEqual([
      {
        type: 'dry',
        parameters: {
          temperature_C: 500,
          duration_min: 20,
          atmosphere: 'Ar',
        },
      },
    ])

    await user.click(screen.getByRole('combobox', { name: /^Atmosphere/ }))
    await user.click(screen.getByRole('option', { name: 'Other' }))
    await user.type(
      screen.getByLabelText(/^Other atmosphere name/),
      'forming gas',
    )
    const custom = JSON.parse(
      screen.getByTestId('value').textContent ?? '',
    ) as TreatmentStep[]
    expect(custom[0].parameters).toEqual({
      temperature_C: 500,
      duration_min: 20,
      atmosphere: 'other',
      atmosphere_other: 'forming gas',
    })
    expect(treatmentStepsAreValid('source_load', custom)).toBe(true)
  })

  it('validates the required plasma parameters without free-text guessing', () => {
    const step: TreatmentStep = {
      type: 'plasma_treatment',
      parameters: {
        power_W: 50,
        gas_species: 'O2',
        duration_min: 5,
      },
    }
    expect(treatmentStepsAreValid('substrate', [step])).toBe(true)
    expect(
      treatmentStepsAreValid('substrate', [
        { ...step, parameters: { ...step.parameters, power_W: 0 } },
      ]),
    ).toBe(false)
  })

  it('requires solvent and method, with duration only for ultrasonic cleaning or soaking', () => {
    const base: TreatmentStep = {
      type: 'solvent_cleaning',
      parameters: { solvent: 'acetone', cleaning_method: 'rinse' },
    }
    expect(treatmentStepsAreValid('substrate', [base])).toBe(true)
    expect(
      treatmentStepsAreValid('substrate', [
        {
          ...base,
          parameters: { solvent: 'acetone', cleaning_method: 'ultrasonic' },
        },
      ]),
    ).toBe(false)
    expect(
      treatmentStepsAreValid('substrate', [
        {
          ...base,
          parameters: {
            solvent: 'other',
            solvent_other: 'ethyl acetate',
            cleaning_method: 'soak',
            duration_min: 10,
          },
        },
      ]),
    ).toBe(true)
    expect(
      treatmentStepsAreValid('substrate', [
        { type: 'uv_ozone_treatment', parameters: {} },
      ]),
    ).toBe(false)
  })

  it('distinguishes an invalid number from a missing required value', () => {
    render(
      <Wrapper
        kind="precursor"
        initial={[
          {
            type: 'spin_coat',
            parameters: { speed_rpm: 0, duration_s: 60 },
          },
        ]}
      />,
    )

    expect(
      screen.getByText('Speed: Enter a number greater than 0'),
    ).toBeInTheDocument()
    expect(screen.queryByText('This field is required')).not.toBeInTheDocument()
  })

  it('normalizes a legacy spin coat and stores ordered stages', async () => {
    const user = userEvent.setup()
    render(
      <Wrapper
        kind="source_load"
        initial={[
          {
            type: 'spin_coat',
            parameters: { speed_rpm: 1000, duration_s: 10 },
          },
        ]}
      />,
    )

    expect(screen.getByLabelText(/^Speed \(rpm\)/)).toHaveValue(1000)
    await user.click(screen.getByRole('button', { name: 'Add spin stage' }))
    const speeds = screen.getAllByLabelText(/^Speed \(rpm\)/)
    const durations = screen.getAllByLabelText(/^Duration \(s\)/)
    await user.type(speeds[1], '6000')
    await user.type(durations[1], '30')

    const value = JSON.parse(
      screen.getByTestId('value').textContent ?? '',
    ) as TreatmentStep[]
    expect(value[0].parameters).toEqual({
      stages: [
        { speed_rpm: 1000, duration_s: 10 },
        { speed_rpm: 6000, duration_s: 30 },
      ],
    })
    expect(treatmentStepsAreValid('source_load', value)).toBe(true)
  })
})
