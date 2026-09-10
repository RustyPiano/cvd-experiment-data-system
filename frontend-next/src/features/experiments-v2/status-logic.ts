import type { QueryClient } from '@tanstack/react-query'
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

export const isResultsReadOnly = (status: RunStatus, canWrite: boolean) =>
  !canWrite || status === 'invalid'

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

// Run writes also change sample summaries, result flags and characterization access.
export const statusTransitionInvalidationKeys = (runId?: string) => [
  ['v2-experiment-list'],
  ['v2-experiment', ...(runId ? [runId] : [])],
  ['experiments', 'detail'],
  ['v2-experiment-status', ...(runId ? [runId] : [])],
  ['samples'],
  ['measurements'],
  ['measurement-detail'],
  ['characterizations'],
  ['v2-run-audit', ...(runId ? [runId] : [])],
  ['v2-run-revisions', ...(runId ? [runId] : [])],
]

export const invalidateRunQueries = (client: QueryClient, runId?: string) =>
  Promise.all(
    statusTransitionInvalidationKeys(runId).map((queryKey) =>
      client.invalidateQueries({ queryKey }),
    ),
  )
