import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Textarea } from '@/components/ui/textarea'
import {
  characterizationProfiles,
  characterizationProperties,
} from '@/shared/generated/field-metadata'
import type { CharacterizationConditionField } from '@/shared/generated/field-metadata'
import { resolveErrorMessage } from '@/shared/api/http-error'
import {
  deleteExperimentFile,
  getExperimentFile,
  uploadExperimentFile,
} from '@/features/samples/api'

import { createMeasurement, listMeasurements, listSamples } from './api'
import { EntityReferenceSelect } from './components/entity-reference-select'
import { ModuleCard } from './components/module-card'
import { snapshotValue } from './components/reference-snapshot'

const METHOD_ORDER = [
  'optical_microscopy',
  'Raman',
  'low_frequency_raman',
  'PL',
  'AFM',
  'SEM',
  'XRD',
  'TEM',
  'other',
] as const

type ResultDefinition = {
  key: string
  label: string
  kind: 'number' | 'text' | 'growth' | 'layer_count'
  propertyCode?: string
  assertionType?: 'phase_identity' | 'stacking_order'
  unit?: string
  required?: boolean
}

export const SIMPLE_RESULTS: Record<string, ResultDefinition[]> = {
  optical_microscopy: [
    {
      key: 'growth',
      label: '是否观察到生长',
      kind: 'growth',
      required: true,
    },
    {
      key: 'coverage',
      label: '覆盖率',
      kind: 'number',
      unit: '%',
      propertyCode: 'coverage_percent',
    },
    {
      key: 'observation',
      label: '观察说明',
      kind: 'text',
      propertyCode: 'observation_note',
    },
  ],
  Raman: [
    {
      key: 'e2g',
      label: 'E₂g 峰位',
      kind: 'number',
      unit: 'cm⁻¹',
      propertyCode: 'raman_e2g_peak_position',
    },
    {
      key: 'a1g',
      label: 'A₁g 峰位',
      kind: 'number',
      unit: 'cm⁻¹',
      propertyCode: 'raman_a1g_peak_position',
    },
    {
      key: 'separation',
      label: '峰间距',
      kind: 'number',
      unit: 'cm⁻¹',
      propertyCode: 'raman_peak_separation',
    },
    {
      key: 'phase',
      label: '物相',
      kind: 'text',
      assertionType: 'phase_identity',
    },
    { key: 'layers', label: '层数结论', kind: 'layer_count' },
  ],
  low_frequency_raman: [
    {
      key: 'shear',
      label: '剪切模峰位',
      kind: 'number',
      unit: 'cm⁻¹',
      propertyCode: 'shear_mode_peak_position',
    },
    {
      key: 'fwhm',
      label: '峰宽',
      kind: 'number',
      unit: 'cm⁻¹',
      propertyCode: 'low_frequency_peak_fwhm',
    },
    {
      key: 'stacking',
      label: '堆叠结论',
      kind: 'text',
      assertionType: 'stacking_order',
    },
  ],
  PL: [
    {
      key: 'a_exciton',
      label: 'A 激子峰能量',
      kind: 'number',
      unit: 'eV',
      propertyCode: 'pl_a_exciton_peak_energy',
    },
    {
      key: 'b_exciton',
      label: 'B 激子峰能量',
      kind: 'number',
      unit: 'eV',
      propertyCode: 'pl_b_exciton_peak_energy',
    },
    {
      key: 'intensity',
      label: '积分强度',
      kind: 'number',
      unit: 'a.u.',
      propertyCode: 'pl_integrated_intensity',
    },
  ],
  AFM: [
    {
      key: 'rms',
      label: 'RMS 粗糙度',
      kind: 'number',
      unit: 'nm',
      propertyCode: 'afm_rms_roughness',
    },
    {
      key: 'step',
      label: '台阶高度',
      kind: 'number',
      unit: 'nm',
      propertyCode: 'afm_step_height',
    },
    { key: 'layers', label: '层数结论', kind: 'layer_count' },
  ],
  SEM: [
    {
      key: 'coverage',
      label: '覆盖率',
      kind: 'number',
      unit: '%',
      propertyCode: 'coverage_percent',
    },
    {
      key: 'domain',
      label: '晶畴尺寸',
      kind: 'number',
      unit: 'μm',
      propertyCode: 'domain_size_um',
    },
    { key: 'growth', label: '是否观察到生长', kind: 'growth' },
  ],
  XRD: [
    {
      key: 'peak',
      label: '衍射峰位',
      kind: 'number',
      unit: '2θ',
      propertyCode: 'xrd_peak_2theta',
    },
    {
      key: 'spacing',
      label: '晶面间距',
      kind: 'number',
      unit: 'nm',
      propertyCode: 'xrd_d_spacing',
    },
    {
      key: 'phase',
      label: '物相',
      kind: 'text',
      assertionType: 'phase_identity',
    },
  ],
  TEM: [
    {
      key: 'spacing',
      label: '晶格间距',
      kind: 'number',
      unit: 'nm',
      propertyCode: 'tem_lattice_spacing',
    },
    {
      key: 'phase',
      label: '物相',
      kind: 'text',
      assertionType: 'phase_identity',
    },
    {
      key: 'stacking',
      label: '堆叠结论',
      kind: 'text',
      assertionType: 'stacking_order',
    },
  ],
  other: [],
}

function conditionHasValue(
  field: CharacterizationConditionField,
  conditions: Record<string, string>,
) {
  return field.components
    ? field.components.every((component) =>
        Boolean(conditions[`${field.key}.${component.key}`]?.trim()),
      )
    : Boolean(conditions[field.key]?.trim())
}

function conditionPartiallyFilled(
  field: CharacterizationConditionField,
  conditions: Record<string, string>,
) {
  if (!field.components) return false
  const values = field.components.map(
    (component) => conditions[`${field.key}.${component.key}`]?.trim() ?? '',
  )
  return values.some(Boolean) && !values.every(Boolean)
}

function typedConditions(
  fields: CharacterizationConditionField[],
  conditions: Record<string, string>,
) {
  return Object.fromEntries(
    fields
      .filter((field) => conditionHasValue(field, conditions))
      .map((field) => [
        field.key,
        field.components
          ? Object.fromEntries(
              field.components.map((component) => [
                component.key,
                Number(conditions[`${field.key}.${component.key}`]),
              ]),
            )
          : field.value_type === 'text'
            ? conditions[field.key].trim()
            : Number(conditions[field.key]),
      ]),
  )
}

function sampleResultLabel(state: string, material: string | null | undefined) {
  if (material) return material
  return (
    {
      unknown: '未表征',
      growth_present: '已观察到生长',
      no_growth: '未观察到生长',
      uncertain: '结论不确定',
      asserted: '已有材料结论',
    }[state] ?? '未表征'
  )
}

function ConditionInput({
  field,
  conditions,
  onChange,
}: {
  field: CharacterizationConditionField
  conditions: Record<string, string>
  onChange: (key: string, value: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>
        {field.label_zh}
        {field.unit ? `（${field.unit}）` : ''}
      </Label>
      {field.components ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {field.components.map((component) => {
            const key = `${field.key}.${component.key}`
            return (
              <div key={key} className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">
                  {component.label_zh}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step={field.value_type === 'resolution' ? '1' : 'any'}
                  value={conditions[key] ?? ''}
                  onChange={(event) => onChange(key, event.target.value)}
                />
              </div>
            )
          })}
        </div>
      ) : (
        <Input
          type={field.value_type === 'text' ? 'text' : 'number'}
          min={field.value_type === 'text' ? undefined : '0'}
          step={field.value_type === 'integer' ? '1' : 'any'}
          value={conditions[field.key] ?? ''}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      )}
    </div>
  )
}

export function SimpleCharacterizationWorkspace({
  runId,
  token,
  readOnly,
}: {
  runId: string
  token: string
  readOnly: boolean
}) {
  const queryClient = useQueryClient()
  const samples = useQuery({
    queryKey: ['samples', runId],
    queryFn: () => listSamples(runId, token),
  })
  const measurements = useQuery({
    queryKey: ['measurements', runId],
    queryFn: () => listMeasurements(token, { runId }),
  })
  const [sampleId, setSampleId] = useState('')
  const [method, setMethod] = useState('')
  const [instrumentId, setInstrumentId] = useState('')
  const [instrumentVersion, setInstrumentVersion] = useState<number | null>(
    null,
  )
  const [instrumentSnapshot, setInstrumentSnapshot] = useState<Record<
    string,
    unknown
  > | null>(null)
  const [measuredAt, setMeasuredAt] = useState('')
  const [location, setLocation] = useState('')
  const [customLocation, setCustomLocation] = useState('')
  const [conditions, setConditions] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, string>>({})
  const [rawFiles, setRawFiles] = useState<File[]>([])

  const profile = characterizationProfiles[method]
  const resultDefinitions = SIMPLE_RESULTS[method] ?? []
  const requiredConditions = (profile?.condition_fields ?? []).filter((field) =>
    profile.required_condition_keys.includes(field.key),
  )
  const optionalConditions = (profile?.condition_fields ?? []).filter((field) =>
    profile.optional_condition_keys.includes(field.key),
  )
  const evidencePresent =
    rawFiles.length > 0 ||
    resultDefinitions.some((field) => results[field.key]?.trim())
  const conditionsValid =
    requiredConditions.every((field) => conditionHasValue(field, conditions)) &&
    optionalConditions.every(
      (field) => !conditionPartiallyFilled(field, conditions),
    )
  const resultsValid = resultDefinitions.every((field) => {
    const value = results[field.key]?.trim() ?? ''
    if (field.required && !value) return false
    if (!value || field.kind === 'text' || field.kind === 'growth') return true
    const number = Number(value)
    return (
      Number.isFinite(number) &&
      (field.kind !== 'layer_count' ||
        (Number.isInteger(number) && number >= 1))
    )
  })
  const canSubmit = Boolean(
    !readOnly &&
    sampleId &&
    method &&
    measuredAt &&
    (location !== 'custom' || customLocation.trim()) &&
    conditionsValid &&
    resultsValid &&
    evidencePresent &&
    (!profile?.instrument_required ||
      (instrumentId && instrumentVersion !== null)) &&
    (!profile?.raw_files_required || rawFiles.length > 0),
  )

  const mutation = useMutation({
    mutationFn: async () => {
      const uploadedFileIds: string[] = []
      try {
        for (const file of rawFiles) {
          const uploaded = await uploadExperimentFile(token, runId, {
            file,
            sampleId,
            method,
            assetRole: 'characterization_file',
          })
          uploadedFileIds.push(uploaded.id)
        }
        const properties = resultDefinitions
          .filter((field) => field.propertyCode && results[field.key]?.trim())
          .map((field) => ({
            property_code: field.propertyCode,
            ...(field.kind === 'text'
              ? { text_value: results[field.key].trim() }
              : {
                  numeric_value: Number(results[field.key]),
                  unit: characterizationProperties[field.propertyCode!]?.unit,
                  statistic: 'single_observation',
                }),
            quality_flag: 'valid',
          }))
        const assertions = resultDefinitions
          .filter(
            (field) =>
              (field.kind === 'growth' ||
                field.kind === 'layer_count' ||
                field.assertionType) &&
              results[field.key]?.trim(),
          )
          .map((field) => {
            const value = results[field.key].trim()
            if (field.kind === 'growth') {
              return {
                assertion_type: 'growth_presence',
                value: { state: value },
                confidence: null,
              }
            }
            if (field.kind === 'layer_count') {
              return {
                assertion_type: 'layer_count',
                value: { count: Number(value) },
                confidence: null,
              }
            }
            return {
              assertion_type: field.assertionType,
              value:
                field.assertionType === 'phase_identity'
                  ? { phase: value }
                  : { stacking_order: value },
              confidence: null,
            }
          })
        return await createMeasurement(
          {
            measurement: {
              sample_id: sampleId,
              method_profile: method,
              ...(instrumentId
                ? {
                    instrument_id: instrumentId,
                    instrument_version: instrumentVersion,
                  }
                : {}),
              measured_at: new Date(measuredAt).toISOString(),
              ...(location
                ? {
                    sample_region: {
                      geometry_type:
                        location === 'whole_sample'
                          ? 'whole_sample'
                          : 'selected_area',
                      label:
                        location === 'custom'
                          ? customLocation.trim()
                          : {
                              whole_sample: '整片',
                              center: '中心',
                              edge: '边缘',
                            }[location],
                      coordinate_system: 'sample_local',
                    },
                  }
                : {}),
              typed_conditions: typedConditions(
                profile.condition_fields,
                conditions,
              ),
              raw_file_ids: uploadedFileIds,
              quality_flag: 'valid',
            },
            analyses: [],
            properties,
            assertions,
          },
          token,
        )
      } catch (error) {
        for (const fileId of uploadedFileIds) {
          const uploaded = await getExperimentFile(token, fileId).catch(
            () => null,
          )
          if (uploaded?.characterization_record_id === null) {
            await deleteExperimentFile(token, fileId).catch(() => undefined)
          }
        }
        throw error
      }
    },
    onSuccess: async () => {
      setResults({})
      setRawFiles([])
      await queryClient.invalidateQueries({
        queryKey: ['measurements', runId],
      })
      await queryClient.invalidateQueries({ queryKey: ['samples', runId] })
      toast.success('表征记录已保存')
    },
    onError: (error) =>
      toast.error(resolveErrorMessage(error, '表征记录保存失败')),
  })

  return (
    <ModuleCard id="module-results" title="添加表征记录">
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-4 rounded-lg border p-4">
          <h3 className="font-medium">1. 选择样品与表征方法</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>样品</Label>
              <Select value={sampleId} onValueChange={setSampleId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="请选择样品" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(samples.data?.items ?? []).map((sample) => (
                      <SelectItem key={sample.id} value={sample.id}>
                        {sample.sample_code} ·{' '}
                        {sampleResultLabel(
                          sample.actual_state,
                          sample.actual_material_summary,
                        )}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>表征方法</Label>
              <Select
                value={method}
                onValueChange={(value) => {
                  setMethod(value)
                  setInstrumentId('')
                  setInstrumentVersion(null)
                  setInstrumentSnapshot(null)
                  setConditions({})
                  setResults({})
                  setRawFiles([])
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="请选择表征方法" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {METHOD_ORDER.map((value) => (
                      <SelectItem key={value} value={value}>
                        {characterizationProfiles[value].label_zh}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-lg border p-4">
          <h3 className="font-medium">2. 仪器与测量信息</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="characterization-measured-at">测量时间</Label>
              <Input
                id="characterization-measured-at"
                type="datetime-local"
                value={measuredAt}
                onInput={(event) => setMeasuredAt(event.currentTarget.value)}
              />
            </div>
            {profile?.instrument_required ? (
              <div className="flex flex-col gap-2">
                <Label>表征仪器</Label>
                <EntityReferenceSelect
                  kind="instrument"
                  productLabel
                  value={instrumentId}
                  selectedVersion={instrumentVersion}
                  selectedSnapshot={instrumentSnapshot}
                  filter={(entity) =>
                    snapshotValue(
                      entity.latest_version?.data ?? {},
                      'name_type',
                    ) === method
                  }
                  onChange={(id, entity) => {
                    setInstrumentId(id)
                    setInstrumentVersion(
                      entity?.latest_version?.version ?? null,
                    )
                    setInstrumentSnapshot(entity?.latest_version?.data ?? null)
                  }}
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <Label>测量位置（选填）</Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="请选择测量位置" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="whole_sample">整片</SelectItem>
                    <SelectItem value="center">中心</SelectItem>
                    <SelectItem value="edge">边缘</SelectItem>
                    <SelectItem value="custom">自定义说明</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            {location === 'custom' ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="characterization-location-note">位置说明</Label>
                <Input
                  id="characterization-location-note"
                  value={customLocation}
                  onChange={(event) => setCustomLocation(event.target.value)}
                />
              </div>
            ) : null}
          </div>

          {requiredConditions.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {requiredConditions.map((field) => (
                <ConditionInput
                  key={field.key}
                  field={field}
                  conditions={conditions}
                  onChange={(key, value) =>
                    setConditions((current) => ({
                      ...current,
                      [key]: value,
                    }))
                  }
                />
              ))}
            </div>
          ) : null}
          {optionalConditions.length ? (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer font-medium">
                更多测量参数
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {optionalConditions.map((field) => (
                  <ConditionInput
                    key={field.key}
                    field={field}
                    conditions={conditions}
                    onChange={(key, value) =>
                      setConditions((current) => ({
                        ...current,
                        [key]: value,
                      }))
                    }
                  />
                ))}
              </div>
            </details>
          ) : null}
        </section>

        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <h3 className="font-medium">3. 上传原始数据</h3>
          <Label htmlFor="characterization-raw-files">
            原始文件{profile?.raw_files_required ? '' : '（选填）'}
          </Label>
          <Input
            id="characterization-raw-files"
            type="file"
            multiple
            onChange={(event) =>
              setRawFiles(Array.from(event.target.files ?? []))
            }
          />
          <p className="text-sm text-muted-foreground">
            {rawFiles.length
              ? `已选择 ${rawFiles.length} 个文件`
              : (profile?.raw_file_guidance_zh ?? '请先选择表征方法')}
          </p>
        </section>

        <section className="flex flex-col gap-4 rounded-lg border p-4">
          <h3 className="font-medium">4. 填写关键结果</h3>
          {method && resultDefinitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              此方法没有预设结果字段，请上传原始数据完成记录。
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {resultDefinitions.map((field) => (
              <div key={field.key} className="flex flex-col gap-2">
                <Label>
                  {field.label}
                  {field.unit ? `（${field.unit}）` : ''}
                </Label>
                {field.kind === 'growth' ? (
                  <Select
                    value={results[field.key] ?? ''}
                    onValueChange={(value) =>
                      setResults((current) => ({
                        ...current,
                        [field.key]: value,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="present">观察到生长</SelectItem>
                        <SelectItem value="absent">未观察到生长</SelectItem>
                        <SelectItem value="uncertain">不确定</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : field.kind === 'text' ? (
                  <Textarea
                    value={results[field.key] ?? ''}
                    onChange={(event) =>
                      setResults((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                ) : (
                  <Input
                    type="number"
                    min={field.kind === 'layer_count' ? '1' : undefined}
                    step={field.kind === 'layer_count' ? '1' : 'any'}
                    value={results[field.key] ?? ''}
                    onChange={(event) =>
                      setResults((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col items-end gap-3 rounded-lg border p-4">
          <h3 className="w-full font-medium">5. 保存表征记录</h3>
          {!canSubmit && method ? (
            <p className="w-full text-sm text-muted-foreground">
              请补齐本方法的必填测量信息，并上传原始文件或填写至少一项关键结果。
            </p>
          ) : null}
          <Button
            type="button"
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            保存表征记录
          </Button>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="font-medium">已有表征记录</h3>
          {measurements.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {resolveErrorMessage(measurements.error, '表征记录加载失败')}
              </AlertDescription>
            </Alert>
          ) : measurements.data?.items.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {measurements.data.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{item.sample_code}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(item.measured_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {characterizationProfiles[item.method_profile]?.label_zh ??
                      item.method_profile}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              当前实验还没有表征记录。
            </p>
          )}
        </section>
      </div>
    </ModuleCard>
  )
}
