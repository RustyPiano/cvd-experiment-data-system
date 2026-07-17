import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ExperimentStatus } from '@/shared/types/api'
import { useTranslation } from 'react-i18next'

type StatusMeta = {
  className: string
  dot: string
}

const BADGE_BASE =
  'gap-1.5 rounded-full border-transparent px-2.5 py-0.5 text-xs font-medium'

const statusMeta: Partial<Record<ExperimentStatus, StatusMeta>> = {
  draft: {
    className: 'bg-secondary text-secondary-foreground hover:bg-secondary',
    dot: 'bg-muted-foreground/60',
  },
  locked: {
    className: 'bg-success-soft text-success-text hover:bg-success-soft',
    dot: 'bg-success',
  },
  invalid: {
    className: 'bg-destructive-soft text-destructive-text hover:bg-destructive-soft',
    dot: 'bg-destructive',
  },
}

function MetaBadge({ label, meta }: { label: string; meta: StatusMeta }) {
  return (
    <Badge className={cn(BADGE_BASE, meta.className)}>
      <span className={cn('size-1.5 rounded-full', meta.dot)} aria-hidden />
      {label}
    </Badge>
  )
}

export function StatusTag({ status }: { status: ExperimentStatus }) {
  const { t } = useTranslation()
  const meta = statusMeta[status] ?? {
    className: 'bg-secondary text-secondary-foreground hover:bg-secondary',
    dot: 'bg-muted-foreground/60',
  }
  return (
    <MetaBadge
      meta={meta}
      label={t(`experimentsV2.status.${status}`, { defaultValue: status })}
    />
  )
}
