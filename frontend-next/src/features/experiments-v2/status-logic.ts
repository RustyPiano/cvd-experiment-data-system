export type RunStatus = 'draft' | 'submitted' | 'locked' | 'invalid'
export type StatusAction = 'submit' | 'lock' | 'unlock' | 'returnToDraft' | 'invalidate'

export function availableStatusActions(status: RunStatus, isAdmin: boolean): StatusAction[] {
  if (status === 'draft') return ['submit', 'invalidate']
  if (status === 'submitted') return ['lock', 'returnToDraft', 'invalidate']
  if (status === 'locked' && isAdmin) return ['unlock']
  return []
}

export const isRunReadOnly = (status: RunStatus) => status === 'locked' || status === 'invalid'

export function statusBadgeVariant(status: RunStatus) {
  return ({ draft: 'secondary', submitted: 'outline', locked: 'default', invalid: 'destructive' } as const)[status]
}

export const statusLabelKey = (status: RunStatus) =>
  ({ draft: 'experimentsV2.status.draft', submitted: 'experimentsV2.status.submitted', locked: 'experimentsV2.status.locked', invalid: 'experimentsV2.status.invalid' } as const)[status]

export const statusBannerKey = (status: 'locked' | 'invalid') =>
  ({ locked: 'experimentsV2.banner.locked', invalid: 'experimentsV2.banner.invalid' } as const)[status]
