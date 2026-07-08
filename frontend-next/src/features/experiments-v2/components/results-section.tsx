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
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { resolveErrorMessage } from '@/shared/api/http-error'
import { useAuth } from '@/features/auth/use-auth'
import type { V2EntityRead } from '@/features/entity-library/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SampleCreate, SampleRead } from '../api'
import {
  createCharacterizationRecord,
  createMeasuredProduct,
  createSample,
  deleteCharacterizationRecord,
  deleteMeasuredProduct,
  listCharacterizationRecords,
  listMeasuredProducts,
  listSamples,
} from '../api'
import { getModuleFields, parseEnumOptions } from '../field-logic'
import { FieldLabel } from './field-bits'
import { EntityReferenceSelect } from './entity-reference-select'
import { ModuleCard } from './module-card'

/** 样品角色词表（后端 SampleRole 枚举，无对应字段元数据，故在此列举，文案走 i18n）。 */
const SAMPLE_ROLES: SampleCreate['role'][] = [
  'top',
  'bottom',
  'product',
  'control',
]

function characterizationMethods(): string[] {
  const field = getModuleFields('characterization').find(
    (item) => item.key === 'method_instrument',
  )
  return parseEnumOptions(field?.options ?? null) ?? []
}

function observedPhenomenaOptions(): string[] {
  const field = getModuleFields('measured_products').find(
    (item) => item.key === 'observed_phenomena',
  )
  return parseEnumOptions(field?.options ?? null) ?? []
}

function sampleLabel(sample: SampleRead): string {
  return sample.sample_code
    ? `${sample.sample_code} · ${sample.role}`
    : sample.role
}

/** 字段标签取自元数据（单一源），不进 locale。未知字段返回空串。 */
function fieldLabel(moduleKey: string, key: string): string {
  return getModuleFields(moduleKey).find((item) => item.key === key)?.labelZh ?? ''
}

/** 加样品控件：空态（带标签 + outline 按钮）与非空态（内联 + ghost 按钮）共用。 */
function AddSampleControls({
  layout,
  newRole,
  onRoleChange,
  onAdd,
  pending,
}: {
  layout: 'empty' | 'inline'
  newRole: SampleCreate['role']
  onRoleChange: (role: SampleCreate['role']) => void
  onAdd: () => void
  pending: boolean
}) {
  const { t } = useTranslation()
  const roleSelect = (
    <Select
      value={newRole}
      onValueChange={(value) => onRoleChange(value as SampleCreate['role'])}
    >
      <SelectTrigger className={layout === 'empty' ? 'w-48' : 'w-40'}>
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
      disabled={pending}
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

export function ResultsSection({ runId }: { runId: string | undefined }) {
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
      <ResultsBody runId={runId} />
    </ModuleCard>
  )
}

/** 叶子组件各自 useAuth（本仓先例），不再逐层钻 token/enabled。 */
function useAuthGate(): { token: string; enabled: boolean } {
  const { session } = useAuth()
  const token = session.accessToken || ''
  return { token, enabled: session.isAuthenticated && !!token }
}

function ResultsBody({ runId }: { runId: string }) {
  const { t } = useTranslation()
  const { token, enabled } = useAuthGate()
  const queryClient = useQueryClient()

  const samplesQuery = useQuery({
    queryKey: ['v2-samples', runId, token],
    queryFn: () => listSamples(runId, token),
    enabled,
  })
  const samples = samplesQuery.data?.items ?? []
  const [selectedSampleId, setSelectedSampleId] = useState('')
  const activeSampleId =
    selectedSampleId || (samples.length > 0 ? samples[0].id : '')

  const invalidateSamples = () =>
    queryClient.invalidateQueries({ queryKey: ['v2-samples', runId, token] })

  const [newRole, setNewRole] = useState<SampleCreate['role']>('product')
  const createSampleMutation = useMutation({
    mutationFn: () => createSample(runId, { role: newRole }, token),
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

  if (samples.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {t('experimentsV2.sections.results.noSamples')}
        </p>
        <AddSampleControls
          layout="empty"
          newRole={newRole}
          onRoleChange={setNewRole}
          onAdd={() => createSampleMutation.mutate()}
          pending={createSampleMutation.isPending}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <FieldLabel
          labelZh={t('experimentsV2.sections.results.sample')}
          unit={null}
          required={false}
          r0={false}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={activeSampleId || undefined}
            onValueChange={setSelectedSampleId}
          >
            <SelectTrigger className="w-64">
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
          />
        </div>
      </div>

      <Separator />
      <CharacterizationRecords
        runId={runId}
        samples={samples}
        defaultSampleId={activeSampleId}
      />

      <Separator />
      <MeasuredProducts sampleId={activeSampleId} />
    </div>
  )
}

function CharacterizationRecords({
  runId,
  samples,
  defaultSampleId,
}: {
  runId: string
  samples: SampleRead[]
  defaultSampleId: string
}) {
  const { t } = useTranslation()
  const { token, enabled } = useAuthGate()
  const queryClient = useQueryClient()
  const methods = useMemo(characterizationMethods, [])

  const recordsQuery = useQuery({
    queryKey: ['v2-characterization', runId, token],
    queryFn: () => listCharacterizationRecords(runId, token),
    enabled,
  })
  const records = recordsQuery.data?.items ?? []

  const [sampleId, setSampleId] = useState('')
  const [method, setMethod] = useState('')
  const [instrument, setInstrument] = useState<{
    id: string
    version: number | null
  }>({ id: '', version: null })
  const [conditions, setConditions] = useState('')
  const effectiveSampleId = sampleId || defaultSampleId

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['v2-characterization', runId, token],
    })

  const createMutation = useMutation({
    mutationFn: () =>
      createCharacterizationRecord(
        runId,
        {
          sample_id: effectiveSampleId,
          instrument_id: instrument.id || null,
          instrument_version: instrument.id ? instrument.version : null,
          method_instrument: method || null,
          test_conditions: conditions.trim() || null,
        },
        token,
      ),
    onSuccess: () => {
      setMethod('')
      setInstrument({ id: '', version: null })
      setConditions('')
      void invalidate()
      toast.success(t('experimentsV2.sections.results.recordAdded'))
    },
    onError: (error) =>
      toast.error(
        resolveErrorMessage(error, t('experimentsV2.form.saveError')),
      ),
  })

  const deleteMutation = useMutation({
    mutationFn: (recordId: string) =>
      deleteCharacterizationRecord(recordId, token),
    onSuccess: () => void invalidate(),
    onError: (error) =>
      toast.error(
        resolveErrorMessage(error, t('experimentsV2.form.saveError')),
      ),
  })

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold text-foreground">
        {t('experimentsV2.sections.results.characterization')}
      </h3>

      {records.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {records.map((record) => (
            <li
              key={record.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="text-foreground">
                {record.method_instrument ||
                  t('experimentsV2.sections.results.untitledRecord')}
                {record.test_conditions ? (
                  <span className="text-muted-foreground">
                    {' '}
                    · {record.test_conditions}
                  </span>
                ) : null}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('experimentsV2.form.removeItem')}
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(record.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('experimentsV2.sections.results.noRecords')}
        </p>
      )}

      <div className="grid gap-4 rounded-md border border-dashed border-border p-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <FieldLabel
            labelZh={t('experimentsV2.sections.results.sample')}
            unit={null}
            required
            r0={false}
          />
          <Select
            value={effectiveSampleId || undefined}
            onValueChange={setSampleId}
          >
            <SelectTrigger className="w-full">
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
            labelZh={t('experimentsV2.sections.results.method')}
            unit={null}
            required={false}
            r0={false}
          />
          <Select value={method || undefined} onValueChange={setMethod}>
            <SelectTrigger className="w-full">
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
            labelZh={t('experimentsV2.sections.results.instrument')}
            unit={null}
            required={false}
            r0={false}
          />
          <EntityReferenceSelect
            kind="instrument"
            value={instrument.id}
            onChange={(id, entity: V2EntityRead | null) =>
              setInstrument({
                id,
                version: entity?.latest_version?.version ?? null,
              })
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel
            labelZh={fieldLabel('characterization', 'test_conditions')}
            unit={null}
            required={false}
            r0={false}
          />
          <Input
            value={conditions}
            onChange={(event) => setConditions(event.target.value)}
            autoComplete="off"
            placeholder={t('experimentsV2.form.inputPlaceholder')}
          />
        </div>

        <div className="sm:col-span-2">
          <p className="text-xs text-muted-foreground">
            {t('experimentsV2.sections.results.rawDataHint')}
          </p>
        </div>

        <div className="sm:col-span-2 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={createMutation.isPending || !effectiveSampleId}
            onClick={() => createMutation.mutate()}
          >
            {t('experimentsV2.sections.results.addRecord')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function MeasuredProducts({ sampleId }: { sampleId: string }) {
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

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['v2-measured', sampleId, token],
    })

  const togglePhenomenon = (option: string, checked: boolean) =>
    setSelected((prev) =>
      checked ? [...prev, option] : prev.filter((item) => item !== option),
    )

  const createMutation = useMutation({
    mutationFn: () =>
      createMeasuredProduct(
        sampleId,
        {
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
      setSelected([])
      setPhaseStacking('')
      setLayersCoverage('')
      setDomain('')
      setSpectral('')
      void invalidate()
      toast.success(t('experimentsV2.sections.results.productAdded'))
    },
    onError: (error) =>
      toast.error(
        resolveErrorMessage(error, t('experimentsV2.form.saveError')),
      ),
  })

  const deleteMutation = useMutation({
    mutationFn: (productId: string) => deleteMeasuredProduct(productId, token),
    onSuccess: () => void invalidate(),
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

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold text-foreground">
        {t('experimentsV2.sections.results.measured')}
      </h3>

      {products.length > 0 ? (
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('experimentsV2.form.removeItem')}
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(product.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('experimentsV2.sections.results.noProducts')}
        </p>
      )}

      <div className="flex flex-col gap-4 rounded-md border border-dashed border-border p-4">
        <div className="flex flex-col gap-2">
          <FieldLabel
            labelZh={fieldLabel('measured_products', 'observed_phenomena')}
            unit={null}
            required={false}
            r0={false}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-2">
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
                />
                {option}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <FieldLabel
              labelZh={fieldLabel('measured_products', 'detected_phase_stacking')}
              unit={null}
              required={false}
              r0={false}
            />
            <Input
              value={phaseStacking}
              onChange={(event) => setPhaseStacking(event.target.value)}
              autoComplete="off"
              placeholder={t('experimentsV2.form.inputPlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel
              labelZh={fieldLabel('measured_products', 'measured_layers_coverage')}
              unit={null}
              required={false}
              r0={false}
            />
            <Input
              value={layersCoverage}
              onChange={(event) => setLayersCoverage(event.target.value)}
              autoComplete="off"
              placeholder={t('experimentsV2.form.inputPlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel
              labelZh={fieldLabel('measured_products', 'domain_nucleation_continuity')}
              unit={null}
              required={false}
              r0={false}
            />
            <Input
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              autoComplete="off"
              placeholder={t('experimentsV2.form.inputPlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel
              labelZh={fieldLabel('measured_products', 'key_spectral_metrics')}
              unit={null}
              required={false}
              r0={false}
            />
            <Textarea
              value={spectral}
              onChange={(event) => setSpectral(event.target.value)}
              rows={2}
              placeholder={t('experimentsV2.form.inputPlaceholder')}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={createMutation.isPending || !sampleId}
            onClick={() => createMutation.mutate()}
          >
            {t('experimentsV2.sections.results.addProduct')}
          </Button>
        </div>
      </div>
    </div>
  )
}
