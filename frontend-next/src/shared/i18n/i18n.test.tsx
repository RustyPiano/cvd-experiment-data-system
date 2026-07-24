import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n, { LANGUAGE_STORAGE_KEY } from './index'

const storedValues = new Map<string, string>()

beforeEach(() => {
  storedValues.clear()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storedValues.get(key) ?? null,
      setItem: (key: string, value: string) => storedValues.set(key, value),
      removeItem: (key: string) => storedValues.delete(key),
      clear: () => storedValues.clear(),
    },
  })
})

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
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('"en"')
  })

  it('keeps document language and title in sync with the active locale', async () => {
    await i18n.changeLanguage('en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe('CVD Lab · Experiment Data System')

    await i18n.changeLanguage('zh')
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(document.title).toBe('CVD 实验数据采集系统')
  })

  it('adopts the language selected in another tab', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, '"en"')
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: LANGUAGE_STORAGE_KEY,
        newValue: '"en"',
      }),
    )

    await vi.waitFor(() => expect(i18n.language).toBe('en'))
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

  it('keeps retired implementation wording out of visible copy', () => {
    const stringValues = (value: unknown): string[] =>
      value && typeof value === 'object'
        ? Object.values(value as Record<string, unknown>).flatMap(stringValues)
        : typeof value === 'string'
          ? [value]
          : []
    const zh = stringValues(i18n.getResourceBundle('zh', 'common')).join('\n')
    const en = stringValues(i18n.getResourceBundle('en', 'common')).join('\n')

    for (const phrase of [
      'v2 实验',
      'v2实验',
      '基础库',
      '装置 Setup',
      '过程步',
      '过程事件',
      '实测产物',
      '创建并保存草稿',
      '加载实验失败',
      '请先选择装置',
      '正在使用装置',
      '实体记录',
    ]) {
      expect(zh).not.toContain(phrase)
    }
    for (const phrase of [
      'v2 experiment',
      'Create and save draft',
      'Failed to load experiment',
      'Select a setup first',
      'Using setup v',
      'Entity record',
    ]) {
      expect(en.toLowerCase()).not.toContain(phrase.toLowerCase())
    }
  })
})
