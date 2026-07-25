import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/shared/i18n'
import { parseStructuredValue } from '@/shared/structured-field'
import { StructuredObjectControl } from './structured-object-control'

function ControlledObject({ fieldKey }: { fieldKey: string }) {
  const [value, setValue] = useState('')
  return (
    <I18nextProvider i18n={i18n}>
      <StructuredObjectControl
        fieldKey={fieldKey}
        value={value}
        onChange={setValue}
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

    await user.click(screen.getByRole('combobox', { name: 'Roughness metric' }))
    await user.click(
      screen.getByRole('option', {
        name: 'Root mean square roughness (RMS)',
      }),
    )
    await user.type(screen.getByLabelText(/^Roughness value/), '0.5')

    expect(
      parseStructuredValue(screen.getByTestId('value').textContent ?? ''),
    ).toEqual({ metric: 'RMS', value_nm: '0.5' })
  })
})
