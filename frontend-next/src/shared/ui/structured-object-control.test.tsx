import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { parseStructuredValue } from '@/shared/structured-field'
import { StructuredObjectControl } from './structured-object-control'

function ControlledObject({
  fieldKey,
  tubeShape,
  zoneCount,
}: {
  fieldKey: string
  tubeShape?: string
  zoneCount?: number
}) {
  const [value, setValue] = useState('')
  return (
    <I18nextProvider i18n={i18n}>
      <StructuredObjectControl
        fieldKey={fieldKey}
        value={value}
        onChange={setValue}
        tubeShape={tubeShape}
        zoneCount={zoneCount}
      />
      <output data-testid="value">{value}</output>
    </I18nextProvider>
  )
}

describe('StructuredObjectControl v3.7 objects', () => {
  beforeEach(async () => i18n.changeLanguage('en'))

  it('expands the named fields for other tube material and shape', async () => {
    const user = userEvent.setup()
    render(<ControlledObject fieldKey="tube_material_shape" />)

    await user.click(screen.getByRole('combobox', { name: 'Material' }))
    await user.click(screen.getByRole('option', { name: 'Other material' }))
    await user.type(screen.getByLabelText(/^Other material name/), 'SiC')

    await user.click(screen.getByRole('combobox', { name: 'Cross-section' }))
    await user.click(screen.getByRole('option', { name: 'Other shape' }))
    await user.type(screen.getByLabelText(/^Other shape/), 'hexagonal')

    expect(
      parseStructuredValue(screen.getByTestId('value').textContent ?? ''),
    ).toEqual({
      material: 'other',
      material_other: 'SiC',
      shape: 'other',
      shape_other: 'hexagonal',
    })
  })

  it('shows tilt angle conditionally and clears it when placement changes', async () => {
    const user = userEvent.setup()
    render(<ControlledObject fieldKey="size_placement" />)

    await user.type(screen.getByLabelText(/^Length \(mm\)/), '10')
    await user.type(screen.getByLabelText(/^Width \(mm\)/), '10')
    await user.click(screen.getByRole('combobox', { name: 'Placement' }))
    await user.click(screen.getByRole('option', { name: 'Tilted' }))
    await user.type(screen.getByLabelText(/^Tilt angle \(°\)/), '15')

    expect(
      parseStructuredValue(screen.getByTestId('value').textContent ?? ''),
    ).toMatchObject({ placement: 'tilted', tilt_angle_deg: '15' })

    await user.click(screen.getByRole('combobox', { name: 'Placement' }))
    await user.click(screen.getByRole('option', { name: 'Face up' }))

    expect(screen.queryByLabelText(/^Tilt angle \(°\)/)).not.toBeInTheDocument()
    expect(
      parseStructuredValue(screen.getByTestId('value').textContent ?? ''),
    ).toEqual({ length_mm: '10', width_mm: '10', placement: 'face_up' })
  })

  it('records the roughness metric and value as separate fields', async () => {
    const user = userEvent.setup()
    render(<ControlledObject fieldKey="surface_roughness" />)

    await user.click(
      screen.getByRole('combobox', {
        name: 'Roughness specification availability',
      }),
    )
    await user.click(
      screen.getByRole('option', { name: 'Specification reported' }),
    )
    await user.click(screen.getByRole('combobox', { name: 'Roughness metric' }))
    await user.click(
      screen.getByRole('option', {
        name: 'Root mean square roughness (RMS)',
      }),
    )
    await user.type(screen.getByLabelText(/^Roughness value/), '0.5')

    expect(
      parseStructuredValue(screen.getByTestId('value').textContent ?? ''),
    ).toEqual({
      availability: 'reported',
      metric: 'RMS',
      value_nm: '0.5',
    })
  })

  it('records unavailable roughness without inventing a zero value', async () => {
    const user = userEvent.setup()
    render(<ControlledObject fieldKey="surface_roughness" />)

    await user.click(
      screen.getByRole('combobox', {
        name: 'Roughness specification availability',
      }),
    )
    await user.click(
      screen.getByRole('option', { name: 'Supplier did not provide' }),
    )

    expect(screen.queryByLabelText(/^Roughness value/)).not.toBeInTheDocument()
    expect(
      parseStructuredValue(screen.getByTestId('value').textContent ?? ''),
    ).toEqual({ availability: 'not_provided' })
  })

  it('shows only the named dimensions for the selected tube shape', async () => {
    const user = userEvent.setup()
    render(
      <ControlledObject
        fieldKey="tube_outer_diameter_wall_mm"
        tubeShape="rectangular"
      />,
    )

    expect(screen.queryByLabelText(/^Outer diameter/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/^Outer width/), '60')
    await user.type(screen.getByLabelText(/^Outer height/), '40')
    await user.type(screen.getByLabelText(/^Wall thickness/), '2')

    expect(
      parseStructuredValue(screen.getByTestId('value').textContent ?? ''),
    ).toEqual({
      outer_width_mm: '60',
      outer_height_mm: '40',
      wall_thickness_mm: '2',
    })
  })

  it('captures usage history for both the furnace tube and a boat', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <ControlledObject fieldKey="tube_usage_history" />,
    )

    await user.type(
      screen.getByLabelText(/^Cleaning or replacement count/),
      '0',
    )
    await user.type(
      screen.getByLabelText(/^Run number since cleaning or replacement/),
      '1',
    )
    expect(
      parseStructuredValue(screen.getByTestId('value').textContent ?? ''),
    ).toEqual({ reset_count: '0', use_number_since_reset: '1' })

    unmount()
    render(<ControlledObject fieldKey="boat_crucible" />)
    expect(
      screen.getByLabelText(/^Cleaning or replacement count/),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText(/^Run number since cleaning or replacement/),
    ).toBeInTheDocument()
  })

  it('selects a valid setup zone and records an optional temperature basis', async () => {
    const user = userEvent.setup()
    render(
      <ControlledObject fieldKey="source_zone_temperature" zoneCount={2} />,
    )

    await user.click(screen.getByRole('combobox', { name: 'Zone number' }))
    await user.click(screen.getByRole('option', { name: 'Zone 2' }))
    await user.type(screen.getByLabelText(/^Temperature \(°C\)/), '620')
    await user.click(
      screen.getByRole('combobox', { name: 'Temperature basis' }),
    )
    await user.click(screen.getByRole('option', { name: 'Measured value' }))

    expect(
      parseStructuredValue(screen.getByTestId('value').textContent ?? ''),
    ).toEqual({
      zone_index: '2',
      temperature_C: '620',
      temperature_basis: 'measured',
    })

    await user.clear(screen.getByLabelText(/^Temperature \(°C\)/))
    expect(
      parseStructuredValue(screen.getByTestId('value').textContent ?? ''),
    ).toEqual({ zone_index: '2' })
  })

  it('limits substrate placement to the selected setup zones', async () => {
    const user = userEvent.setup()
    render(
      <ControlledObject
        fieldKey="zone_thermocouple_distance_mm"
        zoneCount={2}
      />,
    )

    await user.click(screen.getByRole('combobox', { name: 'Zone number' }))
    expect(screen.getByRole('option', { name: 'Zone 1' })).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Zone 2' }))
    await user.type(screen.getByLabelText(/^Distance/), '-5')

    expect(
      parseStructuredValue(screen.getByTestId('value').textContent ?? ''),
    ).toEqual({ zone_index: '2', distance_mm: '-5' })
  })
})
