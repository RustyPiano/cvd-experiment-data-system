import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'

import { experimentModules } from '@/shared/generated/field-metadata'
import i18n from '@/shared/i18n'
import { FieldControl } from './field-control'

vi.mock('@/components/ui/select', () => ({
  Select: ({ value, children }: { value?: string; children: ReactNode }) => (
    <div data-testid="select-root" data-controlled={typeof value === 'string'}>
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <button>{children}</button>
  ),
  SelectValue: () => null,
}))

describe('FieldControl ordinary Select', () => {
  it('always receives a string value, including the empty initial state', () => {
    const field = experimentModules.basic_info.find(
      (item) => item.key === 'synthesis_method',
    )!

    render(
      <I18nextProvider i18n={i18n}>
        <FieldControl
          moduleKey="basic_info"
          field={field}
          values={{}}
          value=""
          onChange={vi.fn()}
        />
      </I18nextProvider>,
    )

    expect(screen.getByTestId('select-root')).toHaveAttribute(
      'data-controlled',
      'true',
    )
  })
})
