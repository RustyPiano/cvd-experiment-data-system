import { AlertTriangle } from 'lucide-react'

import type {
  ExperimentValidationIssue,
  ExperimentValidationResponse,
} from '@/shared/types/api'
import { cn } from '@/lib/utils'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const moduleLabels: Record<string, string> = {
  basic_info: '基础信息',
  environment: '环境条件',
  precheck: '预检查',
  precursors: '前驱体',
  substrates: '基底',
  furnace_program: '炉温程序',
  gas_program: '气体程序',
  process_observation: '过程观察',
  characterization: '表征结果',
  result_summary: '结果总结',
  files: '实验文件',
}

type ValidationIssueItem = ExperimentValidationIssue & {
  level: 'error' | 'warning'
}

function getModuleLabel(moduleKey: string) {
  return moduleLabels[moduleKey] ?? moduleKey
}

function getSummaryValue(
  value: number | null | undefined,
  fallback: number,
) {
  return typeof value === 'number' ? value : fallback
}

export function ValidationSummary({
  result,
  onJumpToModule,
}: {
  result: ExperimentValidationResponse
  onJumpToModule: (moduleKey: string) => void
}) {
  const items: ValidationIssueItem[] = [
    ...result.errors.map((issue) => ({ ...issue, level: 'error' as const })),
    ...result.warnings.map((issue) => ({
      ...issue,
      level: 'warning' as const,
    })),
  ]
  const completionScore = getSummaryValue(
    result.completion_score,
    items.length === 0 ? 100 : 0,
  )
  const blockingCount = getSummaryValue(
    result.blocking_count,
    result.errors.length,
  )
  const warningCount = getSummaryValue(
    result.warning_count,
    result.warnings.length,
  )
  const moduleTargets = [...new Set(items.map((issue) => issue.module_key))]

  if (items.length === 0 && completionScore >= 100) {
    return null
  }

  const hasErrors = blockingCount > 0

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <Alert
          variant={hasErrors ? 'destructive' : 'default'}
          className={cn(
            !hasErrors &&
              'border-warning/40 bg-warning-soft [&>svg]:text-warning',
          )}
        >
          <AlertTriangle />
          <AlertTitle className={cn(!hasErrors && 'text-foreground')}>
            {`校验发现 ${blockingCount} 个错误，${warningCount} 个警告`}
          </AlertTitle>
        </Alert>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={cn(
              completionScore >= 90
                ? 'bg-success-soft text-success'
                : completionScore >= 70
                  ? 'bg-warning-soft text-warning'
                  : 'bg-destructive-soft text-destructive',
            )}
          >
            完整度 {completionScore}%
          </Badge>
          <Badge
            className={cn(
              blockingCount > 0
                ? 'bg-destructive-soft text-destructive'
                : 'bg-success-soft text-success',
            )}
          >
            阻塞项 {blockingCount}
          </Badge>
          <Badge
            className={cn(
              warningCount > 0
                ? 'bg-warning-soft text-warning'
                : 'bg-success-soft text-success',
            )}
          >
            提示项 {warningCount}
          </Badge>
          {moduleTargets.map((moduleKey) => (
            <Button
              key={moduleKey}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onJumpToModule(moduleKey)}
            >
              跳转到{getModuleLabel(moduleKey)}
            </Button>
          ))}
        </div>

        <ul className="flex flex-col gap-2">
          {items.map((issue, index) => (
            <li
              key={`${issue.level}-${issue.module_key}-${issue.field_path}-${index}`}
              className="flex flex-wrap items-start gap-2 text-sm"
            >
              <Badge
                className={cn(
                  issue.level === 'error'
                    ? 'bg-destructive-soft text-destructive'
                    : 'bg-warning-soft text-warning',
                )}
              >
                {issue.level === 'error' ? '错误' : '警告'}
              </Badge>
              <span className="text-muted-foreground">
                {getModuleLabel(issue.module_key)}
              </span>
              <span className="text-foreground">{issue.message}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
