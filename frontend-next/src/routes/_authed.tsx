import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppShell } from '@/shared/ui/app-shell'
import { getStoredSession } from '@/features/auth/session'

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ location }) => {
    if (!getStoredSession().isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
