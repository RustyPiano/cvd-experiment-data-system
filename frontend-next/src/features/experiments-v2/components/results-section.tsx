import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Pencil, Trash2 } from 'lucide-react'
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
import { localizedFieldLabel, localizedOption } from '@/shared/field-i18n'
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
import { ModuleCard } from './module-card'

const SAMPLE_ROLES: SampleCreate['role'][] = ['derived', 'control']
type ResultKind = V2ResultWrite['kind']

function fieldOptions(moduleKey: string, key: string): string[] {
  const field = getModuleFields(moduleKey).find((item) => item.key === key)
  return field ? (parseEnumOptions(field.input, field.options) ?? []) : []
}

function fieldLabel(moduleKey: string, key: string, language: string): string {
  const field = getModuleFields(moduleKey).find((item) => item.key === key)
  return field ? localizedFieldLabel(field, language) : ''
}

function sampleLabel(sample: SampleRead, roleLabel: string): string {
  return sample.sample_code ? `${sample.sample_code} · ${roleLabel}` : roleLabel
}

function spectralNote(value: unknown): string {
  if (value && typeof value === 'object' && 'note' in value) {
    const note = (value as { note?: unknown }).note
    return typeof note === 'string' ? note : ''
  }
  return ''
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
}: {
  runId: string | undefined
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  return (
    <ModuleCard
      title={t('experimentsV2.sections.results.title')}
      subtitle={t('experimentsV2.sections.results.subtitle')}
    >
      {runId ? (
        <ResultsBody runId={runId} readOnly={readOnly} />
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
}: {
  runId: string
  readOnly: boolean
}) {
  const { t } = useTranslation()
  const { token, enabled } = useAuthGate()
  const queryClient = useQueryClient()
  const [selectedSampleId, setSelectedSampleId] = useState('')
  const [newRole, setNewRole] = useState<SampleCreate['role']>('derived')

  const samplesQuery = useQuery({
    queryKey: ['v2-samples', runId, token],
    queryFn: () => listSamples(runId, token),
    enabled,
  })
  const samples = samplesQuery.data?.items ?? []
  const activeSampleId =
    selectedSampleId || (samples.length > 0 ? samples[0].id : '')

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
          <Select value={activeSampleId} onValueChange={setSelectedSampleId}>
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
          onClick={() => createSampleMutation.mutate()}
        >
          {t('experimentsV2.sections.results.addSample')}
        </Button>
      </div>

      <SampleResults
        key={activeSampleId}
        runId={runId}
        sampleId={activeSampleId}
        readOnly={readOnly}
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
}: {
  runId: string
  sampleId: string
  readOnly: boolean
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
  }>({ id: '', version: null })
  const [method, setMethod] = useState('')
  const [conditions, setConditions] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [phaseStacking, setPhaseStacking] = useState('')
  const [layersCoverage, setLayersCoverage] = useState('')
  const [domain, setDomain] = useState('')
  const [spectral, setSpectral] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([])
  const [editingId, setEditingId] = useState('')

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
    setInstrument({ id: '', version: null })
    setMethod('')
    setConditions('')
    setSelected([])
    setPhaseStacking('')
    setLayersCoverage('')
    setDomain('')
    setSpectral('')
    setPendingAttachments([])
    setEditingId('')
  }

  const payload = (): V2ResultWrite => ({
    kind,
    instrument_id:
      kind === 'characterization' && instrument.id ? instrument.id : null,
    instrument_version:
      kind === 'characterization' && instrument.id ? instrument.version : null,
    method_instrument: kind === 'characterization' ? method : null,
    test_conditions:
      kind === 'characterization' ? conditions.trim() || null : null,
    observed_phenomena: selected.length > 0 ? selected : null,
    detected_phase_stacking:
      kind === 'characterization' ? phaseStacking.trim() || null : null,
    measured_layers_coverage:
      kind === 'characterization' ? layersCoverage.trim() || null : null,
    domain_nucleation_continuity:
      kind === 'characterization' ? domain.trim() || null : null,
    key_spectral_metrics:
      kind === 'characterization' && spectral.trim()
        ? { note: spectral.trim() }
        : null,
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      editingId
        ? updateResult(editingId, payload(), token)
        : createResult(sampleId, payload(), token),
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
    setPendingAttachments([])
    setEditingId(result.id)
    setKind(result.kind)
    setInstrument({
      id: result.instrument_id ?? '',
      version: result.instrument_version ?? null,
    })
    setMethod(result.method_instrument ?? '')
    setConditions(result.test_conditions ?? '')
    setSelected(result.observed_phenomena ?? [])
    setPhaseStacking(result.detected_phase_stacking ?? '')
    setLayersCoverage(result.measured_layers_coverage ?? '')
    setDomain(result.domain_nucleation_continuity ?? '')
    setSpectral(spectralNote(result.key_spectral_metrics))
  }

  const togglePhenomenon = (option: string, checked: boolean) =>
    setSelected((current) =>
      checked
        ? [...new Set([...current, option])]
        : current.filter((item) => item !== option),
    )

  const canSave =
    !readOnly &&
    !saveMutation.isPending &&
    (kind === 'characterization' ? Boolean(method) : selected.length > 0)

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
            onValueChange={(value) => setKind(value as ResultKind)}
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
                onValueChange={setMethod}
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
                  {methods.map((option) => (
                    <SelectItem key={option} value={option}>
                      {localizedOption(option, i18n.language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                onChange={(id, entity: V2EntityRead | null) =>
                  setInstrument({
                    id,
                    version: entity?.latest_version?.version ?? null,
                  })
                }
                disabled={readOnly}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="result-conditions"
                labelZh={fieldLabel(
                  'characterization',
                  'test_conditions',
                  i18n.language,
                )}
                unit={null}
                required={false}
                r0={false}
              />
              <Input
                id="result-conditions"
                value={conditions}
                onChange={(event) => setConditions(event.target.value)}
                disabled={readOnly}
              />
            </div>
          </>
        ) : null}

        <div className="sm:col-span-2 flex flex-col gap-2">
          <FieldLabel
            labelZh={fieldLabel(
              'measured_products',
              'observed_phenomena',
              i18n.language,
            )}
            unit={null}
            required={kind === 'direct_observation'}
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
        </div>

        {kind === 'characterization' ? (
          <>
            <ResultTextField
              id="result-phase"
              label={fieldLabel(
                'measured_products',
                'detected_phase_stacking',
                i18n.language,
              )}
              value={phaseStacking}
              onChange={setPhaseStacking}
              disabled={readOnly}
            />
            <ResultTextField
              id="result-layers"
              label={fieldLabel(
                'measured_products',
                'measured_layers_coverage',
                i18n.language,
              )}
              value={layersCoverage}
              onChange={setLayersCoverage}
              disabled={readOnly}
            />
            <ResultTextField
              id="result-domain"
              label={fieldLabel(
                'measured_products',
                'domain_nucleation_continuity',
                i18n.language,
              )}
              value={domain}
              onChange={setDomain}
              disabled={readOnly}
            />
            <ResultTextField
              id="result-spectral"
              label={fieldLabel(
                'measured_products',
                'key_spectral_metrics',
                i18n.language,
              )}
              value={spectral}
              onChange={setSpectral}
              disabled={readOnly}
            />
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
                  onChange={(event) =>
                    setPendingAttachments(Array.from(event.target.files ?? []))
                  }
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
  const title =
    result.kind === 'characterization'
      ? localizedOption(result.method_instrument || '', i18n.language) ||
        t('experimentsV2.sections.results.characterizationResult')
      : (result.observed_phenomena ?? [])
          .map((value) => localizedOption(value, i18n.language))
          .join(' · ') || t('experimentsV2.sections.results.directObservation')
  return (
    <li className="flex flex-col gap-3 rounded-md border border-border p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">{title}</p>
          {result.test_conditions ? (
            <p className="text-muted-foreground">{result.test_conditions}</p>
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
      <ResultSummary result={result} />
      {result.kind === 'characterization' &&
      result.characterization_record_id ? (
        <ResultAttachments
          runId={runId}
          recordId={result.characterization_record_id}
          method={result.method_instrument || ''}
          readOnly={readOnly}
        />
      ) : null}
    </li>
  )
}

function ResultSummary({ result }: { result: V2ResultRead }) {
  const { i18n, t } = useTranslation()
  const values = [
    {
      label: t('experimentsV2.sections.results.observedPhenomena'),
      value: (result.observed_phenomena ?? [])
        .map((value) => localizedOption(value, i18n.language))
        .join(' · '),
    },
    {
      label: t('experimentsV2.sections.results.detectedPhaseStacking'),
      value: result.detected_phase_stacking,
    },
    {
      label: t('experimentsV2.sections.results.measuredLayersCoverage'),
      value: result.measured_layers_coverage,
    },
    {
      label: t('experimentsV2.sections.results.domainNucleationContinuity'),
      value: result.domain_nucleation_continuity,
    },
    {
      label: t('experimentsV2.sections.results.keySpectralMetrics'),
      value: spectralNote(result.key_spectral_metrics),
    },
  ].filter((item) => item.value)

  if (values.length === 0) return null
  return (
    <dl className="grid gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-[max-content_1fr]">
      {values.map((item) => (
        <div key={item.label} className="contents">
          <dt>{item.label}</dt>
          <dd className="text-foreground">{item.value}</dd>
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
  const { t } = useTranslation()
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
          method,
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
