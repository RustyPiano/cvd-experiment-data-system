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
