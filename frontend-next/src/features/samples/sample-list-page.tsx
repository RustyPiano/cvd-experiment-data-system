import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { listSamples } from './api'
import { useAuth } from '@/features/auth/use-auth'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { localizedOption } from '@/shared/field-i18n'
import { EmptyState } from '@/shared/ui/empty-state'
import { PageHeader } from '@/shared/ui/page-header'
import type { SampleRead } from '@/shared/types/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

const actualStateLabels: Record<string, string> = {
  unknown: '尚无结论',
  growth_present: '观察到生长',
  no_growth: '未观察到生长',
  uncertain: '结论不确定',
  asserted: '已有材料结论',
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function substrateSummary(sample: SampleRead, language: string) {
  const substrate = sample.source_substrate_snapshot_json
  if (!substrate) return '—'
  const lot = asRecord(substrate.lot_ref)
  const snapshot = asRecord(lot?.snapshot)
  const attrs = asRecord(snapshot?.attrs)
  const material = substrate.material
    ? localizedOption(String(substrate.material), language)
    : '衬底'
  const batch = snapshot?.batch_number ?? attrs?.batch_number
  return [material, batch].filter(Boolean).join(' · ')
}

export function SampleListPage() {
  const { t, i18n } = useTranslation()
  const { session } = useAuth()
  const [query, setQuery] = useState('')
  const samplesQuery = useQuery({
    queryKey: ['samples', 'list', session.currentUser?.id ?? 'anonymous'],
    queryFn: () => listSamples(session.accessToken!),
    enabled: session.isAuthenticated,
  })
  const items = samplesQuery.data?.items ?? []
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter((sample) =>
      [
        sample.sample_code,
        sample.run_code,
        sample.target_material_system,
        sample.actual_material_summary,
      ].some((value) =>
        String(value ?? '')
          .toLowerCase()
          .includes(needle),
      ),
    )
  }, [items, query])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('samples.list.title')}
        subtitle="查看已提交实验生成的样品及其表征结论。"
      />

      {samplesQuery.isError ? (
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
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Input
            autoComplete="off"
            placeholder="搜索样品编号、实验编号或材料"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full max-w-sm"
            aria-label="搜索样品"
          />

          {samplesQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : samplesQuery.isError ? null : filtered.length === 0 ? (
            <EmptyState
              description={
                items.length === 0
                  ? '提交一条制备实验记录后，系统会自动生成样品。'
                  : '没有匹配的样品。'
              }
            />
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>样品编号</TableHead>
                    <TableHead>来源实验</TableHead>
                    <TableHead>衬底</TableHead>
                    <TableHead>目标材料</TableHead>
                    <TableHead>实际结果</TableHead>
                    <TableHead>表征记录</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((sample) => (
                    <TableRow key={sample.id}>
                      <TableCell className="font-medium tabular-nums">
                        {sample.sample_code}
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
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {substrateSummary(sample, i18n.language)}
                      </TableCell>
                      <TableCell>
                        {sample.target_material_system || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              sample.actual_state === 'no_growth'
                                ? 'destructive'
                                : 'outline'
                            }
                          >
                            {actualStateLabels[sample.actual_state] ??
                              sample.actual_state}
                          </Badge>
                          {sample.actual_material_summary ? (
                            <span>{sample.actual_material_summary}</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {
                          (
                            sample as SampleRead & {
                              characterization_count: number
                            }
                          ).characterization_count
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" asChild>
                          <Link
                            to="/samples/$sampleId"
                            params={{ sampleId: sample.id }}
                          >
                            查看
                          </Link>
                        </Button>
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
