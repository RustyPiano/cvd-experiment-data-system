import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CompositeFieldControl } from './composite-field-control'

function PumpControl() {
  const [value, setValue] = useState('')
  return (
    <CompositeFieldControl
      input="文本+数值"
      value={value}
      options={[]}
      onChange={setValue}
      inputId="pump-pressure"
      selectId="pump-model"
      selectLabel="Pump model"
      freePlaceholder="Ultimate absolute pressure"
      selectPlaceholder="Pump model"
      validation={{ gt: 0, require_value: true }}
    />
  )
}

describe('CompositeFieldControl', () => {
  it('renders a free pump-model input followed by a numeric pressure input', () => {
    render(<PumpControl />)

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Edwards RV12' },
    })
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '2' },
    })

    expect(screen.getByRole('textbox')).toHaveValue('Edwards RV12')
    expect(screen.getByRole('spinbutton')).toHaveValue(2)
  })
})
