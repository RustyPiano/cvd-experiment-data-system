import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/shared/ui/page-header'
import { SimpleExperimentCreateForm } from './simple-experiment-create-form'

export function ExperimentV2NewPage() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('experimentsV2.new.title')}
        subtitle={t('experimentsV2.new.subtitle')}
      />
      <SimpleExperimentCreateForm />
    </div>
  )
}
