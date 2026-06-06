import dayjs from 'dayjs'
import { StatusTag, QualityTag } from '@/shared/ui/status-tag'
import type { ExperimentRead } from '@/shared/types/api'

type DescItem = {
  label: string
  value: React.ReactNode
}

function DescRow({ label, value }: DescItem) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <span className="min-w-[7rem] shrink-0 text-sm font-medium text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  )
}

export function ExperimentSummary({
  experiment,
}: {
  experiment: ExperimentRead
}) {
  const rows: DescItem[] = [
    {
      label: '实验编号',
      value: (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          {experiment.run_code}
        </code>
      ),
    },
    {
      label: '状态',
      value: <StatusTag status={experiment.status} />,
    },
    {
      label: '质量标签',
      value: <QualityTag label={experiment.quality_label} />,
    },
    {
      label: '材料体系',
      value: experiment.material_system || (
        <span className="text-muted-foreground">未填写</span>
      ),
    },
    {
      label: '实验日期',
      value: experiment.experiment_date ? (
        dayjs(experiment.experiment_date).format('YYYY-MM-DD')
      ) : (
        <span className="text-muted-foreground">未填写</span>
      ),
    },
    {
      label: '实验目的',
      value: experiment.objective || (
        <span className="text-muted-foreground">未填写</span>
      ),
    },
    {
      label: '总结结论',
      value: experiment.summary_result || (
        <span className="text-muted-foreground">未填写</span>
      ),
    },
    ...(experiment.invalid_reason
      ? [
          {
            label: '作废原因',
            value: (
              <span className="text-destructive">
                {experiment.invalid_reason}
              </span>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <DescRow key={row.label} label={row.label} value={row.value} />
      ))}
    </div>
  )
}
