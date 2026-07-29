import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { listCharacterizationItems } from './api'
import type { CharacterizationListItem } from './api'
import type { V2ResultRead } from '@/features/experiments-v2/api'
import { ScientificMeasurementWorkspace } from '@/features/experiments-v2/scientific-experiment-form'
import { useAuth } from '@/features/auth/use-auth'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { localizedOption } from '@/shared/field-i18n'
import { EmptyState } from '@/shared/ui/empty-state'
import { PageHeader } from '@/shared/ui/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function resultTypeLabel(result: V2ResultRead, t: TFunction) {
  return t(
    result.kind === 'characterization'
      ? 'characterizations.list.types.characterization'
      : 'characterizations.list.types.directObservation',
  )
}

function resultMethodLabel(
  result: V2ResultRead,
  language: string,
  t: TFunction,
) {
  if (result.kind === 'direct_observation') {
    return t('characterizations.list.types.directObservation')
  }
  if (result.method_instrument === 'other' && result.method_other) {
    return result.method_other
  }
  return result.method_instrument
    ? localizedOption(result.method_instrument, language)
    : t('characterizations.list.methodUnavailable')
}

function matchesQuery(
  item: CharacterizationListItem,
  query: string,
  language: string,
  t: TFunction,
) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [
    item.sample.run_code,
    item.sample.sample_code,
    item.sample.material_system,
    ...item.results.flatMap((result) => [
      resultTypeLabel(result, t),
      resultMethodLabel(result, language, t),
    ]),
  ].some((value) => value?.toLowerCase().includes(needle))
}

export function CharacterizationListPage({ runId }: { runId?: string }) {
  const { t, i18n } = useTranslation()
  const { session } = useAuth()
  const [query, setQuery] = useState('')
  const viewerKey = session.currentUser?.id ?? 'anonymous'

  const itemsQuery = useQuery({
    queryKey: ['characterizations', 'list', viewerKey],
    queryFn: () => listCharacterizationItems(session.accessToken!),
    enabled: session.isAuthenticated && !runId,
    staleTime: 0,
  })
  const items = itemsQuery.data ?? []
  const filtered = useMemo(
    () => items.filter((item) => matchesQuery(item, query, i18n.language, t)),
    [i18n.language, items, query, t],
  )
  const resultCount = items.reduce(
    (count, item) => count + item.results.length,
    0,
  )

  if (runId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t('characterizations.run.title')}
          subtitle={t('characterizations.run.subtitle')}
        />
        <ScientificMeasurementWorkspace
          runId={runId}
          token={session.accessToken!}
          readOnly={false}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('characterizations.list.title')}
        subtitle={t('characterizations.list.subtitle')}
      />

      {itemsQuery.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>
              {resolveErrorMessage(
                itemsQuery.error,
                t('characterizations.list.loadError'),
              )}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => itemsQuery.refetch()}
            >
              {t('characterizations.list.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('characterizations.list.tableTitle')}</CardTitle>
          <CardDescription>
            {t('characterizations.list.total', {
              sampleCount: items.length,
              resultCount,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input
            autoComplete="off"
            aria-label={t('characterizations.list.searchLabel')}
            placeholder={t('characterizations.list.searchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full sm:max-w-md"
          />

          {itemsQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : itemsQuery.isError ? null : filtered.length === 0 ? (
            <EmptyState
              description={
                items.length === 0
                  ? t('characterizations.list.empty')
                  : t('characterizations.list.noMatches')
              }
              action={
                items.length === 0 ? (
                  <Button asChild variant="outline">
                    <Link to="/experiments">
                      {t('characterizations.list.goToRuns')}
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {t('characterizations.list.columns.run')}
                    </TableHead>
                    <TableHead>
                      {t('characterizations.list.columns.sample')}
                    </TableHead>
                    <TableHead>
                      {t('characterizations.list.columns.type')}
                    </TableHead>
                    <TableHead>
                      {t('characterizations.list.columns.method')}
                    </TableHead>
                    <TableHead>
                      {t('characterizations.list.columns.recordedAt')}
                    </TableHead>
                    <TableHead className="text-right">
                      {t('characterizations.list.columns.actions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(({ results, sample }) => {
                    const types = [
                      ...new Set(
                        results.map((result) => resultTypeLabel(result, t)),
                      ),
                    ]
                    const methods = [
                      ...new Set(
                        results.map((result) =>
                          resultMethodLabel(result, i18n.language, t),
                        ),
                      ),
                    ]
                    return (
                      <TableRow key={sample.id}>
                        <TableCell>
                          {sample.run_code ? (
                            <Link
                              to="/experiments/$runId/edit"
                              params={{ runId: sample.experiment_run_id }}
                              className="font-medium tabular-nums text-primary hover:underline"
                            >
                              {sample.run_code}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link
                            to="/samples/$sampleId"
                            params={{ sampleId: sample.id }}
                            className="font-medium tabular-nums text-primary hover:underline"
                          >
                            {sample.sample_code}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {results.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {types.map((type) => (
                                <Badge key={type} variant="secondary">
                                  {type}
                                </Badge>
                              ))}
                              <Badge variant="outline">
                                {t('characterizations.list.resultCount', {
                                  count: results.length,
                                })}
                              </Badge>
                            </div>
                          ) : (
                            <Badge variant="outline">
                              {t('characterizations.list.pending')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {methods.length > 0
                            ? methods.join(' · ')
                            : t('characterizations.list.notRecorded')}
                        </TableCell>
                        <TableCell className="tabular-nums text-sm text-muted-foreground">
                          {results[0]
                            ? dayjs(results[0].created_at).format(
                                'YYYY-MM-DD HH:mm',
                              )
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" asChild>
                            <Link
                              to="/characterizations"
                              search={{ runId: sample.experiment_run_id }}
                            >
                              {t('characterizations.list.openResults')}
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
