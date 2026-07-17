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
  if (status === 'locked' && isAdmin) return ['unlock']
  return []
}

export const isProcessReadOnly = (status: RunStatus, canWrite: boolean) =>
  !canWrite || status === 'locked' || status === 'invalid'

export const isResultsReadOnly = (status: RunStatus, canWrite: boolean) =>
  !canWrite || status === 'invalid'

export function statusBadgeVariant(status: RunStatus) {
  return (
    {
      draft: 'secondary',
      locked: 'default',
      invalid: 'destructive',
    } as const
  )[status]
}

export const statusLabelKey = (status: RunStatus) =>
  (
    ({
      draft: 'experimentsV2.status.draft',
      locked: 'experimentsV2.status.locked',
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
