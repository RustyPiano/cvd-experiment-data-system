import { useBlocker } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
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
  message?: string
  when: boolean
}) {
  const { t } = useTranslation()
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
          <AlertDialogTitle>{t('routeLeave.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {message ?? t('routeLeave.defaultMessage')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            aria-label={t('routeLeave.stay')}
            onClick={() => blocker.reset()}
          >
            {t('routeLeave.stay')}
          </AlertDialogCancel>
          <AlertDialogAction
            aria-label={t('routeLeave.leave')}
            onClick={() => blocker.proceed()}
          >
            {t('routeLeave.leave')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
