import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  reconcileTemperatureProgram,
  TemperatureProgramEditor,
  temperatureProgramIsValid,
} from './temperature-program-editor'
import type {
  TemperatureProgram,
  TemperatureProgramEditorLabels,
} from './temperature-program-editor'

const labels: TemperatureProgramEditorLabels = {
  zone: (zoneIndex) => `Zone ${zoneIndex}`,
  addPoint: 'Add point',
  point: (position) => `Point ${position}`,
  elapsedMinutes: 'Elapsed (min)',
  setpointCelsius: 'Setpoint (°C)',
  removePoint: 'Remove point',
  moveUp: 'Move up',
  moveDown: 'Move down',
  selectSetupFirst: 'Select a setup first',
}

function Wrapper({
  initial = { zones: [] },
}: {
  initial?: TemperatureProgram
}) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <TemperatureProgramEditor
        value={value}
        onChange={setValue}
        zoneCount={2}
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

describe('TemperatureProgramEditor', () => {
  it('builds exactly one auto-numbered program card per setup zone', async () => {
    const user = userEvent.setup()
    render(<Wrapper />)

    const setpoints = screen.getAllByLabelText('Setpoint (°C)')
    await user.type(setpoints[0], '25')
    await user.type(setpoints[1], '500')

    expect(JSON.parse(screen.getByTestId('value').textContent ?? '')).toEqual({
      zones: [
        {
          zone_index: 1,
          points: [{ elapsed_min: 0, setpoint_C: 25 }],
        },
        {
          zone_index: 2,
          points: [{ elapsed_min: 0, setpoint_C: 500 }],
        },
      ],
    })
    expect(screen.queryByLabelText('Zone index')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add zone' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove zone' })).toBeNull()
  })

  it('adds multiple ordered points for a hold or restarted segment', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <Wrapper
        initial={{
          zones: [
            {
              zone_index: 1,
              points: [{ elapsed_min: 0, setpoint_C: 25 }],
            },
          ],
        }}
      />,
    )

    const firstZone = topRows(container)[0]
    await user.click(
      within(firstZone).getByRole('button', { name: 'Add point' }),
    )
    const elapsed = within(firstZone).getAllByLabelText('Elapsed (min)')
    const setpoints = within(firstZone).getAllByLabelText('Setpoint (°C)')
    await user.type(elapsed[1], '30')
    await user.type(setpoints[1], '750')

    const value = JSON.parse(
      screen.getByTestId('value').textContent ?? '',
    ) as TemperatureProgram
    expect(value.zones[0].points).toEqual([
      { elapsed_min: 0, setpoint_C: 25 },
      { elapsed_min: 30, setpoint_C: 750 },
    ])
    expect(temperatureProgramIsValid({ zones: [value.zones[0]] })).toBe(true)
  })

  it('reconciles legacy order to Setup coverage and discards extra zones', () => {
    expect(
      reconcileTemperatureProgram(
        {
          zones: [
            {
              zone_index: 2,
              points: [{ elapsed_min: 0, setpoint_C: 500 }],
            },
            {
              zone_index: 4,
              points: [{ elapsed_min: 0, setpoint_C: 900 }],
            },
            {
              zone_index: 1,
              points: [{ elapsed_min: 0, setpoint_C: 250 }],
            },
          ],
        },
        2,
      ),
    ).toEqual({
      zones: [
        {
          zone_index: 1,
          points: [{ elapsed_min: 0, setpoint_C: 250 }],
        },
        {
          zone_index: 2,
          points: [{ elapsed_min: 0, setpoint_C: 500 }],
        },
      ],
    })
  })

  it('accepts a single-point hold only when it starts at zero minutes', () => {
    expect(
      temperatureProgramIsValid({
        zones: [
          {
            zone_index: 1,
            points: [{ elapsed_min: 0, setpoint_C: 750 }],
          },
        ],
      }),
    ).toBe(true)
    expect(
      temperatureProgramIsValid({
        zones: [
          {
            zone_index: 1,
            points: [{ elapsed_min: 5, setpoint_C: 750 }],
          },
        ],
      }),
    ).toBe(false)
  })

  it('rejects duplicate/out-of-range zones and non-increasing time', () => {
    const invalid: TemperatureProgram = {
      zones: [
        {
          zone_index: 1,
          points: [
            { elapsed_min: 10, setpoint_C: 700 },
            { elapsed_min: 10, setpoint_C: 750 },
          ],
        },
        {
          zone_index: 1,
          points: [{ elapsed_min: 0, setpoint_C: 500 }],
        },
      ],
    }
    expect(temperatureProgramIsValid(invalid, 2)).toBe(false)
    expect(
      temperatureProgramIsValid(
        {
          zones: [
            {
              zone_index: 3,
              points: [{ elapsed_min: 0, setpoint_C: 500 }],
            },
          ],
        },
        2,
      ),
    ).toBe(false)
  })
})
