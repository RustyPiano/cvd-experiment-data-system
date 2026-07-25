import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  listExperimentFiles,
} from './api'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { triggerBlobDownload } from '@/shared/lib/download'
import { PageHeader } from '@/shared/ui/page-header'
import { EmptyState } from '@/shared/ui/empty-state'
import { LoadingState } from '@/shared/ui/loading-state'
import { StatusTag } from '@/shared/ui/status-tag'
import type { FileAssetRead } from '@/shared/types/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
              label={t('samples.detail.materialSystem')}
              value={sample.material_system || '—'}
            />
          </dl>
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
