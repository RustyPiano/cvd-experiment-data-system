// ============================================================================
// i18next 脚手架（实现方案 D12）—— zh 默认 locale
//
// t() 使用范式（新组件一律这样写，禁止硬编码文案）：
//   import { useTranslation } from 'react-i18next'
//   function Save() {
//     const { t } = useTranslation()
//     return <button>{t('actions.save')}</button>   // 文案键加在 locales/{zh,en}/common.ts
//   }
// 切换语言：const { i18n } = useTranslation(); i18n.changeLanguage('en')
//
// Provider 在应用根挂载（src/main.tsx 的 <I18nextProvider>）。
// 键类型安全：src/shared/i18n/i18next.d.ts 用本文件的 resources 做模块增强。
// ============================================================================
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { readJsonStorage, writeJsonStorage } from '@/shared/lib/storage'
import { common as zhCommon } from './locales/zh/common'
import { common as enCommon } from './locales/en/common'

export const defaultNS = 'common'
export const LANGUAGE_STORAGE_KEY = 'cvd.language'

export const resources = {
  zh: { common: zhCommon },
  en: { common: enCommon },
} as const

function storedLanguage() {
  const language = readJsonStorage<unknown>(LANGUAGE_STORAGE_KEY)
  return language === 'en' || language === 'zh' ? language : null
}

// 同步初始化（资源内联、无异步后端），import 本模块即完成初始化。
void i18n.use(initReactI18next).init({
  resources,
  lng: storedLanguage() ?? 'zh',
  fallbackLng: 'zh',
  defaultNS,
  interpolation: { escapeValue: false },
  returnNull: false,
})

function syncDocumentLocale(language: string) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = language.startsWith('en') ? 'en' : 'zh-CN'
  document.title = i18n.t('app.title')
}

i18n.on('languageChanged', (language) => {
  writeJsonStorage(
    LANGUAGE_STORAGE_KEY,
    language.startsWith('en') ? 'en' : 'zh',
  )
  syncDocumentLocale(language)
})

syncDocumentLocale(i18n.language)

window.addEventListener('storage', (event) => {
  if (event.key === LANGUAGE_STORAGE_KEY) {
    void i18n.changeLanguage(storedLanguage() ?? 'zh')
  }
})

export default i18n
