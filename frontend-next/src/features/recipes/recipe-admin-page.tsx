import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { resolveErrorMessage } from '@/shared/api/http-error'
import type {
  ExperimentRead,
  RecipeCreateRequest,
  RecipeRead,
  RecipeUpdateRequest,
} from '@/shared/types/api'
import { EmptyState } from '@/shared/ui/empty-state'
import { LoadingState } from '@/shared/ui/loading-state'
import { PageHeader } from '@/shared/ui/page-header'
import { useAuth } from '@/features/auth/use-auth'
import {
  listExperimentModules,
  listExperiments,
  listActiveVocabularies,
} from '@/features/experiments/api'
import { VocabularyCombobox } from '@/features/experiments/components/vocabulary-combobox'
import type { VocabularySelectOption } from '@/features/experiments/editor-types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  createRecipe,
  deactivateRecipe,
  listAdminRecipes,
  updateRecipe,
} from './api'
import { RecipePayloadEditor } from './recipe-payload-editor'

const NONE_SENTINEL = '__all__'

type RecipeFormState = {
  name: string
  materialSystem: string
  description: string
  defaultPayloadJson: Record<string, unknown>
}

const defaultCreateFormState: RecipeFormState = {
  name: '',
  materialSystem: '',
  description: '',
  defaultPayloadJson: {},
}

function normalizeOptionalText(value: string) {
  const normalized = value.trim()
  return normalized ? normalized : null
}

function buildCreatePayload(formState: RecipeFormState) {
  const name = formState.name.trim()
  if (!name) {
    return {
      error: '请填写 Recipe 名称',
      payload: null,
    }
  }

  const payload: RecipeCreateRequest = {
    name,
    default_payload_json: formState.defaultPayloadJson,
  }
  const materialSystem = normalizeOptionalText(formState.materialSystem)
  const description = normalizeOptionalText(formState.description)
  if (materialSystem) {
    payload.material_system = materialSystem
  }
  if (description) {
    payload.description = description
  }

  return {
    error: null,
    payload,
  }
}

function buildEditPayload(original: RecipeRead, formState: RecipeFormState) {
  const nextName = formState.name.trim()
  if (!nextName) {
    return {
      error: 'Recipe 名称不能为空',
      payload: null,
    }
  }

  const nextMaterialSystem = normalizeOptionalText(formState.materialSystem)
  const nextDescription = normalizeOptionalText(formState.description)
  const payload: RecipeUpdateRequest = {}

  if (nextName !== original.name) {
    payload.name = nextName
  }
  if (nextMaterialSystem !== (original.material_system ?? '')) {
    payload.material_system = nextMaterialSystem
  }
  if (nextDescription !== (original.description ?? '')) {
    payload.description = nextDescription
  }

  const originalPayload = original.default_payload_json ?? {}
  if (
    JSON.stringify(formState.defaultPayloadJson) !==
    JSON.stringify(originalPayload)
  ) {
    payload.default_payload_json = formState.defaultPayloadJson
  }

  return {
    error: null,
    payload,
  }
}

function toFormState(recipe: RecipeRead): RecipeFormState {
  return {
    name: recipe.name,
    materialSystem: recipe.material_system ?? '',
    description: recipe.description ?? '',
    defaultPayloadJson: recipe.default_payload_json ?? {},
  }
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const RECIPE_MODULE_KEYS = new Set([
  'precursors',
  'substrates',
  'furnace_program',
  'gas_program',
  'characterization',
])

function sanitizeModulePayload(
  moduleKey: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (moduleKey === 'precursors') {
    const items = payload.items
    if (!Array.isArray(items)) return payload
    return {
      ...payload,
      items: items
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        )
        .map((item) => {
          const { batch_no, mass_mg, ...rest } = item
          void batch_no
          void mass_mg
          return rest
        }),
    }
  }
  return payload
}

function RecipeForm({
  formState,
  loading,
  materialOptions,
  materialSystemAriaLabel,
  vocabularyOptions,
  onChange,
  onSubmit,
  submitText,
  onImportFromExperiment,
}: {
  formState: RecipeFormState
  loading: boolean
  materialOptions: VocabularySelectOption[]
  materialSystemAriaLabel: string
  vocabularyOptions: Record<string, VocabularySelectOption[]>
  onChange: (next: RecipeFormState) => void
  onSubmit: () => void
  submitText: string
  onImportFromExperiment?: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="editor-field">
        <Label htmlFor="recipe-name">
          名称 <span className="text-destructive">*</span>
        </Label>
        <Input
          autoComplete="off"
          id="recipe-name"
          onChange={(e) => onChange({ ...formState, name: e.target.value })}
          placeholder="例如 MoS2 baseline"
          value={formState.name}
        />
      </div>

      <div className="editor-field">
        <Label>材料体系</Label>
        <VocabularyCombobox
          ariaLabel={materialSystemAriaLabel}
          disabled={false}
          onChange={(value) => onChange({ ...formState, materialSystem: value })}
          options={materialOptions}
          placeholder="选择或输入材料体系"
          value={formState.materialSystem}
        />
      </div>

      <div className="editor-field">
        <Label htmlFor="recipe-description">描述</Label>
        <Textarea
          autoComplete="off"
          rows={2}
          id="recipe-description"
          onChange={(e) =>
            onChange({ ...formState, description: e.target.value })
          }
          value={formState.description}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">默认参数</span>
        {onImportFromExperiment ? (
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0"
            onClick={onImportFromExperiment}
          >
            从实验导入
          </Button>
        ) : null}
      </div>

      <RecipePayloadEditor
        value={formState.defaultPayloadJson}
        onChange={(next) =>
          onChange({ ...formState, defaultPayloadJson: next })
        }
        vocabularyOptions={vocabularyOptions}
      />

      <Button className="mt-2" disabled={loading} onClick={onSubmit}>
        {submitText}
      </Button>
    </div>
  )
}

export function RecipeAdminPage() {
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const currentUser = session.currentUser
  const [appliedFilter, setAppliedFilter] = useState('')
  const [feedback, setFeedback] = useState<{
    type: 'error' | 'success'
    message: string
  } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<RecipeRead | null>(null)
  const [createForm, setCreateForm] = useState(defaultCreateFormState)
  const [editForm, setEditForm] = useState<RecipeFormState | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importSearch, setImportSearch] = useState('')
  const [importInput, setImportInput] = useState('')
  const [recipeToDeactivate, setRecipeToDeactivate] =
    useState<RecipeRead | null>(null)
  const [page, setPage] = useState(1)

  const isAdmin = currentUser?.role === 'admin'
  const queryPrefix = ['admin', 'recipes', currentUser?.id ?? 'anonymous']

  const recipesQuery = useQuery({
    queryKey: [...queryPrefix, appliedFilter || 'all'],
    queryFn: () =>
      listAdminRecipes(session.accessToken!, appliedFilter || undefined),
    enabled: session.isAuthenticated && isAdmin,
  })

  const materialSystemVocabQuery = useQuery({
    queryKey: ['vocabularies', 'material_system', currentUser?.id ?? 'anonymous'],
    queryFn: () =>
      listActiveVocabularies(session.accessToken!, 'material_system'),
    enabled: session.isAuthenticated && isAdmin,
  })

  const precursorMethodVocabQuery = useQuery({
    queryKey: ['vocabularies', 'precursor_method', currentUser?.id ?? 'anonymous'],
    queryFn: () =>
      listActiveVocabularies(session.accessToken!, 'precursor_method'),
    enabled: session.isAuthenticated && isAdmin,
  })

  const substrateTypeVocabQuery = useQuery({
    queryKey: ['vocabularies', 'substrate_type', currentUser?.id ?? 'anonymous'],
    queryFn: () =>
      listActiveVocabularies(session.accessToken!, 'substrate_type'),
    enabled: session.isAuthenticated && isAdmin,
  })

  const substrateBrandVocabQuery = useQuery({
    queryKey: ['vocabularies', 'substrate_brand', currentUser?.id ?? 'anonymous'],
    queryFn: () =>
      listActiveVocabularies(session.accessToken!, 'substrate_brand'),
    enabled: session.isAuthenticated && isAdmin,
  })

  const substrateSizeVocabQuery = useQuery({
    queryKey: ['vocabularies', 'substrate_size', currentUser?.id ?? 'anonymous'],
    queryFn: () =>
      listActiveVocabularies(session.accessToken!, 'substrate_size'),
    enabled: session.isAuthenticated && isAdmin,
  })

  const substrateTreatmentVocabQuery = useQuery({
    queryKey: [
      'vocabularies',
      'substrate_treatment_method',
      currentUser?.id ?? 'anonymous',
    ],
    queryFn: () =>
      listActiveVocabularies(
        session.accessToken!,
        'substrate_treatment_method',
      ),
    enabled: session.isAuthenticated && isAdmin,
  })

  const gasLabelVocabQuery = useQuery({
    queryKey: ['vocabularies', 'gas_label', currentUser?.id ?? 'anonymous'],
    queryFn: () => listActiveVocabularies(session.accessToken!, 'gas_label'),
    enabled: session.isAuthenticated && isAdmin,
  })

  const characterizationMethodVocabQuery = useQuery({
    queryKey: [
      'vocabularies',
      'characterization_method',
      currentUser?.id ?? 'anonymous',
    ],
    queryFn: () =>
      listActiveVocabularies(session.accessToken!, 'characterization_method'),
    enabled: session.isAuthenticated && isAdmin,
  })

  const toOptions = (query: typeof materialSystemVocabQuery) =>
    (query.data?.items ?? []).map((item) => ({
      label: item.label_zh || item.value,
      value: item.value,
    }))

  const vocabularyOptions = useMemo(
    () => ({
      material_system: toOptions(materialSystemVocabQuery),
      precursor_method: toOptions(precursorMethodVocabQuery),
      substrate_type: toOptions(substrateTypeVocabQuery),
      substrate_brand: toOptions(substrateBrandVocabQuery),
      substrate_size: toOptions(substrateSizeVocabQuery),
      substrate_treatment_method: toOptions(substrateTreatmentVocabQuery),
      gas_label: toOptions(gasLabelVocabQuery),
      characterization_method: toOptions(characterizationMethodVocabQuery),
    }),
    [
      materialSystemVocabQuery.data,
      precursorMethodVocabQuery.data,
      substrateTypeVocabQuery.data,
      substrateBrandVocabQuery.data,
      substrateSizeVocabQuery.data,
      substrateTreatmentVocabQuery.data,
      gasLabelVocabQuery.data,
      characterizationMethodVocabQuery.data,
    ],
  )

  const materialOptions = useMemo(
    () => vocabularyOptions.material_system,
    [vocabularyOptions.material_system],
  )

  const experimentsQuery = useQuery({
    queryKey: [
      'experiments',
      'import',
      importSearch,
      currentUser?.id ?? 'anonymous',
    ],
    queryFn: () =>
      listExperiments(session.accessToken!, {
        status: ['submitted', 'locked'],
        q: importSearch || undefined,
      }),
    enabled: session.isAuthenticated && isAdmin && importOpen,
  })

  const importMutation = useMutation({
    mutationFn: async (experimentId: string) => {
      const modules = await listExperimentModules(
        session.accessToken!,
        experimentId,
      )
      const payload: Record<string, unknown> = {}
      for (const mod of modules.items) {
        if (RECIPE_MODULE_KEYS.has(mod.module_key)) {
          payload[mod.module_key] = sanitizeModulePayload(
            mod.module_key,
            mod.payload_json,
          )
        }
      }
      return payload
    },
    onSuccess: (payload) => {
      setCreateForm((prev) => ({ ...prev, defaultPayloadJson: payload }))
      setImportOpen(false)
      setFeedback({ message: '已从实验导入参数', type: 'success' })
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, '导入实验参数失败'),
        type: 'error',
      })
    },
  })

  const invalidateRecipeQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryPrefix,
      }),
      queryClient.invalidateQueries({
        queryKey: ['recipes'],
      }),
    ])
  }

  const createMutation = useMutation({
    mutationFn: (payload: RecipeCreateRequest) =>
      createRecipe(session.accessToken!, payload),
    onSuccess: async () => {
      setFeedback({ message: 'Recipe 创建成功', type: 'success' })
      setCreateOpen(false)
      setCreateForm(defaultCreateFormState)
      await invalidateRecipeQueries()
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, 'Recipe 创建失败'),
        type: 'error',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      payload,
      recipeId,
    }: {
      payload: RecipeUpdateRequest
      recipeId: string
    }) => updateRecipe(session.accessToken!, recipeId, payload),
    onSuccess: async () => {
      setFeedback({ message: 'Recipe 更新成功', type: 'success' })
      setEditTarget(null)
      setEditForm(null)
      await invalidateRecipeQueries()
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, 'Recipe 更新失败'),
        type: 'error',
      })
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (recipeId: string) =>
      deactivateRecipe(session.accessToken!, recipeId),
    onSuccess: async () => {
      setFeedback({ message: 'Recipe 已停用', type: 'success' })
      await invalidateRecipeQueries()
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, 'Recipe 停用失败'),
        type: 'error',
      })
    },
  })

  const reactivateMutation = useMutation({
    mutationFn: (recipeId: string) =>
      updateRecipe(session.accessToken!, recipeId, { is_active: true }),
    onSuccess: async () => {
      setFeedback({ message: 'Recipe 已重新激活', type: 'success' })
      await invalidateRecipeQueries()
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, 'Recipe 重新激活失败'),
        type: 'error',
      })
    },
  })

  const handleCreateSubmit = () => {
    setFeedback(null)
    const result = buildCreatePayload(createForm)
    if (result.error || !result.payload) {
      setFeedback({ message: result.error ?? 'Recipe 创建失败', type: 'error' })
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
      setFeedback({ message: result.error ?? 'Recipe 更新失败', type: 'error' })
      return
    }

    updateMutation.mutate({ payload: result.payload, recipeId: editTarget.id })
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader subtitle="Recipe 管理仅对管理员开放。" title="Recipe 管理" />
        <Alert className="border-warning/40 bg-warning-soft [&>svg]:text-warning">
          <AlertDescription className="text-foreground">
            当前账号没有 Recipe 管理权限。
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const rows = recipesQuery.data?.items ?? []
  const PAGE_SIZE = 20
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginatedRows = rows.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  )

  const filterOptions = materialOptions

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
            新增 Recipe
          </Button>
        }
        subtitle="管理可复用的实验默认参数，Recipe 可用于快速创建标准化实验草稿。"
        title="Recipe 管理"
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
            <Label htmlFor="recipe-filter-material">材料体系筛选</Label>
            <Select
              value={appliedFilter || NONE_SENTINEL}
              onValueChange={(value) => {
                setAppliedFilter(value === NONE_SENTINEL ? '' : value)
                setPage(1)
              }}
            >
              <SelectTrigger
                id="recipe-filter-material"
                className="w-65"
                aria-label="材料体系筛选"
              >
                <SelectValue placeholder="选择材料体系" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_SENTINEL}>全部</SelectItem>
                {filterOptions.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
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
          {recipesQuery.isLoading ? (
            <LoadingState />
          ) : recipesQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {resolveErrorMessage(recipesQuery.error, 'Recipe 列表加载失败')}
              </AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <EmptyState description="当前筛选条件下还没有 Recipe。可清空筛选或新增 Recipe。" />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>材料体系</TableHead>
                      <TableHead>描述</TableHead>
                      <TableHead>创建者</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRows.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">
                          {record.name}
                        </TableCell>
                        <TableCell>{record.material_system || '-'}</TableCell>
                        <TableCell>{record.description || '-'}</TableCell>
                        <TableCell>
                          {record.created_by
                            ? record.created_by.slice(0, 8) + '…'
                            : '-'}
                        </TableCell>
                        <TableCell>{formatDateTime(record.created_at)}</TableCell>
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
                              aria-label={`编辑 ${record.name}`}
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
                                aria-label={`停用 ${record.name}`}
                                className="text-destructive hover:text-destructive"
                                disabled={
                                  deactivateMutation.isPending &&
                                  deactivateMutation.variables === record.id
                                }
                                onClick={() => {
                                  setFeedback(null)
                                  setRecipeToDeactivate(record)
                                }}
                              >
                                停用
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`重新激活 ${record.name}`}
                                disabled={
                                  reactivateMutation.isPending &&
                                  reactivateMutation.variables === record.id
                                }
                                onClick={() => {
                                  setFeedback(null)
                                  reactivateMutation.mutate(record.id)
                                }}
                              >
                                重新激活
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
        <DialogContent className="max-h-[88vh] gap-0 overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>新增 Recipe</DialogTitle>
            <DialogDescription className="sr-only">
              创建可复用的实验默认参数
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-6 max-h-[70vh] overflow-y-auto px-6 py-2">
            <RecipeForm
              formState={createForm}
              loading={createMutation.isPending}
              materialOptions={materialOptions}
              materialSystemAriaLabel="创建材料体系"
              onChange={setCreateForm}
              onImportFromExperiment={() => setImportOpen(true)}
              onSubmit={handleCreateSubmit}
              submitText="创建 Recipe"
              vocabularyOptions={vocabularyOptions}
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
        <DialogContent className="max-h-[88vh] gap-0 overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? `编辑 Recipe · ${editTarget.name}` : '编辑 Recipe'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              编辑可复用的实验默认参数
            </DialogDescription>
          </DialogHeader>
          {editTarget && editForm ? (
            <div className="-mx-6 max-h-[70vh] overflow-y-auto px-6 py-2">
              <RecipeForm
                formState={editForm}
                loading={updateMutation.isPending}
                materialOptions={materialOptions}
                materialSystemAriaLabel="编辑材料体系"
                onChange={setEditForm}
                onSubmit={handleEditSubmit}
                submitText="保存修改"
                vocabularyOptions={vocabularyOptions}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Import from experiment dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[85vh] gap-0 overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>从实验导入</DialogTitle>
            <DialogDescription className="sr-only">
              从已提交或已锁定的实验导入默认参数
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-6 flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-6 py-2">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                setImportSearch(importInput.trim())
              }}
            >
              <Input
                autoComplete="off"
                placeholder="搜索实验编号或材料体系"
                value={importInput}
                onChange={(e) => setImportInput(e.target.value)}
              />
              <Button type="submit">搜索</Button>
            </form>
            {experimentsQuery.isLoading ? (
              <LoadingState />
            ) : experimentsQuery.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {resolveErrorMessage(
                    experimentsQuery.error,
                    '实验列表加载失败',
                  )}
                </AlertDescription>
              </Alert>
            ) : (experimentsQuery.data?.items ?? []).length === 0 ? (
              <EmptyState description="没有可导入的已提交/已锁定实验。" />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>运行编号</TableHead>
                      <TableHead>材料体系</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(experimentsQuery.data?.items ?? []).map(
                      (experiment: ExperimentRead) => (
                        <TableRow key={experiment.id}>
                          <TableCell>{experiment.run_code}</TableCell>
                          <TableCell>
                            {experiment.material_system || '-'}
                          </TableCell>
                          <TableCell>{experiment.status}</TableCell>
                          <TableCell>
                            {formatDateTime(experiment.created_at)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto px-0"
                              disabled={importMutation.isPending}
                              onClick={() =>
                                importMutation.mutate(experiment.id)
                              }
                            >
                              导入
                            </Button>
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirm */}
      <AlertDialog
        open={recipeToDeactivate !== null}
        onOpenChange={(open) => {
          if (!open) setRecipeToDeactivate(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认停用 Recipe？</AlertDialogTitle>
            <AlertDialogDescription>
              确定停用 Recipe “{recipeToDeactivate?.name}” 吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (recipeToDeactivate) {
                  setFeedback(null)
                  deactivateMutation.mutate(recipeToDeactivate.id)
                  setRecipeToDeactivate(null)
                }
              }}
            >
              确认停用
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
