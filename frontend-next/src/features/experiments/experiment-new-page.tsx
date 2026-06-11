import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import dayjs from 'dayjs'

import { resolveErrorMessage } from '@/shared/api/http-error'
import type { ExperimentRead } from '@/shared/types/api'
import { PageHeader } from '@/shared/ui/page-header'
import { useAuth } from '@/features/auth/use-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  cloneExperiment,
  createExperiment,
  createSetupMethodsFromLibrary,
  getSetupMethods,
  listExperimentModules,
  listExperiments,
} from './api'
import { HistoryCloneDialog } from './components/history-clone-dialog'

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
  const [historyCloneOpen, setHistoryCloneOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        subtitle="支持空白创建，或复制 / 派生最近一条实验快速起步。"
        title="新建实验"
      />
      {actionError ? (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>空白 CVD 实验</CardTitle>
            <CardDescription>
              以今天日期创建新的草稿，后续在模块编辑器中补充参数与结果。
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
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
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>复制 / 派生最近一条</CardTitle>
            <CardDescription>
              系统会优先查找你最近更新的一条已提交或已锁定实验，并直接派生出新草稿；也可搜索历史实验。
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
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
    </div>
  )
}
