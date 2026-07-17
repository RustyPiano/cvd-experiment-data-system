import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { LoadingState } from '@/shared/ui/loading-state'
import { listRunAuditEvents } from '../api'

export function RunAuditSection({
  runId,
  token,
}: {
  runId: string
  token: string
}) {
  const { t } = useTranslation()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['v2-run-audit', runId, token],
    queryFn: () => listRunAuditEvents(runId, token),
    enabled: Boolean(token),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('experimentsV2.audit.title')}</CardTitle>
        <CardDescription>
          {t('experimentsV2.audit.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <LoadingState /> : null}
        {isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {resolveErrorMessage(error, t('experimentsV2.audit.loadError'))}
            </AlertDescription>
          </Alert>
        ) : null}
        {!isLoading && !isError && data?.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('experimentsV2.audit.empty')}
          </p>
        ) : null}
        {data?.items.length ? (
          <ol className="relative ml-2 border-l pl-6">
            {data.items.map((event, index) => (
              <li
                key={`${event.created_at}-${index}`}
                className="relative pb-6 last:pb-0"
              >
                <span className="absolute top-1 -left-[1.78rem] size-3 rounded-full border-2 border-background bg-primary" />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">
                    {t(`experimentsV2.audit.actions.${event.action}`, {
                      defaultValue: event.action,
                    })}
                  </p>
                  <time className="text-xs text-muted-foreground">
                    {dayjs(event.created_at).format('YYYY-MM-DD HH:mm')}
                  </time>
                </div>
                <p className="text-sm text-muted-foreground">
                  {event.actor_name}
                </p>
                {event.reason ? (
                  <p className="mt-1 text-sm">
                    {t('experimentsV2.audit.reason', {
                      reason: event.reason,
                    })}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </CardContent>
    </Card>
  )
}
