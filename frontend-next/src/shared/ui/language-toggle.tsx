import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

export function LanguageToggle() {
  const { i18n, t } = useTranslation()
  const isEnglish = i18n.language.startsWith('en')

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={t('language.switch')}
      onClick={() => {
        void i18n.changeLanguage(isEnglish ? 'zh' : 'en')
      }}
    >
      <Languages className="size-4" />
      <span>{isEnglish ? t('language.zh') : t('language.en')}</span>
    </Button>
  )
}
