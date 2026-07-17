import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import i18n from '@/shared/i18n'
import { LanguageToggle } from './language-toggle'

afterEach(async () => i18n.changeLanguage('zh'))

describe('LanguageToggle', () => {
  it('switches between Chinese and English from the app header', async () => {
    const user = userEvent.setup()
    await i18n.changeLanguage('zh')
    render(<LanguageToggle />)

    const button = screen.getByRole('button', { name: '切换语言' })
    expect(button).toHaveTextContent('English')

    await user.click(button)
    expect(i18n.language).toBe('en')
    expect(
      screen.getByRole('button', { name: 'Switch language' }),
    ).toHaveTextContent('中文')
  })
})
