import { createFileRoute } from '@tanstack/react-router'
import { AdminDashboardPage } from '@/features/admin-dashboard/admin-dashboard-page'

export const Route = createFileRoute('/_authed/_admin/dashboard')({
  component: AdminDashboardPage,
})
