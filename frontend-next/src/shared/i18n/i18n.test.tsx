import { afterEach, describe, expect, it } from 'vitest'
import i18n from './index'

afterEach(async () => {
  await i18n.changeLanguage('zh')
})

describe('i18n scaffolding', () => {
  it('defaults to the zh locale', () => {
    expect(i18n.language).toBe('zh')
  })

  it('translates through t() and switches language at runtime', async () => {
    await i18n.changeLanguage('zh')
    expect(i18n.t('example.greeting')).toBe('你好，世界')

    await i18n.changeLanguage('en')
    expect(i18n.t('example.greeting')).toBe('Hello, world')
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
