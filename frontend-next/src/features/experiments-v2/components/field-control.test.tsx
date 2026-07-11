import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'

import { experimentModules } from '@/shared/generated/field-metadata'
import type { FieldMetadata } from '@/shared/generated/field-metadata'
import i18n from '@/shared/i18n'
import { FieldControl } from './field-control'

function compositeField(key: string): FieldMetadata {
  return experimentModules.process_steps.find(
    (field) => field.key === key,
  ) as FieldMetadata
}

function renderControl(field: FieldMetadata, onChange = vi.fn()) {
  function Wrapper() {
    const [value, setValue] = useState('')
    return (
      <I18nextProvider i18n={i18n}>
        <FieldControl
          moduleKey="process_steps"
          field={field}
          values={{}}
          value={value}
          onChange={(next) => {
            setValue(next)
            onChange(next)
          }}
        />
      </I18nextProvider>
    )
  }
  return { user: userEvent.setup(), ...render(<Wrapper />), onChange }
}

describe('FieldControl composite inputs', () => {
  it('edits a 数值+下拉 field without losing either half', async () => {
    const { user, onChange } = renderControl(compositeField('gas_flow_sccm'))

    await user.type(screen.getByRole('textbox'), '80')
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'MFC' }))

    expect(onChange).toHaveBeenLastCalledWith('80（MFC）')
  })

  it('edits a 下拉+数值 field and keeps the Select controlled', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { user, onChange } = renderControl(compositeField('pressure_system'))

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: '常压(APCVD)' }))
    await user.type(screen.getByRole('textbox'), '1.0×10⁵ Pa')

    expect(onChange).toHaveBeenLastCalledWith('常压(APCVD)；1.0×10⁵ Pa')
    expect(error.mock.calls.flat().join(' ')).not.toContain('uncontrolled')
    error.mockRestore()
  })
})
