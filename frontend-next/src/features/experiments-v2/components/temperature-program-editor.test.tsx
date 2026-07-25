import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  TemperatureProgramEditor,
  temperatureProgramIsValid,
} from './temperature-program-editor'
import type {
  TemperatureProgram,
  TemperatureProgramEditorLabels,
} from './temperature-program-editor'

const labels: TemperatureProgramEditorLabels = {
  addZone: 'Add zone',
  zone: (position) => `Zone ${position}`,
  zoneIndex: 'Zone index',
  removeZone: 'Remove zone',
  addPoint: 'Add point',
  point: (position) => `Point ${position}`,
  elapsedMinutes: 'Elapsed (min)',
  setpointCelsius: 'Setpoint (°C)',
  removePoint: 'Remove point',
  moveUp: 'Move up',
  moveDown: 'Move down',
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
  it('builds per-zone points and preserves row identity while reordering', async () => {
    const user = userEvent.setup()
    const { container } = render(<Wrapper />)

    await user.click(screen.getByRole('button', { name: 'Add zone' }))
    await user.click(screen.getByRole('button', { name: 'Add zone' }))
    const setpoints = screen.getAllByLabelText('Setpoint (°C)')
    await user.type(setpoints[0], '25')
    await user.type(setpoints[1], '500')

    const zonesBefore = topRows(container)
    const zoneIdsBefore = zonesBefore.map((row) => row.dataset.rowId)
    await user.click(
      within(zonesBefore[0]).getAllByRole('button', {
        name: 'Move down',
      })[0],
    )

    expect(JSON.parse(screen.getByTestId('value').textContent ?? '')).toEqual({
      zones: [
        {
          zone_index: 2,
          points: [{ elapsed_min: 0, setpoint_C: 500 }],
        },
        {
          zone_index: 1,
          points: [{ elapsed_min: 0, setpoint_C: 25 }],
        },
      ],
    })
    expect(topRows(container).map((row) => row.dataset.rowId)).toEqual([
      zoneIdsBefore[1],
      zoneIdsBefore[0],
    ])
  })

  it('adds multiple ordered points for a hold or restarted segment', async () => {
    const user = userEvent.setup()
    render(
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

    await user.click(screen.getByRole('button', { name: 'Add point' }))
    const elapsed = screen.getAllByLabelText('Elapsed (min)')
    const setpoints = screen.getAllByLabelText('Setpoint (°C)')
    await user.type(elapsed[1], '30')
    await user.type(setpoints[1], '750')

    const value = JSON.parse(
      screen.getByTestId('value').textContent ?? '',
    ) as TemperatureProgram
    expect(value.zones[0].points).toEqual([
      { elapsed_min: 0, setpoint_C: 25 },
      { elapsed_min: 30, setpoint_C: 750 },
    ])
    expect(temperatureProgramIsValid(value)).toBe(true)
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
