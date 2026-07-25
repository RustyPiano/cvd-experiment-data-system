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
  types: {
    direct_load: 'Direct load',
    melt_solidify: 'Melt and solidify',
    pelletize: 'Pelletize',
    spin_coat: 'Spin coat',
    anneal: 'Anneal',
    grind: 'Grind',
    other: 'Other',
    acetone_clean: 'Acetone clean',
    isopropanol_clean: 'Isopropanol clean',
    nitrogen_dry: 'Nitrogen dry',
    plasma_treatment: 'Plasma treatment',
    hydrophilic_treatment: 'Hydrophilic treatment',
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
    method: 'Method',
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
      name: 'Treatment type',
    })
    await user.click(selectors[0])
    await user.click(screen.getByRole('option', { name: 'Spin coat' }))
    await user.click(selectors[1])
    await user.click(screen.getByRole('option', { name: 'Anneal' }))

    await user.type(screen.getByLabelText('Speed (rpm)'), '3000')
    await user.type(screen.getByLabelText('Duration (s)'), '60')
    await user.type(screen.getByLabelText('Temperature (°C)'), '750')
    await user.type(screen.getByLabelText('Duration (min)'), '30')

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
        parameters: { speed_rpm: 3000, duration_s: 60 },
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
    await user.click(screen.getByRole('combobox', { name: 'Treatment type' }))
    await user.click(screen.getByRole('option', { name: 'Other' }))
    await user.type(screen.getByLabelText('Other treatment name'), 'UV ozone')
    await user.click(screen.getByRole('button', { name: 'Add parameter' }))
    await user.type(screen.getByLabelText('Parameter name'), 'duration')
    await user.type(screen.getByLabelText('Parameter value'), '10')
    await user.type(screen.getByLabelText('Parameter unit'), 'min')

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
})
