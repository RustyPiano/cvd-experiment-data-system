import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  TemperatureSensorsEditor,
  temperatureSensorsAreValid,
} from './temperature-sensors-editor'
import type {
  TemperatureSensor,
  TemperatureSensorsEditorLabels,
} from './temperature-sensors-editor'

const labels: TemperatureSensorsEditorLabels = {
  addSensor: 'Add sensor',
  sensor: (position) => `Sensor ${position}`,
  sensorName: 'Sensor name',
  sensorType: 'Sensor type',
  zoneIndex: 'Zone index',
  uncertaintyCelsius: 'Uncertainty (°C)',
  uncertaintySource: 'Uncertainty source',
  selectUncertaintySource: 'Select uncertainty source',
  uncertaintySourceOptions: {
    instrument: 'Instrument specification',
    calibration: 'Calibration',
    repeatability: 'Repeatability',
    estimate: 'Estimate',
  },
  removeSensor: 'Remove sensor',
  moveUp: 'Move up',
  moveDown: 'Move down',
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

function topRows(container: HTMLElement): HTMLFieldSetElement[] {
  return Array.from(
    container.querySelectorAll(
      ':scope > div:first-child > fieldset[data-row-id]',
    ),
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
  it('captures the complete structured sensor record', async () => {
    const user = userEvent.setup()
    render(<Wrapper zoneCount={1} />)

    await user.click(screen.getByRole('button', { name: 'Add sensor' }))
    await user.type(screen.getByLabelText('Sensor name'), 'Furnace TC')
    await user.type(screen.getByLabelText('Sensor type'), 'K-type')
    await user.type(screen.getByLabelText('Zone index'), '1')
    await user.type(screen.getByLabelText('Uncertainty (°C)'), '0.8')
    await user.click(
      screen.getByRole('combobox', { name: 'Uncertainty source' }),
    )
    await user.click(screen.getByRole('option', { name: 'Calibration' }))

    const value = JSON.parse(
      screen.getByTestId('value').textContent ?? '',
    ) as TemperatureSensor[]
    expect(value).toEqual([
      {
        sensor_name: 'Furnace TC',
        sensor_type: 'K-type',
        zone_index: 1,
        uncertainty_C: 0.8,
        uncertainty_source: 'calibration',
      },
    ])
    expect(temperatureSensorsAreValid(value, 1)).toBe(true)
  })

  it('preserves sensor row identity while reordering', async () => {
    const user = userEvent.setup()
    const { container } = render(<Wrapper initial={[sensorOne, sensorTwo]} />)
    const before = topRows(container).map((row) => row.dataset.rowId)

    await user.click(
      within(topRows(container)[0]).getByRole('button', {
        name: 'Move down',
      }),
    )

    const value = JSON.parse(
      screen.getByTestId('value').textContent ?? '',
    ) as TemperatureSensor[]
    expect(value.map((sensor) => sensor.zone_index)).toEqual([2, 1])
    expect(topRows(container).map((row) => row.dataset.rowId)).toEqual([
      before[1],
      before[0],
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
