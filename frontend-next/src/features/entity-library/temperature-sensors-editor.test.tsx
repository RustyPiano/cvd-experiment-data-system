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
  sensorName: 'Sensor name',
  sensorType: 'Sensor type',
  uncertaintyCelsius: 'Uncertainty (°C)',
  uncertaintySource: 'Uncertainty source',
  selectUncertaintySource: 'Select uncertainty source',
  uncertaintySourceOptions: {
    instrument: 'Instrument specification',
    calibration: 'Calibration',
    repeatability: 'Repeatability',
    estimate: 'Estimate',
  },
  selectZoneCountFirst: 'Set the zone count first',
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
  sensor_name: 'Furnace TC 1',
  sensor_type: 'K-type thermocouple',
  zone_index: 1,
  uncertainty_C: 1,
  uncertainty_source: 'calibration',
}

const sensorTwo: TemperatureSensor = {
  sensor_name: 'Furnace TC 2',
  sensor_type: 'K-type thermocouple',
  zone_index: 2,
  uncertainty_C: 1.5,
  uncertainty_source: 'repeatability',
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

    await user.type(screen.getAllByLabelText('Sensor name')[0], 'Furnace TC')
    await user.type(screen.getAllByLabelText('Sensor type')[0], 'K-type')
    await user.type(screen.getAllByLabelText('Uncertainty (°C)')[0], '0.8')
    await user.click(
      screen.getAllByRole('combobox', { name: 'Uncertainty source' })[0],
    )
    await user.click(screen.getByRole('option', { name: 'Calibration' }))

    const value = JSON.parse(
      screen.getByTestId('value').textContent ?? '',
    ) as TemperatureSensor[]
    expect(value).toEqual([
      expect.objectContaining({
        sensor_name: 'Furnace TC',
        sensor_type: 'K-type',
        zone_index: 1,
        uncertainty_C: 0.8,
        uncertainty_source: 'calibration',
      }),
      expect.objectContaining({ zone_index: 2 }),
    ])
    expect(temperatureSensorsAreValid(value, 2)).toBe(false)
  })

  it('aligns legacy rows to the fixed zone order and drops extra zones', () => {
    expect(
      reconcileTemperatureSensors(
        [
          sensorTwo,
          { ...sensorOne, zone_index: 4 },
          { ...sensorOne, sensor_name: 'Exact zone 1' },
        ],
        2,
      ),
    ).toEqual([
      { ...sensorOne, sensor_name: 'Exact zone 1', zone_index: 1 },
      sensorTwo,
    ])
  })

  it('enforces setup zone bounds and non-negative uncertainty', () => {
    expect(
      temperatureSensorsAreValid([{ ...sensorOne, zone_index: 3 }], 2),
    ).toBe(false)
    expect(
      temperatureSensorsAreValid([{ ...sensorOne, uncertainty_C: -0.1 }], 2),
    ).toBe(false)
  })
})
