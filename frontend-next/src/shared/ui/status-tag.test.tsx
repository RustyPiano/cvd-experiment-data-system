import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import i18n from '@/shared/i18n'
import type { ExperimentStatus } from '@/shared/types/api'
import { StatusTag } from './status-tag'

afterEach(async () => i18n.changeLanguage('zh'))

describe('StatusTag', () => {
  it('uses the shared experiment status translations', async () => {
    await i18n.changeLanguage('en')
    render(<StatusTag status="invalid" />)
    expect(screen.getByText('Invalidated')).toBeInTheDocument()
  })

  it('shows an unknown raw status instead of treating it as draft', () => {
    render(<StatusTag status={'archived' as ExperimentStatus} />)
    expect(screen.getByText('archived')).toBeInTheDocument()
    expect(screen.queryByText('草稿')).not.toBeInTheDocument()
  })
})
