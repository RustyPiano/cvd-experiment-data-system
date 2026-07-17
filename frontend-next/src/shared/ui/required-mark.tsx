import { useTranslation } from 'react-i18next'

/**
 * Marks a field that is required to submit an experiment. Visual-only asterisk
 * with an accessible label so screen readers announce it.
 */
export function RequiredMark() {
  const { t } = useTranslation()
  return (
    <span
      className="ml-0.5 text-destructive"
      title={t('requiredMark.title')}
    >
      <span aria-hidden>*</span>
      <span className="sr-only">{t('requiredMark.screenReader')}</span>
    </span>
  )
}
