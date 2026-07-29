import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, Download } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { useAuth } from '@/features/auth/use-auth'
import { getModuleFields } from '@/features/experiments-v2/field-logic'
import {
  downloadExperimentFile,
  getExperiment,
  getSample,
  getSampleLineage,
  listExperimentFiles,
  listSamples,
} from './api'
import { createTransformation } from '@/features/experiments-v2/api'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { triggerBlobDownload } from '@/shared/lib/download'
import { PageHeader } from '@/shared/ui/page-header'
import { EmptyState } from '@/shared/ui/empty-state'
import { LoadingState } from '@/shared/ui/loading-state'
import { StatusTag } from '@/shared/ui/status-tag'
import type { FileAssetRead } from '@/shared/types/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  localizedNamedValue,
  localizedFieldLabel,
  isEnglish,
  localizedOption,
  localizedUnitLabel,
  localizedValue,
} from '@/shared/field-i18n'
import { entities } from '@/shared/generated/field-metadata'
import {
  buildStructuredValueLabels,
  buildTreatmentStepsEditorLabels,
} from '@/shared/structured-editor-labels'
import type { TFunction } from 'i18next'

const routeApi = getRouteApi('/_authed/samples/$sampleId')
const TRANSFORMATION_LABELS: Record<string, string> = {
  cut: '切割',
  split: '分片',
  transfer: '转移',
  stack: '堆叠',
  anneal: '退火',
  etch: '刻蚀',
  clean: '清洗',
  encapsulate: '封装',
  contact_fabrication: '电极制备',
}
const ACTUAL_STATE_LABELS: Record<string, string> = {
  unknown: '尚无实际结论',
  growth_present: '观察到生长',
  no_growth: '未观察到生长',
  uncertain: '结论不确定',
  asserted: '已确认材料结论',
}
const LIFECYCLE_STATE_LABELS: Record<string, string> = {
  active: '在用',
  consumed: '已消耗',
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KiB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB`
}

const STRUCTURED_SOURCE_FIELDS = new Set([
  'surface_roughness',
  'size_placement',
  'zone_thermocouple_distance_mm',
])

const TREATMENT_PARAMETER_KEYS = [
  'temperature_C',
  'duration_min',
  'duration_s',
  'speed_rpm',
  'atmosphere',
  'power_W',
  'gas_species',
  'pressure_Pa',
  'method',
] as const

const TREATMENT_PARAMETER_UNITS: Partial<
  Record<(typeof TREATMENT_PARAMETER_KEYS)[number], string>
> = {
  temperature_C: '℃',
  duration_min: 'min',
  duration_s: 's',
  speed_rpm: 'rpm',
  power_W: 'W',
  pressure_Pa: 'Pa',
}

const MATERIAL_LOT_FIELDS = new Map(
  (entities.material_lot ?? []).map((field) => [field.key, field]),
)

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function hasDisplayValue(value: unknown): boolean {
  return value != null && value !== ''
}

function displayMaterialLotReference(
  value: unknown,
  language: string,
  t: TFunction,
): string {
  const reference = asRecord(value)
  const snapshot = asRecord(reference?.snapshot)
  if (!reference || !snapshot) return '—'
  const attrs = asRecord(snapshot.attrs) ?? {}
  const safeSnapshot = Object.fromEntries(
    [
      'substance_name',
      'chemical_formula',
      'supplier',
      'catalog_number',
      'batch_number',
    ]
      .map((key) => [key, snapshot[key] ?? attrs[key]])
      .filter(([, item]) => hasDisplayValue(item)),
  )
  const version = reference.version ?? snapshot.version
  if (hasDisplayValue(version)) {
    safeSnapshot.frozen_version = `v${String(version)}`
  }
  const labels = Object.fromEntries(
    [...MATERIAL_LOT_FIELDS.entries()].map(([key, field]) => [
      key,
      localizedFieldLabel(field, language),
    ]),
  )
  labels.frozen_version = t('samples.detail.frozenVersion')
  return localizedNamedValue(safeSnapshot, language, labels) || '—'
}

function displayTreatmentSteps(
  value: unknown,
  language: string,
  t: TFunction,
): string {
  if (!Array.isArray(value)) return '—'
  if (value.every((item) => !item || typeof item !== 'object')) {
    return localizedValue(value, language) || '—'
  }
  const labels = buildTreatmentStepsEditorLabels(t)
  const namedLabels: Record<string, string> = {
    type: labels.type,
    other_name: labels.otherName,
    parameters: t('samples.detail.parameters'),
    items: t('samples.detail.namedParameters'),
    name: labels.parameterName,
    value: labels.parameterValue,
    unit: labels.parameterUnit,
  }
  for (const key of TREATMENT_PARAMETER_KEYS) {
    const unit = TREATMENT_PARAMETER_UNITS[key]
    namedLabels[key] = `${labels.fields[key]}${
      unit
        ? `${isEnglish(language) ? ' ' : ''}${localizedUnitLabel(
            unit,
            language,
          )}`
        : ''
    }`
  }
  return localizedNamedValue(value, language, namedLabels) || '—'
}

function displayValue(
  fieldKey: string,
  value: unknown,
  language: string,
  t: TFunction,
): string {
  if (value == null || value === '') return '—'
  if (fieldKey === 'lot_ref') {
    return displayMaterialLotReference(value, language, t)
  }
  if (fieldKey === 'pretreatment_steps') {
    return displayTreatmentSteps(value, language, t)
  }
  if (STRUCTURED_SOURCE_FIELDS.has(fieldKey)) {
    return (
      localizedNamedValue(value, language, buildStructuredValueLabels(t)) || '—'
    )
  }
  if (Array.isArray(value)) return localizedValue(value, language)
  if (typeof value === 'object') {
    if ('value' in value || 'option' in value) {
      return localizedValue(value, language)
    }
    return '—'
  }
  return localizedValue(value, language)
}

export function SampleDetailPage() {
  const { t, i18n } = useTranslation()
  const { sampleId } = routeApi.useParams()
  const { session } = useAuth()
  const viewerKey = session.currentUser?.id ?? 'anonymous'
  const [downloadFileId, setDownloadFileId] = useState<string | null>(null)
  const [transformationType, setTransformationType] = useState('cut')
  const [outputCount, setOutputCount] = useState('2')
  const [carrier, setCarrier] = useState('')
  const [consumeInput, setConsumeInput] = useState(true)
  const [extraInputIds, setExtraInputIds] = useState<string[]>([])
  const [outputRunId, setOutputRunId] = useState('')
  const queryClient = useQueryClient()

  const sampleQuery = useQuery({
    queryKey: ['samples', 'detail', viewerKey, sampleId],
    queryFn: () => getSample(session.accessToken!, sampleId),
    enabled: session.isAuthenticated && Boolean(sampleId),
  })
  const experimentId = sampleQuery.data?.experiment_run_id ?? ''
  const parentSampleId = sampleQuery.data?.parent_sample_id ?? ''
  const parentSampleQuery = useQuery({
    queryKey: ['samples', 'parent', viewerKey, parentSampleId],
    queryFn: () => getSample(session.accessToken!, parentSampleId),
    enabled: session.isAuthenticated && Boolean(parentSampleId),
  })
  const experimentQuery = useQuery({
    queryKey: ['experiments', 'detail', viewerKey, experimentId],
    queryFn: () => getExperiment(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  })
  const filesQuery = useQuery({
    queryKey: ['samples', 'files', viewerKey, sampleId],
    queryFn: () =>
      listExperimentFiles(session.accessToken!, { experimentId, sampleId }),
    enabled:
      session.isAuthenticated && Boolean(experimentId) && Boolean(sampleId),
  })
  const lineageQuery = useQuery({
    queryKey: ['samples', 'lineage', viewerKey, sampleId],
    queryFn: () => getSampleLineage(session.accessToken!, sampleId),
    enabled: session.isAuthenticated && Boolean(sampleId),
  })
  const visibleSamplesQuery = useQuery({
    queryKey: ['samples', 'transformation-options', viewerKey],
    queryFn: () => listSamples(session.accessToken!),
    enabled: session.isAuthenticated,
  })
  const selectedInputIds = [sampleId, ...extraInputIds]
  const selectedSamples = (visibleSamplesQuery.data?.items ?? []).filter(
    (item) => selectedInputIds.includes(item.id),
  )
  const outputRuns = Array.from(
    new Map(
      selectedSamples.map((item) => [
        item.experiment_run_id,
        item.run_code ?? item.experiment_run_id,
      ]),
    ),
  )
  const transformationMutation = useMutation({
    mutationFn: () =>
      createTransformation(
        {
          transformation_type: transformationType,
          input_sample_ids: selectedInputIds,
          output_experiment_run_id: outputRunId || experimentId,
          outputs: Array.from(
            { length: Math.max(1, Number(outputCount)) },
            (_, index) => ({
              output_role: `part_${index + 1}`,
              current_carrier: carrier.trim() || null,
            }),
          ),
          occurred_at: new Date().toISOString(),
          parameters: {},
          consume_inputs: consumeInput,
        },
        session.accessToken!,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['samples', 'lineage', viewerKey, sampleId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['samples', 'detail', viewerKey, sampleId],
      })
      toast.success('样品转化已记录，输出样品已生成')
    },
    onError: (error) =>
      toast.error(resolveErrorMessage(error, '样品转化保存失败')),
  })

  const fileRows = useMemo(
    () => filesQuery.data?.items ?? [],
    [filesQuery.data?.items],
  )
  const substrateRows = useMemo(() => {
    const snapshot = sampleQuery.data?.source_substrate_snapshot_json
    if (!snapshot) return []
    return getModuleFields('substrates')
      .map((field) => ({
        key: field.key,
        label: localizedFieldLabel(field, i18n.language),
        value: snapshot[field.key],
      }))
      .filter(({ value }) => value != null && value !== '')
  }, [i18n.language, sampleQuery.data?.source_substrate_snapshot_json])

  const handleDownload = async (file: FileAssetRead) => {
    setDownloadFileId(file.id)
    try {
      const response = await downloadExperimentFile(
        session.accessToken!,
        file.id,
      )
      triggerBlobDownload(
        response.blob,
        response.filename || file.original_name,
      )
    } catch (error) {
      toast.error(resolveErrorMessage(error, t('samples.detail.downloadError')))
    } finally {
      setDownloadFileId(null)
    }
  }

  if (sampleQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('samples.detail.title')} />
        <LoadingState />
      </div>
    )
  }
  if (sampleQuery.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t('samples.detail.title')}
          subtitle={t('samples.detail.loadErrorSubtitle')}
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link to="/samples">
                <ArrowLeft />
                {t('samples.actions.backToList')}
              </Link>
            </Button>
          }
        />
        <Alert variant="destructive">
          <AlertDescription>
            {resolveErrorMessage(
              sampleQuery.error,
              t('samples.detail.loadError'),
            )}
          </AlertDescription>
        </Alert>
      </div>
    )
  }
  if (!sampleQuery.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('samples.detail.unavailable')}</AlertDescription>
      </Alert>
    )
  }

  const sample = sampleQuery.data

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('samples.detail.titleWithCode', { code: sample.sample_code })}
        subtitle={t('samples.detail.subtitle')}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link
              to="/experiments/$runId/edit"
              params={{ runId: sample.experiment_run_id }}
            >
              <ArrowLeft />
              {t('samples.actions.backToRun')}
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
              {sample.sample_code}
            </code>
            <Badge className="border-transparent bg-primary-soft text-accent-foreground">
              {t(`experimentsV2.sections.results.roles.${sample.role}`, {
                defaultValue: sample.role,
              })}
            </Badge>
            {experimentQuery.data ? (
              <StatusTag status={experimentQuery.data.status} />
            ) : null}
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <DetailRow
              label={t('samples.detail.runCodeLabel')}
              value={
                experimentQuery.data?.run_code ??
                sample.run_code ??
                t('samples.detail.runUnavailable')
              }
            />
            <DetailRow
              label="目标材料（研究意图）"
              value={sample.target_material_system || '—'}
            />
            <DetailRow
              label="实际材料状态"
              value={
                sample.actual_material_summary
                  ? `${ACTUAL_STATE_LABELS[sample.actual_state] ?? sample.actual_state} · ${sample.actual_material_summary}`
                  : (ACTUAL_STATE_LABELS[sample.actual_state] ??
                    sample.actual_state)
              }
            />
            <DetailRow
              label="绑定炉次修订"
              value={sample.run_revision_id || '—'}
            />
            <DetailRow
              label="样品生命周期"
              value={
                LIFECYCLE_STATE_LABELS[sample.lifecycle_state] ??
                sample.lifecycle_state
              }
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>样品转化图</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {(lineageQuery.data?.samples ?? []).map((item) => (
              <Link
                key={item.id}
                to="/samples/$sampleId"
                params={{ sampleId: item.id }}
                className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
              >
                <span className="font-medium">{item.sample_code}</span>
                <span className="ml-2 text-muted-foreground">
                  {LIFECYCLE_STATE_LABELS[item.lifecycle_state] ??
                    item.lifecycle_state}{' '}
                  ·{' '}
                  {ACTUAL_STATE_LABELS[item.actual_state] ?? item.actual_state}
                </span>
              </Link>
            ))}
          </div>
          {(lineageQuery.data?.transformations ?? []).map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-dashed p-3 text-sm"
            >
              <span className="font-medium">
                {TRANSFORMATION_LABELS[item.transformation_type] ??
                  item.transformation_type}
              </span>
              <span className="mx-2 text-muted-foreground">·</span>
              {item.input_sample_ids.length} 输入 →{' '}
              {item.output_sample_ids.length} 输出
              <span className="ml-2 text-muted-foreground">
                {dayjs(item.occurred_at).format('YYYY-MM-DD HH:mm')}
              </span>
            </div>
          ))}
          {sample.lifecycle_state === 'active' &&
          experimentQuery.data?.status !== 'invalid' ? (
            <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-4">
              <div className="grid gap-2">
                <Label>转化类型</Label>
                <Select
                  value={transformationType}
                  onValueChange={setTransformationType}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      'cut',
                      'split',
                      'transfer',
                      'stack',
                      'anneal',
                      'etch',
                      'clean',
                      'encapsulate',
                      'contact_fabrication',
                    ].map((value) => (
                      <SelectItem key={value} value={value}>
                        {TRANSFORMATION_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>输出样品数</Label>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={outputCount}
                  onChange={(event) => setOutputCount(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>输出载体/存放位置</Label>
                <Input
                  value={carrier}
                  onChange={(event) => setCarrier(event.target.value)}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label>输入样品（当前样品固定，可追加其他炉次样品）</Label>
                <div className="grid max-h-40 gap-2 overflow-auto rounded-md border p-3 sm:grid-cols-2">
                  {(visibleSamplesQuery.data?.items ?? [])
                    .filter(
                      (item) =>
                        item.id !== sampleId &&
                        item.lifecycle_state === 'active',
                    )
                    .map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={extraInputIds.includes(item.id)}
                          onChange={(event) =>
                            setExtraInputIds((current) =>
                              event.target.checked
                                ? [...current, item.id]
                                : current.filter((id) => id !== item.id),
                            )
                          }
                        />
                        {item.sample_code} · {item.run_code}
                      </label>
                    ))}
                </div>
              </div>
              <div className="grid gap-2">
                <Label>输出样品归属炉次</Label>
                <Select
                  value={outputRunId || experimentId}
                  onValueChange={setOutputRunId}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {outputRuns.map(([runId, runLabel]) => (
                      <SelectItem key={runId} value={runId}>
                        {runLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col justify-end gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={consumeInput}
                    onChange={(event) => setConsumeInput(event.target.checked)}
                  />
                  输入样品在转化后被消耗
                </label>
                <Button
                  type="button"
                  disabled={
                    transformationMutation.isPending ||
                    Number(outputCount) < 1 ||
                    selectedInputIds.length < 1
                  }
                  onClick={() => transformationMutation.mutate()}
                >
                  创建样品转化
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('samples.detail.sourceAndLineage')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {sample.parent_sample_id ? (
            <div>
              <p className="text-xs text-muted-foreground">
                {t('samples.detail.parentSampleLabel')}
              </p>
              <Button variant="link" className="h-auto p-0" asChild>
                <Link
                  to="/samples/$sampleId"
                  params={{ sampleId: sample.parent_sample_id }}
                >
                  {parentSampleQuery.data?.sample_code ??
                    t('samples.detail.parentSampleUnavailable')}
                </Link>
              </Button>
            </div>
          ) : null}
          {substrateRows.length > 0 ? (
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {substrateRows.map((row) => (
                <DetailRow
                  key={row.key}
                  label={row.label}
                  value={displayValue(row.key, row.value, i18n.language, t)}
                />
              ))}
            </dl>
          ) : sample.parent_sample_id ? null : (
            <p className="text-sm text-muted-foreground">
              {t('samples.detail.noRecordedSource')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('samples.detail.files.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {filesQuery.isLoading ? (
            <LoadingState />
          ) : filesQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {resolveErrorMessage(
                  filesQuery.error,
                  t('samples.detail.files.loadError'),
                )}
              </AlertDescription>
            </Alert>
          ) : fileRows.length === 0 ? (
            <EmptyState description={t('samples.detail.files.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('samples.detail.files.name')}</TableHead>
                    <TableHead>{t('samples.detail.files.method')}</TableHead>
                    <TableHead>{t('samples.detail.files.category')}</TableHead>
                    <TableHead>{t('samples.detail.files.size')}</TableHead>
                    <TableHead>
                      {t('samples.detail.files.uploadedAt')}
                    </TableHead>
                    <TableHead>{t('samples.detail.files.note')}</TableHead>
                    <TableHead>{t('samples.detail.files.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fileRows.map((file) => (
                    <TableRow key={file.id}>
                      <TableCell className="font-medium">
                        {file.original_name}
                      </TableCell>
                      <TableCell>
                        {file.method
                          ? localizedOption(file.method, i18n.language)
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {file.file_category === 'raw'
                          ? t('samples.detail.files.categories.raw')
                          : file.file_category === 'processed'
                            ? t('samples.detail.files.categories.processed')
                            : file.file_category}
                      </TableCell>
                      <TableCell>{formatBytes(file.size_bytes)}</TableCell>
                      <TableCell>
                        {dayjs(file.created_at).format('YYYY-MM-DD HH:mm')}
                      </TableCell>
                      <TableCell>
                        {file.note || t('samples.common.none')}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={downloadFileId === file.id}
                          onClick={() => void handleDownload(file)}
                          aria-label={t('samples.detail.files.downloadLabel', {
                            filename: file.original_name,
                          })}
                        >
                          <Download />
                          {downloadFileId === file.id
                            ? t('samples.detail.files.downloading')
                            : t('samples.detail.files.download')}
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm text-foreground [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  )
}
