import { lazy, Suspense, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'

import { listCharacterizationItems } from './api'
import type { CharacterizationListItem } from './api'
import { getRun } from '@/features/experiments-v2/api'
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

const ScientificMeasurementWorkspace = lazy(() =>
  import('@/features/experiments-v2/simple-characterization-workspace').then(
    (module) => ({ default: module.SimpleCharacterizationWorkspace }),
  ),
)

function measurementMethodLabel(method: string, language: string) {
  return localizedOption(method, language)
}

function matchesQuery(
  item: CharacterizationListItem,
  query: string,
  language: string,
) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [
    item.sample.run_code,
    item.sample.sample_code,
    item.sample.material_system,
    ...item.measurements.map((measurement) =>
      measurementMethodLabel(measurement.method_profile, language),
    ),
  ].some((value) => value?.toLowerCase().includes(needle))
}

export function CharacterizationListPage({
  runId,
  sampleId,
}: {
  runId?: string
  sampleId?: string
}) {
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
  const runQuery = useQuery({
    queryKey: ['v2-experiment-status', runId, session.accessToken],
    queryFn: () => getRun(runId!, session.accessToken!),
    enabled: session.isAuthenticated && Boolean(runId),
  })
  const items = itemsQuery.data ?? []
  const filtered = useMemo(
    () => items.filter((item) => matchesQuery(item, query, i18n.language)),
    [i18n.language, items, query],
  )
  const resultCount = items.reduce(
    (count, item) => count + item.measurements.length,
    0,
  )

  if (runId) {
    const hasCurrentRevision = Boolean(runQuery.data?.current_revision_id)
    const canAddMeasurement =
      ['locked', 'reviewed'].includes(runQuery.data?.status ?? '') &&
      hasCurrentRevision
    const needsInitialLock =
      runQuery.data?.status === 'draft' && !hasCurrentRevision
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t(
            !canAddMeasurement && !needsInitialLock && runQuery.data
              ? 'characterizations.run.readOnlyTitle'
              : 'characterizations.run.title',
          )}
          subtitle={t('characterizations.run.subtitle')}
        />
        {runQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>
                {resolveErrorMessage(
                  runQuery.error,
                  t('characterizations.run.loadError'),
                )}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={runQuery.isFetching}
                onClick={() => void runQuery.refetch()}
              >
                {t('characterizations.list.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : runQuery.isLoading ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : !needsInitialLock ? (
          <Suspense
            fallback={
              <Skeleton
                className="h-96 w-full rounded-lg"
                data-testid="measurement-workspace-loading"
              />
            }
          >
            <ScientificMeasurementWorkspace
              key={`${runId}:${sampleId ?? ''}`}
              runId={runId}
              initialSampleId={sampleId}
              token={session.accessToken!}
              readOnly={!canAddMeasurement}
            />
          </Suspense>
        ) : (
          <Alert>
            <AlertDescription>
              {t('characterizations.run.lockRequired')}
            </AlertDescription>
          </Alert>
        )}
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
                  {filtered.map(({ measurements, sample }) => {
                    const evidencePresent = measurements.some(
                      (measurement) => measurement.evidence_present,
                    )
                    const methods = [
                      ...new Set(
                        measurements.map((measurement) =>
                          measurementMethodLabel(
                            measurement.method_profile,
                            i18n.language,
                          ),
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
                          {measurements.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="secondary">
                                {t(
                                  'characterizations.list.types.characterization',
                                )}
                              </Badge>
                              <Badge variant="outline">
                                {t('characterizations.list.resultCount', {
                                  count: measurements.length,
                                })}
                              </Badge>
                              {!evidencePresent ? (
                                <Badge variant="outline">
                                  {t('characterizations.list.pending')}
                                </Badge>
                              ) : null}
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
                          {measurements[0]
                            ? dayjs(measurements[0].measured_at).format(
                                'YYYY-MM-DD HH:mm',
                              )
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" asChild>
                            <Link
                              to="/characterizations"
                              search={{
                                runId: sample.experiment_run_id,
                                sampleId: sample.id,
                              }}
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
