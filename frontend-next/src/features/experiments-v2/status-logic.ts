import type { ExperimentStatus } from '@/shared/types/api'

export type RunStatus = ExperimentStatus
export type StatusAction = 'lock' | 'unlock' | 'invalidate'

export function availableStatusActions(
  status: RunStatus,
  canWrite: boolean,
  isAdmin: boolean,
): StatusAction[] {
  if (!canWrite) return []
  if (status === 'draft') return ['lock', 'invalidate']
  if (['locked', 'reviewed'].includes(status) && isAdmin) return ['unlock']
  return []
}

export const isProcessReadOnly = (status: RunStatus, canWrite: boolean) =>
  !canWrite ||
  status === 'locked' ||
  status === 'reviewed' ||
  status === 'invalid'

export function statusBadgeVariant(status: RunStatus) {
  return (
    {
      draft: 'secondary',
      locked: 'default',
      reviewed: 'outline',
      invalid: 'destructive',
    } as const
  )[status]
}

export const statusLabelKey = (status: RunStatus) =>
  (
    ({
      draft: 'experimentsV2.status.draft',
      locked: 'experimentsV2.status.locked',
      reviewed: 'experimentsV2.status.reviewed',
      invalid: 'experimentsV2.status.invalid',
    }) as const
  )[status]

export const statusBannerKey = (status: 'locked' | 'invalid') =>
  (
    ({
      locked: 'experimentsV2.banner.locked',
      invalid: 'experimentsV2.banner.invalid',
    }) as const
  )[status]

export const statusTransitionInvalidationKeys = (
  runId: string,
  token: string,
) => [
  ['v2-experiment-list'],
  ['v2-samples', runId, token],
  ['v2-run-audit', runId],
]
