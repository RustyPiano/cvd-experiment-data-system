import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { getExperiment, getSample } from './api'
import { MeasurementDetails } from '@/features/characterizations/measurement-details'
import { listAllMeasurements } from '@/features/experiments-v2/api'
import { useAuth } from '@/features/auth/use-auth'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { localizedOption, localizedValue } from '@/shared/field-i18n'
import { characterizationProfiles } from '@/shared/generated/field-metadata'
import { EmptyState } from '@/shared/ui/empty-state'
import { LoadingState } from '@/shared/ui/loading-state'
import { PageHeader } from '@/shared/ui/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const routeApi = getRouteApi('/_authed/samples/$sampleId')
const actualStateLabels: Record<string, string> = {
  unknown: '尚无结论',
  growth_present: '观察到生长',
  no_growth: '未观察到生长',
  uncertain: '结论不确定',
  asserted: '已有材料结论',
}
const faceLabels: Record<string, string> = {
  face_up: '朝上',
  face_down: '朝下',
  face_to_face: '面对另一片衬底',
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function pretreatmentSummary(value: unknown, language: string) {
  if (!Array.isArray(value)) return localizedValue(value, language)
  return value
    .map((step) => {
      const record = asRecord(step)
      return record?.other_name
        ? String(record.other_name)
        : record?.type
          ? localizedOption(String(record.type), language)
          : ''
    })
    .filter(Boolean)
    .join('；')
}

function substrateRows(
  substrate: Record<string, unknown> | null,
  language: string,
) {
  if (!substrate) return []
  const size = asRecord(substrate.size_placement)
  const zonePosition = asRecord(substrate.zone_thermocouple_distance_mm)
  const lot = asRecord(substrate.lot_ref)
  const snapshot = asRecord(lot?.snapshot)
  const attrs = asRecord(snapshot?.attrs)
  const dimensions = size
    ? [size.length_mm, size.width_mm, size.thickness_mm]
        .filter((value) => value != null && value !== '')
        .join(' × ')
    : ''
  return [
    [
      '材料',
      substrate.material
        ? localizedOption(String(substrate.material), language)
        : '—',
    ],
    ['批次', snapshot?.batch_number ?? attrs?.batch_number ?? '—'],
    ['尺寸', dimensions ? `${dimensions} mm` : '—'],
    [
      '所在温区与位置',
      zonePosition?.zone_index != null && zonePosition.distance_mm != null
        ? `温区 ${String(zonePosition.zone_index)}；相对热电偶 ${Number(zonePosition.distance_mm) > 0 ? '+' : ''}${String(zonePosition.distance_mm)} mm`
        : substrate.axial_position_mm != null
          ? `旧装置原点 ${String(substrate.axial_position_mm)} mm`
          : '—',
    ],
    [
      '放置方式',
      (() => {
        const face = String(substrate.face_orientation ?? size?.placement ?? '')
        return face
          ? (faceLabels[face] ?? localizedOption(face, language))
          : '—'
      })(),
    ],
    [
      '预处理',
      pretreatmentSummary(substrate.pretreatment_steps, language) || '—',
    ],
  ]
}

export function SampleDetailPage() {
  const { i18n } = useTranslation()
  const { sampleId } = routeApi.useParams()
  const { session } = useAuth()
  const viewerKey = session.currentUser?.id ?? 'anonymous'
  const [detailId, setDetailId] = useState<string | null>(null)
  const sampleQuery = useQuery({
    queryKey: ['samples', 'detail', viewerKey, sampleId],
    queryFn: () => getSample(session.accessToken!, sampleId),
    enabled: session.isAuthenticated && Boolean(sampleId),
  })
  const experimentId = sampleQuery.data?.experiment_run_id ?? ''
  const experimentQuery = useQuery({
    queryKey: ['experiments', 'detail', viewerKey, experimentId],
    queryFn: () => getExperiment(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  })
  const measurementsQuery = useQuery({
    queryKey: ['measurements', 'sample', viewerKey, sampleId],
    queryFn: () =>
      listAllMeasurements(session.accessToken!, {
        sampleId,
        includeHistory: true,
      }),
    enabled: session.isAuthenticated && Boolean(sampleId),
  })

  if (sampleQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="样品详情" />
        <LoadingState />
      </div>
    )
  }
  if (sampleQuery.isError || !sampleQuery.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="样品详情"
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link to="/samples">
                <ArrowLeft />
                返回样品列表
              </Link>
            </Button>
          }
        />
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>
              {resolveErrorMessage(sampleQuery.error, '样品加载失败')}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={sampleQuery.isFetching}
              onClick={() => void sampleQuery.refetch()}
            >
              重试
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const sample = sampleQuery.data
  const rows = substrateRows(
    sample.source_substrate_snapshot_json,
    i18n.language,
  )
  const measurements = measurementsQuery.data?.items ?? []
  const note =
    typeof sample.source_substrate_snapshot_json?.note === 'string'
      ? sample.source_substrate_snapshot_json.note
      : typeof sample.metadata_json.note === 'string'
        ? sample.metadata_json.note
        : ''

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={sample.sample_code}
        subtitle="样品信息与已有表征结论"
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/samples">
                <ArrowLeft />
                返回样品列表
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link
                to="/characterizations"
                search={{
                  runId: sample.experiment_run_id,
                  sampleId: sample.id,
                }}
              >
                补录或查看表征
                <ArrowRight />
              </Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailRow label="样品编号" value={sample.sample_code} />
            <DetailRow
              label="来源实验"
              value={experimentQuery.data?.run_code ?? sample.run_code ?? '—'}
            />
            <DetailRow
              label="目标材料"
              value={sample.target_material_system || '—'}
            />
            <DetailRow
              label="生长状态"
              value={
                actualStateLabels[sample.actual_state] ?? sample.actual_state
              }
            />
            <DetailRow
              label="材料结论"
              value={sample.actual_material_summary || '尚无材料结论'}
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>对应衬底</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length ? (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map(([label, value]) => (
                <DetailRow
                  key={String(label)}
                  label={String(label)}
                  value={String(value)}
                />
              ))}
            </dl>
          ) : (
            <EmptyState description="该样品没有衬底记录。" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>已有表征记录</CardTitle>
        </CardHeader>
        <CardContent>
          {measurementsQuery.isLoading ? (
            <LoadingState />
          ) : measurementsQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>
                  {resolveErrorMessage(
                    measurementsQuery.error,
                    '表征记录加载失败',
                  )}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={measurementsQuery.isFetching}
                  onClick={() => void measurementsQuery.refetch()}
                >
                  重试
                </Button>
              </AlertDescription>
            </Alert>
          ) : measurements.length === 0 ? (
            <EmptyState description="暂时还没有表征记录。" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>方法</TableHead>
                    <TableHead>炉次修订</TableHead>
                    <TableHead>测量时间</TableHead>
                    <TableHead>质量</TableHead>
                    <TableHead>原始文件</TableHead>
                    <TableHead>结果</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {measurements.map((measurement) => {
                    const isCurrentRevision =
                      measurement.run_revision_id ===
                      experimentQuery.data?.current_revision_id
                    return (
                      <TableRow key={measurement.id}>
                        <TableCell>
                          <Badge variant="outline">
                            {characterizationProfiles[
                              measurement.method_profile
                            ]?.label_zh ?? measurement.method_profile}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              isCurrentRevision ? 'secondary' : 'outline'
                            }
                          >
                            {isCurrentRevision ? '当前修订' : '历史修订'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {dayjs(measurement.measured_at).format(
                            'YYYY-MM-DD HH:mm',
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              measurement.quality_flag === 'invalid'
                                ? 'destructive'
                                : 'outline'
                            }
                          >
                            {{
                              valid: '有效',
                              suspect: '可疑',
                              invalid: '已失效',
                            }[measurement.quality_flag] ?? '有效'}
                          </Badge>
                        </TableCell>
                        <TableCell>{measurement.raw_file_count}</TableCell>
                        <TableCell>
                          {measurement.property_count +
                            measurement.assertion_count}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-expanded={detailId === measurement.id}
                            aria-controls={`sample-measurement-details-${measurement.id}`}
                            onClick={() =>
                              setDetailId((current) =>
                                current === measurement.id
                                  ? null
                                  : measurement.id,
                              )
                            }
                          >
                            {detailId === measurement.id
                              ? '收起详情'
                              : '查看详情'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {detailId ? (
                <div
                  id={`sample-measurement-details-${detailId}`}
                  role="region"
                  aria-label="表征记录详情"
                  className="mt-4"
                >
                  <MeasurementDetails
                    measurementId={detailId}
                    token={session.accessToken!}
                  />
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>备注</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {note || '暂无备注'}
        </CardContent>
      </Card>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  )
}
