import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getStoredSession } from '@/features/auth/session'

export const Route = createFileRoute('/_authed/_admin')({
  beforeLoad: () => {
    const session = getStoredSession()
    if (!session.isAuthenticated || session.currentUser?.role !== 'admin') {
      throw redirect({ to: '/experiments' })
    }
  },
  component: Outlet,
})
