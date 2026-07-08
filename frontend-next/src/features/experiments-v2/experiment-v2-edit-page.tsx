// v2 编辑实验页：拉取 run + §1–§4 模块 payload，还原表单状态，支持分模块保存。
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { LoadingState } from '@/shared/ui/loading-state'
import { PageHeader } from '@/shared/ui/page-header'
import { useAuth } from '@/features/auth/use-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { getModuleOrNull, getRun } from './api'
import type { V2ModulePayloadRead } from './api'
import { ExperimentV2Form } from './experiment-v2-form'
import { buildStateFromLoaded } from './form-state'

const LOADED_MODULE_KEYS = [
  'basic_info',
  'target_product',
  'precursors',
  'substrates',
] as const

export function ExperimentV2EditPage({ runId }: { runId: string }) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const token = session.accessToken || ''

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['v2-experiment', runId, token],
    enabled: session.isAuthenticated && !!token,
    queryFn: async () => {
      const run = await getRun(runId, token)
      const entries = await Promise.all(
        LOADED_MODULE_KEYS.map(
          async (key) =>
            [key, await getModuleOrNull(runId, key, token)] as const,
        ),
      )
      const modules: Record<string, V2ModulePayloadRead | null> = {}
      for (const [key, payload] of entries) modules[key] = payload
      return { run, modules }
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('experimentsV2.edit.title')}
        subtitle={t('experimentsV2.edit.subtitle')}
      />
      {isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {resolveErrorMessage(error, t('experimentsV2.edit.loadError'))}
          </AlertDescription>
        </Alert>
      ) : null}
      {isLoading || !data ? (
        <LoadingState />
      ) : (
        <ExperimentV2Form
          mode="edit"
          runId={runId}
          runCode={data.run.run_code}
          initialState={buildStateFromLoaded(data.run, data.modules)}
        />
      )}
    </div>
  )
}
