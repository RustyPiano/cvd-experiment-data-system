import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import dayjs from 'dayjs'

import { resolveErrorMessage } from '@/shared/api/http-error'
import type { ExperimentRead, RecipeRead } from '@/shared/types/api'
import { EmptyState } from '@/shared/ui/empty-state'
import { PageHeader } from '@/shared/ui/page-header'
import { useAuth } from '@/features/auth/use-auth'
import { listActiveRecipes } from '@/features/recipes/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  cloneExperiment,
  createExperiment,
  createExperimentFromRecipe,
  createSetupMethodsFromLibrary,
  getSetupMethods,
  listExperimentModules,
  listExperiments,
} from './api'
import { HistoryCloneDialog } from './components/history-clone-dialog'

const MODULE_LABELS: Record<string, string> = {
  precursors: '前驱体',
  substrates: '基底',
  furnace_program: '温区程序',
  gas_program: '气体程序',
  characterization: '表征计划',
}

const RECIPE_MODULE_KEYS = [
  'precursors',
  'substrates',
  'furnace_program',
  'gas_program',
  'characterization',
]

function getModuleSummary(
  moduleKey: string,
  data: Record<string, unknown>,
): string {
  switch (moduleKey) {
    case 'precursors': {
      const items = Array.isArray(data.items) ? data.items : []
      const species = items
        .map((item: Record<string, unknown>) => (item.species as string) || '未命名')
        .join(', ')
      return `${items.length} 条${species ? ` (${species})` : ''}`
    }
    case 'substrates': {
      const items = Array.isArray(data.items) ? data.items : []
      return `${items.length} 条`
    }
    case 'furnace_program': {
      const zones = Array.isArray(data.zones) ? data.zones : []
      return `${zones.length} 个温区`
    }
    case 'gas_program': {
      const segments = Array.isArray(data.segments) ? data.segments : []
      return `${segments.length} 段${data.pre_washing_gas ? `，洗炉: ${data.pre_washing_gas}` : ''}`
    }
    case 'characterization': {
      const methods = Array.isArray(data.methods) ? data.methods : []
      const methodNames = methods
        .map((m: Record<string, unknown>) => (m.method as string) || '未命名')
        .join(', ')
      return `${methods.length} 个方法${methodNames ? ` (${methodNames})` : ''}`
    }
    default:
      return '已配置'
  }
}

function RecipeModuleSummaries({
  payload,
}: {
  payload: Record<string, unknown>
}) {
  return (
    <div className="flex flex-col gap-2">
      {RECIPE_MODULE_KEYS.map((key) => {
        const moduleData = payload[key]
        const label = MODULE_LABELS[key]
        if (!moduleData || typeof moduleData !== 'object') {
          return (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <Badge variant="outline">空</Badge>
            </div>
          )
        }

        const summary = getModuleSummary(
          key,
          moduleData as Record<string, unknown>,
        )
        return (
          <div key={key} className="flex items-center justify-between text-sm">
            <span>{label}</span>
            <Badge className="bg-success-soft text-success">{summary}</Badge>
          </div>
        )
      })}
    </div>
  )
}

function groupRecipesByMaterialSystem(recipes: RecipeRead[]) {
  return recipes.reduce<
    Array<{ materialSystem: string; recipes: RecipeRead[] }>
  >((groups, recipe) => {
    const materialSystem = recipe.material_system || '未分组'
    const existingGroup = groups.find(
      (group) => group.materialSystem === materialSystem,
    )

    if (existingGroup) {
      existingGroup.recipes.push(recipe)
      return groups
    }

    groups.push({ materialSystem, recipes: [recipe] })
    return groups
  }, [])
}

const inheritanceStoragePrefix = 'experiment:inherit:'

function inheritanceStorageKey(sourceExperimentId: string) {
  return `${inheritanceStoragePrefix}${sourceExperimentId}`
}

function writeInheritancePayload({
  environment,
  precheck,
  sourceExperiment,
}: {
  environment?: Record<string, unknown>
  precheck?: Record<string, unknown>
  sourceExperiment: ExperimentRead
}) {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(
    inheritanceStorageKey(sourceExperiment.id),
    JSON.stringify({
      sourceExperimentId: sourceExperiment.id,
      sourceRunCode: sourceExperiment.run_code,
      environment: environment ?? null,
      precheck: precheck ?? null,
    }),
  )
}

function removeInheritancePayload(sourceExperimentId: string | null) {
  if (!sourceExperimentId || typeof window === 'undefined') {
    return
  }

  window.sessionStorage.removeItem(inheritanceStorageKey(sourceExperimentId))
}

export function ExperimentNewPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const isViewer = session.currentUser?.role === 'viewer'
  const [historyCloneOpen, setHistoryCloneOpen] = useState(false)
  const [recipeModalOpen, setRecipeModalOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [recipeCreateError, setRecipeCreateError] = useState<string | null>(
    null,
  )
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeRead | null>(null)

  const navigateToEditor = (
    experiment: ExperimentRead,
    inheritFrom?: string | null,
  ) => {
    void navigate({
      to: '/experiments/$experimentId/edit',
      params: { experimentId: experiment.id },
      search: inheritFrom ? { inheritFrom } : {},
    })
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      let inheritFrom: string | null = null
      let lastSetupLibraryId: string | null = null
      const recentResponse = await listExperiments(session.accessToken!, {
        mine: true,
        status: ['draft', 'submitted', 'locked'],
        sortBy: 'updated_at',
        sortOrder: 'desc',
        page: 1,
        pageSize: 1,
      })
      const sourceExperiment = recentResponse.items[0]

      if (sourceExperiment) {
        const modulesResponse = await listExperimentModules(
          session.accessToken!,
          sourceExperiment.id,
        )
        const modulePayloads = Object.fromEntries(
          modulesResponse.items.map((module) => [
            module.module_key,
            module.payload_json,
          ]),
        )
        writeInheritancePayload({
          environment: modulePayloads.environment,
          precheck: modulePayloads.precheck,
          sourceExperiment,
        })
        inheritFrom = sourceExperiment.id

        try {
          const setupResponse = await getSetupMethods(
            session.accessToken!,
            sourceExperiment.id,
          )
          if (setupResponse && setupResponse.source_setup_library_id) {
            lastSetupLibraryId = setupResponse.source_setup_library_id
          }
        } catch {
          // Swallow errors (404/500) cleanly
        }
      }

      try {
        const experiment = await createExperiment(session.accessToken!, {
          experiment_type: 'cvd',
          material_system: null,
          experiment_date: dayjs().format('YYYY-MM-DD'),
          objective: null,
        })

        if (lastSetupLibraryId) {
          try {
            await createSetupMethodsFromLibrary(
              session.accessToken!,
              experiment.id,
              lastSetupLibraryId,
            )
          } catch {
            // Swallow errors in case the library entry is deactivated or deleted
          }
        }

        return { experiment, inheritFrom }
      } catch (error) {
        removeInheritancePayload(inheritFrom)
        throw error
      }
    },
    onSuccess: ({ experiment, inheritFrom }) => {
      setActionError(null)
      toast.success('实验创建成功')
      navigateToEditor(experiment, inheritFrom)
    },
    onError: (error) => {
      setActionError(resolveErrorMessage(error, '创建实验失败'))
    },
  })

  const recentCloneMutation = useMutation({
    mutationFn: async () => {
      const response = await listExperiments(session.accessToken!, {
        mine: true,
        page: 1,
        pageSize: 1,
        status: ['submitted', 'locked'],
      })

      const sourceExperiment = response.items[0]
      if (!sourceExperiment) {
        throw new Error('最近没有可复制的已提交或已锁定实验。')
      }

      return cloneExperiment(session.accessToken!, sourceExperiment.id)
    },
    onSuccess: (experiment) => {
      setActionError(null)
      toast.success('实验复制成功')
      navigateToEditor(experiment)
    },
    onError: (error) => {
      setActionError(resolveErrorMessage(error, '复制最近一条实验失败'))
    },
  })

  const recipesQuery = useQuery({
    enabled: recipeModalOpen && Boolean(session.accessToken) && !isViewer,
    queryFn: () => listActiveRecipes(session.accessToken!),
    queryKey: ['recipes', 'active', 'experiment-new'],
  })

  const groupedRecipes = useMemo(
    () => groupRecipesByMaterialSystem(recipesQuery.data?.items ?? []),
    [recipesQuery.data?.items],
  )

  const createFromRecipeMutation = useMutation({
    mutationFn: (recipeId: string) =>
      createExperimentFromRecipe(session.accessToken!, {
        recipe_id: recipeId,
        experiment_date: dayjs().format('YYYY-MM-DD'),
      }),
    onSuccess: (experiment) => {
      setActionError(null)
      setRecipeCreateError(null)
      setSelectedRecipe(null)
      setRecipeModalOpen(false)
      toast.success('实验创建成功')
      navigateToEditor(experiment)
    },
    onError: (error) => {
      setRecipeCreateError(
        resolveErrorMessage(error, '从 Recipe 创建实验失败'),
      )
    },
  })

  const closeRecipeModal = () => {
    setRecipeCreateError(null)
    setSelectedRecipe(null)
    setRecipeModalOpen(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        subtitle="支持空白创建、复制最近一条实验，或从 Recipe 快速创建标准化草稿。"
        title="新建实验"
      />
      {isViewer ? (
        <Alert className="border-warning/40 bg-warning-soft [&>svg]:text-warning">
          <AlertDescription className="text-foreground">
            当前账号没有创建实验权限。
          </AlertDescription>
        </Alert>
      ) : null}
      {actionError ? (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>空白 CVD 实验</CardTitle>
            <CardDescription>
              以今天日期创建新的草稿，后续在模块编辑器中补充参数与结果。
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            {!isViewer ? (
              <Button
                disabled={createMutation.isPending}
                onClick={() => {
                  setActionError(null)
                  createMutation.mutate()
                }}
              >
                {createMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                立即创建
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>复制我的最近一条</CardTitle>
            <CardDescription>
              系统会优先查找你最近更新的一条已提交或已锁定实验，并直接派生出新草稿。
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            {!isViewer ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  disabled={recentCloneMutation.isPending}
                  onClick={() => {
                    setActionError(null)
                    recentCloneMutation.mutate()
                  }}
                >
                  {recentCloneMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  复制最近一条
                </Button>
                <Button
                  variant="link"
                  onClick={() => {
                    setActionError(null)
                    setHistoryCloneOpen(true)
                  }}
                >
                  搜索历史实验
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>从 Recipe 创建</CardTitle>
            <CardDescription>
              选择已维护的 Recipe，将默认参数带入新草稿，适合重复工艺快速起步。
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            {!isViewer ? (
              <Button
                variant="outline"
                onClick={() => {
                  setActionError(null)
                  setRecipeCreateError(null)
                  setRecipeModalOpen(true)
                }}
              >
                选择 Recipe
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {session.accessToken && session.currentUser ? (
        <HistoryCloneDialog
          accessToken={session.accessToken}
          currentUserId={session.currentUser.id}
          onCancel={() => setHistoryCloneOpen(false)}
          onCloned={(experiment) => {
            setHistoryCloneOpen(false)
            navigateToEditor(experiment)
          }}
          open={historyCloneOpen}
        />
      ) : null}

      <Dialog
        open={recipeModalOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeRecipeModal()
        }}
      >
        <DialogContent className="max-h-[85vh] gap-0 overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>从 Recipe 创建实验</DialogTitle>
            <DialogDescription className="sr-only">
              选择一个 Recipe 模板创建实验草稿
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 overflow-y-auto pt-2">
            {selectedRecipe ? (
              <>
                {recipeCreateError ? (
                  <Alert variant="destructive">
                    <AlertDescription>{recipeCreateError}</AlertDescription>
                  </Alert>
                ) : null}
                <div>
                  <h3 className="text-base font-semibold">
                    {selectedRecipe.name}
                  </h3>
                  {selectedRecipe.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedRecipe.description}
                    </p>
                  ) : null}
                  {selectedRecipe.material_system ? (
                    <Badge className="mt-2 bg-primary-soft text-primary">
                      {selectedRecipe.material_system}
                    </Badge>
                  ) : null}
                </div>
                <Separator />
                {Object.keys(selectedRecipe.default_payload_json).length ===
                0 ? (
                  <Alert className="border-primary/30 bg-primary-soft [&>svg]:text-primary">
                    <AlertDescription className="text-foreground">
                      此 Recipe 未配置默认参数，将创建空白实验。
                    </AlertDescription>
                  </Alert>
                ) : (
                  <RecipeModuleSummaries
                    payload={selectedRecipe.default_payload_json}
                  />
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedRecipe(null)
                      setRecipeCreateError(null)
                    }}
                  >
                    返回
                  </Button>
                  <Button
                    disabled={createFromRecipeMutation.isPending}
                    onClick={() => {
                      setActionError(null)
                      setRecipeCreateError(null)
                      createFromRecipeMutation.mutate(selectedRecipe.id)
                    }}
                  >
                    {createFromRecipeMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    确认创建实验
                  </Button>
                </div>
              </>
            ) : recipesQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : recipesQuery.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {resolveErrorMessage(
                    recipesQuery.error,
                    'Recipe 列表加载失败',
                  )}
                </AlertDescription>
              </Alert>
            ) : groupedRecipes.length === 0 ? (
              <EmptyState description="当前没有可用的 Recipe。" />
            ) : (
              <>
                {recipeCreateError ? (
                  <Alert variant="destructive">
                    <AlertDescription>{recipeCreateError}</AlertDescription>
                  </Alert>
                ) : null}
                {groupedRecipes.map((group) => (
                  <section key={group.materialSystem} className="flex flex-col gap-2">
                    <h4 className="text-sm font-semibold text-muted-foreground">
                      {group.materialSystem}
                    </h4>
                    <ul className="flex flex-col gap-2">
                      {group.recipes.map((recipe) => (
                        <li
                          key={recipe.id}
                          className="flex items-center justify-between gap-4 rounded-md border p-3"
                        >
                          <div className="min-w-0">
                            <p className="font-medium">{recipe.name}</p>
                            <p className="truncate text-sm text-muted-foreground">
                              {recipe.description || '暂无描述'}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => {
                              setActionError(null)
                              setRecipeCreateError(null)
                              setSelectedRecipe(recipe)
                            }}
                          >
                            预览
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
