import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { resolveErrorMessage } from '@/shared/api/http-error'
import { EmptyState } from '@/shared/ui/empty-state'
import { LoadingState } from '@/shared/ui/loading-state'
import { PageHeader } from '@/shared/ui/page-header'
import type {
  ControlledVocabularyCreateRequest,
  ControlledVocabularyRead,
  ControlledVocabularyUpdateRequest,
  VocabularyGroupUpsertRequest,
  VocabularyReorderRequest,
} from '@/shared/types/api'
import { useAuth } from '@/features/auth/use-auth'
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
  createVocabulary,
  listAdminVocabularies,
  reorderVocabularies,
  updateVocabulary,
  upsertVocabularyGroup,
} from './api'
import { moveInOrder } from './reorder-utils'
import type { GroupFormState } from './group-utils'
import { buildGroupUpsertPayload, emptyGroupFormState } from './group-utils'

const NONE_SENTINEL = '__all__'

type VocabularyFormState = {
  vocabKey: string
  value: string
  labelZh: string
  labelEn: string
  sortOrder: string
  isActive: boolean
  metadataJson: string
  groupKey: string
}

const defaultCreateFormState: VocabularyFormState = {
  vocabKey: '',
  value: '',
  labelZh: '',
  labelEn: '',
  sortOrder: '0',
  isActive: true,
  metadataJson: '{}',
  groupKey: '',
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
    const objectEntries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    )
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

function buildCreatePayload(formState: VocabularyFormState) {
  const metadataResult = parseMetadataJson(formState.metadataJson)
  if (metadataResult.error) {
    return {
      error: metadataResult.error,
      payload: null,
    }
  }

  const vocabKey = formState.vocabKey.trim()
  const value = formState.value.trim()
  const labelZh = formState.labelZh.trim()
  const sortOrder = Number(formState.sortOrder)

  if (!vocabKey || !value || !labelZh) {
    return {
      error: '请完整填写词表 key、值和中文标签',
      payload: null,
    }
  }

  if (!Number.isInteger(sortOrder)) {
    return {
      error: '排序必须是整数',
      payload: null,
    }
  }

  return {
    error: null,
    payload: {
      vocab_key: vocabKey,
      value,
      label_zh: labelZh,
      label_en: normalizeOptionalText(formState.labelEn),
      sort_order: sortOrder,
      is_active: formState.isActive,
      metadata_json: metadataResult.value ?? {},
    } satisfies ControlledVocabularyCreateRequest,
  }
}

function buildEditPayload(
  original: ControlledVocabularyRead,
  formState: VocabularyFormState,
) {
  const metadataResult = parseMetadataJson(formState.metadataJson)
  if (metadataResult.error) {
    return {
      error: metadataResult.error,
      payload: null,
    }
  }

  const nextValue = formState.value.trim()
  const nextLabelZh = formState.labelZh.trim()
  const nextLabelEn = normalizeOptionalText(formState.labelEn)
  const nextSortOrder = Number(formState.sortOrder)

  if (!nextValue || !nextLabelZh) {
    return {
      error: '值和中文标签不能为空',
      payload: null,
    }
  }

  if (!Number.isInteger(nextSortOrder)) {
    return {
      error: '排序必须是整数',
      payload: null,
    }
  }

  const payload: ControlledVocabularyUpdateRequest = {}
  if (nextValue !== original.value) {
    payload.value = nextValue
  }
  if (nextLabelZh !== original.label_zh) {
    payload.label_zh = nextLabelZh
  }
  if (nextLabelEn !== original.label_en) {
    payload.label_en = nextLabelEn
  }
  if (nextSortOrder !== original.sort_order) {
    payload.sort_order = nextSortOrder
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
  // 分组成员变更：归入已存在分组（继承其标签）或留空清除分组。
  const nextGroupKey = formState.groupKey.trim() || null
  if (nextGroupKey !== (original.group_key ?? null)) {
    payload.group_key = nextGroupKey
  }

  return {
    error: null,
    payload,
  }
}

function toFormState(item: ControlledVocabularyRead): VocabularyFormState {
  return {
    vocabKey: item.vocab_key,
    value: item.value,
    labelZh: item.label_zh,
    labelEn: item.label_en ?? '',
    sortOrder: String(item.sort_order),
    isActive: item.is_active,
    metadataJson: JSON.stringify(item.metadata_json ?? {}, null, 2),
    groupKey: item.group_key ?? '',
  }
}

function VocabularyForm({
  formState,
  onChange,
  onSubmit,
  loading,
  isEdit,
  submitText,
}: {
  formState: VocabularyFormState
  onChange: (next: VocabularyFormState) => void
  onSubmit: () => void
  loading: boolean
  isEdit: boolean
  submitText: string
}) {
  const metadataError = parseMetadataJson(formState.metadataJson).error

  return (
    <div className="flex flex-col gap-4">
      <div className="editor-field">
        <Label htmlFor="vocabulary-key">
          词表 key {isEdit ? null : <span className="text-destructive">*</span>}
        </Label>
        <Input
          autoComplete="off"
          id="vocabulary-key"
          readOnly={isEdit}
          className={isEdit ? 'text-muted-foreground' : undefined}
          onChange={(e) => onChange({ ...formState, vocabKey: e.target.value })}
          placeholder="例如 characterization_method"
          value={formState.vocabKey}
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="vocabulary-value">
          值 <span className="text-destructive">*</span>
        </Label>
        <Input
          autoComplete="off"
          id="vocabulary-value"
          onChange={(e) => onChange({ ...formState, value: e.target.value })}
          placeholder="例如 raman"
          value={formState.value}
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="vocabulary-label-zh">
          中文标签 <span className="text-destructive">*</span>
        </Label>
        <Input
          autoComplete="off"
          id="vocabulary-label-zh"
          onChange={(e) => onChange({ ...formState, labelZh: e.target.value })}
          placeholder="例如 拉曼光谱"
          value={formState.labelZh}
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="vocabulary-label-en">英文标签</Label>
        <Input
          autoComplete="off"
          id="vocabulary-label-en"
          onChange={(e) => onChange({ ...formState, labelEn: e.target.value })}
          placeholder="例如 Raman Spectroscopy"
          value={formState.labelEn}
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="vocabulary-sort-order">
          排序 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="vocabulary-sort-order"
          type="number"
          min={0}
          onChange={(e) =>
            onChange({ ...formState, sortOrder: e.target.value })
          }
          value={formState.sortOrder}
        />
      </div>

      {isEdit ? (
        <div className="editor-field">
          <Label htmlFor="vocabulary-group-key">分组键</Label>
          <Input
            autoComplete="off"
            id="vocabulary-group-key"
            onChange={(e) =>
              onChange({ ...formState, groupKey: e.target.value })
            }
            placeholder="填写已存在的分组键以归入该组；留空清除分组"
            value={formState.groupKey}
          />
          <p className="text-xs text-muted-foreground">
            归入的分组需已存在（其标签由分组统一维护，会自动继承）；留空表示移出分组。
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="vocabulary-enabled">启用</Label>
        <Switch
          aria-label="启用"
          checked={formState.isActive}
          id="vocabulary-enabled"
          onCheckedChange={(checked) =>
            onChange({ ...formState, isActive: checked })
          }
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="vocabulary-metadata">元数据 JSON</Label>
        <Textarea
          autoComplete="off"
          rows={5}
          id="vocabulary-metadata"
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

export function VocabularyAdminPage() {
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const currentUser = session.currentUser
  const [appliedFilter, setAppliedFilter] = useState('')
  const [feedback, setFeedback] = useState<{
    type: 'error' | 'success'
    message: string
  } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ControlledVocabularyRead | null>(
    null,
  )
  const [createForm, setCreateForm] = useState(defaultCreateFormState)
  const [editForm, setEditForm] = useState<VocabularyFormState | null>(null)
  const [page, setPage] = useState(1)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [groupForm, setGroupForm] =
    useState<GroupFormState>(emptyGroupFormState)

  const isAdmin = currentUser?.role === 'admin'
  const queryPrefix = ['admin', 'vocabularies', currentUser?.id ?? 'anonymous']

  const vocabulariesQuery = useQuery({
    queryKey: [...queryPrefix, appliedFilter || 'all'],
    queryFn: () =>
      listAdminVocabularies(session.accessToken!, appliedFilter || null),
    enabled: session.isAuthenticated && isAdmin,
  })

  const vocabularyKeyOptionsQuery = useQuery({
    queryKey: [...queryPrefix, 'key-options'],
    queryFn: () => listAdminVocabularies(session.accessToken!, null),
    enabled: session.isAuthenticated && isAdmin,
  })

  const uniqueKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const item of vocabularyKeyOptionsQuery.data?.items ??
      vocabulariesQuery.data?.items ??
      []) {
      keys.add(item.vocab_key)
    }
    return Array.from(keys).sort((left, right) => left.localeCompare(right))
  }, [vocabulariesQuery.data?.items, vocabularyKeyOptionsQuery.data?.items])

  const invalidateVocabularyQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryPrefix,
      }),
      queryClient.invalidateQueries({
        queryKey: ['vocabularies'],
      }),
    ])
  }

  const createMutation = useMutation({
    mutationFn: (payload: ControlledVocabularyCreateRequest) =>
      createVocabulary(session.accessToken!, payload),
    onSuccess: async () => {
      setFeedback({ message: '词条创建成功', type: 'success' })
      setCreateOpen(false)
      setCreateForm(defaultCreateFormState)
      await invalidateVocabularyQueries()
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, '词条创建失败'),
        type: 'error',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      vocabId,
      payload,
    }: {
      payload: ControlledVocabularyUpdateRequest
      vocabId: string
    }) => updateVocabulary(session.accessToken!, vocabId, payload),
    onSuccess: async () => {
      setFeedback({ message: '词条更新成功', type: 'success' })
      setEditTarget(null)
      setEditForm(null)
      await invalidateVocabularyQueries()
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, '词条更新失败'),
        type: 'error',
      })
    },
  })

  const reorderMutation = useMutation({
    mutationFn: (payload: VocabularyReorderRequest) =>
      reorderVocabularies(session.accessToken!, payload),
    onSuccess: async () => {
      setFeedback({ message: '排序已更新', type: 'success' })
      await invalidateVocabularyQueries()
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, '排序更新失败'),
        type: 'error',
      })
    },
  })

  const upsertGroupMutation = useMutation({
    mutationFn: (payload: VocabularyGroupUpsertRequest) =>
      upsertVocabularyGroup(session.accessToken!, payload),
    onSuccess: async () => {
      setFeedback({ message: '分组已保存', type: 'success' })
      setGroupDialogOpen(false)
      setGroupForm(emptyGroupFormState)
      await invalidateVocabularyQueries()
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, '分组保存失败'),
        type: 'error',
      })
    },
  })

  const handleCreateSubmit = () => {
    setFeedback(null)
    const result = buildCreatePayload(createForm)
    if (result.error || !result.payload) {
      setFeedback({
        message: result.error ?? '词条创建失败',
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
        message: result.error ?? '词条更新失败',
        type: 'error',
      })
      return
    }

    updateMutation.mutate({ payload: result.payload, vocabId: editTarget.id })
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader subtitle="受控词表管理仅对管理员开放。" title="受控词表" />
        <Alert className="border-warning/40 bg-warning-soft [&>svg]:text-warning">
          <AlertDescription className="text-foreground">
            当前账号没有词表管理权限。
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const rows = vocabulariesQuery.data?.items ?? []
  // 仅当筛选到单一 vocab_key 时，列表顺序才代表该词表内的真实排序，才允许重排。
  const canReorder = Boolean(appliedFilter) && !reorderMutation.isPending
  // 分组管理也只在单一 vocab_key 视图下有意义（成员来自该词表）。
  const canManageGroups = Boolean(appliedFilter)
  const handleMove = (vocabId: string, direction: 'up' | 'down') => {
    const orderedIds = rows.map((item) => item.id)
    const index = orderedIds.indexOf(vocabId)
    const next = moveInOrder(orderedIds, index, direction)
    if (next === orderedIds) {
      return
    }
    setFeedback(null)
    reorderMutation.mutate({ vocab_key: appliedFilter, ordered_ids: next })
  }

  // 该词表已存在的分组（用于预填/选择已有分组进行编辑）。
  const existingGroups = useMemo(() => {
    const byKey = new Map<
      string,
      { groupKey: string; labelZh: string; sortOrder: number }
    >()
    for (const item of rows) {
      if (item.group_key && !byKey.has(item.group_key)) {
        byKey.set(item.group_key, {
          groupKey: item.group_key,
          labelZh: item.group_label_zh ?? item.group_key,
          sortOrder: item.group_sort_order ?? 0,
        })
      }
    }
    return Array.from(byKey.values()).sort(
      (left, right) => left.sortOrder - right.sortOrder,
    )
  }, [rows])

  // 词条已在「当前所填分组键」组内者，本对话框不能移除（后端按并集应用，取消勾选
  // 不会移除）。锁定其复选框，并把移除引导到行编辑（清除分组键）。
  const lockedMemberIds = useMemo(() => {
    const key = groupForm.groupKey.trim()
    if (!key) {
      return new Set<string>()
    }
    return new Set(
      rows.filter((item) => item.group_key === key).map((item) => item.id),
    )
  }, [rows, groupForm.groupKey])

  const handleGroupSubmit = () => {
    setFeedback(null)
    const result = buildGroupUpsertPayload(appliedFilter, groupForm)
    if (result.error || !result.payload) {
      setFeedback({ message: result.error ?? '分组保存失败', type: 'error' })
      return
    }
    upsertGroupMutation.mutate(result.payload)
  }

  const prefillGroupForm = (groupKey: string) => {
    const members = rows.filter((item) => item.group_key === groupKey)
    const sample = members[0]
    setGroupForm({
      groupKey,
      groupLabelZh: sample?.group_label_zh ?? '',
      groupLabelEn: sample?.group_label_en ?? '',
      groupSortOrder: String(sample?.group_sort_order ?? 0),
      memberIds: members.map((item) => item.id),
    })
  }
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
            新增词条
          </Button>
        }
        subtitle="管理受控词表条目，词表变更会影响实验和文件页的候选项。"
        title="受控词表"
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
            className={
              feedback.type === 'success' ? 'text-foreground' : undefined
            }
          >
            {feedback.message}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="editor-field">
            <Label htmlFor="vocabulary-filter-key">词表 key 筛选</Label>
            <Select
              value={appliedFilter || NONE_SENTINEL}
              onValueChange={(value) => {
                setAppliedFilter(value === NONE_SENTINEL ? '' : value)
                setPage(1)
              }}
            >
              <SelectTrigger
                id="vocabulary-filter-key"
                className="w-65"
                aria-label="词表 key 筛选"
              >
                <SelectValue placeholder="选择词表 key" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_SENTINEL}>全部</SelectItem>
                {uniqueKeys.map((key) => (
                  <SelectItem key={key} value={key}>
                    {key}
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
          {canManageGroups ? (
            <Button
              variant="outline"
              onClick={() => {
                setFeedback(null)
                setGroupForm(emptyGroupFormState)
                setGroupDialogOpen(true)
              }}
            >
              管理分组
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {vocabulariesQuery.isLoading ? (
            <LoadingState />
          ) : vocabulariesQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {resolveErrorMessage(
                  vocabulariesQuery.error,
                  '词表列表加载失败',
                )}
              </AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <EmptyState description="当前筛选条件下还没有词条。可清空筛选或新增词条。" />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>词表 key</TableHead>
                      <TableHead>值</TableHead>
                      <TableHead>中文标签</TableHead>
                      <TableHead>英文标签</TableHead>
                      <TableHead>分组</TableHead>
                      <TableHead>排序</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>元数据</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRows.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>{record.vocab_key}</TableCell>
                        <TableCell>{record.value}</TableCell>
                        <TableCell>{record.label_zh}</TableCell>
                        <TableCell>{record.label_en || '-'}</TableCell>
                        <TableCell>
                          {record.group_label_zh ? (
                            <Badge variant="secondary">
                              {record.group_label_zh}
                            </Badge>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {record.sort_order}
                        </TableCell>
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
                          {Object.keys(record.metadata_json ?? {}).length >
                          0 ? (
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                              {JSON.stringify(record.metadata_json)}
                            </code>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {canReorder ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  aria-label={`上移 ${record.vocab_key}:${record.value}`}
                                  disabled={rows[0]?.id === record.id}
                                  onClick={() => handleMove(record.id, 'up')}
                                >
                                  ↑
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  aria-label={`下移 ${record.vocab_key}:${record.value}`}
                                  disabled={
                                    rows[rows.length - 1]?.id === record.id
                                  }
                                  onClick={() => handleMove(record.id, 'down')}
                                >
                                  ↓
                                </Button>
                              </>
                            ) : null}
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`编辑 ${record.vocab_key}:${record.value}`}
                              onClick={() => {
                                setFeedback(null)
                                setEditTarget(record)
                                setEditForm(toFormState(record))
                              }}
                            >
                              编辑
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`${record.is_active ? '停用' : '启用'} ${record.vocab_key}:${record.value}`}
                              disabled={
                                updateMutation.isPending &&
                                updateMutation.variables?.vocabId === record.id
                              }
                              onClick={() => {
                                setFeedback(null)
                                updateMutation.mutate({
                                  payload: { is_active: !record.is_active },
                                  vocabId: record.id,
                                })
                              }}
                            >
                              {record.is_active ? '停用' : '启用'}
                            </Button>
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
            <DialogTitle>新增词条</DialogTitle>
            <DialogDescription className="sr-only">
              创建新的受控词表词条
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-6 max-h-[65vh] overflow-y-auto px-6 py-2">
            <VocabularyForm
              formState={createForm}
              isEdit={false}
              loading={createMutation.isPending}
              onChange={setCreateForm}
              onSubmit={handleCreateSubmit}
              submitText="创建词条"
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
              {editTarget ? `编辑词条 · ${editTarget.vocab_key}` : '编辑词条'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              编辑现有受控词表词条
            </DialogDescription>
          </DialogHeader>
          {editTarget && editForm ? (
            <div className="-mx-6 max-h-[65vh] overflow-y-auto px-6 py-2">
              <VocabularyForm
                formState={editForm}
                isEdit={true}
                loading={updateMutation.isPending}
                onChange={setEditForm}
                onSubmit={handleEditSubmit}
                submitText="保存修改"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Group management dialog */}
      <Dialog
        open={groupDialogOpen}
        onOpenChange={(open) => {
          if (!upsertGroupMutation.isPending) setGroupDialogOpen(open)
        }}
      >
        <DialogContent className="max-h-[85vh] gap-0 overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{`管理分组 · ${appliedFilter}`}</DialogTitle>
            <DialogDescription className="sr-only">
              定义或编辑该词表的分组，并选择归入该组的词条
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-6 max-h-[65vh] overflow-y-auto px-6 py-2">
            <div className="flex flex-col gap-4">
              {existingGroups.length > 0 ? (
                <div className="editor-field">
                  <Label htmlFor="group-existing">编辑已有分组</Label>
                  <Select
                    value={
                      existingGroups.some(
                        (g) => g.groupKey === groupForm.groupKey,
                      )
                        ? groupForm.groupKey
                        : NONE_SENTINEL
                    }
                    onValueChange={(value) => {
                      if (value === NONE_SENTINEL) {
                        setGroupForm(emptyGroupFormState)
                      } else {
                        prefillGroupForm(value)
                      }
                    }}
                  >
                    <SelectTrigger
                      id="group-existing"
                      aria-label="编辑已有分组"
                    >
                      <SelectValue placeholder="新建分组" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_SENTINEL}>新建分组</SelectItem>
                      {existingGroups.map((group) => (
                        <SelectItem key={group.groupKey} value={group.groupKey}>
                          {group.labelZh}（{group.groupKey}）
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="editor-field">
                <Label htmlFor="group-key">
                  分组键 <span className="text-destructive">*</span>
                </Label>
                <Input
                  autoComplete="off"
                  id="group-key"
                  onChange={(e) =>
                    setGroupForm({ ...groupForm, groupKey: e.target.value })
                  }
                  placeholder="例如 morphology"
                  value={groupForm.groupKey}
                />
              </div>

              <div className="editor-field">
                <Label htmlFor="group-label-zh">
                  中文标签 <span className="text-destructive">*</span>
                </Label>
                <Input
                  autoComplete="off"
                  id="group-label-zh"
                  onChange={(e) =>
                    setGroupForm({ ...groupForm, groupLabelZh: e.target.value })
                  }
                  placeholder="例如 形貌与厚度"
                  value={groupForm.groupLabelZh}
                />
              </div>

              <div className="editor-field">
                <Label htmlFor="group-label-en">英文标签</Label>
                <Input
                  autoComplete="off"
                  id="group-label-en"
                  onChange={(e) =>
                    setGroupForm({ ...groupForm, groupLabelEn: e.target.value })
                  }
                  placeholder="例如 Morphology & Thickness"
                  value={groupForm.groupLabelEn}
                />
              </div>

              <div className="editor-field">
                <Label htmlFor="group-sort-order">
                  分组排序 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="group-sort-order"
                  type="number"
                  onChange={(e) =>
                    setGroupForm({
                      ...groupForm,
                      groupSortOrder: e.target.value,
                    })
                  }
                  value={groupForm.groupSortOrder}
                />
              </div>

              <div className="editor-field">
                <Label>归入该组的词条</Label>
                <p className="text-xs text-muted-foreground">
                  勾选可将词条加入本组；已在组内的词条不能在此移除——如需移出，请在该
                  词条的「编辑」中清除分组键。
                </p>
                <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-input p-2">
                  {rows.map((item) => {
                    const checked = groupForm.memberIds.includes(item.id)
                    const locked = lockedMemberIds.has(item.id)
                    return (
                      <label
                        key={item.id}
                        className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/60"
                      >
                        <input
                          type="checkbox"
                          aria-label={`成员 ${item.value}`}
                          // 已在组内者恒显为选中（即便经手输入分组键未预填成员）。
                          checked={checked || locked}
                          disabled={locked}
                          onChange={(e) =>
                            setGroupForm({
                              ...groupForm,
                              memberIds: e.target.checked
                                ? [...groupForm.memberIds, item.id]
                                : groupForm.memberIds.filter(
                                    (id) => id !== item.id,
                                  ),
                            })
                          }
                        />
                        <span className="truncate">
                          {item.label_zh}
                          <span className="text-muted-foreground">
                            {' '}
                            · {item.value}
                          </span>
                          {locked ? (
                            <span className="text-muted-foreground">
                              {' '}
                              · 已在组内
                            </span>
                          ) : null}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <Button
                disabled={upsertGroupMutation.isPending}
                onClick={handleGroupSubmit}
              >
                保存分组
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
