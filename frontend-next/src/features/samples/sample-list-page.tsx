import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'

import { listSamples } from './api'
import { useAuth } from '@/features/auth/use-auth'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { EmptyState } from '@/shared/ui/empty-state'
import { PageHeader } from '@/shared/ui/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const roleFilters = ['', 'growth', 'derived', 'control'] as const

export function SampleListPage() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const [roleFilter, setRoleFilter] = useState('')
  const [query, setQuery] = useState('')

  const samplesQuery = useQuery({
    queryKey: [
      'samples',
      'list',
      session.currentUser?.id ?? 'anonymous',
      roleFilter,
    ],
    queryFn: () => listSamples(session.accessToken!, roleFilter || null),
    enabled: session.isAuthenticated,
  })

  const items = samplesQuery.data?.items ?? []

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter((sample) =>
      [sample.sample_code, sample.run_code, sample.material_system]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    )
  }, [items, query])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('samples.list.title')}
        subtitle={t('samples.list.subtitle')}
      />

      {samplesQuery.isError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>
              {resolveErrorMessage(
                samplesQuery.error,
                t('samples.list.loadError'),
              )}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => samplesQuery.refetch()}
            >
              {t('samples.actions.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              autoComplete="off"
              placeholder={t('samples.list.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-72"
              aria-label={t('samples.list.searchLabel')}
            />
            <div className="flex items-center gap-2">
              <Label htmlFor="sample-role-filter">
                {t('samples.list.roleFilter')}
              </Label>
              <Select
                value={roleFilter || 'all'}
                onValueChange={(value) =>
                  setRoleFilter(value === 'all' ? '' : value)
                }
              >
                <SelectTrigger id="sample-role-filter" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">
                      {t('samples.list.allRoles')}
                    </SelectItem>
                    {roleFilters
                      .filter((role) => role !== '')
                      .map((role) => (
                        <SelectItem key={role} value={role}>
                          {t(`experimentsV2.sections.results.roles.${role}`)}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          {samplesQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : samplesQuery.isError ? null : filtered.length === 0 ? (
            <EmptyState
              description={
                items.length === 0
                  ? t('samples.list.empty')
                  : t('samples.list.noMatches')
              }
            />
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('samples.list.columns.code')}</TableHead>
                    <TableHead>{t('samples.list.columns.run')}</TableHead>
                    <TableHead>{t('samples.list.columns.material')}</TableHead>
                    <TableHead>{t('samples.list.columns.role')}</TableHead>
                    <TableHead>{t('samples.list.columns.updatedAt')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((sample) => (
                    <TableRow key={sample.id}>
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
                        {sample.run_code ? (
                          <Link
                            to="/experiments/$runId/edit"
                            params={{ runId: sample.experiment_run_id }}
                            className="tabular-nums text-primary hover:underline"
                          >
                            {sample.run_code}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {sample.material_system || (
                          <span className="text-muted-foreground text-sm">
                            {t('samples.common.notProvided')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {t(
                            `experimentsV2.sections.results.roles.${sample.role}`,
                            { defaultValue: sample.role },
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums text-sm text-muted-foreground">
                        {dayjs(sample.updated_at).format('YYYY-MM-DD HH:mm')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
