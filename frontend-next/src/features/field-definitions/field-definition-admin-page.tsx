import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { resolveErrorMessage } from '@/shared/api/http-error'
import type {
  FieldDefinitionCreateRequest,
  FieldDefinitionRead,
  FieldDefinitionUpdateRequest,
  FieldType,
} from '@/shared/types/api'
import { EmptyState } from '@/shared/ui/empty-state'
import { LoadingState } from '@/shared/ui/loading-state'
import { PageHeader } from '@/shared/ui/page-header'
import { useAuth } from '@/features/auth/use-auth'
import { listActiveVocabularies } from '@/features/experiments/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  createFieldDefinition,
  deactivateFieldDefinition,
  listAdminFieldDefinitions,
  reactivateFieldDefinition,
  updateFieldDefinition,
} from './api'

const MODULE_LABELS: Record<string, string> = {
  basic_info: '基本信息',
  environment: '环境',
  precheck: '预检',
  precursors: '前驱体',
  substrates: '基底',
  furnace_program: '温区程序',
  gas_program: '气体程序',
  process_observation: '过程观察',
  characterization: '表征',
  result_summary: '结果摘要',
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: '文本',
  number: '数字',
  boolean: '布尔',
  select: '下拉选择',
  textarea: '长文本',
  date: '日期',
  multi_select: '多选',
  array: '数组',
}

const FIELD_TYPE_OPTIONS = Object.entries(FIELD_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
)

const MODULE_OPTIONS = Object.entries(MODULE_LABELS).map(([value, label]) => ({
  value,
  label,
}))

const DEFAULT_STRATEGY_OPTIONS = [
  { value: 'empty', label: '空' },
  { value: 'inherit', label: '继承' },
  { value: 'default', label: '默认值' },
]

const NONE_SENTINEL = '__none__'

type FieldDefinitionFormState = {
  fieldKey: string
  moduleKey: string
  labelZh: string
  labelEn: string
  fieldType: FieldType
  unit: string
  required: boolean
  defaultStrategy: string
  inheritable: boolean
  vocabKey: string
  sortOrder: number
  isActive: boolean
  metadataJson: string
}

const defaultCreateFormState: FieldDefinitionFormState = {
  fieldKey: '',
  moduleKey: 'basic_info',
  labelZh: '',
  labelEn: '',
  fieldType: 'text',
  unit: '',
  required: false,
  defaultStrategy: '',
  inheritable: false,
  vocabKey: '',
  sortOrder: 0,
  isActive: true,
  metadataJson: '{}',
}

function normalizeOptionalText(value: string) {
  const normalized = value.trim()
  return normalized ? normalized : null
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const objectEntries = Object.entries(
      value as Record<string, unknown>,
    ).sort(([a], [b]) => a.localeCompare(b))
    return `{${objectEntries
      .map(
        ([key, itemValue]) =>
          `${JSON.stringify(key)}:${stableSerialize(itemValue)}`,
      )
      .join(',')}}`
  }

  return JSON.stringify(value)
}

function parseMetadataJson(rawValue: string) {
  const normalized = rawValue.trim()
  if (!normalized) {
    return {
      error: null,
      value: {},
    }
  }

  try {
    const parsed = JSON.parse(normalized) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        error: '元数据 JSON 必须是 JSON 对象',
        value: null,
      }
    }

    return {
      error: null,
      value: parsed as Record<string, unknown>,
    }
  } catch {
    return {
      error: '元数据 JSON 不是合法的 JSON 对象',
      value: null,
    }
  }
}

function buildCreatePayload(formState: FieldDefinitionFormState) {
  const metadataResult = parseMetadataJson(formState.metadataJson)
  if (metadataResult.error) {
    return {
      error: metadataResult.error,
      payload: null,
    } as const
  }

  const fieldKey = formState.fieldKey.trim()
  const moduleKey = formState.moduleKey.trim()
  const labelZh = formState.labelZh.trim()

  if (!fieldKey || !moduleKey || !labelZh) {
    return {
      error: '请完整填写字段 key、模块 key 和中文名',
      payload: null,
    } as const
  }

  const payload: FieldDefinitionCreateRequest = {
    field_key: fieldKey,
    module_key: moduleKey,
    label_zh: labelZh,
    label_en: normalizeOptionalText(formState.labelEn),
    field_type: formState.fieldType,
    unit: normalizeOptionalText(formState.unit),
    required: formState.required,
    default_strategy: normalizeOptionalText(formState.defaultStrategy),
    inheritable: formState.inheritable,
    vocab_key: normalizeOptionalText(formState.vocabKey),
    sort_order: formState.sortOrder,
    is_active: formState.isActive,
    metadata_json: metadataResult.value ?? {},
  }

  return {
    error: null,
    payload,
  } as const
}

function buildEditPayload(
  original: FieldDefinitionRead,
  formState: FieldDefinitionFormState,
) {
  const metadataResult = parseMetadataJson(formState.metadataJson)
  if (metadataResult.error) {
    return {
      error: metadataResult.error,
      payload: null,
    } as const
  }

  const nextFieldKey = formState.fieldKey.trim()
  const nextModuleKey = formState.moduleKey.trim()
  const nextLabelZh = formState.labelZh.trim()

  if (!nextFieldKey || !nextModuleKey || !nextLabelZh) {
    return {
      error: '字段 key、模块 key 和中文名不能为空',
      payload: null,
    } as const
  }

  const payload: FieldDefinitionUpdateRequest = {}

  if (nextFieldKey !== original.field_key) {
    payload.field_key = nextFieldKey
  }
  if (nextModuleKey !== original.module_key) {
    payload.module_key = nextModuleKey
  }
  if (nextLabelZh !== original.label_zh) {
    payload.label_zh = nextLabelZh
  }

  const nextLabelEn = normalizeOptionalText(formState.labelEn)
  if (nextLabelEn !== original.label_en) {
    payload.label_en = nextLabelEn
  }
  if (formState.fieldType !== original.field_type) {
    payload.field_type = formState.fieldType
  }

  const nextUnit = normalizeOptionalText(formState.unit)
  if (nextUnit !== original.unit) {
    payload.unit = nextUnit
  }
  if (formState.required !== original.required) {
    payload.required = formState.required
  }

  const nextDefaultStrategy = normalizeOptionalText(formState.defaultStrategy)
  if (nextDefaultStrategy !== original.default_strategy) {
    payload.default_strategy = nextDefaultStrategy
  }
  if (formState.inheritable !== original.inheritable) {
    payload.inheritable = formState.inheritable
  }

  const nextVocabKey = normalizeOptionalText(formState.vocabKey)
  if (nextVocabKey !== original.vocab_key) {
    payload.vocab_key = nextVocabKey
  }
  if (formState.sortOrder !== original.sort_order) {
    payload.sort_order = formState.sortOrder
  }
  if (formState.isActive !== original.is_active) {
    payload.is_active = formState.isActive
  }
  if (
    stableSerialize(metadataResult.value ?? {}) !==
    stableSerialize(original.metadata_json ?? {})
  ) {
    payload.metadata_json = metadataResult.value ?? {}
  }

  return {
    error: null,
    payload,
  } as const
}

function toFormState(item: FieldDefinitionRead): FieldDefinitionFormState {
  return {
    fieldKey: item.field_key,
    moduleKey: item.module_key,
    labelZh: item.label_zh,
    labelEn: item.label_en ?? '',
    fieldType: item.field_type as FieldType,
    unit: item.unit ?? '',
    required: item.required,
    defaultStrategy: item.default_strategy ?? '',
    inheritable: item.inheritable,
    vocabKey: item.vocab_key ?? '',
    sortOrder: item.sort_order,
    isActive: item.is_active,
    metadataJson: JSON.stringify(item.metadata_json ?? {}, null, 2),
  }
}

function FieldDefinitionForm({
  formState,
  loading,
  materialOptions,
  onChange,
  onSubmit,
  submitText,
  isEdit,
}: {
  formState: FieldDefinitionFormState
  loading: boolean
  materialOptions: { label: string; value: string }[]
  onChange: (next: FieldDefinitionFormState) => void
  onSubmit: () => void
  submitText: string
  isEdit: boolean
}) {
  const metadataError = parseMetadataJson(formState.metadataJson).error

  return (
    <div className="flex flex-col gap-4">
      <div className="editor-field">
        <Label htmlFor="field-def-key">
          字段 key <span className="text-destructive">*</span>
        </Label>
        <Input
          autoComplete="off"
          id="field-def-key"
          onChange={(e) => onChange({ ...formState, fieldKey: e.target.value })}
          placeholder="例如 temperature"
          readOnly={isEdit}
          className={isEdit ? 'text-muted-foreground' : undefined}
          value={formState.fieldKey}
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="field-def-module">
          模块 key <span className="text-destructive">*</span>
        </Label>
        <Select
          disabled={isEdit}
          value={formState.moduleKey}
          onValueChange={(value) => onChange({ ...formState, moduleKey: value })}
        >
          <SelectTrigger
            id="field-def-module"
            className="w-full"
            aria-label="模块 key"
          >
            <SelectValue placeholder="选择模块" />
          </SelectTrigger>
          <SelectContent>
            {MODULE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="editor-field">
        <Label htmlFor="field-def-label-zh">
          中文名 <span className="text-destructive">*</span>
        </Label>
        <Input
          autoComplete="off"
          id="field-def-label-zh"
          onChange={(e) => onChange({ ...formState, labelZh: e.target.value })}
          placeholder="例如 温度"
          value={formState.labelZh}
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="field-def-label-en">英文名</Label>
        <Input
          autoComplete="off"
          id="field-def-label-en"
          onChange={(e) => onChange({ ...formState, labelEn: e.target.value })}
          placeholder="例如 Temperature"
          value={formState.labelEn}
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="field-def-type">
          字段类型 <span className="text-destructive">*</span>
        </Label>
        <Select
          value={formState.fieldType}
          onValueChange={(value) =>
            onChange({ ...formState, fieldType: value as FieldType })
          }
        >
          <SelectTrigger
            id="field-def-type"
            className="w-full"
            aria-label="字段类型"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="editor-field">
        <Label htmlFor="field-def-unit">单位</Label>
        <Input
          autoComplete="off"
          id="field-def-unit"
          onChange={(e) => onChange({ ...formState, unit: e.target.value })}
          placeholder="例如 °C、sccm、mg"
          value={formState.unit}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="field-def-required">必填</Label>
        <Switch
          aria-label="必填"
          checked={formState.required}
          id="field-def-required"
          onCheckedChange={(checked) =>
            onChange({ ...formState, required: checked })
          }
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="field-def-strategy">默认策略</Label>
        <Select
          value={formState.defaultStrategy || NONE_SENTINEL}
          onValueChange={(value) =>
            onChange({
              ...formState,
              defaultStrategy: value === NONE_SENTINEL ? '' : value,
            })
          }
        >
          <SelectTrigger
            id="field-def-strategy"
            className="w-full"
            aria-label="默认策略"
          >
            <SelectValue placeholder="选择默认策略" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_SENTINEL}>无</SelectItem>
            {DEFAULT_STRATEGY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="field-def-inheritable">可继承</Label>
        <Switch
          aria-label="可继承"
          checked={formState.inheritable}
          id="field-def-inheritable"
          onCheckedChange={(checked) =>
            onChange({ ...formState, inheritable: checked })
          }
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="field-def-vocab">关联词表</Label>
        <Select
          value={formState.vocabKey || NONE_SENTINEL}
          onValueChange={(value) =>
            onChange({
              ...formState,
              vocabKey: value === NONE_SENTINEL ? '' : value,
            })
          }
        >
          <SelectTrigger
            id="field-def-vocab"
            className="w-full"
            aria-label="关联词表"
          >
            <SelectValue placeholder="选择关联词表" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_SENTINEL}>无</SelectItem>
            {materialOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="editor-field">
        <Label htmlFor="field-def-sort">
          排序 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="field-def-sort"
          type="number"
          min={0}
          onChange={(e) =>
            onChange({ ...formState, sortOrder: Number(e.target.value) || 0 })
          }
          value={formState.sortOrder}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="field-def-active">启用</Label>
        <Switch
          aria-label="启用"
          checked={formState.isActive}
          id="field-def-active"
          onCheckedChange={(checked) =>
            onChange({ ...formState, isActive: checked })
          }
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="field-def-metadata">元数据 JSON</Label>
        <Textarea
          autoComplete="off"
          rows={5}
          id="field-def-metadata"
          onChange={(e) =>
            onChange({ ...formState, metadataJson: e.target.value })
          }
          value={formState.metadataJson}
          aria-invalid={metadataError ? true : undefined}
        />
        {metadataError ? (
          <p className="text-xs text-destructive">{metadataError}</p>
        ) : null}
      </div>

      <Button disabled={loading} onClick={onSubmit}>
        {submitText}
      </Button>
    </div>
  )
}

export function FieldDefinitionAdminPage() {
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const currentUser = session.currentUser
  const [appliedFilter, setAppliedFilter] = useState('')
  const [feedback, setFeedback] = useState<{
    type: 'error' | 'success'
    message: string
  } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<FieldDefinitionRead | null>(null)
  const [createForm, setCreateForm] = useState(defaultCreateFormState)
  const [editForm, setEditForm] = useState<FieldDefinitionFormState | null>(
    null,
  )
  const [page, setPage] = useState(1)

  const isAdmin = currentUser?.role === 'admin'
  const queryPrefix = [
    'admin',
    'field-definitions',
    currentUser?.id ?? 'anonymous',
  ]

  const fieldDefinitionsQuery = useQuery({
    queryKey: [...queryPrefix, appliedFilter || 'all'],
    queryFn: () =>
      listAdminFieldDefinitions(
        session.accessToken!,
        appliedFilter || undefined,
      ),
    enabled: session.isAuthenticated && isAdmin,
  })

  const vocabularyKeysQuery = useQuery({
    queryKey: ['vocabularies', 'all-keys', currentUser?.id ?? 'anonymous'],
    queryFn: () => listActiveVocabularies(session.accessToken!, ''),
    enabled: session.isAuthenticated && isAdmin,
  })

  const vocabKeyOptions = useMemo(() => {
    const keys = new Set<string>()
    for (const item of vocabularyKeysQuery.data?.items ?? []) {
      keys.add(item.vocab_key)
    }
    return Array.from(keys)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({ label: key, value: key }))
  }, [vocabularyKeysQuery.data?.items])

  const invalidateFieldDefinitionQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryPrefix,
      }),
      queryClient.invalidateQueries({
        queryKey: ['field-definitions'],
      }),
    ])
  }

  const createMutation = useMutation({
    mutationFn: (payload: FieldDefinitionCreateRequest) =>
      createFieldDefinition(session.accessToken!, payload),
    onSuccess: async () => {
      setFeedback({ message: '字段定义创建成功', type: 'success' })
      setCreateOpen(false)
      setCreateForm(defaultCreateFormState)
      await invalidateFieldDefinitionQueries()
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, '字段定义创建失败'),
        type: 'error',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      fieldId,
      payload,
    }: {
      payload: FieldDefinitionUpdateRequest
      fieldId: string
    }) => updateFieldDefinition(session.accessToken!, fieldId, payload),
    onSuccess: async () => {
      setFeedback({ message: '字段定义更新成功', type: 'success' })
      setEditTarget(null)
      setEditForm(null)
      await invalidateFieldDefinitionQueries()
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, '字段定义更新失败'),
        type: 'error',
      })
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (fieldId: string) =>
      deactivateFieldDefinition(session.accessToken!, fieldId),
    onSuccess: async () => {
      setFeedback({ message: '字段定义已停用', type: 'success' })
      await invalidateFieldDefinitionQueries()
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, '字段定义停用失败'),
        type: 'error',
      })
    },
  })

  const reactivateMutation = useMutation({
    mutationFn: (fieldId: string) =>
      reactivateFieldDefinition(session.accessToken!, fieldId),
    onSuccess: async () => {
      setFeedback({ message: '字段定义已重新启用', type: 'success' })
      await invalidateFieldDefinitionQueries()
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, '字段定义重新启用失败'),
        type: 'error',
      })
    },
  })

  const handleCreateSubmit = () => {
    setFeedback(null)
    const result = buildCreatePayload(createForm)
    if (result.error || !result.payload) {
      setFeedback({
        message: result.error ?? '字段定义创建失败',
        type: 'error',
      })
      return
    }

    createMutation.mutate(result.payload)
  }

  const handleEditSubmit = () => {
    if (!editTarget || !editForm) {
      return
    }

    setFeedback(null)
    const result = buildEditPayload(editTarget, editForm)
    if (result.error || !result.payload) {
      setFeedback({
        message: result.error ?? '字段定义更新失败',
        type: 'error',
      })
      return
    }

    updateMutation.mutate({ payload: result.payload, fieldId: editTarget.id })
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader subtitle="字段词典管理仅对管理员开放。" title="字段词典" />
        <Alert className="border-warning/40 bg-warning-soft [&>svg]:text-warning">
          <AlertDescription className="text-foreground">
            当前账号没有字段词典管理权限。
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const rows = fieldDefinitionsQuery.data?.items ?? []
  const PAGE_SIZE = 20
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginatedRows = rows.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setFeedback(null)
              setCreateForm(defaultCreateFormState)
              setCreateOpen(true)
            }}
          >
            新增字段
          </Button>
        }
        subtitle="管理字段词典定义，控制实验表单的字段、类型和约束。"
        title="字段词典"
      />

      {feedback ? (
        <Alert
          variant={feedback.type === 'error' ? 'destructive' : undefined}
          className={
            feedback.type === 'success'
              ? 'border-success/40 bg-success-soft [&>svg]:text-success'
              : undefined
          }
        >
          <AlertDescription
            className={feedback.type === 'success' ? 'text-foreground' : undefined}
          >
            {feedback.message}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="editor-field">
            <Label htmlFor="field-def-filter-module">模块筛选</Label>
            <Select
              value={appliedFilter || NONE_SENTINEL}
              onValueChange={(value) => {
                setAppliedFilter(value === NONE_SENTINEL ? '' : value)
                setPage(1)
              }}
            >
              <SelectTrigger
                id="field-def-filter-module"
                className="w-50"
                aria-label="模块筛选"
              >
                <SelectValue placeholder="选择模块" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_SENTINEL}>全部</SelectItem>
                {MODULE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setAppliedFilter('')
              setPage(1)
            }}
          >
            清空筛选
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {fieldDefinitionsQuery.isLoading ? (
            <LoadingState />
          ) : fieldDefinitionsQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {resolveErrorMessage(
                  fieldDefinitionsQuery.error,
                  '字段定义列表加载失败',
                )}
              </AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <EmptyState description="当前筛选条件下还没有字段定义。可清空筛选或新增字段。" />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>字段 key</TableHead>
                      <TableHead>中文名</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>单位</TableHead>
                      <TableHead>必填</TableHead>
                      <TableHead>可继承</TableHead>
                      <TableHead>词表</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRows.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                            {record.field_key}
                          </code>
                        </TableCell>
                        <TableCell>{record.label_zh}</TableCell>
                        <TableCell>
                          {FIELD_TYPE_LABELS[record.field_type] ??
                            record.field_type}
                        </TableCell>
                        <TableCell>{record.unit || '-'}</TableCell>
                        <TableCell>
                          {record.required ? (
                            <Badge className="bg-destructive/10 text-destructive">
                              必填
                            </Badge>
                          ) : (
                            <Badge variant="secondary">选填</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {record.inheritable ? (
                            <Badge className="bg-primary-soft text-primary">
                              可继承
                            </Badge>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>{record.vocab_key || '-'}</TableCell>
                        <TableCell>
                          {record.is_active ? (
                            <Badge className="bg-success-soft text-success">
                              启用
                            </Badge>
                          ) : (
                            <Badge variant="secondary">停用</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`编辑 ${record.field_key}`}
                              onClick={() => {
                                setFeedback(null)
                                setEditTarget(record)
                                setEditForm(toFormState(record))
                              }}
                            >
                              编辑
                            </Button>
                            {record.is_active ? (
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`停用 ${record.field_key}`}
                                disabled={
                                  deactivateMutation.isPending &&
                                  deactivateMutation.variables === record.id
                                }
                                onClick={() => {
                                  setFeedback(null)
                                  deactivateMutation.mutate(record.id)
                                }}
                              >
                                停用
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`启用 ${record.field_key}`}
                                disabled={
                                  reactivateMutation.isPending &&
                                  reactivateMutation.variables === record.id
                                }
                                onClick={() => {
                                  setFeedback(null)
                                  reactivateMutation.mutate(record.id)
                                }}
                              >
                                启用
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {rows.length > PAGE_SIZE ? (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    共 {rows.length} 条 · 第 {safePage}/{totalPages} 页
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage <= 1}
                      onClick={() => setPage(safePage - 1)}
                    >
                      上一页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage(safePage + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!createMutation.isPending) setCreateOpen(open)
        }}
      >
        <DialogContent className="max-h-[85vh] gap-0 overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新增字段定义</DialogTitle>
            <DialogDescription className="sr-only">
              创建新的字段词典定义
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-6 max-h-[65vh] overflow-y-auto px-6 py-2">
            <FieldDefinitionForm
              formState={createForm}
              isEdit={false}
              loading={createMutation.isPending}
              materialOptions={vocabKeyOptions}
              onChange={setCreateForm}
              onSubmit={handleCreateSubmit}
              submitText="创建字段定义"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={editTarget !== null && editForm !== null}
        onOpenChange={(open) => {
          if (!open && !updateMutation.isPending) {
            setEditTarget(null)
            setEditForm(null)
          }
        }}
      >
        <DialogContent className="max-h-[85vh] gap-0 overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editTarget
                ? `编辑字段定义 · ${editTarget.field_key}`
                : '编辑字段定义'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              编辑现有字段词典定义
            </DialogDescription>
          </DialogHeader>
          {editTarget && editForm ? (
            <div className="-mx-6 max-h-[65vh] overflow-y-auto px-6 py-2">
              <FieldDefinitionForm
                formState={editForm}
                isEdit={true}
                loading={updateMutation.isPending}
                materialOptions={vocabKeyOptions}
                onChange={setEditForm}
                onSubmit={handleEditSubmit}
                submitText="保存修改"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
