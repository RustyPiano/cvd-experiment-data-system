import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  reconcileTemperatureSensors,
  TemperatureSensorsEditor,
  temperatureSensorsAreValid,
} from './temperature-sensors-editor'
import type {
  TemperatureSensor,
  TemperatureSensorsEditorLabels,
} from './temperature-sensors-editor'

const labels: TemperatureSensorsEditorLabels = {
  sensor: (zoneIndex) => `Temperature sensor for zone ${zoneIndex}`,
  sensorType: 'Sensor category',
  sensorTypeOptions: {
    thermocouple: 'Thermocouple',
    rtd: 'Resistance temperature detector (RTD)',
    infraredThermometer: 'Infrared thermometer',
    fiberOpticTemperatureSensor: 'Fiber-optic temperature sensor',
    thermistor: 'Thermistor',
  },
  selectSensorType: 'Select sensor category',
  otherSensorType: 'Other',
  otherSensorTypePlaceholder: 'Enter sensor type',
  nominalAccuracyCelsius: 'Nominal temperature accuracy (±°C)',
  selectZoneCountFirst: 'Set the zone count first',
  requiredMessage: 'This field is required',
}

function Wrapper({
  initial = [],
  zoneCount = 2,
}: {
  initial?: TemperatureSensor[]
  zoneCount?: number
}) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <TemperatureSensorsEditor
        value={value}
        onChange={setValue}
        zoneCount={zoneCount}
        showErrors
        labels={labels}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  )
}

const sensorOne: TemperatureSensor = {
  sensor_type: 'thermocouple',
  zone_index: 1,
  nominal_accuracy_C: 1,
}

const sensorTwo: TemperatureSensor = {
  sensor_type: 'thermocouple',
  zone_index: 2,
}

describe('TemperatureSensorsEditor', () => {
  it('renders exactly one auto-numbered card per setup zone', async () => {
    const user = userEvent.setup()
    render(<Wrapper zoneCount={2} />)

    expect(
      screen.getByText('Temperature sensor for zone 1'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Temperature sensor for zone 2'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Zone index')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add|remove/i })).toBeNull()

    await user.click(
      screen.getAllByRole('combobox', { name: /^Sensor category/ })[0],
    )
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual([
      'Thermocouple',
      'Resistance temperature detector (RTD)',
      'Infrared thermometer',
      'Fiber-optic temperature sensor',
      'Thermistor',
      'Other',
    ])
    await user.click(screen.getByRole('option', { name: 'Thermocouple' }))
    await user.type(
      screen.getAllByLabelText('Nominal temperature accuracy (±°C)')[0],
      '0.8',
    )

    const value = JSON.parse(
      screen.getByTestId('value').textContent ?? '',
    ) as TemperatureSensor[]
    expect(value).toEqual([
      expect.objectContaining({
        sensor_type: 'thermocouple',
        zone_index: 1,
        nominal_accuracy_C: 0.8,
      }),
      expect.objectContaining({ zone_index: 2 }),
    ])
    expect(temperatureSensorsAreValid(value, 2)).toBe(false)
  })

  it('aligns rows to the fixed zone order and drops extra zones', () => {
    expect(
      reconcileTemperatureSensors(
        [
          sensorTwo,
          { ...sensorOne, zone_index: 4 },
          { ...sensorOne, nominal_accuracy_C: 0.5 },
        ],
        2,
      ),
    ).toEqual([
      { ...sensorOne, nominal_accuracy_C: 0.5, zone_index: 1 },
      sensorTwo,
    ])
  })

  it('allows missing nominal accuracy and rejects negative values', () => {
    expect(temperatureSensorsAreValid([sensorOne], 1)).toBe(true)
    expect(
      temperatureSensorsAreValid(
        [{ ...sensorOne, nominal_accuracy_C: null }],
        1,
      ),
    ).toBe(true)
    expect(
      temperatureSensorsAreValid([{ ...sensorOne, zone_index: 3 }], 2),
    ).toBe(false)
    expect(
      temperatureSensorsAreValid(
        [{ ...sensorOne, nominal_accuracy_C: -0.1 }],
        1,
      ),
    ).toBe(false)
  })
})
