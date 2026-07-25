import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { resolveErrorMessage } from '@/shared/api/http-error'
import { useAuth } from '@/features/auth/use-auth'
import type { V2EntityRead } from '@/features/entity-library/api'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LoadingState } from '@/shared/ui/loading-state'
import {
  deleteExperimentFile,
  downloadExperimentFile,
  listExperimentFiles,
  uploadExperimentFile,
} from '@/features/samples/api'
import type { FileAssetRead } from '@/shared/types/api'
import { triggerBlobDownload } from '@/shared/lib/download'
import {
  canonicalOption,
  localizedFieldLabel,
  localizedOption,
  localizedUnit,
} from '@/shared/field-i18n'
import type {
  SampleCreate,
  SampleRead,
  V2ResultRead,
  V2ResultWrite,
} from '../api'
import {
  createResult,
  createSample,
  deleteResult,
  listResults,
  listSamples,
  updateResult,
} from '../api'
import { getModuleFields, parseEnumOptions } from '../field-logic'
import { FieldLabel } from './field-bits'
import { EntityReferenceSelect } from './entity-reference-select'
import { snapshotValue } from './reference-snapshot'
import { ModuleCard } from './module-card'
import { ExperimentAttachments } from './experiment-attachments'
import {
  decodeCustomMetricName,
  encodeCustomMetricName,
  methodSchema,
  metricDefinition,
  parseTestConditions,
  readableLegacyMetricCode,
  serializeTestConditions,
} from './result-method-schema'
import type {
  ConditionField,
  MethodSchema,
  NamedParameter,
  ResultFieldKey,
} from './result-method-schema'

const SAMPLE_ROLES: SampleCreate['role'][] = ['derived', 'control']
const CONDITION_LABEL_KEYS = {
  illumination_mode:
    'experimentsV2.sections.results.conditionFields.illumination_mode',
  objective_magnification_x:
    'experimentsV2.sections.results.conditionFields.objective_magnification_x',
  scale_calibration_um_per_px:
    'experimentsV2.sections.results.conditionFields.scale_calibration_um_per_px',
  accelerating_voltage_kv:
    'experimentsV2.sections.results.conditionFields.accelerating_voltage_kv',
  working_distance_mm:
    'experimentsV2.sections.results.conditionFields.working_distance_mm',
  detector: 'experimentsV2.sections.results.conditionFields.detector',
  magnification_x:
    'experimentsV2.sections.results.conditionFields.magnification_x',
  excitation_wavelength_nm:
    'experimentsV2.sections.results.conditionFields.excitation_wavelength_nm',
  laser_power_mw:
    'experimentsV2.sections.results.conditionFields.laser_power_mw',
  integration_time_s:
    'experimentsV2.sections.results.conditionFields.integration_time_s',
  accumulations: 'experimentsV2.sections.results.conditionFields.accumulations',
  low_wavenumber_cutoff_cm1:
    'experimentsV2.sections.results.conditionFields.low_wavenumber_cutoff_cm1',
  excitation_power_mw:
    'experimentsV2.sections.results.conditionFields.excitation_power_mw',
  measurement_temperature_k:
    'experimentsV2.sections.results.conditionFields.measurement_temperature_k',
  afm_mode: 'experimentsV2.sections.results.conditionFields.afm_mode',
  scan_size_um: 'experimentsV2.sections.results.conditionFields.scan_size_um',
  scan_rate_hz: 'experimentsV2.sections.results.conditionFields.scan_rate_hz',
  radiation_source:
    'experimentsV2.sections.results.conditionFields.radiation_source',
  scan_start_2theta_deg:
    'experimentsV2.sections.results.conditionFields.scan_start_2theta_deg',
  scan_end_2theta_deg:
    'experimentsV2.sections.results.conditionFields.scan_end_2theta_deg',
  step_size_2theta_deg:
    'experimentsV2.sections.results.conditionFields.step_size_2theta_deg',
  tem_mode: 'experimentsV2.sections.results.conditionFields.tem_mode',
  camera_length_mm:
    'experimentsV2.sections.results.conditionFields.camera_length_mm',
} as const
const CONDITION_OPTION_KEYS = {
  bright_field: 'experimentsV2.sections.results.conditionOptions.bright_field',
  dark_field: 'experimentsV2.sections.results.conditionOptions.dark_field',
  polarized_light:
    'experimentsV2.sections.results.conditionOptions.polarized_light',
  tapping: 'experimentsV2.sections.results.conditionOptions.tapping',
  contact: 'experimentsV2.sections.results.conditionOptions.contact',
  non_contact: 'experimentsV2.sections.results.conditionOptions.non_contact',
  TEM: 'experimentsV2.sections.results.conditionOptions.TEM',
  HRTEM: 'experimentsV2.sections.results.conditionOptions.HRTEM',
  STEM: 'experimentsV2.sections.results.conditionOptions.STEM',
  SAED: 'experimentsV2.sections.results.conditionOptions.SAED',
} as const
const METRIC_LABEL_KEYS = {
  raman_e2g_peak_position:
    'experimentsV2.sections.results.metrics.raman_e2g_peak_position',
  raman_a1g_peak_position:
    'experimentsV2.sections.results.metrics.raman_a1g_peak_position',
  raman_peak_separation:
    'experimentsV2.sections.results.metrics.raman_peak_separation',
  raman_peak_fwhm: 'experimentsV2.sections.results.metrics.raman_peak_fwhm',
  raman_intensity_ratio:
    'experimentsV2.sections.results.metrics.raman_intensity_ratio',
  shear_mode_peak_position:
    'experimentsV2.sections.results.metrics.shear_mode_peak_position',
  layer_breathing_mode_peak_position:
    'experimentsV2.sections.results.metrics.layer_breathing_mode_peak_position',
  low_frequency_peak_fwhm:
    'experimentsV2.sections.results.metrics.low_frequency_peak_fwhm',
  pl_a_exciton_peak_energy:
    'experimentsV2.sections.results.metrics.pl_a_exciton_peak_energy',
  pl_b_exciton_peak_energy:
    'experimentsV2.sections.results.metrics.pl_b_exciton_peak_energy',
  pl_peak_fwhm: 'experimentsV2.sections.results.metrics.pl_peak_fwhm',
  pl_integrated_intensity:
    'experimentsV2.sections.results.metrics.pl_integrated_intensity',
  afm_step_height: 'experimentsV2.sections.results.metrics.afm_step_height',
  afm_rms_roughness: 'experimentsV2.sections.results.metrics.afm_rms_roughness',
  afm_ra_roughness: 'experimentsV2.sections.results.metrics.afm_ra_roughness',
  xrd_peak_2theta: 'experimentsV2.sections.results.metrics.xrd_peak_2theta',
  xrd_peak_fwhm: 'experimentsV2.sections.results.metrics.xrd_peak_fwhm',
  xrd_d_spacing: 'experimentsV2.sections.results.metrics.xrd_d_spacing',
  tem_lattice_spacing:
    'experimentsV2.sections.results.metrics.tem_lattice_spacing',
} as const
type ResultKind = V2ResultWrite['kind']
type ResultOtherDetails = {
  method_other?: string | null
  observed_phenomena_other?: string | null
}
type ResultWithOtherDetails = V2ResultRead & ResultOtherDetails

export function instrumentMatchesMethod(
  snapshot: Record<string, unknown> | null | undefined,
  method: string,
  methodOther = '',
): boolean {
  if (!method) return true
  const nameType = canonicalOption(
    String(
      snapshotValue(snapshot, 'name_type') ??
        snapshotValue(snapshot, 'name_type_snapshot') ??
        '',
    ),
  )
  const expected = canonicalOption(method)
  if (expected !== 'other') return Boolean(nameType) && nameType === expected
  const specific = canonicalOption(methodOther.trim())
  return (
    nameType === 'other' ||
    (Boolean(specific) &&
      nameType.toLocaleLowerCase() === specific.toLocaleLowerCase())
  )
}

function fieldOptions(moduleKey: string, key: string): string[] {
  const field = getModuleFields(moduleKey).find((item) => item.key === key)
  return field ? (parseEnumOptions(field.input, field.options) ?? []) : []
}

function fieldLabel(moduleKey: string, key: string, language: string): string {
  const field = getModuleFields(moduleKey).find((item) => item.key === key)
  return field ? localizedFieldLabel(field, language) : ''
}

function fieldUnit(
  moduleKey: string,
  key: string,
  language: string,
): string | null {
  return localizedUnit(
    getModuleFields(moduleKey).find((item) => item.key === key)?.unit ?? null,
    language,
  )
}

function conditionLabelKey(key: string) {
  return CONDITION_LABEL_KEYS[key as keyof typeof CONDITION_LABEL_KEYS]
}

function conditionOptionKey(option: string) {
  return CONDITION_OPTION_KEYS[option as keyof typeof CONDITION_OPTION_KEYS]
}

function metricLabelKey(code: string) {
  return METRIC_LABEL_KEYS[code as keyof typeof METRIC_LABEL_KEYS]
}

function sampleLabel(sample: SampleRead, roleLabel: string): string {
  return sample.sample_code ? `${sample.sample_code} · ${roleLabel}` : roleLabel
}

type SpectralMetricDraft = {
  metricCode: string
  metricName: string
  originalCode?: string
  value: string
  unit: string
}

function spectralDrafts(value: unknown): SpectralMetricDraft[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const metric = item as {
      metric_code?: unknown
      value?: unknown
      unit?: unknown
    }
    const code =
      typeof metric.metric_code === 'string' ? metric.metric_code : ''
    const definition = metricDefinition(code)
    const decodedName = decodeCustomMetricName(code)
    return [
      {
        metricCode: definition ? code : 'custom',
        metricName:
          decodedName ??
          (definition || !code ? '' : readableLegacyMetricCode(code)),
        originalCode: definition ? undefined : code || undefined,
        value: metric.value == null ? '' : String(metric.value),
        unit: typeof metric.unit === 'string' ? metric.unit : '',
      },
    ]
  })
}

function metricCodeForDraft(metric: SpectralMetricDraft): string | null {
  if (metric.metricCode !== 'custom') return metric.metricCode
  const originalName = metric.originalCode
    ? (decodeCustomMetricName(metric.originalCode) ??
      readableLegacyMetricCode(metric.originalCode))
    : null
  if (
    metric.originalCode &&
    originalName === metric.metricName.trim() &&
    /^[a-z][a-z0-9_]*$/.test(metric.originalCode)
  ) {
    return metric.originalCode
  }
  return encodeCustomMetricName(metric.metricName)
}

function schemaShows(schema: MethodSchema, field: ResultFieldKey): boolean {
  return schema.resultFields.includes(field)
}

function conditionValueValid(field: ConditionField, value: string): boolean {
  if (!value.trim() || field.type !== 'number') return true
  return resultNumberValid(value, {
    integer: field.integer,
    min: field.min,
    gt: field.gt,
  })
}

function optionalNumber(
  value: string,
  options: { integer?: boolean; min?: number; gt?: number; max?: number } = {},
): number | null {
  if (!value.trim()) return null
  const number = Number(value)
  if (
    !Number.isFinite(number) ||
    (options.integer && !Number.isInteger(number)) ||
    (options.min != null && number < options.min) ||
    (options.gt != null && number <= options.gt) ||
    (options.max != null && number > options.max)
  ) {
    throw new RangeError('invalid result number')
  }
  return number
}

function resultNumberValid(
  value: string,
  options: { integer?: boolean; min?: number; gt?: number; max?: number } = {},
) {
  try {
    optionalNumber(value, options)
    return true
  } catch {
    return false
  }
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KiB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB`
}

function useAuthGate(): { token: string; enabled: boolean } {
  const { session } = useAuth()
  const token = session.accessToken || ''
  return { token, enabled: session.isAuthenticated && !!token }
}

export function ResultsSection({
  runId,
  readOnly = false,
  onDirtyChange,
}: {
  runId: string | undefined
  readOnly?: boolean
  onDirtyChange?: (dirty: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <ModuleCard
      id="module-results"
      title={t('experimentsV2.sections.results.title')}
    >
      {runId ? (
        <ResultsBody
          runId={runId}
          readOnly={readOnly}
          onDirtyChange={onDirtyChange}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('experimentsV2.sections.results.newModeHint')}
        </p>
      )}
    </ModuleCard>
  )
}

function ResultsBody({
  runId,
  readOnly,
  onDirtyChange,
}: {
  runId: string
  readOnly: boolean
  onDirtyChange?: (dirty: boolean) => void
}) {
  const { t } = useTranslation()
  const { token, enabled } = useAuthGate()
  const queryClient = useQueryClient()
  const [selectedSampleId, setSelectedSampleId] = useState('')
  const [newRole, setNewRole] = useState<SampleCreate['role']>('derived')
  const [resultDirty, setResultDirty] = useState(false)

  useEffect(() => {
    onDirtyChange?.(resultDirty)
  }, [onDirtyChange, resultDirty])

  const samplesQuery = useQuery({
    queryKey: ['v2-samples', runId, token],
    queryFn: () => listSamples(runId, token),
    enabled,
  })
  const samples = samplesQuery.data?.items ?? []
  const activeSampleId =
    selectedSampleId || (samples.length > 0 ? samples[0].id : '')
  const confirmDiscard = () =>
    !resultDirty ||
    window.confirm(t('experimentsV2.sections.results.discardChanges'))
  const selectSample = (sampleId: string) => {
    if (sampleId === activeSampleId || !confirmDiscard()) return
    setResultDirty(false)
    setSelectedSampleId(sampleId)
  }
  const requestCreateSample = () => {
    if (!confirmDiscard()) return
    setResultDirty(false)
    createSampleMutation.mutate()
  }

  const createSampleMutation = useMutation({
    mutationFn: () =>
      createSample(
        runId,
        {
          role: newRole,
          parent_sample_id: newRole === 'derived' ? activeSampleId : null,
        },
        token,
      ),
    onSuccess: (sample) => {
      setSelectedSampleId(sample.id)
      setResultDirty(false)
      void queryClient.invalidateQueries({
        queryKey: ['v2-samples', runId, token],
      })
      toast.success(t('experimentsV2.sections.results.sampleCreated'))
    },
    onError: (error) =>
      toast.error(
        resolveErrorMessage(error, t('experimentsV2.form.saveError')),
      ),
  })

  if (samplesQuery.isLoading) return <LoadingState />
  if (samplesQuery.isError) {
    return (
      <QueryError
        message={t('experimentsV2.sections.results.samplesLoadError')}
        onRetry={() => void samplesQuery.refetch()}
      />
    )
  }
  if (samples.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('experimentsV2.sections.results.noSamples')}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-64 flex-1 flex-col gap-1.5">
          <FieldLabel
            htmlFor="results-active-sample"
            labelZh={t('experimentsV2.sections.results.sample')}
            unit={null}
            required={false}
            r0={false}
          />
          <Select value={activeSampleId} onValueChange={selectSample}>
            <SelectTrigger id="results-active-sample" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {samples.map((sample) => (
                <SelectItem key={sample.id} value={sample.id}>
                  {sampleLabel(
                    sample,
                    sample.role === 'growth'
                      ? t('experimentsV2.sections.results.roles.growth')
                      : sample.role === 'derived'
                        ? t('experimentsV2.sections.results.roles.derived')
                        : t('experimentsV2.sections.results.roles.control'),
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Select
          value={newRole}
          onValueChange={(value) => setNewRole(value as SampleCreate['role'])}
          disabled={readOnly}
        >
          <SelectTrigger
            className="w-40"
            aria-label={t('experimentsV2.sections.results.sampleRole')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SAMPLE_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {t(`experimentsV2.sections.results.roles.${role}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={readOnly || createSampleMutation.isPending}
          onClick={requestCreateSample}
        >
          {t('experimentsV2.sections.results.addSample')}
        </Button>
      </div>

      <SampleResults
        key={activeSampleId}
        runId={runId}
        sampleId={activeSampleId}
        readOnly={readOnly}
        dirty={resultDirty}
        onDirtyChange={setResultDirty}
      />
    </div>
  )
}

function QueryError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-start gap-2 text-sm text-destructive">
      <p>{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {t('experimentsV2.sections.results.retry')}
      </Button>
    </div>
  )
}

function SampleResults({
  runId,
  sampleId,
  readOnly,
  dirty,
  onDirtyChange,
}: {
  runId: string
  sampleId: string
  readOnly: boolean
  dirty: boolean
  onDirtyChange: (dirty: boolean) => void
}) {
  const { i18n, t } = useTranslation()
  const { token, enabled } = useAuthGate()
  const queryClient = useQueryClient()
  const methods = useMemo(
    () => fieldOptions('characterization', 'method_instrument'),
    [],
  )
  const phenomena = useMemo(
    () => fieldOptions('measured_products', 'observed_phenomena'),
    [],
  )
  const [kind, setKind] = useState<ResultKind>('direct_observation')
  const [instrument, setInstrument] = useState<{
    id: string
    version: number | null
    snapshot: Record<string, unknown> | null
  }>({ id: '', version: null, snapshot: null })
  const [method, setMethod] = useState('')
  const [methodOther, setMethodOther] = useState('')
  const [conditionValues, setConditionValues] = useState<
    Record<string, string>
  >({})
  const [conditionParameters, setConditionParameters] = useState<
    NamedParameter[]
  >([])
  const [conditionNote, setConditionNote] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [phenomenonOther, setPhenomenonOther] = useState('')
  const [phaseStacking, setPhaseStacking] = useState('')
  const [layerCount, setLayerCount] = useState('')
  const [coveragePercent, setCoveragePercent] = useState('')
  const [domainSize, setDomainSize] = useState('')
  const [nucleationDensity, setNucleationDensity] = useState('')
  const [spectralMetrics, setSpectralMetrics] = useState<SpectralMetricDraft[]>(
    [],
  )
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([])
  const [existingFileIds, setExistingFileIds] = useState<string[]>([])
  const [editingId, setEditingId] = useState('')
  const currentMethodSchema = methodSchema(method)

  const queryKey = ['v2-results', sampleId, token]
  const resultsQuery = useQuery({
    queryKey,
    queryFn: () => listResults(sampleId, token),
    enabled: enabled && Boolean(sampleId),
  })
  const results = resultsQuery.data?.items ?? []

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({
        queryKey: ['v2-experiment', runId, token],
      }),
      queryClient.invalidateQueries({ queryKey: ['v2-experiment-list'] }),
      queryClient.invalidateQueries({ queryKey: ['v2-run-audit', runId] }),
    ])

  const reset = () => {
    setKind('direct_observation')
    setInstrument({ id: '', version: null, snapshot: null })
    setMethod('')
    setMethodOther('')
    setConditionValues({})
    setConditionParameters([])
    setConditionNote('')
    setSelected([])
    setPhenomenonOther('')
    setPhaseStacking('')
    setLayerCount('')
    setCoveragePercent('')
    setDomainSize('')
    setNucleationDensity('')
    setSpectralMetrics([])
    setPendingAttachments([])
    setExistingFileIds([])
    setEditingId('')
    onDirtyChange(false)
  }

  const payload = (
    fileAssetIds = existingFileIds,
  ): V2ResultWrite & ResultOtherDetails => ({
    kind,
    file_asset_ids: kind === 'direct_observation' ? fileAssetIds : [],
    instrument_id:
      kind === 'characterization' && instrument.id ? instrument.id : null,
    instrument_version:
      kind === 'characterization' && instrument.id ? instrument.version : null,
    method_instrument:
      kind === 'characterization' ? canonicalOption(method) : null,
    method_other:
      kind === 'characterization' && canonicalOption(method) === 'other'
        ? methodOther.trim() || null
        : null,
    test_conditions:
      kind === 'characterization'
        ? serializeTestConditions(
            conditionValues,
            conditionParameters,
            conditionNote,
          )
        : null,
    observed_phenomena:
      selected.length > 0 ? selected.map(canonicalOption) : null,
    observed_phenomena_other: selected.map(canonicalOption).includes('other')
      ? phenomenonOther.trim() || null
      : null,
    detected_phase_stacking:
      kind === 'characterization' ? phaseStacking.trim() || null : null,
    layer_count:
      kind === 'characterization'
        ? optionalNumber(layerCount, { integer: true, min: 0 })
        : null,
    coverage_percent:
      kind === 'characterization'
        ? optionalNumber(coveragePercent, { min: 0, max: 100 })
        : null,
    domain_size_um:
      kind === 'characterization'
        ? optionalNumber(domainSize, { gt: 0 })
        : null,
    nucleation_density_cm2:
      kind === 'characterization'
        ? optionalNumber(nucleationDensity, { min: 0 })
        : null,
    key_spectral_metrics:
      kind === 'characterization' && spectralMetrics.length > 0
        ? spectralMetrics.map((metric) => ({
            metric_code: metricCodeForDraft(metric)!,
            value: optionalNumber(metric.value)!,
            unit: metric.unit.trim(),
          }))
        : null,
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const uploadedIds: string[] = []
      if (kind === 'direct_observation') {
        try {
          for (const file of pendingAttachments) {
            const uploaded = await uploadExperimentFile(token, runId, {
              file,
              sampleId,
              assetRole: 'direct_observation_file',
            })
            uploadedIds.push(uploaded.id)
          }
          const writePayload = payload([...existingFileIds, ...uploadedIds])
          return editingId
            ? await updateResult(editingId, writePayload, token)
            : await createResult(sampleId, writePayload, token)
        } catch (error) {
          await Promise.allSettled(
            uploadedIds.map((fileId) => deleteExperimentFile(token, fileId)),
          )
          throw error
        }
      }
      return editingId
        ? updateResult(editingId, payload(), token)
        : createResult(sampleId, payload(), token)
    },
    onSuccess: async (result) => {
      const updated = Boolean(editingId)
      const attachments = pendingAttachments
      reset()
      toast.success(
        t(
          updated
            ? 'experimentsV2.sections.results.resultUpdated'
            : 'experimentsV2.sections.results.resultAdded',
        ),
      )
      if (
        attachments.length > 0 &&
        result.characterization_record_id &&
        result.method_instrument
      ) {
        const recordId = result.characterization_record_id
        const savedMethod = result.method_instrument
        const uploads = await Promise.allSettled(
          attachments.map((file) =>
            uploadExperimentFile(token, runId, {
              file,
              method: savedMethod,
              characterizationRecordId: recordId,
            }),
          ),
        )
        if (uploads.some((upload) => upload.status === 'rejected')) {
          toast.error(
            t(
              'experimentsV2.sections.results.resultSavedAttachmentUploadError',
            ),
          )
        }
      }
      await invalidate()
    },
    onError: (error) =>
      toast.error(
        resolveErrorMessage(error, t('experimentsV2.form.saveError')),
      ),
  })
  const deleteMutation = useMutation({
    mutationFn: (resultId: string) => deleteResult(resultId, token),
    onSuccess: (_response, resultId) => {
      if (editingId === resultId) reset()
      void invalidate()
    },
    onError: (error) =>
      toast.error(
        resolveErrorMessage(error, t('experimentsV2.form.saveError')),
      ),
  })

  const editResult = (result: V2ResultRead) => {
    if (
      dirty &&
      !window.confirm(t('experimentsV2.sections.results.discardChanges'))
    ) {
      return
    }
    setPendingAttachments([])
    setExistingFileIds(result.file_asset_ids ?? [])
    setEditingId(result.id)
    setKind(result.kind)
    setInstrument({
      id: result.instrument_id ?? '',
      version: result.instrument_version ?? null,
      snapshot: result.instrument_snapshot_json ?? null,
    })
    setMethod(canonicalOption(result.method_instrument ?? ''))
    setMethodOther((result as ResultWithOtherDetails).method_other ?? '')
    const parsedConditions = parseTestConditions(result.test_conditions)
    setConditionValues(parsedConditions.values)
    setConditionParameters(parsedConditions.parameters)
    setConditionNote(parsedConditions.note)
    setSelected((result.observed_phenomena ?? []).map(canonicalOption))
    setPhenomenonOther(
      (result as ResultWithOtherDetails).observed_phenomena_other ?? '',
    )
    setPhaseStacking(result.detected_phase_stacking ?? '')
    setLayerCount(result.layer_count == null ? '' : String(result.layer_count))
    setCoveragePercent(
      result.coverage_percent == null ? '' : String(result.coverage_percent),
    )
    setDomainSize(
      result.domain_size_um == null ? '' : String(result.domain_size_um),
    )
    setNucleationDensity(
      result.nucleation_density_cm2 == null
        ? ''
        : String(result.nucleation_density_cm2),
    )
    setSpectralMetrics(spectralDrafts(result.key_spectral_metrics))
    onDirtyChange(false)
  }

  const togglePhenomenon = (option: string, checked: boolean) => {
    onDirtyChange(true)
    if (!checked && canonicalOption(option) === 'other') setPhenomenonOther('')
    setSelected((current) =>
      checked
        ? [...new Set([...current, option])]
        : current.filter((item) => item !== option),
    )
  }

  const selectMethod = (value: string) => {
    const nextMethod = canonicalOption(value)
    if (nextMethod !== canonicalOption(method)) {
      setConditionValues({})
      setConditionParameters([])
      setConditionNote('')
      setSelected([])
      setPhenomenonOther('')
      setPhaseStacking('')
      setLayerCount('')
      setCoveragePercent('')
      setDomainSize('')
      setNucleationDensity('')
      setSpectralMetrics([])
    }
    setMethod(nextMethod)
    if (nextMethod !== 'other') setMethodOther('')
    if (
      instrument.id &&
      !instrumentMatchesMethod(instrument.snapshot, nextMethod, methodOther)
    ) {
      setInstrument({ id: '', version: null, snapshot: null })
    }
    onDirtyChange(true)
  }

  const numericMeasurementsValid =
    resultNumberValid(layerCount, { integer: true, min: 0 }) &&
    resultNumberValid(coveragePercent, { min: 0, max: 100 }) &&
    resultNumberValid(domainSize, { gt: 0 }) &&
    resultNumberValid(nucleationDensity, { min: 0 })
  const spectralMetricsValid = spectralMetrics.every(
    (metric) =>
      Boolean(metricCodeForDraft(metric)) &&
      resultNumberValid(metric.value) &&
      metric.value.trim() !== '' &&
      metric.unit.trim() !== '',
  )
  const conditionsValid =
    currentMethodSchema.conditionFields.every((field) =>
      conditionValueValid(field, conditionValues[field.key] ?? ''),
    ) &&
    conditionParameters.every(
      (parameter) => parameter.name.trim() && parameter.value.trim(),
    )
  const methodOtherValid =
    kind !== 'characterization' ||
    canonicalOption(method) !== 'other' ||
    Boolean(methodOther.trim())
  const phenomenonOtherValid =
    !selected.map(canonicalOption).includes('other') ||
    Boolean(phenomenonOther.trim())
  const canSave =
    !readOnly &&
    !saveMutation.isPending &&
    numericMeasurementsValid &&
    spectralMetricsValid &&
    conditionsValid &&
    methodOtherValid &&
    phenomenonOtherValid &&
    (kind === 'characterization'
      ? Boolean(method)
      : selected.length > 0 ||
        pendingAttachments.length > 0 ||
        existingFileIds.length > 0)

  return (
    <div className="flex flex-col gap-5">
      {resultsQuery.isLoading ? <LoadingState /> : null}
      {resultsQuery.isError ? (
        <QueryError
          message={t('experimentsV2.sections.results.resultsLoadError')}
          onRetry={() => void resultsQuery.refetch()}
        />
      ) : null}
      {!resultsQuery.isLoading && !resultsQuery.isError ? (
        results.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {results.map((result) => (
              <ResultCard
                key={result.id}
                runId={runId}
                result={result}
                readOnly={readOnly}
                deletePending={deleteMutation.isPending}
                onEdit={() => editResult(result)}
                onDelete={() => deleteMutation.mutate(result.id)}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('experimentsV2.sections.results.noResults')}
          </p>
        )
      ) : null}

      <div className="grid gap-4 rounded-md border border-border p-4 sm:grid-cols-2">
        {editingId ? (
          <p className="sm:col-span-2 text-sm font-medium text-primary">
            {t('experimentsV2.sections.results.editing')}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <FieldLabel
            htmlFor="result-kind"
            labelZh={t('experimentsV2.sections.results.resultType')}
            unit={null}
            required
            r0={false}
          />
          <Select
            value={kind}
            onValueChange={(value) => {
              setKind(value as ResultKind)
              onDirtyChange(true)
            }}
            disabled={readOnly || Boolean(editingId)}
          >
            <SelectTrigger
              id="result-kind"
              className="w-full"
              aria-label={t('experimentsV2.sections.results.resultType')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direct_observation">
                {t('experimentsV2.sections.results.directObservation')}
              </SelectItem>
              <SelectItem value="characterization">
                {t('experimentsV2.sections.results.characterizationResult')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {kind === 'characterization' ? (
          <>
            <div className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="result-method"
                labelZh={t('experimentsV2.sections.results.method')}
                unit={null}
                required
                r0={false}
              />
              <Select
                value={method}
                onValueChange={selectMethod}
                disabled={readOnly}
              >
                <SelectTrigger
                  id="result-method"
                  className="w-full"
                  aria-label={t('experimentsV2.sections.results.method')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {methods.map((option) => (
                      <SelectItem key={option} value={option}>
                        {localizedOption(option, i18n.language)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            {canonicalOption(method) === 'other' ? (
              <div className="flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor="result-method-other"
                  labelZh={t('experimentsV2.sections.results.otherMethodName')}
                  unit={null}
                  required
                  r0={false}
                />
                <Input
                  id="result-method-other"
                  value={methodOther}
                  aria-invalid={!methodOther.trim() || undefined}
                  onChange={(event) => {
                    const next = event.target.value
                    setMethodOther(next)
                    if (
                      instrument.id &&
                      !instrumentMatchesMethod(
                        instrument.snapshot,
                        method,
                        next,
                      )
                    ) {
                      setInstrument({
                        id: '',
                        version: null,
                        snapshot: null,
                      })
                    }
                    onDirtyChange(true)
                  }}
                  disabled={readOnly}
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="result-instrument"
                labelZh={t('experimentsV2.sections.results.instrument')}
                unit={null}
                required={false}
                r0={false}
              />
              <EntityReferenceSelect
                triggerId="result-instrument"
                kind="instrument"
                value={instrument.id}
                selectedVersion={instrument.version}
                selectedSnapshot={instrument.snapshot}
                filter={(entity) =>
                  instrumentMatchesMethod(
                    entity.latest_version?.data,
                    method,
                    methodOther,
                  )
                }
                onChange={(id, entity: V2EntityRead | null) => {
                  setInstrument({
                    id,
                    version: entity?.latest_version?.version ?? null,
                    snapshot: entity?.latest_version?.data ?? null,
                  })
                  onDirtyChange(true)
                }}
                disabled={readOnly}
              />
              {instrument.snapshot ? (
                <InstrumentSnapshotSummary
                  snapshot={instrument.snapshot}
                  version={instrument.version}
                />
              ) : null}
            </div>
            {method ? (
              <MethodConditionsEditor
                schema={currentMethodSchema}
                values={conditionValues}
                parameters={conditionParameters}
                note={conditionNote}
                disabled={readOnly}
                onValuesChange={(values) => {
                  setConditionValues(values)
                  onDirtyChange(true)
                }}
                onParametersChange={(parameters) => {
                  setConditionParameters(parameters)
                  onDirtyChange(true)
                }}
                onNoteChange={(note) => {
                  setConditionNote(note)
                  onDirtyChange(true)
                }}
              />
            ) : null}
          </>
        ) : null}

        {kind === 'direct_observation' ||
        (Boolean(method) &&
          schemaShows(currentMethodSchema, 'observed_phenomena')) ? (
          <div className="sm:col-span-2 flex flex-col gap-2">
            <FieldLabel
              labelZh={fieldLabel(
                'measured_products',
                'observed_phenomena',
                i18n.language,
              )}
              unit={null}
              required={
                kind === 'direct_observation' &&
                pendingAttachments.length === 0 &&
                existingFileIds.length === 0
              }
              r0={false}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {phenomena.map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <Checkbox
                    checked={selected.includes(option)}
                    onCheckedChange={(checked) =>
                      togglePhenomenon(option, checked === true)
                    }
                    disabled={readOnly}
                  />
                  {localizedOption(option, i18n.language)}
                </label>
              ))}
            </div>
            {selected.map(canonicalOption).includes('other') ? (
              <div className="flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor="result-phenomenon-other"
                  labelZh={t(
                    'experimentsV2.sections.results.otherPhenomenonDescription',
                  )}
                  unit={null}
                  required
                  r0={false}
                />
                <Input
                  id="result-phenomenon-other"
                  value={phenomenonOther}
                  aria-invalid={!phenomenonOther.trim() || undefined}
                  onChange={(event) => {
                    setPhenomenonOther(event.target.value)
                    onDirtyChange(true)
                  }}
                  disabled={readOnly}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {kind === 'direct_observation' ? (
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="direct-observation-attachments"
              labelZh={t('experimentsV2.sections.results.newAttachments')}
              unit={null}
              required={selected.length === 0}
              r0={false}
            />
            <Input
              id="direct-observation-attachments"
              type="file"
              multiple
              disabled={readOnly || saveMutation.isPending}
              onChange={(event) => {
                setPendingAttachments(Array.from(event.target.files ?? []))
                onDirtyChange(true)
              }}
            />
            {pendingAttachments.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('experimentsV2.sections.results.selectedAttachmentCount', {
                  count: pendingAttachments.length,
                })}
              </p>
            ) : null}
          </div>
        ) : null}

        {kind === 'characterization' && method ? (
          <>
            {schemaShows(currentMethodSchema, 'detected_phase_stacking') ? (
              <ResultTextField
                id="result-phase"
                label={fieldLabel(
                  'measured_products',
                  'detected_phase_stacking',
                  i18n.language,
                )}
                value={phaseStacking}
                onChange={(value) => {
                  setPhaseStacking(value)
                  onDirtyChange(true)
                }}
                disabled={readOnly}
              />
            ) : null}
            {schemaShows(currentMethodSchema, 'layer_count') ? (
              <ResultNumberField
                id="result-layer-count"
                label={fieldLabel(
                  'measured_products',
                  'layer_count',
                  i18n.language,
                )}
                unit={fieldUnit(
                  'measured_products',
                  'layer_count',
                  i18n.language,
                )}
                value={layerCount}
                integer
                min={0}
                onChange={(value) => {
                  setLayerCount(value)
                  onDirtyChange(true)
                }}
                disabled={readOnly}
              />
            ) : null}
            {schemaShows(currentMethodSchema, 'coverage_percent') ? (
              <ResultNumberField
                id="result-coverage-percent"
                label={fieldLabel(
                  'measured_products',
                  'coverage_percent',
                  i18n.language,
                )}
                unit={fieldUnit(
                  'measured_products',
                  'coverage_percent',
                  i18n.language,
                )}
                value={coveragePercent}
                min={0}
                max={100}
                onChange={(value) => {
                  setCoveragePercent(value)
                  onDirtyChange(true)
                }}
                disabled={readOnly}
              />
            ) : null}
            {schemaShows(currentMethodSchema, 'domain_size_um') ? (
              <ResultNumberField
                id="result-domain-size"
                label={fieldLabel(
                  'measured_products',
                  'domain_size_um',
                  i18n.language,
                )}
                unit={fieldUnit(
                  'measured_products',
                  'domain_size_um',
                  i18n.language,
                )}
                value={domainSize}
                gt={0}
                onChange={(value) => {
                  setDomainSize(value)
                  onDirtyChange(true)
                }}
                disabled={readOnly}
              />
            ) : null}
            {schemaShows(currentMethodSchema, 'nucleation_density_cm2') ? (
              <ResultNumberField
                id="result-nucleation-density"
                label={fieldLabel(
                  'measured_products',
                  'nucleation_density_cm2',
                  i18n.language,
                )}
                unit={fieldUnit(
                  'measured_products',
                  'nucleation_density_cm2',
                  i18n.language,
                )}
                value={nucleationDensity}
                min={0}
                onChange={(value) => {
                  setNucleationDensity(value)
                  onDirtyChange(true)
                }}
                disabled={readOnly}
              />
            ) : null}
            {schemaShows(currentMethodSchema, 'key_spectral_metrics') ? (
              <SpectralMetricsEditor
                schema={currentMethodSchema}
                metrics={spectralMetrics}
                valid={spectralMetricsValid}
                disabled={readOnly}
                onChange={(metrics) => {
                  setSpectralMetrics(metrics)
                  onDirtyChange(true)
                }}
              />
            ) : null}
            {!editingId ? (
              <div className="sm:col-span-2 flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor="result-attachments"
                  labelZh={t('experimentsV2.sections.results.newAttachments')}
                  unit={null}
                  required={false}
                  r0={false}
                />
                <Input
                  id="result-attachments"
                  type="file"
                  multiple
                  disabled={readOnly || saveMutation.isPending}
                  onChange={(event) => {
                    setPendingAttachments(Array.from(event.target.files ?? []))
                    onDirtyChange(true)
                  }}
                />
                {pendingAttachments.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'experimentsV2.sections.results.selectedAttachmentCount',
                      { count: pendingAttachments.length },
                    )}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        <div className="sm:col-span-2 flex justify-end gap-2">
          {editingId ? (
            <Button type="button" variant="ghost" onClick={reset}>
              {t('actions.cancel')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={!canSave}
            onClick={() => saveMutation.mutate()}
          >
            {editingId
              ? t('actions.save')
              : t('experimentsV2.sections.results.addResult')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function MethodConditionsEditor({
  schema,
  values,
  parameters,
  note,
  disabled,
  onValuesChange,
  onParametersChange,
  onNoteChange,
}: {
  schema: MethodSchema
  values: Record<string, string>
  parameters: NamedParameter[]
  note: string
  disabled: boolean
  onValuesChange: (values: Record<string, string>) => void
  onParametersChange: (parameters: NamedParameter[]) => void
  onNoteChange: (note: string) => void
}) {
  const { i18n, t } = useTranslation()
  const updateParameter = (index: number, patch: Partial<NamedParameter>) => {
    onParametersChange(
      parameters.map((parameter, position) =>
        position === index ? { ...parameter, ...patch } : parameter,
      ),
    )
  }
  return (
    <fieldset className="sm:col-span-2 flex flex-col gap-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium text-foreground">
        {fieldLabel('characterization', 'test_conditions', i18n.language)}
      </legend>
      {schema.conditionFields.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {schema.conditionFields.map((field) =>
            field.type === 'select' ? (
              <div key={field.key} className="flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor={`result-condition-${field.key}`}
                  labelZh={t(conditionLabelKey(field.key))}
                  unit={field.unit ?? null}
                  required={false}
                  r0={false}
                />
                <Select
                  value={values[field.key] ?? ''}
                  onValueChange={(value) =>
                    onValuesChange({ ...values, [field.key]: value })
                  }
                  disabled={disabled}
                >
                  <SelectTrigger
                    id={`result-condition-${field.key}`}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(field.options ?? []).map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(conditionOptionKey(option))}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            ) : field.type === 'number' ? (
              <ResultNumberField
                key={field.key}
                id={`result-condition-${field.key}`}
                label={t(conditionLabelKey(field.key))}
                unit={field.unit ?? null}
                value={values[field.key] ?? ''}
                integer={field.integer}
                min={field.min}
                gt={field.gt}
                onChange={(value) =>
                  onValuesChange({ ...values, [field.key]: value })
                }
                disabled={disabled}
              />
            ) : (
              <ResultTextField
                key={field.key}
                id={`result-condition-${field.key}`}
                label={t(conditionLabelKey(field.key))}
                value={values[field.key] ?? ''}
                onChange={(value) =>
                  onValuesChange({ ...values, [field.key]: value })
                }
                disabled={disabled}
              />
            ),
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('experimentsV2.sections.results.namedConditionsHint')}
        </p>
      )}
      {parameters.map((parameter, index) => (
        <div
          key={index}
          className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]"
        >
          <Input
            aria-label={t('experimentsV2.sections.results.parameterName')}
            placeholder={t('experimentsV2.sections.results.parameterName')}
            value={parameter.name}
            disabled={disabled}
            onChange={(event) =>
              updateParameter(index, { name: event.target.value })
            }
          />
          <Input
            aria-label={t('experimentsV2.sections.results.parameterValue')}
            placeholder={t('experimentsV2.sections.results.parameterValue')}
            value={parameter.value}
            disabled={disabled}
            onChange={(event) =>
              updateParameter(index, { value: event.target.value })
            }
          />
          <Input
            aria-label={t('experimentsV2.sections.results.parameterUnit')}
            placeholder={t('experimentsV2.sections.results.parameterUnit')}
            value={parameter.unit}
            disabled={disabled}
            onChange={(event) =>
              updateParameter(index, { unit: event.target.value })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t(
              'experimentsV2.sections.results.removeConditionParameter',
            )}
            disabled={disabled}
            onClick={() =>
              onParametersChange(
                parameters.filter((_, position) => position !== index),
              )
            }
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onParametersChange([
              ...parameters,
              { name: '', value: '', unit: '' },
            ])
          }
        >
          <Plus />
          {t('experimentsV2.sections.results.addConditionParameter')}
        </Button>
        <div className="min-w-64 flex-1">
          <Input
            aria-label={t(
              'experimentsV2.sections.results.additionalConditionNote',
            )}
            placeholder={t(
              'experimentsV2.sections.results.additionalConditionNote',
            )}
            value={note}
            disabled={disabled}
            onChange={(event) => onNoteChange(event.target.value)}
          />
        </div>
      </div>
    </fieldset>
  )
}

function SpectralMetricsEditor({
  schema,
  metrics,
  valid,
  disabled,
  onChange,
}: {
  schema: MethodSchema
  metrics: SpectralMetricDraft[]
  valid: boolean
  disabled: boolean
  onChange: (metrics: SpectralMetricDraft[]) => void
}) {
  const { t } = useTranslation()
  const update = (index: number, patch: Partial<SpectralMetricDraft>) =>
    onChange(
      metrics.map((metric, position) =>
        position === index ? { ...metric, ...patch } : metric,
      ),
    )
  const firstDefinition = schema.metrics[0]
  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel
          labelZh={t('experimentsV2.sections.results.methodMetrics')}
          unit={null}
          required={false}
          r0={false}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onChange([
              ...metrics,
              {
                metricCode: firstDefinition?.code ?? 'custom',
                metricName: '',
                value: '',
                unit: firstDefinition?.unit ?? '',
              },
            ])
          }
        >
          <Plus />
          {t('experimentsV2.sections.results.addMetric')}
        </Button>
      </div>
      {metrics.map((metric, index) => {
        const definition =
          metric.metricCode === 'custom'
            ? undefined
            : schema.metrics.find((item) => item.code === metric.metricCode)
        return (
          <div
            key={index}
            className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1.5fr_1fr_1fr_auto]"
          >
            <div className="flex flex-col gap-2">
              {schema.metrics.length > 0 ? (
                <Select
                  value={definition ? metric.metricCode : 'custom'}
                  onValueChange={(code) => {
                    const next = schema.metrics.find(
                      (item) => item.code === code,
                    )
                    update(index, {
                      metricCode: next?.code ?? 'custom',
                      metricName: '',
                      originalCode: undefined,
                      unit: next?.unit ?? '',
                    })
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger
                    aria-label={t('experimentsV2.sections.results.metricName')}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {schema.metrics.map((item) => (
                        <SelectItem key={item.code} value={item.code}>
                          {t(metricLabelKey(item.code))}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">
                        {t('experimentsV2.sections.results.otherNamedMetric')}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : null}
              {!definition ? (
                <Input
                  aria-label={t(
                    'experimentsV2.sections.results.metricParameterName',
                  )}
                  placeholder={t(
                    'experimentsV2.sections.results.metricParameterName',
                  )}
                  value={metric.metricName}
                  disabled={disabled}
                  onChange={(event) =>
                    update(index, { metricName: event.target.value })
                  }
                />
              ) : null}
            </div>
            <Input
              id={`result-metric-value-${index}`}
              type="number"
              step="any"
              aria-label={t('experimentsV2.sections.results.metricValue')}
              placeholder={t('experimentsV2.sections.results.metricValue')}
              value={metric.value}
              disabled={disabled}
              onChange={(event) => update(index, { value: event.target.value })}
            />
            <Input
              id={`result-metric-unit-${index}`}
              aria-label={t('experimentsV2.sections.results.metricUnit')}
              placeholder={t('experimentsV2.sections.results.metricUnit')}
              value={metric.unit}
              readOnly={Boolean(definition)}
              disabled={disabled}
              onChange={(event) => update(index, { unit: event.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('experimentsV2.sections.results.removeMetric')}
              disabled={disabled}
              onClick={() =>
                onChange(metrics.filter((_, position) => position !== index))
              }
            >
              <Trash2 />
            </Button>
          </div>
        )
      })}
      {!valid ? (
        <p className="text-xs text-destructive">
          {t('experimentsV2.sections.results.invalidMetric')}
        </p>
      ) : null}
    </div>
  )
}

function InstrumentSnapshotSummary({
  snapshot,
  version,
}: {
  snapshot: Record<string, unknown>
  version: number | null
}) {
  const { i18n, t } = useTranslation()
  const nameType =
    snapshotValue(snapshot, 'name_type_snapshot') ??
    snapshotValue(snapshot, 'name_type')
  const vendor = snapshotValue(snapshot, 'vendor')
  const model = snapshotValue(snapshot, 'model')
  const rows = [
    {
      label: t('experimentsV2.sections.results.instrumentSnapshot.type'),
      value:
        nameType == null
          ? null
          : localizedOption(String(nameType), i18n.language),
    },
    {
      label: t('experimentsV2.sections.results.instrumentSnapshot.code'),
      value:
        snapshotValue(snapshot, 'instrument_code_snapshot') ??
        snapshotValue(snapshot, 'instrument_code'),
    },
    {
      label: t('experimentsV2.sections.results.instrumentSnapshot.vendorModel'),
      value: [vendor, model].filter(Boolean).join(' · '),
    },
    {
      label: t('experimentsV2.sections.results.instrumentSnapshot.fixedConfig'),
      value: snapshotValue(snapshot, 'fixed_config'),
    },
    {
      label: t('experimentsV2.sections.results.instrumentSnapshot.version'),
      value:
        version ??
        snapshotValue(snapshot, 'instrument_version') ??
        snapshotValue(snapshot, 'version'),
    },
    {
      label: t(
        'experimentsV2.sections.results.instrumentSnapshot.lastCalibration',
      ),
      value: snapshotValue(snapshot, 'last_calibration'),
    },
  ].filter((row) => row.value != null && row.value !== '')
  if (rows.length === 0) return null
  return (
    <dl className="grid gap-x-3 gap-y-1 rounded-md border border-border p-3 text-xs text-muted-foreground sm:grid-cols-[max-content_1fr]">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt>{row.label}</dt>
          <dd className="min-w-0 break-words text-foreground [overflow-wrap:anywhere]">
            {String(row.value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function TestConditionsSummary({
  raw,
  method,
}: {
  raw: string
  method: string
}) {
  const { i18n, t } = useTranslation()
  const parsed = parseTestConditions(raw)
  const fields = new Map(
    methodSchema(method).conditionFields.map((field) => [field.key, field]),
  )
  const values = Object.entries(parsed.values).map(([key, value]) => {
    const field = fields.get(key)
    const label = field
      ? t(conditionLabelKey(key))
      : readableLegacyMetricCode(key)
    return `${label}: ${value}${field?.unit ? ` ${field.unit}` : ''}`
  })
  const parameters = parsed.parameters.map(
    (parameter) =>
      `${parameter.name}: ${parameter.value}${
        parameter.unit ? ` ${parameter.unit}` : ''
      }`,
  )
  const summary = [...values, ...parameters, parsed.note].filter(Boolean)
  return <>{summary.join(i18n.language.startsWith('en') ? ' · ' : '；')}</>
}

function hasMetricSummary(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { note?: unknown }).note === 'string' &&
    (value as { note: string }).note.trim(),
  )
}

function MetricSummary({ value }: { value: unknown }) {
  const { t } = useTranslation()
  if (Array.isArray(value)) {
    return (
      <>
        {value
          .flatMap((item) => {
            if (!item || typeof item !== 'object') return []
            const metric = item as {
              metric_code?: unknown
              value?: unknown
              unit?: unknown
            }
            if (
              typeof metric.metric_code !== 'string' ||
              typeof metric.value !== 'number' ||
              typeof metric.unit !== 'string'
            ) {
              return []
            }
            const definition = metricDefinition(metric.metric_code)
            const name = definition
              ? t(metricLabelKey(metric.metric_code))
              : (decodeCustomMetricName(metric.metric_code) ??
                readableLegacyMetricCode(metric.metric_code))
            return [`${name}: ${metric.value} ${metric.unit}`]
          })
          .join(' · ')}
      </>
    )
  }
  if (value && typeof value === 'object' && 'note' in value) {
    const note = (value as { note?: unknown }).note
    return <>{typeof note === 'string' ? note : ''}</>
  }
  return null
}

function ResultTextField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel
        htmlFor={id}
        labelZh={label}
        unit={null}
        required={false}
        r0={false}
      />
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </div>
  )
}

function ResultNumberField({
  id,
  label,
  unit,
  value,
  onChange,
  disabled,
  integer,
  min,
  gt,
  max,
}: {
  id: string
  label: string
  unit: string | null
  value: string
  onChange: (value: string) => void
  disabled: boolean
  integer?: boolean
  min?: number
  gt?: number
  max?: number
}) {
  const { t } = useTranslation()
  const valid = resultNumberValid(value, { integer, min, gt, max })
  const errorId = `${id}-error`
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel
        htmlFor={id}
        labelZh={label}
        unit={unit}
        required={false}
        r0={false}
      />
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={integer ? 1 : 'any'}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-invalid={!valid || undefined}
        aria-describedby={!valid ? errorId : undefined}
      />
      {!valid ? (
        <p id={errorId} className="text-xs text-destructive">
          {t('experimentsV2.sections.results.invalidMeasurement')}
        </p>
      ) : null}
    </div>
  )
}

function ResultCard({
  runId,
  result,
  readOnly,
  deletePending,
  onEdit,
  onDelete,
}: {
  runId: string
  result: V2ResultRead
  readOnly: boolean
  deletePending: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const { i18n, t } = useTranslation()
  const details = result as ResultWithOtherDetails
  const fileAssetIds = result.file_asset_ids ?? []
  const title =
    result.kind === 'characterization'
      ? (canonicalOption(result.method_instrument ?? '') === 'other'
          ? details.method_other
          : localizedOption(result.method_instrument || '', i18n.language)) ||
        t('experimentsV2.sections.results.characterizationResult')
      : (result.observed_phenomena ?? [])
          .map((value) =>
            canonicalOption(value) === 'other' &&
            details.observed_phenomena_other
              ? details.observed_phenomena_other
              : localizedOption(value, i18n.language),
          )
          .join(' · ') || t('experimentsV2.sections.results.directObservation')
  return (
    <li className="min-w-0 flex flex-col gap-3 rounded-md border border-border p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium text-foreground [overflow-wrap:anywhere]">
            {title}
          </p>
          {result.test_conditions ? (
            <p className="break-words text-muted-foreground [overflow-wrap:anywhere]">
              <TestConditionsSummary
                raw={result.test_conditions}
                method={result.method_instrument ?? ''}
              />
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('experimentsV2.sections.results.editResultLabel')}
            disabled={readOnly}
            onClick={onEdit}
          >
            <Pencil />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t(
                  'experimentsV2.sections.results.deleteResultLabel',
                )}
                disabled={readOnly || deletePending}
              >
                <Trash2 />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('experimentsV2.sections.results.deleteResultTitle')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('experimentsV2.sections.results.deleteResultDescription')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>
                  {t('experimentsV2.sections.results.confirmDeleteResult')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {result.instrument_snapshot_json ? (
        <InstrumentSnapshotSummary
          snapshot={result.instrument_snapshot_json}
          version={result.instrument_version}
        />
      ) : null}
      <ResultSummary result={result} />
      {result.kind === 'characterization' &&
      result.characterization_record_id ? (
        <ResultAttachments
          runId={runId}
          recordId={result.characterization_record_id}
          method={result.method_instrument || ''}
          readOnly={readOnly}
        />
      ) : result.kind === 'direct_observation' && fileAssetIds.length > 0 ? (
        <ExperimentAttachments
          runId={runId}
          role="direct_observation_file"
          sampleId={result.sample_id}
          includeIds={fileAssetIds}
          allowUpload={false}
          readOnly={readOnly}
        />
      ) : null}
    </li>
  )
}

function ResultSummary({ result }: { result: V2ResultRead }) {
  const { i18n, t } = useTranslation()
  const details = result as ResultWithOtherDetails
  const values = [
    {
      label: t('experimentsV2.sections.results.observedPhenomena'),
      value: (result.observed_phenomena ?? [])
        .map((value) =>
          canonicalOption(value) === 'other' && details.observed_phenomena_other
            ? details.observed_phenomena_other
            : localizedOption(value, i18n.language),
        )
        .join(' · '),
    },
    {
      label: t('experimentsV2.sections.results.detectedPhaseStacking'),
      value: result.detected_phase_stacking,
    },
    {
      label: fieldLabel('measured_products', 'layer_count', i18n.language),
      value:
        result.layer_count == null
          ? null
          : `${result.layer_count} ${fieldUnit(
              'measured_products',
              'layer_count',
              i18n.language,
            )}`,
    },
    {
      label: fieldLabel('measured_products', 'coverage_percent', i18n.language),
      value:
        result.coverage_percent == null
          ? null
          : `${result.coverage_percent} ${fieldUnit(
              'measured_products',
              'coverage_percent',
              i18n.language,
            )}`,
    },
    {
      label: fieldLabel('measured_products', 'domain_size_um', i18n.language),
      value:
        result.domain_size_um == null
          ? null
          : `${result.domain_size_um} ${fieldUnit(
              'measured_products',
              'domain_size_um',
              i18n.language,
            )}`,
    },
    {
      label: fieldLabel(
        'measured_products',
        'nucleation_density_cm2',
        i18n.language,
      ),
      value:
        result.nucleation_density_cm2 == null
          ? null
          : `${result.nucleation_density_cm2} ${fieldUnit(
              'measured_products',
              'nucleation_density_cm2',
              i18n.language,
            )}`,
    },
    {
      label: t('experimentsV2.sections.results.measuredLayersCoverage'),
      value:
        result.layer_count == null && result.coverage_percent == null
          ? result.measured_layers_coverage
          : null,
    },
    {
      label: t('experimentsV2.sections.results.domainNucleationContinuity'),
      value:
        result.domain_size_um == null && result.nucleation_density_cm2 == null
          ? result.domain_nucleation_continuity
          : null,
    },
    {
      label: t('experimentsV2.sections.results.keySpectralMetrics'),
      value: hasMetricSummary(result.key_spectral_metrics) ? (
        <MetricSummary value={result.key_spectral_metrics} />
      ) : null,
    },
  ].filter((item) => item.value != null && item.value !== '')

  if (values.length === 0) return null
  return (
    <dl className="grid gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-[max-content_1fr]">
      {values.map((item) => (
        <div key={item.label} className="contents">
          <dt>{item.label}</dt>
          <dd className="min-w-0 break-words text-foreground [overflow-wrap:anywhere]">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function ResultAttachments({
  runId,
  recordId,
  method,
  readOnly,
}: {
  runId: string
  recordId: string
  method: string
  readOnly: boolean
}) {
  const { i18n, t } = useTranslation()
  const methodLabel = localizedOption(method, i18n.language)
  const { token, enabled } = useAuthGate()
  const queryClient = useQueryClient()
  const queryKey = ['v2-characterization-files', recordId, token]
  const filesQuery = useQuery({
    queryKey,
    queryFn: () =>
      listExperimentFiles(token, { characterizationRecordId: recordId }),
    enabled,
  })
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ['v2-run-audit', runId] }),
    ])
  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadExperimentFile(token, runId, {
        file,
        method,
        characterizationRecordId: recordId,
      }),
    onSuccess: () => void invalidate(),
    onError: (error) =>
      toast.error(
        resolveErrorMessage(
          error,
          t('experimentsV2.sections.results.attachmentUploadError'),
        ),
      ),
  })
  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => deleteExperimentFile(token, fileId),
    onSuccess: () => void invalidate(),
    onError: (error) =>
      toast.error(
        resolveErrorMessage(
          error,
          t('experimentsV2.sections.results.attachmentDeleteError'),
        ),
      ),
  })
  const [downloading, setDownloading] = useState<string | null>(null)
  const handleDownload = async (file: FileAssetRead) => {
    setDownloading(file.id)
    try {
      const response = await downloadExperimentFile(token, file.id)
      triggerBlobDownload(
        response.blob,
        response.filename || file.original_name,
      )
    } catch (error) {
      toast.error(
        resolveErrorMessage(
          error,
          t('experimentsV2.sections.results.attachmentDownloadError'),
        ),
      )
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      {filesQuery.isLoading ? <LoadingState /> : null}
      {filesQuery.isError ? (
        <QueryError
          message={t('experimentsV2.sections.results.filesLoadError')}
          onRetry={() => void filesQuery.refetch()}
        />
      ) : null}
      {(filesQuery.data?.items ?? []).map((file) => (
        <div
          key={file.id}
          className="flex flex-wrap items-center gap-2 text-muted-foreground"
        >
          <span className="min-w-0 flex-1 truncate text-foreground">
            {file.original_name}
          </span>
          <span>{formatBytes(file.size_bytes)}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={downloading === file.id}
            onClick={() => void handleDownload(file)}
          >
            <Download />
            {t('experimentsV2.sections.results.downloadAttachment')}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t(
                  'experimentsV2.sections.results.deleteAttachmentLabel',
                  { filename: file.original_name },
                )}
                disabled={readOnly || deleteMutation.isPending}
              >
                <Trash2 />
                {t('experimentsV2.sections.results.deleteAttachment')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('experimentsV2.sections.results.deleteAttachmentTitle')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    'experimentsV2.sections.results.deleteAttachmentDescription',
                    { filename: file.original_name },
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {t('experimentsV2.sections.results.cancelDeleteAttachment')}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate(file.id)}
                >
                  {t('experimentsV2.sections.results.confirmDeleteAttachment')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ))}
      <Input
        type="file"
        aria-label={t('experimentsV2.sections.results.uploadAttachmentLabel', {
          method: methodLabel,
        })}
        disabled={readOnly || uploadMutation.isPending || !method}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) uploadMutation.mutate(file)
          event.target.value = ''
        }}
      />
    </div>
  )
}
