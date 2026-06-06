import { useBlocker } from '@tanstack/react-router'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

/**
 * Blocks navigation when `when` is true and prompts the user for confirmation.
 * Uses TanStack Router's `useBlocker` with `withResolver: true` to surface the
 * blocked state and allow the UI to control proceed / reset.
 */
export function RouteLeaveGuard({
  message,
  when,
}: {
  message: string
  when: boolean
}) {
  const blocker = useBlocker({
    shouldBlockFn: () => when,
    enableBeforeUnload: when,
    withResolver: true,
  })

  if (blocker.status !== 'blocked') {
    return null
  }

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>离开确认</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel aria-label="留下" onClick={() => blocker.reset()}>
            留下
          </AlertDialogCancel>
          <AlertDialogAction
            aria-label="离开"
            onClick={() => blocker.proceed()}
          >
            离开
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
