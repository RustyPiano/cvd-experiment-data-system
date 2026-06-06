import { Link } from '@tanstack/react-router'
import { Info } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { ExperimentRead } from '@/shared/types/api'

export function ExperimentSourceBanner({
  experiment,
}: {
  experiment: Pick<
    ExperimentRead,
    'derived_from_run_code' | 'derived_from_run_id'
  >
}) {
  if (!experiment.derived_from_run_id && !experiment.derived_from_run_code) {
    return null
  }

  const sourceLabel = experiment.derived_from_run_code ?? '历史实验'

  return (
    <Alert>
      <Info className="size-4" />
      <AlertTitle>本实验派生自 {sourceLabel}</AlertTitle>
      <AlertDescription>
        <p className="mb-2">
          已自动复制基础工艺参数与计划字段；环境条件仅保留样品环境，预检查已重置，
          表征结果仅保留计划字段并清空结果，结果总结已重置为待重新确认状态。
        </p>
        {experiment.derived_from_run_id ? (
          <p className="text-muted-foreground">
            来源实验：{' '}
            <Link
              to="/experiments/$experimentId"
              params={{ experimentId: experiment.derived_from_run_id }}
              className="text-primary underline-offset-4 hover:underline"
            >
              {sourceLabel}
            </Link>
          </p>
        ) : (
          <p className="text-muted-foreground">来源实验：{sourceLabel}</p>
        )}
      </AlertDescription>
    </Alert>
  )
}
