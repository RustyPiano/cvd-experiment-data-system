import { useTranslation } from 'react-i18next'

/**
 * t() 使用范式示例（D12 红线：新 UI 文案禁止硬编码进组件，一律走 t()）。
 * 供 P4 表单/管理页复制的最小样板——本组件未接入路由，仅作范式与测试载体。
 */
export function I18nUsageExample() {
  const { t, i18n } = useTranslation()
  return (
    <div>
      <p data-testid="greeting">{t('example.greeting')}</p>
      <button
        type="button"
        onClick={() => {
          void i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh')
        }}
      >
        {t('language.switch')}
      </button>
    </div>
  )
}
