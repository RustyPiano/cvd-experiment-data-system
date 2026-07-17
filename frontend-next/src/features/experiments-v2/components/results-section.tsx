// §7 表征 + 实测产物。表征记录（表征类型/仪器引用(instruments)+测试条件+原始数据占位）走
// characterization-records 端点；实测产物（观察现象多选词表/检出相多型堆垛/实测层数覆盖率/
// 畴尺寸/关键谱学指标）走 measured-products 端点。二者均以「样品」为关联主键（沿用 v1
// /samples 端点），故本段仅在编辑态（炉次已存在）可录入。
//
// ⚠️ 观察现象词表待俊杰对齐（待明确#5，一级『生长/未生长』+二级细分的粒度未定）；本段
// 多选项直接读字段元数据（observed_phenomena.options），词表改动只需改 field-source.yaml
// 后重跑 gen:fields，本文件无需改动。
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { resolveErrorMessage } from '@/shared/api/http-error'
import { useAuth } from '@/features/auth/use-auth'
import type { V2EntityRead } from '@/features/entity-library/api'
import { Button } from '@/components/ui/button'
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
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  CharacterizationRecordRead,
  MeasuredProductRead,
  SampleCreate,
  SampleRead,
} from '../api'
import {
  createCharacterizationRecord,
  createMeasuredProduct,
  createSample,
  deleteCharacterizationRecord,
  deleteMeasuredProduct,
  listCharacterizationRecords,
  listMeasuredProducts,
  listSamples,
  updateCharacterizationRecord,
  updateMeasuredProduct,
} from '../api'
import { getModuleFields, parseEnumOptions } from '../field-logic'
import { FieldLabel } from './field-bits'
import { EntityReferenceSelect } from './entity-reference-select'
import { ModuleCard } from './module-card'

/** 可手工新增的特殊样品类型；growth 由锁定工艺时自动生成。 */
const SAMPLE_ROLES: SampleCreate['role'][] = ['derived', 'control']

function characterizationMethods(): string[] {
  const field = getModuleFields('characterization').find(
    (item) => item.key === 'method_instrument',
  )
  return field ? (parseEnumOptions(field.input, field.options) ?? []) : []
}

function observedPhenomenaOptions(): string[] {
  const field = getModuleFields('measured_products').find(
    (item) => item.key === 'observed_phenomena',
  )
  return field ? (parseEnumOptions(field.input, field.options) ?? []) : []
}

function sampleLabel(sample: SampleRead): string {
  return sample.sample_code
    ? `${sample.sample_code} · ${sample.role}`
    : sample.role
}

/** 字段标签取自元数据（单一源），不进 locale。未知字段返回空串。 */
function fieldLabel(moduleKey: string, key: string): string {
  return (
    getModuleFields(moduleKey).find((item) => item.key === key)?.labelZh ?? ''
  )
}

/** 加样品控件：空态（带标签 + outline 按钮）与非空态（内联 + ghost 按钮）共用。 */
function AddSampleControls({
  layout,
  newRole,
  onRoleChange,
  onAdd,
  pending,
  disabled,
}: {
  layout: 'empty' | 'inline'
  newRole: SampleCreate['role']
  onRoleChange: (role: SampleCreate['role']) => void
  onAdd: () => void
  pending: boolean
  disabled: boolean
}) {
  const { t } = useTranslation()
  const roleSelect = (
    <Select
      value={newRole}
      onValueChange={(value) => onRoleChange(value as SampleCreate['role'])}
      disabled={disabled}
    >
      <SelectTrigger
        id="results-new-sample-role"
        className={layout === 'empty' ? 'w-48' : 'w-40'}
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
  )
  const addButton = (
    <Button
      type="button"
      variant={layout === 'empty' ? 'outline' : 'ghost'}
      size="sm"
      disabled={pending || disabled}
      onClick={onAdd}
    >
      {t('experimentsV2.sections.results.addSample')}
    </Button>
  )
  if (layout === 'inline') {
    return (
      <div className="flex items-end gap-2">
        {roleSelect}
        {addButton}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <FieldLabel
          htmlFor="results-new-sample-role"
          labelZh={t('experimentsV2.sections.results.sampleRole')}
          unit={null}
          required={false}
          r0={false}
        />
        {roleSelect}
      </div>
      {addButton}
    </div>
  )
}

export function ResultsSection({
  runId,
  readOnly = false,
}: {
  runId: string | undefined
  readOnly?: boolean
}) {
  const { t } = useTranslation()

  if (!runId) {
    return (
      <ModuleCard
        index="§7"
        title={t('experimentsV2.sections.results.title')}
        subtitle={t('experimentsV2.sections.results.subtitle')}
      >
        <p className="text-sm text-muted-foreground">
          {t('experimentsV2.sections.results.newModeHint')}
        </p>
      </ModuleCard>
    )
  }

  return (
    <ModuleCard
      index="§7"
      title={t('experimentsV2.sections.results.title')}
      subtitle={t('experimentsV2.sections.results.subtitle')}
    >
      <ResultsBody runId={runId} readOnly={readOnly} />
    </ModuleCard>
  )
}

/** 叶子组件各自 useAuth（本仓先例），不再逐层钻 token/enabled。 */
function useAuthGate(): { token: string; enabled: boolean } {
  const { session } = useAuth()
  const token = session.accessToken || ''
  return { token, enabled: session.isAuthenticated && !!token }
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

  const samplesQuery = useQuery({
    queryKey: ['v2-samples', runId, token],
    queryFn: () => listSamples(runId, token),
    enabled,
  })
  const samples = samplesQuery.data?.items ?? []
  const recordsQuery = useQuery({
    queryKey: ['v2-characterization', runId, token],
    queryFn: () => listCharacterizationRecords(runId, token),
    enabled,
  })
  const records = recordsQuery.data?.items ?? []
  const [selectedSampleId, setSelectedSampleId] = useState('')
  const activeSampleId =
    selectedSampleId || (samples.length > 0 ? samples[0].id : '')

  const invalidateSamples = () =>
    queryClient.invalidateQueries({ queryKey: ['v2-samples', runId, token] })

  const [newRole, setNewRole] = useState<SampleCreate['role']>('derived')
  const createSampleMutation = useMutation({
    mutationFn: () =>
      createSample(
        runId,
        { role: newRole, parent_sample_id: activeSampleId },
        token,
      ),
    onSuccess: (sample) => {
      setSelectedSampleId(sample.id)
      void invalidateSamples()
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
      <div className="flex flex-col gap-1.5">
        <FieldLabel
          htmlFor="results-active-sample"
          labelZh={t('experimentsV2.sections.results.sample')}
          unit={null}
          required={false}
          r0={false}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={activeSampleId || ''}
            onValueChange={setSelectedSampleId}
          >
            <SelectTrigger id="results-active-sample" className="w-64">
              <SelectValue
                placeholder={t('experimentsV2.form.selectPlaceholder')}
              />
            </SelectTrigger>
            <SelectContent>
              {samples.map((sample) => (
                <SelectItem key={sample.id} value={sample.id}>
                  {sampleLabel(sample)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AddSampleControls
            layout="inline"
            newRole={newRole}
            onRoleChange={setNewRole}
            onAdd={() => createSampleMutation.mutate()}
            pending={createSampleMutation.isPending}
            disabled={readOnly}
          />
        </div>
      </div>

      <Separator />
      <CharacterizationRecords
        runId={runId}
        samples={samples}
        defaultSampleId={activeSampleId}
        records={records}
        isLoading={recordsQuery.isLoading}
        isError={recordsQuery.isError}
        onRetry={() => void recordsQuery.refetch()}
        readOnly={readOnly}
      />

      <Separator />
      <MeasuredProducts
        key={activeSampleId}
        runId={runId}
        sampleId={activeSampleId}
        records={records}
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

function CharacterizationRecords({
  runId,
  samples,
  defaultSampleId,
  records,
  isLoading,
  isError,
  onRetry,
  readOnly,
}: {
  runId: string
  samples: SampleRead[]
  defaultSampleId: string
  records: CharacterizationRecordRead[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  readOnly: boolean
}) {
  const { t } = useTranslation()
  const { token } = useAuthGate()
  const queryClient = useQueryClient()
  const methods = useMemo(characterizationMethods, [])

  const [sampleId, setSampleId] = useState('')
  const [method, setMethod] = useState('')
  const [instrument, setInstrument] = useState<{
    id: string
    version: number | null
  }>({ id: '', version: null })
  const [conditions, setConditions] = useState('')
  const [editingId, setEditingId] = useState('')
  const effectiveSampleId = sampleId || defaultSampleId

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['v2-characterization', runId, token],
    })
  const invalidateRun = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['v2-experiment', runId, token],
      }),
      queryClient.invalidateQueries({
        queryKey: ['v2-experiment-list'],
      }),
    ])

  const saveMutation = useMutation({
    mutationFn: () =>
      editingId
        ? updateCharacterizationRecord(
            editingId,
            {
              method_instrument: method,
              test_conditions: conditions.trim() || null,
            },
            token,
          )
        : createCharacterizationRecord(
            runId,
            {
              sample_id: effectiveSampleId,
              instrument_id: instrument.id || null,
              instrument_version: instrument.id ? instrument.version : null,
              method_instrument: method,
              test_conditions: conditions.trim() || null,
            },
            token,
          ),
    onSuccess: () => {
      const updated = Boolean(editingId)
      setEditingId('')
      setMethod('')
      setInstrument({ id: '', version: null })
      setConditions('')
      void Promise.all([invalidate(), invalidateRun()])
      toast.success(
        t(
          updated
            ? 'experimentsV2.sections.results.recordUpdated'
            : 'experimentsV2.sections.results.recordAdded',
        ),
      )
    },
    onError: (error) =>
      toast.error(
        resolveErrorMessage(error, t('experimentsV2.form.saveError')),
      ),
  })

  const deleteMutation = useMutation({
    mutationFn: (recordId: string) =>
      deleteCharacterizationRecord(recordId, token),
    onSuccess: (_data, deletedId) => {
      if (editingId === deletedId) {
        setEditingId('')
        setSampleId('')
        setMethod('')
        setInstrument({ id: '', version: null })
        setConditions('')
      }
      void Promise.all([invalidate(), invalidateRun()])
    },
    onError: (error) =>
      toast.error(
        resolveErrorMessage(error, t('experimentsV2.form.saveError')),
      ),
  })

  const visibleRecords = records.filter(
    (record) => record.sample_id === defaultSampleId,
  )
  const cancelEdit = () => {
    setEditingId('')
    setSampleId('')
    setMethod('')
    setInstrument({ id: '', version: null })
    setConditions('')
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold text-foreground">
        {t('experimentsV2.sections.results.characterization')}
      </h3>

      {isLoading ? <LoadingState /> : null}
      {isError ? (
        <QueryError
          message={t('experimentsV2.sections.results.recordsLoadError')}
          onRetry={onRetry}
        />
      ) : null}

      {!isLoading && !isError && visibleRecords.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {visibleRecords.map((record) => (
            <CharacterizationRecordItem
              key={record.id}
              runId={runId}
              record={record}
              sampleCode={
                samples.find((sample) => sample.id === record.sample_id)
                  ?.sample_code ?? ''
              }
              readOnly={readOnly}
              recordDeletePending={deleteMutation.isPending}
              onEditRecord={() => {
                setEditingId(record.id)
                setSampleId(record.sample_id)
                setMethod(record.method_instrument ?? '')
                setConditions(record.test_conditions ?? '')
              }}
              onDeleteRecord={() => deleteMutation.mutate(record.id)}
            />
          ))}
        </ul>
      ) : !isLoading && !isError ? (
        <p className="text-sm text-muted-foreground">
          {t('experimentsV2.sections.results.noRecords')}
        </p>
      ) : null}

      <div className="grid gap-4 rounded-md border border-dashed border-border p-4 sm:grid-cols-2">
        {editingId ? (
          <p className="sm:col-span-2 text-sm font-medium text-primary">
            {t('experimentsV2.sections.results.editing')}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <FieldLabel
            htmlFor="characterization-sample"
            labelZh={t('experimentsV2.sections.results.sample')}
            unit={null}
            required
            r0={false}
          />
          <Select
            value={effectiveSampleId || ''}
            onValueChange={setSampleId}
            disabled={readOnly || Boolean(editingId)}
          >
            <SelectTrigger id="characterization-sample" className="w-full">
              <SelectValue
                placeholder={t('experimentsV2.form.selectPlaceholder')}
              />
            </SelectTrigger>
            <SelectContent>
              {samples.map((sample) => (
                <SelectItem key={sample.id} value={sample.id}>
                  {sampleLabel(sample)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel
            htmlFor="characterization-method"
            labelZh={t('experimentsV2.sections.results.method')}
            unit={null}
            required={false}
            r0={false}
          />
          <Select value={method} onValueChange={setMethod} disabled={readOnly}>
            <SelectTrigger id="characterization-method" className="w-full">
              <SelectValue
                placeholder={t('experimentsV2.form.selectPlaceholder')}
              />
            </SelectTrigger>
            <SelectContent>
              {methods.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel
            htmlFor="characterization-instrument"
            labelZh={t('experimentsV2.sections.results.instrument')}
            unit={null}
            required={false}
            r0={false}
          />
          <EntityReferenceSelect
            triggerId="characterization-instrument"
            kind="instrument"
            value={instrument.id}
            onChange={(id, entity: V2EntityRead | null) =>
              setInstrument({
                id,
                version: entity?.latest_version?.version ?? null,
              })
            }
            disabled={readOnly || Boolean(editingId)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel
            htmlFor="characterization-conditions"
            labelZh={fieldLabel('characterization', 'test_conditions')}
            unit={null}
            required={false}
            r0={false}
          />
          <Input
            id="characterization-conditions"
            value={conditions}
            onChange={(event) => setConditions(event.target.value)}
            autoComplete="off"
            placeholder={t('experimentsV2.form.inputPlaceholder')}
            disabled={readOnly}
          />
        </div>

        <div className="sm:col-span-2 flex justify-end gap-2">
          {editingId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelEdit}
            >
              {t('actions.cancel')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saveMutation.isPending || !effectiveSampleId || readOnly}
            onClick={() => saveMutation.mutate()}
          >
            {editingId
              ? t('actions.save')
              : t('experimentsV2.sections.results.addRecord')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KiB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB`
}

function CharacterizationRecordItem({
  runId,
  record,
  sampleCode,
  readOnly,
  recordDeletePending,
  onEditRecord,
  onDeleteRecord,
}: {
  runId: string
  record: {
    id: string
    sample_id: string
    method_instrument: string | null
    test_conditions: string | null
  }
  sampleCode: string
  readOnly: boolean
  recordDeletePending: boolean
  onEditRecord: () => void
  onDeleteRecord: () => void
}) {
  const { t } = useTranslation()
  const { token, enabled } = useAuthGate()
  const queryClient = useQueryClient()
  const method = record.method_instrument || ''
  const queryKey = ['v2-characterization-files', record.id, token]
  const filesQuery = useQuery({
    queryKey,
    queryFn: () =>
      listExperimentFiles(token, { characterizationRecordId: record.id }),
    enabled,
  })
  const invalidate = () => queryClient.invalidateQueries({ queryKey })
  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadExperimentFile(token, runId, {
        file,
        method,
        characterizationRecordId: record.id,
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
      const payload = await downloadExperimentFile(token, file.id)
      triggerBlobDownload(payload.blob, payload.filename || file.original_name)
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
    <li className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-foreground">
          {method || t('experimentsV2.sections.results.untitledRecord')}
          {sampleCode ? (
            <span className="text-muted-foreground"> · {sampleCode}</span>
          ) : null}
          {record.test_conditions ? (
            <span className="text-muted-foreground">
              {' '}
              · {record.test_conditions}
            </span>
          ) : null}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('experimentsV2.sections.results.editRecordLabel', {
              method:
                method || t('experimentsV2.sections.results.untitledRecord'),
            })}
            disabled={readOnly}
            onClick={onEditRecord}
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
                  'experimentsV2.sections.results.deleteRecordLabel',
                  {
                    method:
                      method ||
                      t('experimentsV2.sections.results.untitledRecord'),
                  },
                )}
                disabled={recordDeletePending || readOnly}
              >
                <Trash2 />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('experimentsV2.sections.results.deleteRecordTitle')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('experimentsV2.sections.results.deleteRecordDescription')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={onDeleteRecord}>
                  {t('experimentsV2.sections.results.confirmDeleteRecord')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {filesQuery.isLoading ? <LoadingState /> : null}
      {filesQuery.isError ? (
        <QueryError
          message={t('experimentsV2.sections.results.filesLoadError')}
          onRetry={() => void filesQuery.refetch()}
        />
      ) : null}
      {!filesQuery.isLoading &&
        !filesQuery.isError &&
        (filesQuery.data?.items ?? []).map((file) => (
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
              aria-label={t(
                'experimentsV2.sections.results.downloadAttachmentLabel',
                { filename: file.original_name },
              )}
              disabled={downloading === file.id}
              onClick={() => void handleDownload(file)}
            >
              <Download data-icon="inline-start" />
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
                  disabled={deleteMutation.isPending || readOnly}
                >
                  <Trash2 data-icon="inline-start" />
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
                    {t(
                      'experimentsV2.sections.results.confirmDeleteAttachment',
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ))}

      <Input
        type="file"
        aria-label={t('experimentsV2.sections.results.uploadAttachmentLabel', {
          method: method || t('experimentsV2.sections.results.untitledRecord'),
        })}
        disabled={readOnly || uploadMutation.isPending || !method}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) uploadMutation.mutate(file)
          event.target.value = ''
        }}
      />
    </li>
  )
}

function MeasuredProducts({
  runId,
  sampleId,
  records,
  readOnly,
}: {
  runId: string
  sampleId: string
  records: CharacterizationRecordRead[]
  readOnly: boolean
}) {
  const { t } = useTranslation()
  const { token, enabled } = useAuthGate()
  const queryClient = useQueryClient()
  const phenomena = useMemo(observedPhenomenaOptions, [])

  const productsQuery = useQuery({
    queryKey: ['v2-measured', sampleId, token],
    queryFn: () => listMeasuredProducts(sampleId, token),
    enabled: enabled && Boolean(sampleId),
  })
  const products = productsQuery.data?.items ?? []

  const [selected, setSelected] = useState<string[]>([])
  const [phaseStacking, setPhaseStacking] = useState('')
  const [layersCoverage, setLayersCoverage] = useState('')
  const [domain, setDomain] = useState('')
  const [spectral, setSpectral] = useState('')
  const [characterizationRecordId, setCharacterizationRecordId] = useState('')
  const [editingId, setEditingId] = useState('')

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['v2-measured', sampleId, token],
    })
  const invalidateRun = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['v2-experiment', runId, token],
      }),
      queryClient.invalidateQueries({
        queryKey: ['v2-experiment-list'],
      }),
    ])

  const togglePhenomenon = (option: string, checked: boolean) =>
    setSelected((prev) =>
      checked ? [...prev, option] : prev.filter((item) => item !== option),
    )

  const saveMutation = useMutation({
    mutationFn: () =>
      (editingId ? updateMeasuredProduct : createMeasuredProduct)(
        editingId || sampleId,
        {
          characterization_record_id: characterizationRecordId || null,
          observed_phenomena: selected.length > 0 ? selected : null,
          detected_phase_stacking: phaseStacking.trim() || null,
          measured_layers_coverage: layersCoverage.trim() || null,
          domain_nucleation_continuity: domain.trim() || null,
          key_spectral_metrics: spectral.trim()
            ? { note: spectral.trim() }
            : null,
        },
        token,
      ),
    onSuccess: () => {
      const updated = Boolean(editingId)
      setEditingId('')
      setCharacterizationRecordId('')
      setSelected([])
      setPhaseStacking('')
      setLayersCoverage('')
      setDomain('')
      setSpectral('')
      void Promise.all([invalidate(), invalidateRun()])
      toast.success(
        t(
          updated
            ? 'experimentsV2.sections.results.productUpdated'
            : 'experimentsV2.sections.results.productAdded',
        ),
      )
    },
    onError: (error) =>
      toast.error(
        resolveErrorMessage(error, t('experimentsV2.form.saveError')),
      ),
  })

  const deleteMutation = useMutation({
    mutationFn: (productId: string) => deleteMeasuredProduct(productId, token),
    onSuccess: (_data, deletedId) => {
      if (editingId === deletedId) {
        setEditingId('')
        setCharacterizationRecordId('')
        setSelected([])
        setPhaseStacking('')
        setLayersCoverage('')
        setDomain('')
        setSpectral('')
      }
      void Promise.all([invalidate(), invalidateRun()])
    },
    onError: (error) =>
      toast.error(
        resolveErrorMessage(error, t('experimentsV2.form.saveError')),
      ),
  })

  const spectralNote = (value: unknown): string => {
    if (value && typeof value === 'object' && 'note' in value) {
      const note = (value as { note?: unknown }).note
      return typeof note === 'string' ? note : ''
    }
    return ''
  }

  const editProduct = (product: MeasuredProductRead) => {
    setEditingId(product.id)
    setCharacterizationRecordId(product.characterization_record_id ?? '')
    setSelected(product.observed_phenomena ?? [])
    setPhaseStacking(product.detected_phase_stacking ?? '')
    setLayersCoverage(product.measured_layers_coverage ?? '')
    setDomain(product.domain_nucleation_continuity ?? '')
    setSpectral(spectralNote(product.key_spectral_metrics))
  }
  const cancelEdit = () => {
    setEditingId('')
    setCharacterizationRecordId('')
    setSelected([])
    setPhaseStacking('')
    setLayersCoverage('')
    setDomain('')
    setSpectral('')
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold text-foreground">
        {t('experimentsV2.sections.results.measured')}
      </h3>

      {productsQuery.isLoading ? <LoadingState /> : null}
      {productsQuery.isError ? (
        <QueryError
          message={t('experimentsV2.sections.results.productsLoadError')}
          onRetry={() => void productsQuery.refetch()}
        />
      ) : null}

      {!productsQuery.isLoading &&
      !productsQuery.isError &&
      products.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {products.map((product) => (
            <li
              key={product.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="text-foreground">
                {(product.observed_phenomena ?? []).join('、') ||
                  product.detected_phase_stacking ||
                  spectralNote(product.key_spectral_metrics) ||
                  t('experimentsV2.sections.results.untitledProduct')}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t(
                    'experimentsV2.sections.results.editProductLabel',
                  )}
                  disabled={readOnly}
                  onClick={() => editProduct(product)}
                >
                  <Pencil className="size-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t(
                        'experimentsV2.sections.results.deleteProductLabel',
                      )}
                      disabled={deleteMutation.isPending || readOnly}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t('experimentsV2.sections.results.deleteProductTitle')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t(
                          'experimentsV2.sections.results.deleteProductDescription',
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t('actions.cancel')}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate(product.id)}
                      >
                        {t(
                          'experimentsV2.sections.results.confirmDeleteProduct',
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ul>
      ) : !productsQuery.isLoading && !productsQuery.isError ? (
        <p className="text-sm text-muted-foreground">
          {t('experimentsV2.sections.results.noProducts')}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 rounded-md border border-dashed border-border p-4">
        {editingId ? (
          <p className="text-sm font-medium text-primary">
            {t('experimentsV2.sections.results.editing')}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <FieldLabel
            htmlFor="measured-characterization-record"
            labelZh={t('experimentsV2.sections.results.characterizationRecord')}
            unit={null}
            required={false}
            r0={false}
          />
          <Select
            value={characterizationRecordId}
            onValueChange={setCharacterizationRecordId}
            disabled={readOnly}
          >
            <SelectTrigger
              id="measured-characterization-record"
              className="w-full"
              aria-label={t(
                'experimentsV2.sections.results.characterizationRecord',
              )}
            >
              <SelectValue
                placeholder={t('experimentsV2.form.selectPlaceholder')}
              />
            </SelectTrigger>
            <SelectContent>
              {records
                .filter((record) => record.sample_id === sampleId)
                .map((record) => (
                  <SelectItem key={record.id} value={record.id}>
                    {record.method_instrument ||
                      t('experimentsV2.sections.results.untitledRecord')}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <FieldLabel
            htmlFor={phenomena.length ? 'measured-phenomenon-0' : undefined}
            labelZh={fieldLabel('measured_products', 'observed_phenomena')}
            unit={null}
            required={false}
            r0={false}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {phenomena.map((option, index) => (
              <label
                key={option}
                className="flex items-center gap-2 text-sm text-foreground"
              >
                <Checkbox
                  id={`measured-phenomenon-${index}`}
                  checked={selected.includes(option)}
                  disabled={readOnly}
                  onCheckedChange={(checked) =>
                    togglePhenomenon(option, checked === true)
                  }
                />
                {option}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="measured-phase-stacking"
              labelZh={fieldLabel(
                'measured_products',
                'detected_phase_stacking',
              )}
              unit={null}
              required={false}
              r0={false}
            />
            <Input
              id="measured-phase-stacking"
              value={phaseStacking}
              onChange={(event) => setPhaseStacking(event.target.value)}
              autoComplete="off"
              placeholder={t('experimentsV2.form.inputPlaceholder')}
              disabled={readOnly}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="measured-layers-coverage"
              labelZh={fieldLabel(
                'measured_products',
                'measured_layers_coverage',
              )}
              unit={null}
              required={false}
              r0={false}
            />
            <Input
              id="measured-layers-coverage"
              value={layersCoverage}
              onChange={(event) => setLayersCoverage(event.target.value)}
              autoComplete="off"
              placeholder={t('experimentsV2.form.inputPlaceholder')}
              disabled={readOnly}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="measured-domain"
              labelZh={fieldLabel(
                'measured_products',
                'domain_nucleation_continuity',
              )}
              unit={null}
              required={false}
              r0={false}
            />
            <Input
              id="measured-domain"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              autoComplete="off"
              placeholder={t('experimentsV2.form.inputPlaceholder')}
              disabled={readOnly}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="measured-spectral"
              labelZh={fieldLabel('measured_products', 'key_spectral_metrics')}
              unit={null}
              required={false}
              r0={false}
            />
            <Textarea
              id="measured-spectral"
              value={spectral}
              onChange={(event) => setSpectral(event.target.value)}
              rows={2}
              placeholder={t('experimentsV2.form.inputPlaceholder')}
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          {editingId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelEdit}
            >
              {t('actions.cancel')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saveMutation.isPending || !sampleId || readOnly}
            onClick={() => saveMutation.mutate()}
          >
            {editingId
              ? t('actions.save')
              : t('experimentsV2.sections.results.addProduct')}
          </Button>
        </div>
      </div>
    </div>
  )
}
