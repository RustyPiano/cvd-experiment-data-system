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
import { common as zhCommon } from './locales/zh/common'
import { common as enCommon } from './locales/en/common'

export const defaultNS = 'common'

export const resources = {
  zh: { common: zhCommon },
  en: { common: enCommon },
} as const

// 同步初始化（资源内联、无异步后端），import 本模块即完成初始化。
void i18n.use(initReactI18next).init({
  resources,
  lng: 'zh',
  fallbackLng: 'zh',
  defaultNS,
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n
