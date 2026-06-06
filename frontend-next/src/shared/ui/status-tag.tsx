import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ExperimentStatus, QualityLabel } from '@/shared/types/api'

type StatusMeta = {
  label: string
  className: string
  dot: string
}

const BADGE_BASE =
  'gap-1.5 rounded-full border-transparent px-2.5 py-0.5 text-xs font-medium'

const statusMeta: Record<ExperimentStatus, StatusMeta> = {
  draft: {
    label: '草稿',
    className: 'bg-secondary text-secondary-foreground hover:bg-secondary',
    dot: 'bg-muted-foreground/60',
  },
  submitted: {
    label: '已提交',
    className: 'bg-primary-soft text-accent-foreground hover:bg-primary-soft',
    dot: 'bg-primary',
  },
  locked: {
    label: '已锁定',
    className: 'bg-success-soft text-success hover:bg-success-soft',
    dot: 'bg-success',
  },
  invalid: {
    label: '已作废',
    className: 'bg-destructive-soft text-destructive hover:bg-destructive-soft',
    dot: 'bg-destructive',
  },
}

const qualityMeta: Record<QualityLabel, StatusMeta> = {
  success: {
    label: '成功',
    className: 'bg-success-soft text-success hover:bg-success-soft',
    dot: 'bg-success',
  },
  partial: {
    label: '部分成功',
    className: 'bg-warning-soft text-warning hover:bg-warning-soft',
    dot: 'bg-warning',
  },
  failed: {
    label: '失败',
    className: 'bg-destructive-soft text-destructive hover:bg-destructive-soft',
    dot: 'bg-destructive',
  },
  unknown: {
    label: '未判断',
    className: 'bg-secondary text-secondary-foreground hover:bg-secondary',
    dot: 'bg-muted-foreground/50',
  },
}

function MetaBadge({ meta }: { meta: StatusMeta }) {
  return (
    <Badge className={cn(BADGE_BASE, meta.className)}>
      <span className={cn('size-1.5 rounded-full', meta.dot)} aria-hidden />
      {meta.label}
    </Badge>
  )
}

export function StatusTag({ status }: { status: ExperimentStatus }) {
  return <MetaBadge meta={statusMeta[status] ?? statusMeta.draft} />
}

export function QualityTag({ label }: { label: QualityLabel }) {
  return <MetaBadge meta={qualityMeta[label] ?? qualityMeta.unknown} />
}
