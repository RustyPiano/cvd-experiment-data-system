import { Skeleton } from '@/components/ui/skeleton'

export function LoadingState() {
  return (
    <div className="space-y-3 p-2">
      <Skeleton className="h-5 w-1/3 rounded" />
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-2/3 rounded" />
    </div>
  )
}
