import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import {
  getMeasurement,
  invalidateMeasurement,
} from '@/features/experiments-v2/api'
import type { MeasurementDetail } from '@/features/experiments-v2/api'
import { downloadExperimentFile } from '@/features/samples/api'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { formatFileSize } from '@/shared/file-assets'
import { isEnglish, localizedOption, localizedUnit } from '@/shared/field-i18n'
import {
  characterizationProfiles,
  characterizationProperties,
} from '@/shared/generated/field-metadata'
import { RequiredMark } from '@/shared/ui/required-mark'
import { triggerBlobDownload } from '@/shared/lib/download'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

function StructuredMeasurementValue({
  code,
  value,
  files,
}: {
  code: string
  value: Record<string, unknown>
  files: MeasurementDetail['raw_files']
}) {
  const { t } = useTranslation()
  const tr = (key: string) =>
    t(`characterizations.workspace.peaks.${key}`, { defaultValue: key })
  if (code === 'elemental_composition') {
    const components = Array.isArray(value.components)
      ? (value.components as { species: string; fraction: number }[])
      : []
    return (
      <div className="flex flex-col gap-1">
        <span>
          {t(
            `characterizations.workspace.advanced.compositionBasisValues.${String(value.basis)}`,
            { defaultValue: String(value.basis) },
          )}
        </span>
        <span>
          {components
            .map((item) => `${item.species}: ${item.fraction}`)
            .join(' · ')}
        </span>
      </div>
    )
  }
  const peaks = Array.isArray(value.peaks)
    ? (value.peaks as Record<string, number>[])
    : []
  const source = files.find((file) => file.id === value.source_file_id)
  return (
    <div className="flex w-full flex-col gap-2">
      <span>{tr(String(value.status))}</span>
      {source ? (
        <span>
          {tr('source')}：{source.original_name}
        </span>
      ) : null}
      {peaks.map((peak, index) => (
        <div
          key={peak.id}
          className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border p-2"
        >
          <span>
            {tr('peak')} {index + 1}
          </span>
          {['position', 'fwhm', 'height', 'area', 'd_spacing_nm']
            .filter((key) => peak[key] != null)
            .map((key) => {
              const unit =
                key === 'd_spacing_nm'
                  ? 'nm'
                  : key === 'height'
                    ? value.intensity_unit
                    : key === 'area'
                      ? `${value.intensity_unit} · ${value.position_unit}`
                      : value.position_unit
              return (
                <span key={key}>
                  {tr(key)}：{peak[key]} {String(unit)}
                </span>
              )
            })}
        </div>
      ))}
      {value.extraction_method ? (
        <span>
          {tr('extractionMethod')}：{String(value.extraction_method)}
        </span>
      ) : null}
      {value.baseline_method ? (
        <span>
          {tr('baselineMethod')}：{String(value.baseline_method)}
        </span>
      ) : null}
    </div>
  )
}

function readableValue(value: unknown, language: string): string {
  if (value == null || value === '') return '—'
  if (typeof value !== 'object') {
    return localizedOption(String(value), language)
  }
  if (Array.isArray(value)) {
    return (
      value
        .map((item) => readableValue(item, language))
        .join(isEnglish(language) ? ', ' : '、') || '—'
    )
  }
  const colon = isEnglish(language) ? ': ' : '：'
  return Object.entries(value)
    .map(([key, item]) => `${key}${colon}${readableValue(item, language)}`)
    .join(isEnglish(language) ? '; ' : '；')
}

function translatedKey(
  t: TFunction,
  namespace: 'regionFields' | 'assertionFields' | 'analysisParameterFields',
  key: string,
) {
  return t(`characterizations.details.${namespace}.${key}`, {
    defaultValue: key,
  })
}

function translatedCode(
  t: TFunction,
  namespace: 'regionValues' | 'assertionValues',
  value: unknown,
  language: string,
) {
  if (typeof value !== 'string') return readableValue(value, language)
  return t(`characterizations.details.${namespace}.${value}`, {
    defaultValue: localizedOption(value, language),
  })
}

function conditionValue(
  field: (typeof characterizationProfiles)[string]['condition_fields'][number],
  value: unknown,
  language: string,
) {
  let rendered: string
  if (
    field.components &&
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    const colon = isEnglish(language) ? ': ' : '：'
    rendered = Object.entries(value)
      .map(([key, item]) => {
        const component = field.components?.find((entry) => entry.key === key)
        const label = component
          ? isEnglish(language)
            ? component.label_en
            : component.label_zh
          : key
        return `${label}${colon}${readableValue(item, language)}`
      })
      .join(isEnglish(language) ? '; ' : '；')
  } else if (typeof value === 'string' && field.options) {
    const option = field.options.find((item) => item.value === value)
    rendered = option
      ? isEnglish(language)
        ? option.label_en
        : option.label_zh
      : value
  } else {
    rendered = readableValue(value, language)
  }
  const unit = localizedUnit(field.unit ?? null, language)
  return unit ? `${rendered} ${unit}` : rendered
}

type DetailFile = MeasurementDetail['raw_files'][number]

function analysisPerformer(
  analysis: MeasurementDetail['analyses'][number],
): string | null {
  const name =
    'performed_by_name' in analysis ? analysis.performed_by_name : null
  if (typeof name === 'string' && name) return name
  const value = 'performed_by_id' in analysis ? analysis.performed_by_id : null
  return typeof value === 'string' ? value : null
}

function qualityVariant(
  quality: string,
): 'destructive' | 'secondary' | 'outline' {
  return quality === 'invalid'
    ? 'destructive'
    : quality === 'valid'
      ? 'secondary'
      : 'outline'
}

export function MeasurementDetails({
  measurementId,
  token,
  allowInvalidate = true,
  onInvalidated,
}: {
  measurementId: string
  token: string
  allowInvalidate?: boolean
  onInvalidated?: () => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [invalidateOpen, setInvalidateOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(
    null,
  )
  const detail = useQuery({
    queryKey: ['measurement-detail', measurementId],
    queryFn: () => getMeasurement(measurementId, token),
  })
  const invalidation = useMutation({
    mutationFn: () => invalidateMeasurement(measurementId, reason, token),
    onSuccess: async () => {
      setInvalidateOpen(false)
      setReason('')
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['measurement-detail', measurementId],
        }),
        queryClient.invalidateQueries({ queryKey: ['measurements'] }),
        queryClient.invalidateQueries({ queryKey: ['characterizations'] }),
        queryClient.invalidateQueries({ queryKey: ['samples'] }),
      ])
      onInvalidated?.()
      toast.success(t('characterizations.details.invalidateSuccess'))
    },
    onError: (error) =>
      toast.error(
        resolveErrorMessage(
          error,
          t('characterizations.details.invalidateError'),
        ),
      ),
  })
  const download = async (fileId: string, filename: string) => {
    setDownloadingFileId(fileId)
    try {
      const response = await downloadExperimentFile(token, fileId)
      triggerBlobDownload(response.blob, response.filename ?? filename)
    } catch (error) {
      toast.error(
        resolveErrorMessage(
          error,
          t('characterizations.details.downloadError'),
        ),
      )
    } finally {
      setDownloadingFileId(null)
    }
  }

  if (detail.isLoading) {
    return <Skeleton className="h-40 w-full rounded-lg" />
  }
  if (detail.isError || !detail.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>
            {resolveErrorMessage(
              detail.error,
              t('characterizations.details.loadError'),
            )}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={detail.isFetching}
            onClick={() => void detail.refetch()}
          >
            {t('characterizations.details.retry')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const measurement = detail.data
  const english = isEnglish(i18n.language)
  const instrument = measurement.instrument_snapshot_json
  const instrumentVersion =
    instrument?.instrument_version ?? instrument?.version
  const instrumentLabel = instrument
    ? [
        instrument.name_type_snapshot ?? instrument.name_type,
        instrument.instrument_code_snapshot ?? instrument.instrument_code,
        instrumentVersion == null ? null : `v${String(instrumentVersion)}`,
      ]
        .filter((value) => value != null && value !== '')
        .join(' · ') || t('characterizations.details.snapshotRecorded')
    : t('characterizations.details.noInstrument')
  const qualityLabel =
    measurement.quality_flag === 'valid'
      ? t('characterizations.details.quality.valid')
      : measurement.quality_flag === 'suspect'
        ? t('characterizations.details.quality.suspect')
        : measurement.quality_flag === 'invalid'
          ? t('characterizations.details.quality.invalid')
          : measurement.quality_flag
  const profile = characterizationProfiles[measurement.method_profile]
  const conditionFields = new Map(
    (profile?.condition_fields ?? []).map((field) => [field.key, field]),
  )
  const analysisLabels = new Map(
    measurement.analyses.map((analysis) => [
      analysis.id,
      `${analysis.software_name} ${analysis.software_version}`.trim(),
    ]),
  )
  const analysisReference = (id: string | null) =>
    id ? [analysisLabels.get(id), id].filter(Boolean).join(' · ') : null
  const colon = english ? ': ' : '：'
  const renderAnalysisFiles = (files: DetailFile[]) =>
    files.length ? (
      <ul className="flex flex-col gap-2">
        {files.map((file) => {
          const filename = file.original_name
          return (
            <li
              key={file.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
            >
              <span className="min-w-0 break-all text-xs">
                <span className="block truncate font-medium">{filename}</span>
                <span className="text-muted-foreground">
                  {file.content_type ??
                    t('characterizations.details.unknownContentType')}{' '}
                  · {formatFileSize(file.size_bytes)} · SHA-256 {file.sha256}
                </span>
                {file.deleted_at ? (
                  <Badge variant="outline" className="ml-2">
                    {t('characterizations.details.deletedFile')}
                  </Badge>
                ) : null}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={t('characterizations.details.downloadFile', {
                  filename,
                })}
                disabled={
                  Boolean(file.deleted_at) || downloadingFileId !== null
                }
                onClick={() => void download(file.id, filename)}
              >
                <Download data-icon="inline-start" />
                {file.deleted_at
                  ? t('characterizations.details.deletedFile')
                  : downloadingFileId === file.id
                    ? t('characterizations.details.downloading')
                    : t('characterizations.details.download')}
              </Button>
            </li>
          )
        })}
      </ul>
    ) : (
      <p className="text-xs text-muted-foreground">
        {t('characterizations.details.noAnalysisFiles')}
      </p>
    )

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-muted/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium">{t('characterizations.details.title')}</h4>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {t('characterizations.details.revision', {
              version: measurement.revision_number,
            })}
          </Badge>
          {measurement.quality_flag !== 'valid' ? (
            <Badge
              variant={
                measurement.quality_flag === 'invalid'
                  ? 'destructive'
                  : measurement.quality_flag === 'suspect'
                    ? 'outline'
                    : 'secondary'
              }
            >
              {qualityLabel}
            </Badge>
          ) : null}
        </div>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">
            {t('characterizations.details.method')}
          </dt>
          <dd className="font-medium">
            {(i18n.language.startsWith('en')
              ? characterizationProfiles[measurement.method_profile]?.label_en
              : characterizationProfiles[measurement.method_profile]
                  ?.label_zh) ?? measurement.method_profile}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t('characterizations.details.instrument')}
          </dt>
          <dd className="font-medium">{instrumentLabel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t('characterizations.details.measurementPerformedBy')}
          </dt>
          <dd className="font-medium">
            {measurement.performed_by_name ?? measurement.performed_by_id}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t('characterizations.details.conditions')}
          </dt>
          <dd className="flex flex-col gap-1">
            {Object.entries(measurement.typed_conditions).length ? (
              Object.entries(measurement.typed_conditions).map(
                ([key, value]) => {
                  const field = conditionFields.get(key)
                  const label = field
                    ? isEnglish(i18n.language)
                      ? field.label_en
                      : field.label_zh
                    : key
                  return (
                    <span key={key}>
                      <span className="font-medium">{label}</span>
                      {colon}
                      {field
                        ? conditionValue(field, value, i18n.language)
                        : readableValue(value, i18n.language)}
                    </span>
                  )
                },
              )
            ) : (
              <span>—</span>
            )}
          </dd>
        </div>
        {Object.keys(measurement.sample_region).length ? (
          <div>
            <dt className="text-muted-foreground">
              {t('characterizations.details.region')}
            </dt>
            <dd className="flex flex-col gap-1">
              {Object.entries(measurement.sample_region).map(([key, value]) => (
                <span key={key}>
                  <span className="font-medium">
                    {translatedKey(t, 'regionFields', key)}
                  </span>
                  {colon}
                  {key === 'geometry_type' || key === 'coordinate_system'
                    ? translatedCode(t, 'regionValues', value, i18n.language)
                    : readableValue(value, i18n.language)}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>

      {measurement.quality_note ? (
        <p className="rounded-md border px-3 py-2 text-sm">
          <span className="font-medium">
            {t('characterizations.details.qualityNoteLabel')}
            {colon}
          </span>
          {measurement.quality_note}
        </p>
      ) : null}

      <section className="flex flex-col gap-2">
        <h5 className="text-sm font-medium">
          {t('characterizations.details.results')}
        </h5>
        {measurement.properties.length || measurement.assertions.length ? (
          <ul className="flex flex-col gap-1 text-sm">
            {measurement.properties.map((property) => {
              const value =
                property.numeric_value ??
                property.text_value ??
                property.structured_value
              const propertyQuality = t(
                `characterizations.details.propertyQuality.${property.quality_flag}`,
                { defaultValue: property.quality_flag },
              )
              const renderedValue = `${readableValue(value, i18n.language)}${property.unit ? ` ${localizedUnit(property.unit, i18n.language)}` : ''}`
              const analysisLabel = analysisReference(property.analysis_run_id)
              return (
                <li key={property.id} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {(i18n.language.startsWith('en')
                        ? characterizationProperties[property.property_code]
                            ?.label_en
                        : characterizationProperties[property.property_code]
                            ?.label_zh) ?? property.property_code}
                      {colon}
                    </span>
                    {property.structured_value &&
                    ['spectral_peaks', 'elemental_composition'].includes(
                      property.property_code,
                    ) ? (
                      <StructuredMeasurementValue
                        code={property.property_code}
                        value={property.structured_value}
                        files={measurement.raw_files}
                      />
                    ) : (
                      <span>
                        {property.quality_flag === 'below_detection_limit'
                          ? t('characterizations.details.belowDetectionValue', {
                              value: renderedValue,
                            })
                          : renderedValue}
                      </span>
                    )}
                    {property.quality_flag !== 'valid' ? (
                      <Badge variant={qualityVariant(property.quality_flag)}>
                        {propertyQuality}
                      </Badge>
                    ) : null}
                  </div>
                  {property.statistic != null ||
                  property.uncertainty_value != null ||
                  property.sample_count != null ||
                  property.quality_note != null ||
                  analysisLabel ? (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {property.statistic != null ? (
                        <span>
                          {t('characterizations.details.statistic', {
                            value: t(
                              `characterizations.workspace.statistics.${property.statistic}`,
                              { defaultValue: property.statistic },
                            ),
                          })}
                        </span>
                      ) : null}
                      {property.uncertainty_value != null ? (
                        <span>
                          {t('characterizations.details.uncertainty', {
                            value: `${property.uncertainty_value}${property.unit ? ` ${localizedUnit(property.unit, i18n.language)}` : ''}`,
                            type: property.uncertainty_type ?? '—',
                          })}
                        </span>
                      ) : null}
                      {property.sample_count != null ? (
                        <span>
                          {t('characterizations.details.sampleCount', {
                            count: property.sample_count,
                          })}
                        </span>
                      ) : null}
                      {property.quality_note ? (
                        <span>
                          {t(
                            property.quality_flag === 'below_detection_limit'
                              ? 'characterizations.details.detectionLimitBasis'
                              : 'characterizations.details.qualityNote',
                            { value: property.quality_note },
                          )}
                        </span>
                      ) : null}
                      {analysisLabel ? (
                        <span>
                          {t('characterizations.details.analysisRun', {
                            analysis: analysisLabel,
                          })}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
            {measurement.assertions.length ? (
              <li className="mt-3 font-medium">
                {t('characterizations.details.historicalAssignments')}
              </li>
            ) : null}
            {measurement.assertions.map((assertion) => {
              const analysisLabel = analysisReference(assertion.analysis_run_id)
              return (
                <li key={assertion.id} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      <span className="font-medium">
                        {t(
                          `characterizations.details.assertionTypes.${assertion.assertion_type}`,
                          { defaultValue: assertion.assertion_type },
                        )}
                      </span>
                      {colon}
                      {Object.entries(assertion.value)
                        .map(
                          ([key, value]) =>
                            `${translatedKey(t, 'assertionFields', key)}${colon}${translatedCode(t, 'assertionValues', value, i18n.language)}`,
                        )
                        .join(english ? '; ' : '；')}
                    </span>
                    <Badge variant="outline">
                      {t(
                        `characterizations.details.assertionValidity.${assertion.validity}`,
                        { defaultValue: assertion.validity },
                      )}
                    </Badge>
                  </div>
                  {assertion.confidence != null || analysisLabel ? (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {assertion.confidence != null ? (
                        <span>
                          {t('characterizations.details.confidence', {
                            value: assertion.confidence,
                          })}
                        </span>
                      ) : null}
                      {analysisLabel ? (
                        <span>
                          {t('characterizations.details.analysisRun', {
                            analysis: analysisLabel,
                          })}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('characterizations.details.noStructuredResults')}
          </p>
        )}
      </section>

      {measurement.region_image_file ? (
        <section className="flex flex-col gap-2">
          <h5 className="text-sm font-medium">
            {t('characterizations.details.regionImage')}
          </h5>
          {renderAnalysisFiles([measurement.region_image_file])}
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h5 className="text-sm font-medium">
          {t('characterizations.details.rawFiles')}
        </h5>
        {measurement.raw_files.length ? (
          <ul className="flex flex-col gap-2">
            {measurement.raw_files.map((file) => (
              <li
                key={file.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="min-w-0 break-all">
                  {file.original_name} ·{' '}
                  {file.content_type ??
                    t('characterizations.details.unknownContentType')}{' '}
                  · {formatFileSize(file.size_bytes)} · SHA-256 {file.sha256}
                  {file.deleted_at ? (
                    <Badge variant="outline" className="ml-2">
                      {t('characterizations.details.deletedFile')}
                    </Badge>
                  ) : null}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={t('characterizations.details.downloadFile', {
                    filename: file.original_name,
                  })}
                  disabled={
                    Boolean(file.deleted_at) || downloadingFileId !== null
                  }
                  onClick={() => void download(file.id, file.original_name)}
                >
                  <Download data-icon="inline-start" />
                  {file.deleted_at
                    ? t('characterizations.details.deletedFile')
                    : downloadingFileId === file.id
                      ? t('characterizations.details.downloading')
                      : t('characterizations.details.download')}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('characterizations.details.noFiles')}
          </p>
        )}
      </section>

      {measurement.analyses.length ? (
        <section className="flex flex-col gap-2">
          <h5 className="text-sm font-medium">
            {t('characterizations.details.analysis')}
          </h5>
          <ul className="flex flex-col gap-3 text-sm">
            {measurement.analyses.map((analysis) => (
              <li key={analysis.id} className="rounded-md border p-3">
                <p className="font-medium">
                  {analysis.software_name} {analysis.software_version}
                  {analysis.code_commit ? ` · ${analysis.code_commit}` : ''}
                </p>
                <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <div>
                    <dt className="inline font-medium">
                      {t('characterizations.details.analysisStartedAt')}
                    </dt>
                    <dd className="inline">
                      {colon}
                      <time dateTime={analysis.started_at}>
                        {new Date(analysis.started_at).toLocaleString(
                          i18n.language,
                        )}
                      </time>
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">
                      {t('characterizations.details.analysisCompletedAt')}
                    </dt>
                    <dd className="inline">
                      {colon}
                      {analysis.completed_at ? (
                        <time dateTime={analysis.completed_at}>
                          {new Date(analysis.completed_at).toLocaleString(
                            i18n.language,
                          )}
                        </time>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">
                      {t('characterizations.details.analysisPerformedBy')}
                    </dt>
                    <dd className="inline">
                      {colon}
                      {analysisPerformer(analysis) ?? '—'}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <h6 className="text-xs font-medium">
                      {t('characterizations.details.analysisParameters')}
                    </h6>
                    {Object.keys(analysis.parameters).length ? (
                      <dl className="mt-1 flex flex-col gap-1 text-xs">
                        {Object.entries(analysis.parameters).map(
                          ([key, value]) => (
                            <div key={key}>
                              <dt className="inline font-medium">
                                {translatedKey(
                                  t,
                                  'analysisParameterFields',
                                  key,
                                )}
                              </dt>
                              <dd className="inline">
                                {colon}
                                {readableValue(value, i18n.language)}
                              </dd>
                            </div>
                          ),
                        )}
                      </dl>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('characterizations.details.noAnalysisParameters')}
                      </p>
                    )}
                  </div>
                  <div>
                    <h6 className="text-xs font-medium">
                      {t('characterizations.details.analysisInputs')}
                    </h6>
                    <div className="mt-1">
                      {renderAnalysisFiles(analysis.input_files)}
                    </div>
                  </div>
                  <div>
                    <h6 className="text-xs font-medium">
                      {t('characterizations.details.analysisOutputs')}
                    </h6>
                    <div className="mt-1">
                      {renderAnalysisFiles(analysis.output_files)}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {measurement.quality_flag === 'invalid' ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col gap-2">
            <p>
              {t('characterizations.details.invalidationReason', {
                reason:
                  measurement.invalidation_reason ??
                  t('characterizations.details.noReason'),
              })}
            </p>
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <div>
                <dt className="inline font-medium">
                  {t('characterizations.details.invalidatedBy')}
                </dt>
                <dd className="inline">
                  {colon}
                  {measurement.invalidated_by_id ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium">
                  {t('characterizations.details.invalidatedAt')}
                </dt>
                <dd className="inline">
                  {colon}
                  {measurement.invalidated_at ? (
                    <time dateTime={measurement.invalidated_at}>
                      {new Date(measurement.invalidated_at).toLocaleString(
                        i18n.language,
                      )}
                    </time>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
          </AlertDescription>
        </Alert>
      ) : measurement.can_invalidate && allowInvalidate ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setInvalidateOpen(true)}
          >
            {t('characterizations.details.invalidateAction')}
          </Button>
        </div>
      ) : null}

      <AlertDialog
        open={invalidateOpen}
        onOpenChange={(open) => {
          if (!invalidation.isPending) setInvalidateOpen(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('characterizations.details.invalidateTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('characterizations.details.invalidateDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`measurement-${measurementId}-invalidate-reason`}>
              {t('characterizations.details.reason')}
              <RequiredMark />
            </Label>
            <Textarea
              id={`measurement-${measurementId}-invalidate-reason`}
              value={reason}
              maxLength={2000}
              disabled={invalidation.isPending}
              aria-invalid={!reason.trim() || undefined}
              aria-required
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={invalidation.isPending}>
              {t('characterizations.details.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!reason.trim() || invalidation.isPending}
              onClick={(event) => {
                event.preventDefault()
                invalidation.mutate()
              }}
            >
              {invalidation.isPending
                ? t('characterizations.details.invalidating')
                : t('characterizations.details.confirmInvalidate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
