import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import i18n from './index'
import { I18nUsageExample } from './i18n-usage-example'

afterEach(async () => {
  await i18n.changeLanguage('zh')
})

describe('i18n scaffolding', () => {
  it('defaults to the zh locale', () => {
    expect(i18n.language).toBe('zh')
  })

  it('renders文案 through t() and switches language at runtime', async () => {
    const user = userEvent.setup()
    render(
      <I18nextProvider i18n={i18n}>
        <I18nUsageExample />
      </I18nextProvider>,
    )

    expect(screen.getByTestId('greeting')).toHaveTextContent('你好，世界')

    await user.click(screen.getByRole('button'))
    expect(screen.getByTestId('greeting')).toHaveTextContent('Hello, world')
  })

  it('keeps zh and en resources structurally in sync', () => {
    const keyPaths = (obj: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([key, value]) =>
        value && typeof value === 'object'
          ? keyPaths(value as Record<string, unknown>, `${prefix}${key}.`)
          : [`${prefix}${key}`],
      )
    const zhKeys = keyPaths(i18n.getResourceBundle('zh', 'common')).sort()
    const enKeys = keyPaths(i18n.getResourceBundle('en', 'common')).sort()
    expect(enKeys).toEqual(zhKeys)
  })
})
