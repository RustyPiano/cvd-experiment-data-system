// v2 新建实验页。
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/shared/ui/page-header'
import { useAuth } from '@/features/auth/use-auth'
import { ExperimentV2Form } from './experiment-v2-form'
import { buildEmptyState } from './form-state'

export function ExperimentV2NewPage() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const operator = session.currentUser?.name ?? ''
  const initialState = useMemo(() => buildEmptyState(operator), [operator])
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('experimentsV2.new.title')}
        subtitle={t('experimentsV2.new.subtitle')}
      />
      <ExperimentV2Form mode="new" initialState={initialState} />
    </div>
  )
}
