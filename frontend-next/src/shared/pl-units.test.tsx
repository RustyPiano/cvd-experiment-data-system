import { useState } from 'react'
import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from './i18n'
import { ConditionInput, opticalUnitValue } from './characterization-conditions'
import { characterizationProfiles } from './generated/field-metadata'

it('converts PL settings and keeps reversed energy endpoints in wavelength order', async () => {
  expect(opticalUnitValue(20, '℃')).toBeCloseTo(293.15)
  expect(opticalUnitValue(100, 'ps')).toBe(100000)
  expect(opticalUnitValue(80, 'kHz')).toBeCloseTo(0.08)
  expect(opticalUnitValue(80, 'Hz')).toBeCloseTo(0.00008)
  await i18n.changeLanguage('zh')
  function Form() {
    const [conditions, setConditions] = useState<Record<string, string>>({
      'spectral_range_nm.min': '600',
      'spectral_range_nm.max': '800',
    })
    return (
      <>
        <output data-testid="conditions">{JSON.stringify(conditions)}</output>
        <ConditionInput
          field={
            characterizationProfiles.PL.condition_fields.find(
              (field) => field.key === 'spectral_range_nm',
            )!
          }
          conditions={conditions}
          language="zh"
          onChange={(key, value) =>
            setConditions((current) => ({ ...current, [key]: value }))
          }
        />
      </>
    )
  }
  render(<Form />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '发射范围 单位' }))
  await user.click(screen.getByRole('option', { name: 'eV' }))
  expect(
    Number(screen.getByLabelText<HTMLInputElement>('发射范围 最小值').value),
  ).toBeCloseTo(1239.8419843320025 / 800)
  await user.clear(screen.getByLabelText('发射范围 最小值'))
  await user.type(screen.getByLabelText('发射范围 最小值'), '1.5')
  const saved = JSON.parse(screen.getByTestId('conditions').textContent)
  expect(Number(saved['spectral_range_nm.max'])).toBeCloseTo(
    1239.8419843320025 / 1.5,
  )
  expect(saved['spectral_range_nm.min']).toBe('600')
})

it('allows negative Celsius temperatures while preserving positive kelvin values', async () => {
  await i18n.changeLanguage('zh')
  function Form() {
    const [conditions, setConditions] = useState<Record<string, string>>({
      temperature_control: 'recorded',
      temperature_K: '100',
    })
    return (
      <ConditionInput
        field={
          characterizationProfiles.PL.condition_fields.find(
            (field) => field.key === 'temperature_K',
          )!
        }
        conditions={conditions}
        language="zh"
        onChange={(key, value) =>
          setConditions((current) => ({ ...current, [key]: value }))
        }
      />
    )
  }
  render(<Form />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '测量温度 单位' }))
  await user.click(screen.getByRole('option', { name: '℃' }))
  const input = screen.getByRole<HTMLInputElement>('spinbutton')
  expect(input.valueAsNumber).toBeCloseTo(-173.15)
  expect(input.checkValidity()).toBe(true)
})
