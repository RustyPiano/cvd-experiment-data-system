import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

type EmptyStateProps = {
  description: string
  action?: ReactNode
}

export function EmptyState({ description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Inbox className="size-10 text-muted-foreground/40" aria-hidden />
      <p role="status" className="text-sm text-muted-foreground">
        {description}
      </p>
      {action ? <div>{action}</div> : null}
    </div>
  )
}
