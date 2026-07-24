import { Skeleton } from '@/components/ui/skeleton'
import { useTranslation } from 'react-i18next'

export function LoadingState() {
  const { t } = useTranslation()
  return (
    <div role="status" className="space-y-3 p-2">
      <span className="sr-only">{t('states.loading')}</span>
      <Skeleton className="h-5 w-1/3 rounded" />
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-2/3 rounded" />
    </div>
  )
}
